import asyncio
from backend.app.services.queue_client import rabbitmq_manager

async def test():
    await rabbitmq_manager.connect()
    dlq_count = await rabbitmq_manager.get_dlq_message_count()
    main_count = await rabbitmq_manager.get_main_queue_message_count()
    print(f"DLQ Count: {dlq_count}")
    print(f"Main Count: {main_count}")
    
    msgs = await rabbitmq_manager.peek_dlq_messages(limit=10)
    print(f"Peek DLQ count: {len(msgs)}")
    
    dlq_count2 = await rabbitmq_manager.get_dlq_message_count()
    print(f"DLQ Count after peek: {dlq_count2}")

asyncio.run(test())
