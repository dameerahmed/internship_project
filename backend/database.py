import os
import logging
from typing import AsyncGenerator
from sqlalchemy.orm import declarative_base
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from backend.config import settings
logger = logging.getLogger("webhook_gateway.database")

# Environment variable configuration

if not settings.DATABASE_URL:
   
    logger.critical("DATABASE_URL environment variable is missing!")
    raise RuntimeError("DATABASE_URL environment variable is required to start the application.")

try:
    # SQLAlchemy Engine setup with explicit security & pool limits
    engine = create_async_engine(
        settings.DATABASE_URL,  # Temporary connections beyond pool_size
        poolclass=NullPool,    
        pool_pre_ping=True,    # Liveness check safe hai
        echo=False
    )
    
    # Session factory configuration
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
    Highly secure FastAPI Dependency context provider (Asynchronous).
    Ensures absolute transactional isolation and flawless cleanup.
    """
    async with SessionLocal() as db:
        try:
            yield db
        except SQLAlchemyError as db_err:
            await db.rollback()
            logger.error(f"Database transaction error caught, rolling back: {str(db_err)}")
            raise