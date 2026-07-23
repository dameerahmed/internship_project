import asyncio
import httpx

async def test():
    auth = ("admin", "admin123")
    async with httpx.AsyncClient() as client:
        res = await client.get("http://localhost:15672/api/queues/%2F/webhook_delivery_queue", auth=auth)
        if res.status_code == 200:
            print("Messages:", res.json().get('messages'))
            print("Messages Unacknowledged:", res.json().get('messages_unacknowledged'))

asyncio.run(test())
