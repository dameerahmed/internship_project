import os
import logging
from typing import AsyncGenerator
from sqlalchemy.orm import declarative_base
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from  config import settings

logger = logging.getLogger("webhook_gateway.database")

# Environment variable configuration
if not settings.DATABASE_URL:
    logger.critical("DATABASE_URL environment variable is missing!")
    raise RuntimeError("DATABASE_URL environment variable is required to start the application.")

# Determine if this process is a Celery worker. Workers use asyncio.run() per
# task which creates a fresh event loop each time, making a connection pool
# dangerous (connections are bound to the loop they were created on). We use
# NullPool for workers so every task gets a clean, short-lived connection.
# The FastAPI server (uvicorn) keeps a single long-running event loop and
# benefits greatly from a real async connection pool (QueuePool).
_IS_CELERY_WORKER = os.getenv("IS_CELERY_WORKER", "false").lower() == "true"

try:
    if _IS_CELERY_WORKER:
        # Celery workers: NullPool is correct — each asyncio.run() call lives
        # in its own event loop, so pooled connections would be invalid.
        engine = create_async_engine(
            settings.DATABASE_URL,
            poolclass=NullPool,
            pool_pre_ping=True,
            echo=False,
        )
        logger.info("Database engine initialized with NullPool (Celery worker mode).")
    else:
        # FastAPI server: use a proper async queue pool for high throughput.
        # pool_size=10: keep 10 persistent connections warm.
        # max_overflow=20: allow up to 30 total under burst load.
        # pool_timeout=30: wait up to 30s for a free connection before error.
        # pool_recycle=1800: recycle connections every 30 min to prevent stale TCP.
        engine = create_async_engine(
            settings.DATABASE_URL,
            poolclass=AsyncAdaptedQueuePool,
            pool_size=10,
            max_overflow=20,
            pool_timeout=30,
            pool_recycle=1800,
            pool_pre_ping=True,   # Liveness check on checkout
            echo=False,
        )
        logger.info("Database engine initialized with AsyncAdaptedQueuePool (size=10, overflow=20).")

    # Session factory
    SessionLocal = async_sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
        expire_on_commit=False,
    )

except SQLAlchemyError as engine_err:
    logger.critical(f"Failed to initialize SQLAlchemy Engine: {str(engine_err)}")
    raise RuntimeError(f"Database engine initialization failed: {engine_err}")

# Declarative base for DB Models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI Dependency: yields an async DB session from the connection pool.
    Rolls back on SQLAlchemy errors and always releases the connection.
    """
    async with SessionLocal() as db:
        try:
            yield db
        except SQLAlchemyError as db_err:
            await db.rollback()
            logger.error(f"Database transaction error caught, rolling back: {str(db_err)}")
            raise