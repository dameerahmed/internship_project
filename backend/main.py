import logging
import os
from typing import List
from backend.app.routers import project
from backend.app.routers import auth
from backend.app.routers import company
from backend.app.routers import gateway
from backend.app.routers import logs
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from backend.app.routers import target_webhook

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebhookGateway")

app = FastAPI(
    title="Webhook Gateway",
    description="Webhook gateway API",
    version="1.0.0"
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