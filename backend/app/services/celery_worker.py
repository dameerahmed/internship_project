import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import unquote

import httpx
from celery import Celery, Task
from kombu import Exchange, Queue
from sqlalchemy import select, delete

from backend.config import settings

# Database Layer & Models Mapping
from backend.database import get_db, engine 
from backend.app.models.event_config import EventConfig
from backend.app.models.webhook_log import WebhookLog, WebhookStatus
from backend.app.models.project import Project
from backend.app.models.webhook_event import WebhookEvent
from backend.app.utils.security import WebhookSecurity, sanitize_for_logging
from backend.app.services.failover import service_health_monitor, sanitize_response_payload
from backend.app.services.redis_client import get_redis_client
from backend.app.services.project_service import refresh_project_cache

logger = logging.getLogger("celery_worker")

# Initialize Celery System Application
celery_app = Celery("webhook_workers", broker=settings.RABBITMQ_URL)
webhook_exchange = Exchange("webhook_delivery_queue", type="direct")

celery_app.conf.update(
    task_queues=(
        Queue(
            "webhook_delivery_queue", 
            exchange=webhook_exchange,
            routing_key="webhook_delivery_queue",
            queue_arguments={
                "x-message-ttl": 172800000,
                "x-dead-letter-exchange": "webhook_dlx",
                "x-dead-letter-routing-key": "webhook.failed"
            }
        ),
    ),
    task_default_queue="webhook_delivery_queue",
    task_default_exchange="webhook_delivery_queue",
    task_default_routing_key="webhook_delivery_queue",
    task_create_missing_queues=False  
)

# Periodic cleanup: remove webhook logs older than per-project retention_days
celery_app.conf.beat_schedule = {
    'cleanup-old-webhook-logs-daily': {
        'task': 'webhook_workers.cleanup_old_webhook_logs',
        'schedule': 60 * 60 * 24,  # once per day
    },
}


def _resolve_target_url(target_url: Optional[str], event_config, project_id: int) -> Optional[str]:
    url = (event_config.target_url if event_config and event_config.target_url else None) or target_url
    if not url:
        return None
    url = unquote(str(url))
    if ";" in url:
        urls = [u.strip() for u in url.split(";") if u.strip()]
        url = urls[0] if urls else url
    if not url.startswith("http://") and not url.startswith("https://"):
        # If running in Docker, map relative URLs to the FastAPI container
        url = f"http://backend:8000{url}" if url.startswith("/") else f"http://backend:8000/{url}"
    
    # If the user passed localhost/127.0.0.1 from the frontend, it will fail inside the docker network.
    # We must explicitly map it to the 'backend' container.
    url = url.replace("http://localhost:8000", "http://backend:8000")
    url = url.replace("http://127.0.0.1:8000", "http://backend:8000")
    return url


async def _persist_webhook_log(**kwargs):
    try:
        async for db_session in get_db():
            log_entry = WebhookLog(
                event_id=kwargs.get("event_id"),
                event_config_id=kwargs.get("event_config_id"),
                status=kwargs.get("status"),
                attempt_number=kwargs.get("attempt_number", 1),
                response_code=kwargs.get("response_code"),
                error_message=kwargs.get("error_message"),
                processing_duration_ms=kwargs.get("processing_duration_ms"),
                source_ip=kwargs.get("source_ip"),
                http_method=kwargs.get("http_method"),
            )
            db_session.add(log_entry)
            await db_session.commit()
            break
    except Exception as exc:
        logger.exception("Failed to persist webhook log", exc_info=exc)


@celery_app.task(
    bind=True,
    max_retries=5,
    default_retry_delay=16,
    retry_backoff=True,
)
def dispatch_webhook_task(self: Task, delivery_packet: dict = None, *args, **kwargs):
    """
    Main entry point for Celery execution. 
    Handles variable argument capturing to completely avoid positional tracking bugs during retries.
    """
    # 🚀 FIX: Keyword extraction logic if positional index shifts during retry execution
    if delivery_packet is None:
        delivery_packet = kwargs.get("delivery_packet")

    if not delivery_packet:
        raise ValueError("Critical Error: Missing delivery packet context payload inside task lifecycle invocation.")

    try:
        return asyncio.run(orchestrate_webhook_lifecycle(self, delivery_packet))
    except Exception as general_err:
        # Pass structural signals cleanly back to Celery (Retry/Reject commands should never be suppressed)
        if "Retry" in type(general_err).__name__ or "Reject" in type(general_err).__name__:
            raise general_err
        logger.exception("Unexpected crash in worker engine")
        raise general_err


