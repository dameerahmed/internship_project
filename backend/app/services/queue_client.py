import json
import logging
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

    async def connect(self):
        """
        Creates a resilient, robust connection to RabbitMQ.
        Automatically declares exchanges, main queues, and dead-letter queues.
        """
        # Only build a connection if it does not exist or was closed
        if not self.connection or self.connection.is_closed:
            try:
                # connect_robust automatically reconnects in the background if RabbitMQ drops or restarts
                self.connection = await aio_pika.connect_robust(self.url)
                self.channel = await self.connection.channel()

                # =================================================================
                # 1. DEAD LETTER QUEUE (DLQ) INFRASTRUCTURE
                # =================================================================
                dlq_exchange_name = "webhook_dlx"
                dlq_queue_name = "webhook_dead_letter_queue"
                dlq_routing_key = "webhook.failed"

                # Declare the DLQ Exchange (acts as the post office for broken messages)
                dlq_exchange = await self.channel.declare_exchange(
                    dlq_exchange_name, 
                    type=aio_pika.ExchangeType.DIRECT,
                    durable=True  # Keeps exchange saved on disk even if server restarts
                )
                
                # Declare the actual DLQ Queue box where messages sit safely
                dlq_queue = await self.channel.declare_queue(dlq_queue_name, durable=True)
                
                # Permanently bind the queue to the exchange using the failure key routing rule
                await dlq_queue.bind(dlq_exchange, routing_key=dlq_routing_key)

                # =================================================================
                # 2. MAIN PRODUCTION WEBHOOK QUEUE INFRASTRUCTURE
                # =================================================================
                main_queue_name = "webhook_delivery_queue"
                main_queue_args = {
                    # If a message is rejected or fails max retries, route it here:
                    "x-dead-letter-exchange": dlq_exchange_name,
                    "x-dead-letter-routing-key": dlq_routing_key,
                    # If a message sits unprocessed for 48 hours (in ms), move it to DLQ automatically:
                    "x-message-ttl": 172800000
                }

                # Always reset the main webhook queue to avoid stale RabbitMQ definitions.
              
                await self.channel.declare_queue(
                    main_queue_name,
                    durable=True,
                    arguments=main_queue_args
                )

                logger.info("SECURITY GUARD: RabbitMQ and Dead Letter Queue (DLQ) safely initialized.")
                
            except AMQPConnectionError as net_err:
                logger.critical(f"NETWORK CRASH: Could not connect to RabbitMQ broker: {str(net_err)}")
                raise RuntimeError(f"RabbitMQ connection failed entirely: {net_err}")
            except Exception as generic_err:
                logger.critical(f"CONFIG CRASH: Failed setting up queues/exchanges: {str(generic_err)}")
                raise

    async def publish_message(self, payload: dict, routing_key: str = "webhook_delivery_queue"):
        """
        Securely converts python dictionaries to structured bytes and writes them to the queue.
        """
        # Ensure a running, safe pipeline is available before running the publish execution
        if not self.channel or self.channel.is_closed:
            logger.warning("Pipeline channel closed. Attempting emergency reconnection...")
            await self.connect()
        
        try:
            # Convert dictionary object to a flat text string, then encode it into raw computer bytes
            serialized_payload = json.dumps(payload).encode("utf-8")
            
            # Send the persistent message to the default exchange
            await self.channel.default_exchange.publish(
                aio_pika.Message(
                    body=serialized_payload,
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT  # Strictly forces RabbitMQ to write this to the hard drive immediately
                ),
                routing_key=routing_key
            )
        except AMQPChannelError as channel_err:
            logger.error(f"CHANNEL ERROR: Failed to write data to queue pipeline: {str(channel_err)}")
            raise
        except Exception as write_err:
            logger.error(f"WRITE ERROR: System failed serialization or payload transport: {str(write_err)}")
            raise

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