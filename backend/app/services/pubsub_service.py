"""
Centralized Redis Pub/Sub Publisher & Subscriber Service.

Channels:
    logs:{project_id}       → emitted by Celery worker after every delivery
    metrics:{company_id}    → emitted by Celery worker with updated metrics snapshot
    dlq:{company_id}        → emitted when a message enters or leaves the DLQ

WebSocket handlers subscribe to these channels instead of polling the DB/AMQP.

Performance notes:
- Publishers use get_redis_client() and call .close() to return the connection
  to the pool (not .aclose() which would terminate the socket).
- For high-frequency publishing (every webhook delivery), the connection is
  borrowed, used, and returned — no socket teardown overhead.
- Subscribers open a dedicated connection (pubsub requires its own channel)
  and clean it up in __aexit__.
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
    Publish a serialized log entry to the project-scoped channel and global
    webhook_telemetry channel. Called by the Celery worker after persisting.

    Uses .close() to return the connection to the pool without socket teardown.
    """
    redis = None
    try:
        redis = await get_redis_client()
        payload_str = json.dumps(log_entry)
        # Use a pipeline so both publishes happen in one round-trip
        async with redis.pipeline(transaction=False) as pipe:
            pipe.publish(logs_channel(project_id), payload_str)
            pipe.publish("webhook_telemetry", payload_str)
            await pipe.execute()
    except Exception as exc:
        logger.warning("Failed to publish log event for project %s: %s", project_id, exc)
    finally:
        if redis:
            # .close() returns connection to pool; does NOT kill the socket.
            await redis.close()


async def publish_telemetry_event(payload: dict) -> None:
    """
    Publish a telemetry JSON payload to the 'webhook_telemetry' channel.
    Called when a Celery worker completes a webhook delivery task.
    """
    redis = None
    try:
        redis = await get_redis_client()
        await redis.publish("webhook_telemetry", json.dumps(payload))
    except Exception as exc:
        logger.warning("Failed to publish webhook_telemetry event: %s", exc)
    finally:
        if redis:
            await redis.close()


async def publish_metrics_snapshot(company_id: int, snapshot: dict, project_id: Optional[int] = None) -> None:
    """
    Publish a full metrics snapshot to the company-scoped channel and
    optionally the project-scoped channel. Uses a pipeline for efficiency.
    """
    redis = None
    try:
        redis = await get_redis_client()
        payload = {"type": "DASHBOARD_UPDATE", **snapshot}
        if project_id:
            payload["project_id"] = project_id
        serialized = json.dumps(payload)

        async with redis.pipeline(transaction=False) as pipe:
            pipe.publish(metrics_channel(company_id), serialized)
            if project_id:
                pipe.publish(project_metrics_channel(project_id), serialized)
            await pipe.execute()
    except Exception as exc:
        logger.warning(
            "Failed to publish metrics snapshot for company %s (project %s): %s",
            company_id, project_id, exc
        )
    finally:
        if redis:
            await redis.close()


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
            await redis.close()


# ─────────────────────────────── subscriber ──────────────────────────────────

class RedisPubSubSubscriber:
    """
    Async context manager that subscribes to one or more Redis Pub/Sub channels
    and yields decoded messages.

    A Pub/Sub connection requires a DEDICATED connection (it cannot be shared
    with regular commands). We therefore open a fresh connection here and close
    it in __aexit__ using aclose() to fully disconnect.

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
                # aclose() is correct here — the pub/sub connection is dedicated
                # and must be fully disconnected, not returned to the generic pool.
                await self._redis.aclose()

    async def listen(self):
        """
        Async generator that yields raw JSON strings from subscribed channels.
        Skips subscribe/unsubscribe ACK frames (type != 'message').
        """
        async for raw in self._pubsub.listen():
            if raw and raw.get("type") == "message":
                data = raw.get("data")
                if data:
                    yield data
