"""
Centralized Redis Pub/Sub Publisher & Subscriber Service.

Channels:
    logs:{project_id}       → emitted by Celery worker after every delivery
    metrics:{company_id}    → emitted by Celery worker with updated metrics snapshot
    dlq:{company_id}        → emitted when a message enters or leaves the DLQ

WebSocket handlers subscribe to these channels instead of polling the DB/AMQP.
"""

import json
import logging
from typing import Optional

from app.services.redis_client import get_redis_client

logger = logging.getLogger("app.pubsub")

# ─────────────────────────── channel name helpers ────────────────────────────

def logs_channel(project_id: int) -> str:
    return f"logs:{project_id}"


def metrics_channel(company_id: int) -> str:
    return f"metrics:{company_id}"


def project_metrics_channel(project_id: int) -> str:
    return f"metrics:project:{project_id}"


def dlq_channel(company_id: int) -> str:
    return f"dlq:{company_id}"


# ──────────────────────────────── publisher ───────────────────────────────────

async def publish_log_event(project_id: int, log_entry: dict) -> None:
    """
    Publish a serialized log entry to the project-scoped channel.
    Called by the Celery worker after persisting a WebhookLog.
    """
    redis = None
    try:
        redis = await get_redis_client()
        await redis.publish(logs_channel(project_id), json.dumps(log_entry))
    except Exception as exc:
        logger.warning("Failed to publish log event for project %s: %s", project_id, exc)
    finally:
        if redis:
            await redis.aclose()


async def publish_metrics_snapshot(company_id: int, snapshot: dict, project_id: Optional[int] = None) -> None:
    """
    Publish a full metrics snapshot to the company-scoped channel and optionally project-scoped channel.
    Called by the Celery worker and Gateway after metrics update.
    """
    redis = None
    try:
        redis = await get_redis_client()
        payload = {"type": "DASHBOARD_UPDATE", **snapshot}
        if project_id:
            payload["project_id"] = project_id
        serialized = json.dumps(payload)
        
        await redis.publish(metrics_channel(company_id), serialized)
        if project_id:
            await redis.publish(project_metrics_channel(project_id), serialized)
    except Exception as exc:
        logger.warning("Failed to publish metrics snapshot for company %s (project %s): %s", company_id, project_id, exc)
    finally:
        if redis:
            await redis.aclose()


async def publish_dlq_event(company_id: int, event_type: str, item: Optional[dict] = None) -> None:
    """
    Publish a DLQ change notification (item added or removed).
    Called by the DLQ replay/discard handlers.
    """
    redis = None
    try:
        redis = await get_redis_client()
        payload = {"type": "DLQ_CHANGE", "event": event_type, "item": item}
        await redis.publish(dlq_channel(company_id), json.dumps(payload))
    except Exception as exc:
        logger.warning("Failed to publish DLQ event for company %s: %s", company_id, exc)
    finally:
        if redis:
            await redis.aclose()


# ─────────────────────────────── subscriber ──────────────────────────────────

class RedisPubSubSubscriber:
    """
    Async context manager that subscribes to one or more Redis Pub/Sub channels
    and yields decoded messages.

    Usage inside a WebSocket handler:
        async with RedisPubSubSubscriber(["logs:42"]) as sub:
            async for message in sub.listen():
                await websocket.send_text(message)
    """

    def __init__(self, channels: list[str]):
        self.channels = channels
        self._redis = None
        self._pubsub = None

    async def __aenter__(self):
        self._redis = await get_redis_client()
        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe(*self.channels)
        return self

    async def __aexit__(self, *args):
        try:
            if self._pubsub:
                await self._pubsub.unsubscribe(*self.channels)
                await self._pubsub.aclose()
        except Exception:
            pass
        finally:
            if self._redis:
                await self._redis.aclose()

    async def listen(self):
        """
        Async generator that yields raw JSON strings from the subscribed channels.
        Only yields actual message data (skips subscribe/unsubscribe ACK frames).
        """
        async for raw in self._pubsub.listen():
            if raw and raw.get("type") == "message":
                data = raw.get("data")
                if data:
                    yield data
