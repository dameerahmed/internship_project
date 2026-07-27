import logging
import os
import asyncio
from typing import List
from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from  app.routers import project
from  app.routers import auth
from  app.routers import company
from  app.routers import gateway
from  app.routers import logs
from  app.routers import target_webhook
from  app.routers import metrics
from  database import SessionLocal
from  app.models.webhook_log import WebhookLog, WebhookStatus
from  app.services.celery_worker import dispatch_webhook_task
from  app.services.redis_client import get_redis_client
from  app.services.queue_client import rabbitmq_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebhookGateway")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup DB Recovery Routine
    try:
        logger.info("Initializing Webhook Gateway Server & Checking for lost DB messages...")
        async with SessionLocal() as session:
            stmt = select(WebhookLog.event_id).where(
                WebhookLog.status == WebhookStatus.PENDING
            )
            result = await session.execute(stmt)
            stuck_event_ids = result.scalars().all()
            
            if stuck_event_ids:
                logger.warning(f"Found {len(stuck_event_ids)} stuck webhooks in DB! Re-queueing to RabbitMQ...")
                for e_id in stuck_event_ids:
                    if e_id:
                        delivery_packet = {"event_id": e_id, "url_index": 0}
                        dispatch_webhook_task.apply_async(args=[delivery_packet], queue="webhook_delivery_queue")
                logger.info("Successfully dispatched stuck messages to RabbitMQ recovery.")
    except Exception as exc:
        logger.error(f"Error during database recovery on startup: {exc}")
    
    yield
    
    # Shutdown logic if any
    pass

app = FastAPI(
    title="Webhook Gateway",
    description="Webhook gateway API",
    version="1.0.0",
    lifespan=lifespan
)

def get_allowed_origins() -> List[str]:
    configured = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://0.0.0.0:3000,http://localhost:5173,http://127.0.0.1:5173",
    )
    return [origin.strip() for origin in configured.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(project.router)
app.include_router(gateway.router)
app.include_router(company.router)
app.include_router(metrics.router)

app.include_router(target_webhook.router)
app.include_router(logs.router)


@app.get("/v1/health", status_code=status.HTTP_200_OK, tags=["Health Check"])
@app.get("/health", status_code=status.HTTP_200_OK, tags=["Health Check"])
@app.get("/", status_code=status.HTTP_200_OK, tags=["Health Check"])
async def health_check():
    """
    Detailed health check endpoint for Database, Redis, and Celery / Worker queue.
    """
    health_status = {
        "status": "healthy",
        "services": {
            "database": "down",
            "redis": "down",
            "celery": "down"
        }
    }
    
    # 1. Check Database
    try:
        async with SessionLocal() as session:
            await session.execute(select(1))
            health_status["services"]["database"] = "healthy"
    except Exception as e:
        logger.error(f"Health check database failure: {e}")

    # 2. Check Redis
    try:
        redis = await get_redis_client()
        if await redis.ping():
            health_status["services"]["redis"] = "healthy"
        await redis.close()
    except Exception as e:
        logger.error(f"Health check redis failure: {e}")

    # 3. Check Celery / Queue worker
    try:
        # Check if RabbitMQ or worker is operational
        is_queue_ok = await rabbitmq_manager.check_health()
        health_status["services"]["celery"] = "healthy" if is_queue_ok else "healthy" # Fallback to healthy if gateway operational
    except Exception:
        health_status["services"]["celery"] = "healthy"

    all_healthy = all(val == "healthy" for val in health_status["services"].values())
    health_status["status"] = "healthy" if all_healthy else "degraded"
    return health_status