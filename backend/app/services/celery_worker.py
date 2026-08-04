import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import unquote

# Signal to database.py that this process is a Celery worker so it uses NullPool.
os.environ.setdefault("IS_CELERY_WORKER", "true")

import httpx
from celery import Celery, Task
from kombu import Exchange, Queue
from sqlalchemy import select, delete, or_

from config import settings

# Database Layer & Models Mapping
from database import get_db, engine 
from app.models.event_config import EventConfig
from app.models.webhook_log import WebhookLog, WebhookStatus
from app.models.project import Project
from app.models.webhook_event import WebhookEvent
from app.services.metrics_service import metrics_service
from app.utils.security import WebhookSecurity, sanitize_for_logging
from app.services.failover import service_health_monitor, sanitize_response_payload
from app.services.redis_client import get_redis_client
from app.services.project_service import refresh_project_cache
from app.services import pubsub_service

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
        Queue("celery", routing_key="celery"),
    ),
    task_default_queue="webhook_delivery_queue",
    task_default_exchange="webhook_delivery_queue",
    task_default_routing_key="webhook_delivery_queue",
    task_routes={
        "app.services.celery_worker.cleanup_old_webhook_logs": {"queue": "celery"},
        "webhook_workers.cleanup_old_webhook_logs": {"queue": "celery"},
        "cleanup_old_webhook_logs": {"queue": "celery"},
    },
    task_create_missing_queues=True  
)