async def orchestrate_webhook_lifecycle(task_instance: Task, delivery_packet: dict):
    # 🚀 Pass-by-Reference Resolution logic
    event_id = delivery_packet.get("event_id")
    url_index = delivery_packet.get("url_index", 0)
    
    project_id = delivery_packet.get("project_id")
    company_id = delivery_packet.get("company_id")
    event_type = delivery_packet.get("event_type")
    data_payload = delivery_packet.get("data_payload")
    target_url = delivery_packet.get("target_url")

    # If this is a minimalist payload, fetch details from the database
    if project_id is None or data_payload is None or event_type is None:
        if not event_id:
            raise ValueError("Critical Error: Missing event_id in minimalist delivery packet.")
        
        db_event = None
        db_exc = None
        try:
            async for db_session in get_db():
                db_event = await db_session.get(WebhookEvent, event_id)
                break
        except Exception as db_err:
            logger.error("Failed to query WebhookEvent from DB in worker: %s", db_err)
            db_exc = db_err

        if not db_event:
            # Resolve potential FastAPI database transaction commit race condition
            if task_instance.request.retries < task_instance.max_retries:
                logger.warning(
                    "Event %s not found in database or DB query failed; retrying task (attempt %s).",
                    event_id, task_instance.request.retries + 1
                )
                raise task_instance.retry(
                    args=[],
                    kwargs={"delivery_packet": delivery_packet},
                    countdown=2,
                    exc=db_exc or ValueError(f"WebhookEvent record with ID {event_id} not found in database yet.")
                )
            else:
                raise db_exc or ValueError(f"WebhookEvent with ID {event_id} not found after maximum retries.")

        project_id = db_event.project_id
        event_type = db_event.event_type
        data_payload = db_event.payload
        
        # Always resolve target URL dynamically from the active cache/db config
        target_url = None
        
        # Extract headers from the event metadata
        if db_event.metadata_json and isinstance(db_event.metadata_json, dict):
            metadata_headers = db_event.metadata_json.get("incoming_headers")
            if metadata_headers:
                delivery_packet["request_headers"] = metadata_headers

    if not event_id:
        unique_timestamp = int(time.time() * 1000)
        event_id = f"evt_{unique_timestamp}_{uuid.uuid4().hex[:8]}"
        delivery_packet["event_id"] = event_id

    try:
        result = await _process_webhook_delivery(
            event_id=event_id,
            project_id=project_id,
            company_id=company_id,
            event_type=event_type,
            data_payload=data_payload,
            target_url=target_url,
            url_index=url_index,
            retry_count=task_instance.request.retries,
            request_headers=delivery_packet.get("request_headers"),
            started_at=delivery_packet.get("started_at", time.time()),
        )
    finally:
        # Drop connection pool instances to avoid database bleeding
        await engine.dispose()

    # Evaluation retry phase
    if result.get("captured_exception"):
        if task_instance.request.retries < task_instance.max_retries:
            logger.warning("Attempt %s failed for event %s; triggering Celery retry", task_instance.request.retries + 1, event_id)
            
            # For retry, pass the lightweight payload structure to preserve reference
            retry_packet = {
                "event_id": event_id,
                "url_index": url_index
            }
            raise task_instance.retry(
                args=[], 
                kwargs={"delivery_packet": retry_packet}, 
                exc=result["captured_exception"]
            )

        logger.warning("Retries exhausted for project %s; routing packet to DLQ", project_id)
        
        # Route FULL payload to DLQ so the UI can render it and requeues work correctly
        dlq_packet = {
            "event_id": event_id,
            "project_id": project_id,
            "company_id": company_id,
            "event_type": event_type,
            "data_payload": data_payload,
            "target_url": result.get("target_url") or target_url,
            "url_index": url_index
        }
        try:
            with celery_app.producer_pool.acquire(block=True) as producer:
                producer.publish(
                    {
                        "event_id": event_id,
                        "delivery_packet": dlq_packet,
                        "reason": str(result["captured_exception"])
                    },
                    exchange="webhook_dlx",      # Dead letter exchange configured on RabbitMQ
                    routing_key="webhook.failed", # Exact routing key matched with DLQ binding
                    serializer="json",
                    retry=True
                )
            logger.info("Event %s routed to DLQ successfully", event_id)
        except Exception as dlq_err:
            logger.exception("Celery native transport failed to route to DLQ")

        return {"status": "failed_and_routed_to_dlq", "reason": str(result["captured_exception"]) }

    logger.info("Worker delivered event %s with status %s", event_id, result["response_code"])
    return sanitize_response_payload({"status": "delivered", "http_status": result["response_code"]})


