import json
import logging
import time
from datetime import datetime, timezone
import aio_pika
from aio_pika.exceptions import AMQPConnectionError, AMQPChannelError
from backend.config import settings

# Setup standard logger to print queue issues to console
logger = logging.getLogger("app.queue")

# Safety Check: Stop the server immediately if the RabbitMQ connection string is missing
if not settings.RABBITMQ_URL:
    logger.critical("CRITICAL: RABBITMQ_URL environment variable is totally missing!")
    raise RuntimeError("System cannot start without RABBITMQ_URL configuration.")

class RabbitMQManager:
    def __init__(self, amqp_url: str):
        self.url = amqp_url
        self.connection = None
        self.channel = None
        self.dlq_queue_name = "webhook_dead_letter_queue"
        self.dlq_exchange_name = "webhook_dlx"
        self.main_queue_name = "webhook_delivery_queue"
        self.dlq_routing_key = "webhook.failed"

    async def connect(self):
        """
        Creates a resilient connection to RabbitMQ.
        Declares exchanges, main queues, and dead-letter queues.
        """
        if not self.connection or self.connection.is_closed:
            try:
                self.connection = await aio_pika.connect_robust(self.url)
                self.channel = await self.connection.channel()

                # 1. DEAD LETTER QUEUE (DLQ) INFRASTRUCTURE
                dlq_exchange = await self.channel.declare_exchange(
                    self.dlq_exchange_name, 
                    type=aio_pika.ExchangeType.DIRECT,
                    durable=True
                )
                
                dlq_queue = await self.channel.declare_queue(self.dlq_queue_name, durable=True)
                await dlq_queue.bind(dlq_exchange, routing_key=self.dlq_routing_key)

                # 2. MAIN PRODUCTION WEBHOOK QUEUE INFRASTRUCTURE
                main_queue_args = {
                    "x-dead-letter-exchange": self.dlq_exchange_name,
                    "x-dead-letter-routing-key": self.dlq_routing_key,
                    "x-message-ttl": 172800000
                }

                await self.channel.declare_queue(
                    self.main_queue_name,
                    durable=True,
                    arguments=main_queue_args
                )

                logger.info("RabbitMQ and Dead Letter Queue (DLQ) safely initialized.")
                
            except AMQPConnectionError as net_err:
                logger.critical(f"RabbitMQ connection error: {str(net_err)}")
                raise RuntimeError(f"RabbitMQ connection failed: {net_err}")
            except Exception as generic_err:
                logger.critical(f"Failed setting up RabbitMQ queues/exchanges: {str(generic_err)}")
                raise

    async def publish_message(self, payload: dict, routing_key: str = "webhook_delivery_queue"):
        """
        Securely converts python dictionaries to structured bytes and writes them to the queue.
        """
        if not self.channel or self.channel.is_closed:
            logger.warning("Pipeline channel closed. Attempting emergency reconnection...")
            await self.connect()
        
        try:
            serialized_payload = json.dumps(payload).encode("utf-8")
            await self.channel.default_exchange.publish(
                aio_pika.Message(
                    body=serialized_payload,
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT
                ),
                routing_key=routing_key
            )
        except AMQPChannelError as channel_err:
            logger.error(f"CHANNEL ERROR: Failed to write data to queue pipeline: {str(channel_err)}")
            raise
        except Exception as write_err:
            logger.error(f"WRITE ERROR: System failed serialization or payload transport: {str(write_err)}")
            raise

    async def get_dlq_message_count(self) -> int:
        """Returns the real-time number of messages waiting in RabbitMQ DLQ."""
        try:
            if not self.channel or self.channel.is_closed:
                await self.connect()
            dlq_queue = await self.channel.declare_queue(self.dlq_queue_name, durable=True)
            return dlq_queue.declare_result.message_count
        except Exception as err:
            logger.warning("Failed to fetch RabbitMQ DLQ message count: %s", err)
            return 0

    async def peek_dlq_messages(self, limit: int = 100) -> list:
        """
        Fetches REAL messages directly from RabbitMQ Dead Letter Queue without destroying them.
        Uses non-destructive nack(requeue=True) after inspecting headers and payloads.
        """
        if not self.channel or self.channel.is_closed:
            await self.connect()

        try:
            dlq_queue = await self.channel.declare_queue(self.dlq_queue_name, durable=True)
            queue_count = dlq_queue.declare_result.message_count
            if queue_count == 0:
                return []

            inspect_count = min(queue_count, limit)
            messages_data = []

            for i in range(inspect_count):
                msg = await dlq_queue.get(fail=False)
                if not msg:
                    break

                try:
                    raw_body = msg.body.decode("utf-8") if isinstance(msg.body, (bytes, bytearray)) else str(msg.body)
                    parsed_body = {}
                    try:
                        parsed_body = json.loads(raw_body)
                    except Exception:
                        parsed_body = {"raw_content": raw_body}

                    # Celery payload unpacking helper if Kombu wrapped
                    packet = parsed_body
                    if isinstance(parsed_body, list) and len(parsed_body) > 0:
                        first_elem = parsed_body[0]
                        if isinstance(first_elem, list) and len(first_elem) > 0 and isinstance(first_elem[0], dict):
                            packet = first_elem[0]
                        elif isinstance(first_elem, dict):
                            packet = first_elem

                    # Extract x-death headers provided by RabbitMQ DLX
                    headers = dict(msg.headers or {})
                    x_death = headers.get("x-death") or []
                    death_info = x_death[0] if isinstance(x_death, list) and len(x_death) > 0 else {}

                    attempt_count = death_info.get("count", 1)
                    death_reason = death_info.get("reason", "rejected")
                    source_queue = death_info.get("queue", self.main_queue_name)

                    event_id = (
                        packet.get("event_id") 
                        or headers.get("event_id") 
                        or msg.message_id 
                        or f"dlq_{i+1}_{hash(raw_body)}"
                    )
                    
                    project_id = packet.get("project_id") or headers.get("project_id")
                    event_type = packet.get("event_type") or headers.get("event_type") or "webhook.failed"
                    target_url = packet.get("target_url") or headers.get("target_url") or "/v1/gateway"
                    error_msg = headers.get("error_message") or headers.get("exception") or f"Dead Lettered: {death_reason}"

                    # ISO timestamp
                    timestamp_val = headers.get("timestamp") or time.time()
                    if isinstance(timestamp_val, (int, float)):
                        created_at = datetime.fromtimestamp(timestamp_val, tz=timezone.utc).isoformat()
                    else:
                        created_at = str(timestamp_val)

                    messages_data.append({
                        "id": str(msg.message_id or event_id or f"dlq-{i+1}"),
                        "raw_id": str(msg.message_id or event_id),
                        "event_id": event_id,
                        "project_id": project_id,
                        "project_name": f"Project #{project_id}" if project_id else "Global DLQ Node",
                        "event_type": event_type,
                        "target_url": target_url,
                        "error_message": error_msg,
                        "attempt_number": attempt_count,
                        "created_at": created_at,
                        "source_queue": source_queue,
                        "routing_key": msg.routing_key or self.dlq_routing_key,
                        "payload": packet.get("data_payload") or packet.get("payload") or packet,
                        "headers": headers,
                    })

                finally:
                    # Put message safely back in DLQ position
                    await msg.nack(requeue=True)

            return messages_data

        except Exception as err:
            logger.error("Failed to peek RabbitMQ DLQ messages: %s", err)
            return []

    async def requeue_dlq_messages(self, target_ids: list = None) -> dict:
        """
        Takes REAL messages directly from RabbitMQ DLQ and pushes them BACK into the main RabbitMQ queue.
        Removes them from DLQ via ack() and publishes them to main exchange.
        """
        if not self.channel or self.channel.is_closed:
            await self.connect()

        try:
            dlq_queue = await self.channel.declare_queue(self.dlq_queue_name, durable=True)
            queue_count = dlq_queue.declare_result.message_count
            if queue_count == 0:
                return {"replayed_count": 0, "replayed_ids": []}

            requeued_ids = []
            target_set = set(str(i) for i in target_ids) if target_ids and "all" not in target_ids else None

            for _ in range(queue_count):
                msg = await dlq_queue.get(fail=False)
                if not msg:
                    break

                raw_id = str(msg.message_id or "")
                raw_body = msg.body.decode("utf-8") if isinstance(msg.body, (bytes, bytearray)) else str(msg.body)
                
                # Check matching ID
                should_requeue = False
                if target_set is None: # "all"
                    should_requeue = True
                else:
                    # Check if ID or event_id matches target_set
                    if raw_id in target_set:
                        should_requeue = True
                    else:
                        for tid in target_set:
                            if tid in raw_id or tid in raw_body or f"log-{tid}" in raw_id or f"evt_{tid}" in raw_body:
                                should_requeue = True
                                break

                if should_requeue:
                    # 1. Acknowledge and remove from DLQ
                    await msg.ack()
                    
                    # 2. Publish back into main queue
                    await self.channel.default_exchange.publish(
                        aio_pika.Message(
                            body=msg.body,
                            headers=msg.headers,
                            delivery_mode=aio_pika.DeliveryMode.PERSISTENT
                        ),
                        routing_key=self.main_queue_name
                    )
                    requeued_ids.append(raw_id or f"msg_{len(requeued_ids)+1}")
                else:
                    # Return to DLQ
                    await msg.nack(requeue=True)

            return {"replayed_count": len(requeued_ids), "replayed_ids": requeued_ids}

        except Exception as err:
            logger.error("Failed to requeue RabbitMQ DLQ messages: %s", err)
            return {"replayed_count": 0, "replayed_ids": [], "error": str(err)}

    async def discard_dlq_messages(self, target_ids: list = None) -> dict:
        """
        Permanently purges/discards REAL messages from RabbitMQ DLQ by calling ack().
        """
        if not self.channel or self.channel.is_closed:
            await self.connect()

        try:
            dlq_queue = await self.channel.declare_queue(self.dlq_queue_name, durable=True)
            queue_count = dlq_queue.declare_result.message_count
            if queue_count == 0:
                return {"discarded_count": 0, "discarded_ids": []}

            discarded_ids = []
            target_set = set(str(i) for i in target_ids) if target_ids and "all" not in target_ids else None

            for _ in range(queue_count):
                msg = await dlq_queue.get(fail=False)
                if not msg:
                    break

                raw_id = str(msg.message_id or "")
                raw_body = msg.body.decode("utf-8") if isinstance(msg.body, (bytes, bytearray)) else str(msg.body)

                should_discard = False
                if target_set is None: # "all"
                    should_discard = True
                else:
                    if raw_id in target_set:
                        should_discard = True
                    else:
                        for tid in target_set:
                            if tid in raw_id or tid in raw_body or f"log-{tid}" in raw_id or f"evt_{tid}" in raw_body:
                                should_discard = True
                                break

                if should_discard:
                    # Ack to delete from RabbitMQ DLQ
                    await msg.ack()
                    discarded_ids.append(raw_id or f"msg_{len(discarded_ids)+1}")
                else:
                    # Keep in DLQ
                    await msg.nack(requeue=True)

            return {"discarded_count": len(discarded_ids), "discarded_ids": discarded_ids}

        except Exception as err:
            logger.error("Failed to discard RabbitMQ DLQ messages: %s", err)
            return {"discarded_count": 0, "discarded_ids": [], "error": str(err)}

    async def close(self):
        """
        Smooth teardown handler to close active broker channels during app shutdown.
        """
        try:
            if self.connection and not self.connection.is_closed:
                await self.connection.close()
                logger.info("SYSTEM SHUTDOWN: RabbitMQ broker sessions closed cleanly.")
        except Exception as close_err:
            logger.error(f"SHUTDOWN WARNING: Error occurred while closing connection sessions: {str(close_err)}")

# Create a single global engine instance to safely use across your whole app
rabbitmq_manager = RabbitMQManager(settings.RABBITMQ_URL)