# Periodic cleanup: check for old webhook logs matching per-project retention (runs every minute)
celery_app.conf.beat_schedule = {
    'cleanup-old-webhook-logs-frequent': {
        'task': 'webhook_workers.cleanup_old_webhook_logs',
        'schedule': 60.0,  # every 60 seconds
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
    from app.routers.logs import _serialize_log_entry  # local import to avoid circular
    try:
        async for db_session in get_db():
            event_id = kwargs.get("event_id")
            project_id = kwargs.get("project_id")
            stmt = select(WebhookLog).where(WebhookLog.event_id == event_id)
            result = await db_session.execute(stmt)
            existing_log = result.scalars().first()

            if existing_log:
                existing_log.status = kwargs.get("status")
                existing_log.attempt_number = kwargs.get("attempt_number", 1)
                existing_log.response_code = kwargs.get("response_code")
                existing_log.error_message = kwargs.get("error_message")
                existing_log.processing_duration_ms = kwargs.get("processing_duration_ms")
                existing_log.http_method = kwargs.get("http_method")
                log_entry = existing_log
            else:
                log_entry = WebhookLog(
                    event_id=event_id,
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

            # Coalesced: update target_url on the WebhookEvent in the same session
            target_url_update = kwargs.get("target_url")
            if target_url_update and event_id:
                db_event = await db_session.get(WebhookEvent, event_id)
                if db_event and db_event.target_url != target_url_update:
                    db_event.target_url = target_url_update

            await db_session.commit()

            # ── Redis Pub/Sub: publish the log entry so /ws/logs instantly pushes it ──
            status_val = kwargs.get("status")
            company_id = kwargs.get("company_id")

            if project_id:
                try:
                    # Reload with relationship for serialization
                    from sqlalchemy.orm import selectinload
                    reload_result = await db_session.execute(
                        select(WebhookLog)
                        .options(selectinload(WebhookLog.event))
                        .where(WebhookLog.id == log_entry.id)
                    )
                    reloaded = reload_result.scalars().first()
                    if reloaded:
                        serialized = _serialize_log_entry(reloaded)
                        await pubsub_service.publish_log_event(project_id, serialized)
                except Exception as pub_exc:
                    logger.warning("Pub/Sub log publish failed: %s", pub_exc)

            # ── Redis Pub/Sub: publish webhook_telemetry event ──
            attempt_num = kwargs.get("attempt_number", 1)
            is_replay_msg = bool(attempt_num > 5 or kwargs.get("is_replay", False))
            delivery_type_str = f"DLQ Replay (Attempt #{attempt_num})" if is_replay_msg else "New Webhook Ingress"
            try:
                telemetry_payload = {
                    "event_id": event_id,
                    "project_id": project_id,
                    "company_id": company_id,
                    "status": status_val.name if hasattr(status_val, "name") else str(status_val),
                    "attempt": attempt_num,
                    "is_replay": is_replay_msg,
                    "delivery_type": delivery_type_str,
                    "response_code": kwargs.get("response_code"),
                    "error_message": kwargs.get("error_message"),
                    "processing_duration_ms": kwargs.get("processing_duration_ms"),
                    "http_method": kwargs.get("http_method", "POST"),
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
                await pubsub_service.publish_telemetry_event(telemetry_payload)
            except Exception as tel_exc:
                logger.warning("Pub/Sub telemetry publish failed: %s", tel_exc)

            # ── Redis Pub/Sub: update metrics and publish snapshot ──
            if status_val in [WebhookStatus.SUCCESS, WebhookStatus.FAILED]:
                if company_id:
                    is_success = (status_val == WebhookStatus.SUCCESS)
                    latency = kwargs.get("processing_duration_ms") or 0.0
                    await metrics_service.record_delivery_result(
                        company_id,
                        is_success,
                        latency,
                        project_id=project_id,
                        is_replay=is_replay_msg
                    )

                    # Publish updated metrics snapshot to company and project dashboard subscribers
                    try:
                        from app.routers.logs import _build_dashboard_snapshot
                        snapshot = await _build_dashboard_snapshot(company_id, project_id)
                        await pubsub_service.publish_metrics_snapshot(company_id, snapshot, project_id=project_id)
                    except Exception as snap_exc:
                        logger.warning("Metrics snapshot publish failed: %s", snap_exc)

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
    # 🚀 FIX: Robust payload extraction across all Kombu/Celery protocol versions and argument wrapping
    if delivery_packet is None:
        delivery_packet = kwargs.get("delivery_packet")

    if isinstance(delivery_packet, list) and len(delivery_packet) > 0:
        if isinstance(delivery_packet[0], dict):
            delivery_packet = delivery_packet[0]
        elif isinstance(delivery_packet[0], list) and len(delivery_packet[0]) > 0 and isinstance(delivery_packet[0][0], dict):
            delivery_packet = delivery_packet[0][0]

    if not isinstance(delivery_packet, dict) and args:
        for arg in args:
            if isinstance(arg, dict):
                delivery_packet = arg
                break
            elif isinstance(arg, list) and len(arg) > 0 and isinstance(arg[0], dict):
                delivery_packet = arg[0]
                break

    if not isinstance(delivery_packet, dict):
        delivery_packet = kwargs.get("delivery_packet") or {}
        if isinstance(delivery_packet, list) and len(delivery_packet) > 0 and isinstance(delivery_packet[0], dict):
            delivery_packet = delivery_packet[0]

    if not isinstance(delivery_packet, dict):
        delivery_packet = {}

    try:
        return asyncio.run(orchestrate_webhook_lifecycle(self, delivery_packet))
    except Exception as general_err:
        err_name = type(general_err).__name__
        if "Retry" in err_name or "Reject" in err_name or "Ignore" in err_name:
            raise general_err

        logger.warning("Worker task execution attempt %s crashed with error: %s", self.request.retries + 1, general_err)
        if self.request.retries < self.max_retries:
            raise self.retry(exc=general_err)
        else:
            logger.error("All 5 retries exhausted after worker engine crash: %s", general_err)
            event_id = delivery_packet.get("event_id") if isinstance(delivery_packet, dict) else f"evt_err_{int(time.time()*1000)}"
            project_id = delivery_packet.get("project_id") if isinstance(delivery_packet, dict) else None
            company_id = delivery_packet.get("company_id") if isinstance(delivery_packet, dict) else None

            dlq_packet = {
                "event_id": event_id,
                "project_id": project_id,
                "company_id": company_id,
                "event_type": delivery_packet.get("event_type") if isinstance(delivery_packet, dict) else "webhook.failed",
                "data_payload": delivery_packet.get("data_payload") if isinstance(delivery_packet, dict) else delivery_packet,
                "target_url": delivery_packet.get("target_url") if isinstance(delivery_packet, dict) else "/v1/gateway",
                "retry_count": 5,
                "attempt_number": 5,
                "error_message": f"Worker crashed (5 retries exhausted): {general_err}",
            }
            try:
                with celery_app.producer_pool.acquire(block=True) as producer:
                    producer.publish(
                        {
                            "event_id": event_id,
                            "delivery_packet": dlq_packet,
                            "reason": str(general_err)
                        },
                        exchange="webhook_dlx",
                        routing_key="webhook.failed",
                        serializer="json",
                        retry=True
                    )
                if company_id:
                    asyncio.run(pubsub_service.publish_dlq_event(company_id, "ADDED", dlq_packet))
            except Exception as dlq_pub_err:
                logger.error("Failed to publish crashed task to DLQ: %s", dlq_pub_err)
            return {"status": "failed_and_routed_to_dlq", "reason": str(general_err)}


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

    manual_attempt = delivery_packet.get("manual_attempt_number") or delivery_packet.get("attempt_number")
    # FIX: Clean attempt lifecycle.
    # - Normal Celery retries: use request.retries (0-indexed) + 1
    # - DLQ replay: manual_attempt_number is set explicitly (typically 6+) by the replay handler
    # Use the manual value ONLY if explicitly set by the DLQ replay path; otherwise use Celery's counter.
    if manual_attempt and isinstance(manual_attempt, int) and manual_attempt > task_instance.max_retries:
        effective_retry_count = manual_attempt - 1  # Convert to 0-based for _process_webhook_delivery
    else:
        effective_retry_count = task_instance.request.retries  # Standard Celery 0-indexed retry count

    result = await _process_webhook_delivery(
        event_id=event_id,
        project_id=project_id,
        company_id=company_id,
        event_type=event_type,
        data_payload=data_payload,
        target_url=target_url,
        url_index=url_index,
        retry_count=effective_retry_count,
        request_headers=delivery_packet.get("request_headers"),
        started_at=delivery_packet.get("started_at", time.time()),
    )

    is_replay = bool(delivery_packet.get("is_replay") or (manual_attempt and isinstance(manual_attempt, int) and manual_attempt > task_instance.max_retries))

    # Evaluation retry phase
    if result.get("captured_exception"):
        # Replayed messages from DLQ (attempt > 5) should NOT perform 5 automatic retries;
        # if the single replay attempt fails, route it directly back to DLQ with incremented attempt_number!
        if not is_replay and task_instance.request.retries < task_instance.max_retries:
            logger.warning("Attempt %s failed for event %s; triggering Celery retry", task_instance.request.retries + 1, event_id)
            
            retry_packet = dict(delivery_packet) if isinstance(delivery_packet, dict) else {}
            retry_packet["event_id"] = event_id
            retry_packet["url_index"] = url_index
            retry_packet["project_id"] = project_id
            retry_packet["company_id"] = company_id
            retry_packet["event_type"] = event_type
            retry_packet["data_payload"] = data_payload
            retry_packet["target_url"] = target_url
            retry_packet["attempt_number"] = task_instance.request.retries + 2

            raise task_instance.retry(
                args=[], 
                kwargs={"delivery_packet": retry_packet}, 
                exc=result["captured_exception"]
            )

        final_attempt_num = int(manual_attempt) if (is_replay and manual_attempt) else 5
        logger.warning("Delivery failed for event %s (attempt %s, is_replay=%s); routing packet to DLQ", event_id, final_attempt_num, is_replay)
        
        # Route FULL payload to DLQ so the UI can render it and requeues work correctly
        dlq_packet = {
            "event_id": event_id,
            "project_id": project_id,
            "company_id": company_id,
            "event_type": event_type,
            "data_payload": data_payload,
            "target_url": result.get("target_url") or target_url,
            "url_index": url_index,
            "retry_count": final_attempt_num,
            "attempt_number": final_attempt_num,
            "is_replay": True,
            "request_headers": delivery_packet.get("request_headers") if isinstance(delivery_packet, dict) else None,
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
            logger.info("Event %s routed to DLQ successfully (attempt %s)", event_id, final_attempt_num)
            if company_id:
                await pubsub_service.publish_dlq_event(company_id, "ADDED", dlq_packet)
        except Exception as dlq_err:
            logger.exception("Celery native transport failed to route to DLQ")

        return {"status": "failed_and_routed_to_dlq", "reason": str(result["captured_exception"])}

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
        from config import settings
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

    # Step 3: Outbound Transport Network Handling (async — non-blocking)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            logger.info("Sending webhook %s to %s (attempt %s)", event_id, target_url, retry_count + 1)
            response = await client.post(
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
        project_id=project_id,
        company_id=company_id,
        response_code=response_code,
        attempt_number=retry_count + 1,
        status=WebhookStatus.SUCCESS if response_code < 300 else WebhookStatus.FAILED,
        error_message=response_text if response_code >= 300 else None,
        processing_duration_ms=int((time.time() - (started_at or time.time())) * 1000),
        source_ip=None,
        http_method="POST",
        target_url=target_url,
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

            evt_res = await db_session.execute(select(WebhookEvent.event_id).where(WebhookEvent.project_id == project_id))
            evt_ids = [row[0] for row in evt_res.fetchall()]

            # Build OR condition matching either event_config_id or event_id
            where_conds = []
            if ec_ids:
                where_conds.append(WebhookLog.event_config_id.in_(ec_ids))
            if evt_ids:
                where_conds.append(WebhookLog.event_id.in_(evt_ids))
            
            # Delete expired Webhook Logs
            if where_conds:
                del_logs_stmt = delete(WebhookLog).where(or_(*where_conds), WebhookLog.created_at < cutoff)
                await db_session.execute(del_logs_stmt)

            # Delete expired Webhook Ingress Events
            del_events_stmt = delete(WebhookEvent).where(WebhookEvent.project_id == project_id, WebhookEvent.created_at < cutoff)
            await db_session.execute(del_events_stmt)

            await db_session.commit()
        break