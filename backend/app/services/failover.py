import asyncio
import json
import logging
import re
import time
from collections import deque
from typing import Any, Callable, Deque, Dict, Optional

logger = logging.getLogger("app.failover")

SENSITIVE_KEY_PATTERN = re.compile(
    r"(password|passwd|secret|token|api[_-]?key|authorization|cookie|private|ssh|env|traceback|stacktrace|sql|query|schema)",
    re.IGNORECASE,
)

SAFE_ERROR_MESSAGE = "ERR_GATEWAY_HANDSHAKE_FAILED"


class OfflineMessageBuffer:
    """In-memory fallback queue that preserves webhook events while brokers are unavailable."""

    def __init__(self, max_items: int = 250):
        self._items: Deque[dict] = deque(maxlen=max_items)
        self._lock = asyncio.Lock()

    def enqueue(self, item: dict) -> None:
        if not isinstance(item, dict):
            raise TypeError("OfflineMessageBuffer expects a dictionary item")
        self._items.append(item)

    def pending(self) -> int:
        return len(self._items)

    async def drain(self, publisher: Callable[[dict], Any]) -> int:
        drained = 0
        while True:
            async with self._lock:
                if not self._items:
                    break
                item = self._items.popleft()

            try:
                await publisher(item)
                drained += 1
            except Exception as exc:
                async with self._lock:
                    self._items.appendleft(item)
                logger.warning("Offline message replay failed; retaining buffered item: %s", exc)
                break

        return drained


class ServiceHealthMonitor:
    """Tracks Redis and RabbitMQ liveness so the app can fail over gracefully."""

    def __init__(self) -> None:
        self.redis_available = True
        self.rabbitmq_available = True
        self.last_checked: Dict[str, Optional[float]] = {"redis": None, "rabbitmq": None}
        self._lock = asyncio.Lock()

    async def check_redis(self, client_factory: Optional[Callable[[], Any]] = None) -> bool:
        factory = client_factory or self._get_default_redis_client
        try:
            res = factory()
            client = await res if (asyncio.iscoroutine(res) or hasattr(res, "__await__")) else res
            if hasattr(client, "ping"):
                res_ping = client.ping()
                if asyncio.iscoroutine(res_ping) or hasattr(res_ping, "__await__"):
                    await res_ping
            available = True
        except Exception as exc:
            available = False
            logger.warning("Redis health probe failed: %s", exc)
        finally:
            async with self._lock:
                self.redis_available = available
                self.last_checked["redis"] = asyncio.get_running_loop().time()
        return available

    async def check_rabbitmq(self, manager: Optional[Any] = None) -> bool:
        manager = manager or self._get_default_rabbitmq_manager()
        try:
            if manager is None:
                available = False
            else:
                if getattr(manager, "connection", None) is None or getattr(manager.connection, "is_closed", True):
                    await manager.connect()
                available = True
        except Exception as exc:
            available = False
            logger.warning("RabbitMQ health probe failed: %s", exc)
        finally:
            async with self._lock:
                self.rabbitmq_available = available
                self.last_checked["rabbitmq"] = asyncio.get_running_loop().time()
        return available

    async def check_services(self, redis_client_factory: Optional[Callable[[], Any]] = None, manager: Optional[Any] = None) -> Dict[str, bool]:
        now = time.time()
        cached_status = self.last_checked.get("cached_status")
        last_time = self.last_checked.get("last_services_check")
        if last_time and (now - last_time < 5.0) and cached_status:
            return cached_status

        status = {
            "redis": await self.check_redis(redis_client_factory),
            "rabbitmq": await self.check_rabbitmq(manager),
        }
        self.last_checked["last_services_check"] = now
        self.last_checked["cached_status"] = status
        return status

    @staticmethod
    async def _get_default_redis_client() -> Any:
        from backend.app.services.redis_client import get_redis_client

        client = await get_redis_client()
        try:
            await client.ping()
            return client
        except Exception:
            await client.close()
            raise

    @staticmethod
    def _get_default_rabbitmq_manager() -> Any:
        from backend.app.services.queue_client import rabbitmq_manager

        return rabbitmq_manager


service_health_monitor = ServiceHealthMonitor()
offline_message_buffer = OfflineMessageBuffer()


def sanitize_response_payload(value: Any) -> Any:
    """Strip secrets and unsafe internals before any JSON response reaches the UI."""
    if isinstance(value, dict):
        sanitized: Dict[str, Any] = {}
        for key, child in value.items():
            if SENSITIVE_KEY_PATTERN.search(str(key)):
                sanitized[key] = "[REDACTED]"
                continue

            if str(key).lower() in {"traceback", "stacktrace"}:
                sanitized[key] = "[REDACTED]"
                continue

            sanitized[key] = sanitize_response_payload(child)
        return sanitized

    if isinstance(value, list):
        return [sanitize_response_payload(item) for item in value]

    if isinstance(value, str):
        if "Traceback (most recent call last):" in value:
            return SAFE_ERROR_MESSAGE
        if len(value) > 1800:
            return value[:1800] + "..."
        return value

    return value


async def populate_cache_if_available(cache_key: str, payload: dict, redis_client: Optional[Any] = None) -> None:
    if not payload:
        return
    try:
        if redis_client is None:
            from backend.app.services.redis_client import get_redis_client

            redis_client = await get_redis_client()
        await redis_client.set(cache_key, json.dumps(payload), ex=900)
    except Exception as exc:
        logger.warning("Cache repopulation skipped due to Redis unavailability: %s", exc)
