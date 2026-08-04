import logging
import asyncio
from typing import AsyncGenerator
import redis.asyncio as aioredis
from redis.exceptions import RedisError, ConnectionError
from  config import settings

import weakref

logger = logging.getLogger("app.redis")

# Safety Check: Stop the server immediately if the URL is missing
if not settings.REDIS_URL:
    logger.critical("CRITICAL: REDIS_URL environment variable is totally missing!")
    raise RuntimeError("System cannot start without REDIS_URL configuration.")

# ─────────────────────────── Connection Pool Registry ────────────────────────
# Loop-specific Connection Pools map using WeakKeyDictionary to avoid
# memory/reference leaks when event loops are recycled (e.g., in tests or Celery).
_redis_pools: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()


def _get_or_create_pool(loop: asyncio.AbstractEventLoop) -> aioredis.ConnectionPool:
    """Return the pool bound to this event loop, creating it if needed."""
    if loop not in _redis_pools:
        try:
            _redis_pools[loop] = aioredis.ConnectionPool.from_url(
                settings.REDIS_URL,
                max_connections=50,       # Maximum connections allowed in the pool
                retry_on_timeout=True,    # Automatically retry on temporary network blips
                decode_responses=True,    # Return clean Python strings, not bytes
                protocol=2,               # Force RESP2 protocol
            )
            logger.debug("Created new Redis connection pool for event loop %s", id(loop))
        except Exception as init_error:
            logger.critical(f"CRITICAL: Failed to initialize Redis Connection Pool: {str(init_error)}")
            raise RuntimeError(f"Redis initialization aborted: {init_error}")
    return _redis_pools[loop]


async def get_redis_client() -> aioredis.Redis:
    """
    Return a Redis client from the event-loop-specific connection pool.

    IMPORTANT: Call `.close()` (not `.aclose()`) when finished to return
    the connection back to the pool without disconnecting the socket.
    `aclose()` terminates the underlying socket — only use it when you
    explicitly want to remove the connection from the pool.
    """
    loop = asyncio.get_running_loop()
    pool = _get_or_create_pool(loop)
    return aioredis.Redis(connection_pool=pool)


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """
    FastAPI Dependency: yields a Redis client from the pool and
    safely returns the connection on exit.
    """
    client = await get_redis_client()
    try:
        yield client
    except ConnectionError as conn_err:
        logger.error(f"Redis server connection was lost: {str(conn_err)}")
        raise
    except RedisError as redis_err:
        logger.error(f"Redis command failed: {str(redis_err)}")
        raise
    finally:
        # .close() returns the connection to the pool — it does NOT close the socket.
        # This is the correct pattern for pooled connections.
        await client.close()