async def _process_webhook_delivery(
    event_id: str,
    project_id: int,
    company_id: int,
    event_type: str,
    data_payload: dict,
    target_url: Optional[str],
    url_index: int,
    retry_count: int,
    request_headers: Optional[dict] = None,
    started_at: Optional[float] = None,
):
    response_code = 500
    response_text = "Internal Worker Client Error"
    captured_exception = None
    event_config_id = None
    response = None

    # Step 1: Redis-first resolution with DB read-through fallback
    cached_config = None
    redis_client = None
    try:
        import redis.asyncio as aioredis
        from backend.config import settings
        # Instantiate a fresh connection to avoid "Event loop is closed" errors
        # caused by mixing asyncio.run() with a global connection pool
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True, protocol=2)
        cached_data_raw = await redis_client.get(f"auth:project_{project_id}")
        if cached_data_raw:
            cached_config = json.loads(cached_data_raw)
    except Exception as redis_err:
        logger.warning("Redis cache read failed in worker: %s", redis_err)
    finally:
        if redis_client:
            try:
                await redis_client.close()
            except Exception:
                pass

    # Cache miss or legacy cache without 'event_configs' mapping -> read-through DB query
    if not cached_config or "event_configs" not in cached_config:
        try:
            async for db_session in get_db():
                cached_config = await refresh_project_cache(project_id, db_session)
                break
        except Exception as db_err:
            logger.error("Database fallback failed in worker: %s", db_err)

    # Resolve event configuration from cache payload
    if cached_config:
        cached_event = cached_config.get("event_configs", {}).get(event_type)
        if cached_event:
            event_config_id = cached_event.get("id")
            
            # Resolve target URL dynamically
            metadata_urls = cached_event.get("metadata_json") or {}
            urls_list = metadata_urls.get("urls")
            
            resolved_url = None
            if isinstance(urls_list, list) and len(urls_list) > 0:
                if 0 <= url_index < len(urls_list):
                    resolved_url = urls_list[url_index]
                else:
                    resolved_url = urls_list[0]
            elif cached_event.get("target_url"):
                resolved_url = cached_event["target_url"]
                
            if resolved_url:
                target_url = resolved_url

    # Format and normalize resolved URL
    if target_url:
        target_url = unquote(str(target_url))
        if ";" in target_url:
            urls = [u.strip() for u in target_url.split(";") if u.strip()]
            target_url = urls[0] if urls else target_url
        if not target_url.startswith("http://") and not target_url.startswith("https://"):
            target_url = f"http://backend:8000{target_url}" if target_url.startswith("/") else f"http://backend:8000/{target_url}"
            
        # Map localhost to the backend container for Docker networking
        target_url = target_url.replace("http://localhost:8000", "http://backend:8000")
        target_url = target_url.replace("http://127.0.0.1:8000", "http://backend:8000")

    # Update WebhookEvent target_url in DB to match resolved target_url (keeps UI reports consistent)
    if target_url:
        try:
            async for db_session in get_db():
                db_event = await db_session.get(WebhookEvent, event_id)
                if db_event and db_event.target_url != target_url:
                    db_event.target_url = target_url
                    await db_session.commit()
                break
        except Exception as e:
            logger.warning("Failed to update WebhookEvent target_url in DB: %s", e)

    if not target_url:
        response_code = 404
        response_text = f"No target_url configured mapping found for project {project_id}"
        await _persist_webhook_log(
            event_id=event_id,
            event_config_id=event_config_id,
            status=WebhookStatus.FAILED,
            attempt_number=retry_count + 1,
            response_code=response_code,
            error_message=response_text,
        )
        return {"target_url": None, "response_code": response_code, "response_text": response_text, "captured_exception": None}

    # Step 2: Cryptographic Signature Delivery Pipeline Block
    delivery_payload = {
        "project_id": project_id,
        "company_id": company_id,
        "target_url": target_url,
        "event": event_type,
        "event_type": event_type,
        "data": data_payload,
    }
    payload_bytes = json.dumps(delivery_payload, sort_keys=True).encode("utf-8")

    request_headers = {
        "Event-Id": event_id,
        "Content-Type": "application/json",
        "X-GATEWAY-SIGNATURE": WebhookSecurity.sign_payload(payload_bytes, settings.SYSTEM_PRIVATE_KEY or "gateway-secret"),
    }

    # Step 3: Outbound Transport Network Handling
    try:
        with httpx.Client(timeout=5.0) as client:
            logger.info("Sending webhook %s to %s (attempt %s)", event_id, target_url, retry_count + 1)
            response = client.post(
                target_url,
                content=payload_bytes,
                headers=request_headers,
            )
            response_code = response.status_code
            response_text = response.text
            if response_code >= 300:
                captured_exception = Exception(f"Delivery failed with status {response_code}")
    except httpx.RequestError as exc:
        response_text = f"Network Timeout/Connection Error: {str(exc)}"
        logger.warning("Worker network error for %s: %s", event_id, response_text)
        captured_exception = exc

    # Step 4: Storage Transaction Tracking
    result = await _persist_webhook_log(
        event_id=event_id,
        event_config_id=event_config_id,
        response_code=response_code,
        attempt_number=retry_count + 1,
        status=WebhookStatus.SUCCESS if response_code < 300 else WebhookStatus.FAILED,
        error_message=response_text if response_code >= 300 else None,
        processing_duration_ms=int((time.time() - (started_at or time.time())) * 1000),
        source_ip=None,
        http_method="POST",
    )

    return {
        "target_url": target_url,
        "response_code": response_code,
        "response_text": response_text,
        "captured_exception": captured_exception,
    }


