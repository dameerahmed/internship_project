from fastapi import APIRouter, Request, Depends, HTTPException, status
from pydantic import BaseModel
import asyncio
import httpx
import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from backend.app.services.redis_client import get_redis, get_redis_client
from backend.app.utils.security import WebhookSecurity, build_log_payload, sanitize_for_logging
from backend.app.services.celery_worker import dispatch_webhook_task
from backend.app.services.failover import (
    offline_message_buffer,
    populate_cache_if_available,
    sanitize_response_payload,
    service_health_monitor,
)
from backend.app.services.project_service import refresh_project_cache
from backend.app.models.event_config import EventConfig
from backend.app.models.project import Project
from backend.app.models.webhook_event import WebhookEvent
from backend.app.models.webhook_log import WebhookLog, WebhookStatus
from backend.database import get_db

router = APIRouter(tags=["Gateway"])
logger = logging.getLogger("gateway_router")


class GatewayTestRequest(BaseModel):
    api_key: str
    secret_key: str
    event_type: str = "order.created"
    payload: Dict[str, Any] = {
        "event": "order.created",
        "order_id": "ord_1001",
        "amount": 99.99
    }


async def _persist_gateway_log(log_payload: dict) -> None:
    try:
        async for db_session in get_db():
            event_id = log_payload.get("event_id")
            if event_id:
                existing_event = await db_session.get(WebhookEvent, event_id)
                if existing_event is None:
                    existing_event = WebhookEvent(
                        event_id=event_id,
                        project_id=log_payload.get("project_id"),
                        event_config_id=log_payload.get("event_config_id"),
                        event_type=log_payload.get("event_type", "webhook.received"),
                        target_url=log_payload.get("forwarding_target_url"),
                        payload=log_payload.get("request_payload") or log_payload.get("payload") or {},
                        metadata_json={
                            "source": "gateway",
                            "status": log_payload.get("status", "PENDING"),
                            "incoming_headers": log_payload.get("incoming_headers"),
                            "request_payload": log_payload.get("request_payload") or log_payload.get("payload"),
                        },
                    )
                    db_session.add(existing_event)
                else:
                    existing_event.project_id = log_payload.get("project_id")
                    existing_event.event_config_id = log_payload.get("event_config_id")
                    existing_event.event_type = log_payload.get("event_type", "webhook.received")
                    existing_event.target_url = log_payload.get("forwarding_target_url")
                    existing_event.payload = log_payload.get("request_payload") or log_payload.get("payload") or {}
                    existing_event.metadata_json = {
                        "source": "gateway",
                        "status": log_payload.get("status", "PENDING"),
                        "incoming_headers": log_payload.get("incoming_headers"),
                        "request_payload": log_payload.get("request_payload") or log_payload.get("payload"),
                    }

            entry = WebhookLog(
                event_id=event_id,
                event_config_id=log_payload.get("event_config_id"),
                status=WebhookStatus[log_payload.get("status", "PENDING")],
                attempt_number=log_payload.get("attempt_number", 1),
                response_code=log_payload.get("response_code"),
                error_message=log_payload.get("error_message"),
                processing_duration_ms=log_payload.get("processing_duration_ms"),
                source_ip=log_payload.get("source_ip"),
                http_method=log_payload.get("http_method"),
            )
            db_session.add(entry)
            await db_session.commit()
            break
    except Exception as exc:
        logger.warning("Failed to persist gateway log: %s", exc)


async def _queue_gateway_log(log_payload: dict, redis_conn=None) -> None:
    if redis_conn is not None:
        try:
            await redis_conn.rpush("gateway:logs", json.dumps(log_payload))
            await redis_conn.expire("gateway:logs", 86400)
        except Exception as exc:
            logger.warning("Redis queue log warning: %s", exc)
    else:
        try:
            redis_client = await get_redis_client()
            try:
                await redis_client.rpush("gateway:logs", json.dumps(log_payload))
                await redis_client.expire("gateway:logs", 86400)
            finally:
                await redis_client.close()
        except Exception as exc:
            logger.warning("Redis unavailable while queueing gateway log: %s", exc)

    asyncio.create_task(_persist_gateway_log(log_payload))


