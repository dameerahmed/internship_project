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

    async def _ensure_channel(self):
        """Ensure we have an open channel, reconnecting if needed."""
        if not self.channel or self.channel.is_closed:
            logger.warning("RabbitMQ channel closed — reconnecting...")
            await self.connect()

    async def _get_dlq_queue_passive(self):
        """
        Passively query the DLQ state without re-declaring or modifying it.
        passive=True → RabbitMQ returns current message_count without touching the queue.
        Raises if queue does not exist.
        """
        await self._ensure_channel()
        if hasattr(self.channel, "_queues"):
            self.channel._queues.pop(self.dlq_queue_name, None)

        queue = await self.channel.declare_queue(
            self.dlq_queue_name,
            durable=True,
            passive=True   # ← CRITICAL FIX: just query, don't re-declare
        )
        return queue

    async def _get_main_queue_passive(self):
        """Passively query the main delivery queue state."""
        await self._ensure_channel()
        if hasattr(self.channel, "_queues"):
            self.channel._queues.pop(self.main_queue_name, None)

        queue = await self.channel.declare_queue(
            self.main_queue_name,
            durable=True,
            passive=True
        )
        return queue

    def _get_message_count(self, queue) -> int:
        """
        Safely extract message_count from aio_pika Queue.
        aio_pika stores the AMQP DeclareOk frame as .declaration_result (NOT .declare_result).
        Using declare_result was silently throwing AttributeError → always returned 0.
        """
        try:
            return queue.declaration_result.message_count  # ← CRITICAL FIX
        except AttributeError:
            # Fallback for different aio_pika versions
            try:
                return queue._declaration_result.message_count
            except AttributeError:
                logger.warning("Cannot read declaration_result from queue object — aio_pika version mismatch?")
                return -1  # -1 signals "unknown" so callers can still try iterating

    async def publish_message(self, payload: dict, routing_key: str = "webhook_delivery_queue"):
        """
        Securely converts python dictionaries to structured bytes and writes them to the queue.
        """
        await self._ensure_channel()

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
        """
        Returns the real-time number of messages waiting in RabbitMQ DLQ.

        FIX: Uses passive=True + declaration_result (not declare_result which doesn't exist).
        """
        try:
            dlq_queue = await self._get_dlq_queue_passive()
            count = self._get_message_count(dlq_queue)
            logger.debug("DLQ message count: %d", count)
            return max(0, count)
        except Exception as err:
            logger.warning("Failed to fetch RabbitMQ DLQ message count: %s", err)
            return 0

    async def get_main_queue_message_count(self) -> int:
        """
        Returns the real-time number of messages waiting in the Main Delivery Queue.
        """
        try:
            main_queue = await self._get_main_queue_passive()
            count = self._get_message_count(main_queue)
            return max(0, count)
        except Exception as err:
            logger.warning("Failed to fetch RabbitMQ Main Queue message count: %s", err)
            return 0

    async def peek_dlq_messages(self, limit: int = 100) -> list:
        """
        Fetches REAL messages directly from RabbitMQ Dead Letter Queue without destroying them.

        KEY FIX: We drain all messages into a local list FIRST, then nack them all back.
        Previous approach: get → nack(requeue=True) in same loop → RabbitMQ puts message back
        at front of queue → next get() returns the SAME message → infinite cycle on msg 1.

        Correct approach: drain N messages (they're "unacked" and off the queue head),
        process them all, then nack all at once to put them back.
        """
        try:
            dlq_queue = await self._get_dlq_queue_passive()
            queue_count = self._get_message_count(dlq_queue)

            if queue_count == 0:
                return []

            inspect_count = min(queue_count if queue_count > 0 else limit, limit)
            raw_messages = []  # hold drained AMQP messages before processing

            # ── PHASE 1: DRAIN messages off the queue head into local memory ──────────
            # While they're held here (unacked), RabbitMQ won't serve them to any other consumer.
            for _ in range(inspect_count):
                msg = await dlq_queue.get(fail=False)
                if msg is None:
                    break
                raw_messages.append(msg)

            if not raw_messages:
                return []

            # ── PHASE 2: PARSE collected messages ────────────────────────────────────
            messages_data = []
            for i, msg in enumerate(raw_messages):
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

                    # Handle nested delivery_packet structure from updated Celery worker
                    delivery_packet = packet.get("delivery_packet") or packet

                    event_id = (
                        packet.get("event_id")
                        or delivery_packet.get("event_id")
                        or headers.get("event_id")
                        or msg.message_id
                        or f"dlq_{i+1}_{abs(hash(raw_body))}"
                    )

                    project_id = delivery_packet.get("project_id") or headers.get("project_id")
                    event_type = delivery_packet.get("event_type") or headers.get("event_type") or "webhook.failed"
                    target_url = delivery_packet.get("target_url") or headers.get("target_url") or "/v1/gateway"
                    error_msg = packet.get("reason") or headers.get("error_message") or headers.get("exception") or f"Dead Lettered: {death_reason}"

                    # ISO timestamp
                    timestamp_val = headers.get("timestamp") or time.time()
                    if isinstance(timestamp_val, (int, float)):
                        created_at = datetime.fromtimestamp(timestamp_val, tz=timezone.utc).isoformat()
                    elif isinstance(timestamp_val, datetime):
                        created_at = timestamp_val.isoformat()
                    else:
                        created_at = str(timestamp_val)

                    # Ensure headers are JSON serializable (RabbitMQ sometimes injects datetime objects)
                    safe_headers = {}
                    for k, v in headers.items():
                        if isinstance(v, datetime):
                            safe_headers[k] = v.isoformat()
                        else:
                            safe_headers[k] = v

                    msg_id = str(msg.message_id or event_id or f"dlq-{i+1}")

                    messages_data.append({
                        "id": msg_id,
                        "raw_id": msg_id,
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
                        "payload": delivery_packet.get("data_payload") or delivery_packet.get("payload") or packet,
                        "headers": safe_headers,
                    })

                except Exception as parse_err:
                    logger.warning("Failed to parse DLQ message #%d: %s", i, parse_err)

            # ── PHASE 3: NACK ALL messages back to DLQ (non-destructive) ─────────────
            # Done AFTER parsing so we don't cycle on the same message in the get() loop.
            for msg in raw_messages:
                try:
                    await msg.nack(requeue=True)
                except Exception as nack_err:
                    logger.warning("Failed to nack DLQ message back: %s", nack_err)

            return messages_data

        except Exception as err:
            logger.error("Failed to peek RabbitMQ DLQ messages: %s", err)
            return []

    async def requeue_dlq_messages(self, target_ids: list = None) -> dict:
        """
        Takes REAL messages directly from RabbitMQ DLQ and pushes them BACK into the main queue.
        Removes them from DLQ via ack() and publishes to main exchange.

        FIX: Uses declaration_result (not declare_result) for message count.
        """
        await self._ensure_channel()

        try:
            dlq_queue = await self._get_dlq_queue_passive()
            queue_count = self._get_message_count(dlq_queue)

            if queue_count == 0:
                return {"replayed_count": 0, "replayed_ids": []}

            requeued_ids = []
            target_set = set(str(i) for i in target_ids) if target_ids and "all" not in target_ids else None
            drain_limit = queue_count if queue_count > 0 else 500

            for _ in range(drain_limit):
                msg = await dlq_queue.get(fail=False)
                if not msg:
                    break

                raw_id = str(msg.message_id or "")
                raw_body = msg.body.decode("utf-8") if isinstance(msg.body, (bytes, bytearray)) else str(msg.body)

                should_requeue = False
                if target_set is None:  # "all"
                    should_requeue = True
                else:
                    if raw_id in target_set:
                        should_requeue = True
                    else:
                        for tid in target_set:
                            if tid in raw_id or tid in raw_body:
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
                    # Return unmatched message to DLQ
                    await msg.nack(requeue=True)

            return {"replayed_count": len(requeued_ids), "replayed_ids": requeued_ids}

        except Exception as err:
            logger.error("Failed to requeue RabbitMQ DLQ messages: %s", err)
            return {"replayed_count": 0, "replayed_ids": [], "error": str(err)}

    async def discard_dlq_messages(self, target_ids: list = None) -> dict:
        """
        Permanently purges/discards REAL messages from RabbitMQ DLQ by calling ack().

        FIX: Uses declaration_result (not declare_result) for message count.
        """
        await self._ensure_channel()

        try:
            dlq_queue = await self._get_dlq_queue_passive()
            queue_count = self._get_message_count(dlq_queue)

            if queue_count == 0:
                return {"discarded_count": 0, "discarded_ids": []}

            discarded_ids = []
            target_set = set(str(i) for i in target_ids) if target_ids and "all" not in target_ids else None
            drain_limit = queue_count if queue_count > 0 else 500

            for _ in range(drain_limit):
                msg = await dlq_queue.get(fail=False)
                if not msg:
                    break

                raw_id = str(msg.message_id or "")
                raw_body = msg.body.decode("utf-8") if isinstance(msg.body, (bytes, bytearray)) else str(msg.body)

                should_discard = False
                if target_set is None:  # "all"
                    should_discard = True
                else:
                    if raw_id in target_set:
                        should_discard = True
                    else:
                        for tid in target_set:
                            if tid in raw_id or tid in raw_body:
                                should_discard = True
                                break

                if should_discard:
                    # Ack to permanently delete from RabbitMQ DLQ
                    await msg.ack()
                    discarded_ids.append(raw_id or f"msg_{len(discarded_ids)+1}")
                else:
                    # Keep unmatched message in DLQ
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