@celery_app.task(bind=True)
def cleanup_old_webhook_logs(self: Task):
    """Background task to delete webhook logs older than each project's retention_days."""
    try:
        return asyncio.run(_cleanup_old_logs())
    except Exception as exc:
        logger.exception("Failed cleanup task")
        raise


async def _cleanup_old_logs():
    async for db_session in get_db():
        # Fetch projects with retention configuration
        proj_res = await db_session.execute(
            select(
                Project.id, 
                Project.retention_days, 
                getattr(Project, "retention_mode", None), 
                getattr(Project, "delete_date", None), 
                getattr(Project, "delete_time", None)
            )
        )
        projects = proj_res.fetchall()
        now = datetime.utcnow()
        for proj in projects:
            project_id = proj[0]
            retention_days = proj[1] or 30
            retention_mode = proj[2] or "rolling_days"
            delete_date_val = proj[3]
            delete_time_val = proj[4] or "02:00"

            if retention_mode == "specific_date" and delete_date_val:
                try:
                    time_parts = str(delete_time_val).split(":")
                    hour = int(time_parts[0]) if len(time_parts) > 0 else 2
                    minute = int(time_parts[1]) if len(time_parts) > 1 else 0

                    if isinstance(delete_date_val, str):
                        target_dt = datetime.strptime(delete_date_val, "%Y-%m-%d").replace(hour=hour, minute=minute)
                    else:
                        target_dt = delete_date_val.replace(hour=hour, minute=minute)

                    if now < target_dt:
                        continue  # Target purge time has not arrived yet
                    cutoff = target_dt
                except Exception:
                    cutoff = now - timedelta(days=retention_days)
            else:
                cutoff = now - timedelta(days=retention_days)

            ec_res = await db_session.execute(select(EventConfig.id).where(EventConfig.project_id == project_id))
            ec_ids = [row[0] for row in ec_res.fetchall()]
            
            # Delete expired Webhook Logs
            if ec_ids:
                del_logs_stmt = delete(WebhookLog).where(WebhookLog.event_config_id.in_(ec_ids), WebhookLog.created_at < cutoff)
                await db_session.execute(del_logs_stmt)

            # Delete expired Webhook Ingress Events
            del_events_stmt = delete(WebhookEvent).where(WebhookEvent.project_id == project_id, WebhookEvent.created_at < cutoff)
            await db_session.execute(del_events_stmt)

            await db_session.commit()
        break