@router.post("/v1/gateway")
async def incoming_webhook_receiver(request: Request, redis_conn = Depends(get_redis)):
    started_at = time.time()
    event_id = f"evt_{uuid.uuid4().hex}"

    try:
        # 1. Read mandatory security headers
        client_api_key = request.headers.get("X-API-KEY")
        incoming_signature = request.headers.get("X-HUB-SIGNATURE")
        
        if not client_api_key or not incoming_signature:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Security credentials headers missing (X-API-KEY or X-HUB-SIGNATURE)"
            )
            
        # 2. Decrypt & parse 4-part key. Fails instantly if parts != 4 or tampered
        project_id, company_id, incoming_secret = WebhookSecurity.decode_and_parse_api_key(client_api_key)
        
        # 3. Pull authentication payload from Redis cache (FastAPI will manage the yielded dependency)
        cached_data_raw = None
        try:
            cached_data_raw = await redis_conn.get(f"auth:project_{project_id}")
        except Exception as redis_err:
            logger.warning("Redis cache lookup failed; falling back to database-backed validation: %s", redis_err)
            cached_data_raw = None

        if not cached_data_raw:
            async for db_session in get_db():
                cached_config = await refresh_project_cache(project_id, db_session, redis_conn)
                if not cached_config or not cached_config.get("is_active"):
                    raise HTTPException(status_code=401, detail="Project configuration unrecognized or deactivated")
                break
            else:
                raise HTTPException(status_code=401, detail="Project configuration unrecognized or deactivated")
        else:
            cached_config = json.loads(cached_data_raw)
        
        # 4. Perform Constant-Time Secret Hash Matching
        is_valid_key = WebhookSecurity.verify_secret_hash(incoming_secret, cached_config["hashed_secret"])
        if not is_valid_key or not cached_config["is_active"]:
            raise HTTPException(status_code=401, detail="Authentication failed: Keys mismatch")
            
        # 5. Extract Raw Bytes body for HMAC verification first (Crucial step)
        body_bytes = await request.body()
        
        is_signature_valid = WebhookSecurity.verify_hmac_signature(
            payload=body_bytes,
            secret_key=cached_config["secret_key"],
            incoming_signature=incoming_signature
        )
        if not is_signature_valid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signature authentication failed")

        try:
            payload_json = json.loads(body_bytes.decode("utf-8"))
            incoming_event_type = payload_json.get("event")
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

        request_headers = {key: value for key, value in request.headers.items() if key.lower() not in {"authorization", "cookie", "x-api-key", "x-hub-signature"}}
        request_payload = sanitize_for_logging(payload_json)
        log_payload = build_log_payload(
            event_id=event_id,
            request_headers=request_headers,
            request_payload=request_payload,
            project_id=project_id,
            event_type=incoming_event_type,
            event_config_id=None,
            status="PENDING",
            attempt_number=1,
            response_code=None,
            response_body=json.dumps({"status": "queued"}),
            error_message=None,
            forwarding_target_url=None,
            processing_duration_ms=None,
            source_ip=request.client.host if request.client else None,
            http_method=request.method,
        )

        if not incoming_event_type or incoming_event_type not in cached_config.get("allowed_events", []):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The event type '{incoming_event_type}' is not configured"
            )

        target_urls = []
        event_configs = cached_config.get("event_configs", {})
        cached_event = event_configs.get(incoming_event_type)

        # If cache lacks "event_configs" (e.g. legacy cache), read-through by refreshing cache
        if cached_event is None and incoming_event_type in cached_config.get("allowed_events", []):
            try:
                async for db_session in get_db():
                    cached_config = await refresh_project_cache(project_id, db_session, redis_conn)
                    event_configs = cached_config.get("event_configs", {})
                    cached_event = event_configs.get(incoming_event_type)
                    break
            except Exception:
                pass

        if cached_event and cached_event.get("is_active", True):
            log_payload["event_config_id"] = cached_event.get("id")
            metadata_urls = cached_event.get("metadata_json") or {}
            if isinstance(metadata_urls.get("urls"), list):
                target_urls = [url for url in metadata_urls["urls"] if isinstance(url, str) and url.strip()]
            elif cached_event.get("target_url"):
                target_urls = [cached_event["target_url"]]
            log_payload["forwarding_target_url"] = target_urls[0] if target_urls else cached_event.get("target_url")

        await _queue_gateway_log(log_payload, redis_conn=redis_conn)

        if not target_urls:
            target_urls = [None]

        broker_status = await service_health_monitor.check_services()
        for idx, target_url in enumerate(target_urls):
            delivery_packet = {
                "event_id": event_id,
                "url_index": idx,
            }

            if broker_status.get("rabbitmq"):
                dispatch_webhook_task.apply_async(args=[delivery_packet], queue="webhook_delivery_queue")
            else:
                offline_message_buffer.enqueue(delivery_packet)
                logger.warning("RabbitMQ unavailable; buffering delivery packet %s for later replay", event_id)

        if not broker_status.get("rabbitmq"):
            asyncio.create_task(offline_message_buffer.drain(lambda item: dispatch_webhook_task.apply_async(args=[item], queue="webhook_delivery_queue")))

        return sanitize_response_payload({"status": "Accepted", "detail": "Valid signature. Webhook delivery task queued."})
        
    except HTTPException:
        raise
    except Exception as general_err:
        raise HTTPException(status_code=500, detail=f"Fatal Gateway Crash: {str(general_err)}")


@router.post("/v1/gateway/test")
async def test_webhook_receiver(test_req: GatewayTestRequest):
    """
    Swagger UI Test Helper Endpoint (/docs):
    Takes mandatory api_key, secret_key, event_type, and payload.
    Calculates X-HUB-SIGNATURE using the required secret_key and sends an HTTP POST
    request to hit our real gateway route POST /v1/gateway!
    """
    payload_data = dict(test_req.payload or {})
    payload_data["event"] = test_req.event_type

    body_bytes = json.dumps(payload_data).encode("utf-8")
    signature = WebhookSecurity.sign_payload(body_bytes, test_req.secret_key)

    headers = {
        "X-API-KEY": test_req.api_key,
        "X-HUB-SIGNATURE": signature,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                "http://127.0.0.1:8000/v1/gateway",
                headers=headers,
                content=body_bytes
            )
            response_json = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
            response_code = response.status_code
        except Exception as exc:
            return sanitize_response_payload({
                "status": "Failed",
                "detail": f"Failed to send request to /v1/gateway: {str(exc)}",
                "generated_headers": headers,
                "sent_payload": payload_data,
            })

    return sanitize_response_payload({
        "status": "Gateway_Accepted" if response_code < 400 else "Gateway_Rejected",
        "gateway_http_code": response_code,
        "gateway_response": response_json,
        "generated_headers": headers,
        "sent_payload": payload_data,
        "curl_command": (
            f"curl -X POST http://127.0.0.1:8000/v1/gateway "
            f"-H 'X-API-KEY: {test_req.api_key}' "
            f"-H 'X-HUB-SIGNATURE: {signature}' "
            f"-H 'Content-Type: application/json' "
            f"-d '{json.dumps(payload_data)}'"
        )
    })
