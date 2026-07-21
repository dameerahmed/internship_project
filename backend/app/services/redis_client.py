import logging
from typing import AsyncGenerator
import redis.asyncio as aioredis
from redis.exceptions import RedisError, ConnectionError
from backend.config import settings

# Setup standard logger to print errors to console
logger = logging.getLogger("app.redis")

# Safety Check: Stop the server immediately if the URL is missing
if not settings.REDIS_URL:
    logger.critical("CRITICAL: REDIS_URL environment variable is totally missing!")
    raise RuntimeError("System cannot start without REDIS_URL configuration.")

try:
    # Create a reusable pool of 50 connections to maximize performance under load
    redis_pool = aioredis.ConnectionPool.from_url(
        settings.REDIS_URL,
        max_connections=50,       # Maximum connections allowed in the pool
        retry_on_timeout=True,    # Automatically retry if a temporary network blip happens
        decode_responses=True,    # Automatically convert raw binary data into clean Python strings
        protocol=2,               # Force RESP2 protocol (prevents 'HELLO' command errors on older Redis servers)
    )
except Exception as init_error:
    logger.critical(f"CRITICAL: Failed to initialize Redis Connection Pool: {str(init_error)}")
    raise RuntimeError(f"Redis initialization aborted: {init_error}")

async def get_redis_client() -> aioredis.Redis:
    """
    Return a Redis client from the shared connection pool.
    The caller is responsible for closing it after use.
    """
    return aioredis.Redis(connection_pool=redis_pool)


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """
    Asynchronous Context Dependency for Redis.
    Safely opens a connection from the pool and guarantees its return/cleanup.
    """
    # Grab an open, active client connection from our managed pool
    client = await get_redis_client()
    try:
        # Give the connection to the calling function to read/write data
        yield client
    except ConnectionError as conn_err:
        # Explicitly log if the Redis server goes offline during use
        logger.error(f"DATABASE ERROR: Redis server connection was lost: {str(conn_err)}")
        raise
    except RedisError as redis_err:
        # Catch any general faulty query execution or command errors
        logger.error(f"EXECUTION ERROR: Redis command failed to process: {str(redis_err)}")
        raise
    finally:
        # CRITICAL PROTECTION: Always close the client session to return it to the pool.
        # This completely prevents system resource leaks.
        await client.close()