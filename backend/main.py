import logging
import os
import asyncio
from typing import List
from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from backend.app.routers import project
from backend.app.routers import auth
from backend.app.routers import company
from backend.app.routers import gateway
from backend.app.routers import logs
from backend.app.routers import target_webhook
from backend.database import SessionLocal
from backend.app.models.webhook_log import WebhookLog, WebhookStatus
from backend.app.services.celery_worker import dispatch_webhook_task

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebhookGateway")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup DB Recovery Routine
    try:
        logger.info("Initializing Webhook Gateway Server & Checking for lost DB messages...")
        async with SessionLocal() as session:
            stmt = select(WebhookLog.event_id).where(
                WebhookLog.status.in_([WebhookStatus.PENDING, WebhookStatus.PROCESSING])
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

app.include_router(target_webhook.router)
app.include_router(logs.router)


@app.get("/", status_code=status.HTTP_200_OK, tags=["Health Check"])
async def root():
    """
    Basic health-check endpoint to verify if the Gateway server is up and running.
    """
    try:
        logger.info("Health check endpoint hit successfully.")
        return {
            "status": "online",
            "message": "Webhook Gateway Engine is running smoothly!",
            "engine_mode": "Asynchronous/SQLAlchemy-AsyncPG"
        }
    except Exception as e:
        logger.error(f"Health check failed internally: {str(e)}")
        return {
            "status": "offline",
            "message": f"Internal system anomaly: {str(e)}"
        }