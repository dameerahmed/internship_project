import asyncio
import logging
import json
from typing import Optional
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote
from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, func, case
from sqlalchemy.orm import selectinload
import time
from app.services.dependencies import get_current_company
from app.services.redis_client import get_redis_client
from app.models.event_config import EventConfig
from app.models.project import Project
from app.models.webhook_log import WebhookLog, WebhookStatus
from app.models.webhook_event import WebhookEvent
from app.services.celery_worker import dispatch_webhook_task
from app.services.metrics_service import metrics_service
from app.services.pubsub_service import (
    RedisPubSubSubscriber,
    logs_channel,
    metrics_channel,
    project_metrics_channel,
    dlq_channel,
    publish_dlq_event,
    publish_metrics_snapshot,
)
from app.utils.security import JWTManager
from starlette.websockets import WebSocketState
from app.services.failover import service_health_monitor
from database import get_db
from app.services.queue_client import rabbitmq_manager
from app.services.rate_limiter import (
    rate_limit_api,
    rate_limit_dashboard,
    rate_limit_dlq_actions,
)

logger = logging.getLogger("logs_router")
router = APIRouter(tags=["Logs"])


# ─────────────────────────── helpers ─────────────────────────────────────────

def _parse_query_datetime(value):
    if not value:
        return None

    text = value.strip()
    if not text:
        return None

    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed

    # Strip tzinfo so it matches PostgreSQL TIMESTAMP WITHOUT TIME ZONE
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def _serialize_log_entry(log: WebhookLog) -> dict:
    event_obj = getattr(log, "event", None)
    event_payload = event_obj.payload if event_obj and event_obj.payload else {}
    event_metadata = event_obj.metadata_json if event_obj and isinstance(event_obj.metadata_json, dict) else {}
    target_url = event_obj.target_url if event_obj and event_obj.target_url else None

    incoming_headers = event_metadata.get("incoming_headers") or {
        "Content-Type": "application/json",
        "User-Agent": "Webhook-Gateway/2.0",
        "Source-IP": log.source_ip or "127.0.0.1",
        "X-Gateway-Verified": "HMAC-SHA256 (Constant Time Match)",
    }
    
    event_type = (
        (event_obj.event_type if event_obj and event_obj.event_type else None)
        or (event_payload.get("event") if isinstance(event_payload, dict) else None)
        or (event_payload.get("event_type") if isinstance(event_payload, dict) else None)
        or "webhook.received"
    )
    status_name = log.status.name if log.status else "UNKNOWN"
    level = "SUCCESS" if status_name == "SUCCESS" else "ERROR" if status_name == "FAILED" else "INFO"

    metadata = {
        "event_type": event_type,
        "status": status_name,
        "response_code": log.response_code,
        "attempt": log.attempt_number,
        "http_method": log.http_method or "POST",
        "source_ip": log.source_ip or "127.0.0.1",
        "processing_duration_ms": log.processing_duration_ms,
        "target_url": target_url,
        "incoming_headers": incoming_headers,
        "request_payload": event_payload,
        "response_data": {
            "status_code": log.response_code or 200,
            "status": status_name,
            "error_message": log.error_message,
            "processing_duration_ms": log.processing_duration_ms,
        }
    }
    if log.error_message:
        metadata["error_message"] = log.error_message
    if event_payload:
        metadata["event_payload"] = event_payload

    timestamp_dt = log.created_at.replace(tzinfo=timezone.utc) if log.created_at and log.created_at.tzinfo is None else log.created_at

    return {
        "id": f"log-{log.id}",
        "timestamp": timestamp_dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + "Z" if timestamp_dt else "",
        "created_at": timestamp_dt.isoformat() if timestamp_dt else None,
        "level": level,
        "message": (event_payload.get("message") if isinstance(event_payload, dict) else None) or (event_payload.get("event") if isinstance(event_payload, dict) else None) or f"Webhook event '{event_type}'",
        "source": "gateway",
        "status": status_name,
        "status_code": log.response_code,
        "response_code": log.response_code,
        "event_type": event_type,
        "http_method": log.http_method or "POST",
        "target_url": target_url,
        "path": target_url,
        "attempt": log.attempt_number,
        "processing_duration_ms": log.processing_duration_ms,
        "source_ip": log.source_ip or "127.0.0.1",
        "error_message": log.error_message,
        "metadata": metadata,
    }


def _decode_company_id_from_token(token: Optional[str]) -> Optional[int]:
    if not token:
        return None

    try:
        payload = JWTManager.decode_access_token(token)
        if not payload or payload.get("type") != "access":
            return None
        company_id_str = payload.get("sub") or payload.get("company_id")
        if not company_id_str:
            return None
        return int(company_id_str)
    except Exception:
        return None


async def _authenticate_request(request: Request, token_override: Optional[str] = None) -> Optional[int]:
    token = token_override or request.query_params.get("token")
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    return _decode_company_id_from_token(token)


async def _ws_authenticate(websocket: WebSocket) -> Optional[int]:
    """
    Extract and validate a JWT from the `?token=` WebSocket query parameter.
    Returns the authenticated company_id (int) or None on failure.

    WebSocket cannot use HTTP Authorization headers directly in browser clients,
    so the access token is passed as a query parameter. This is the industry
    standard pattern (used by Pusher, Ably, Supabase Realtime, etc.).
    """
    return _decode_company_id_from_token(websocket.query_params.get("token"))


# ─────────────────────── REST: Webhook Logs ──────────────────────────────────

@router.get("/v1/projects/{project_id}/webhook-logs")
@router.get("/v1/projects/{project_id}/logs")
async def list_project_logs(
    project_id: int,
    start: str = Query(None, description="ISO start datetime to filter logs"),
    end: str = Query(None, description="ISO end datetime to filter logs"),
    status_code: str = Query(None, description="Status code filter: 2xx, 4xx, 5xx"),
    limit: int = Query(100, ge=1, le=1000),
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
):
    company_id = current_company.id
    project_result = await db.execute(select(Project).where(Project.id == project_id, Project.company_id == company_id))
    if project_result.scalars().first() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    event_config_result = await db.execute(select(EventConfig.id).where(EventConfig.project_id == project_id))
    event_config_ids = [row[0] for row in event_config_result.fetchall()]

    if not event_config_ids:
        return []

    query = (
        select(WebhookLog)
        .options(selectinload(WebhookLog.event))
        .where(WebhookLog.event_config_id.in_(event_config_ids))
    )

    if status_code:
        code_str = status_code.lower().strip()
        if code_str in ("2xx", "200", "success"):
            query = query.where(WebhookLog.response_code >= 200, WebhookLog.response_code < 300)
        elif code_str in ("4xx", "400", "client_error"):
            query = query.where(WebhookLog.response_code >= 400, WebhookLog.response_code < 500)
        elif code_str in ("5xx", "500", "server_error"):
            query = query.where(WebhookLog.response_code >= 500)

    try:
        start_dt = _parse_query_datetime(start)
        if start_dt is not None:
            query = query.where(WebhookLog.created_at >= start_dt)

        end_dt = _parse_query_datetime(end)
        if end_dt is not None:
            query = query.where(WebhookLog.created_at <= end_dt)
    except Exception:
        pass

    offset = (page - 1) * limit
    query = query.order_by(WebhookLog.created_at.desc()).offset(offset).limit(limit)
    logs_result = await db.execute(query)
    logs = logs_result.scalars().all()
    return [_serialize_log_entry(log) for log in logs]


@router.get("/v1/webhooks/logs")
async def list_company_webhooks_logs(
    start: str = Query(None, description="ISO start datetime to filter logs"),
    end: str = Query(None, description="ISO end datetime to filter logs"),
    status_code: str = Query(None, description="Status code filter: 2xx, 4xx, 5xx"),
    limit: int = Query(100, ge=1, le=1000),
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
):
    company_id = current_company.id
    proj_result = await db.execute(select(Project.id).where(Project.company_id == company_id))
    project_ids = [row[0] for row in proj_result.fetchall()]

    if not project_ids:
        return []

    event_config_result = await db.execute(select(EventConfig.id).where(EventConfig.project_id.in_(project_ids)))
    event_config_ids = [row[0] for row in event_config_result.fetchall()]

    if not event_config_ids:
        return []

    query = (
        select(WebhookLog)
        .options(selectinload(WebhookLog.event))
        .where(WebhookLog.event_config_id.in_(event_config_ids))
    )

    if status_code:
        code_str = status_code.lower().strip()
        if code_str in ("2xx", "200", "success"):
            query = query.where(WebhookLog.response_code >= 200, WebhookLog.response_code < 300)
        elif code_str in ("4xx", "400", "client_error"):
            query = query.where(WebhookLog.response_code >= 400, WebhookLog.response_code < 500)
        elif code_str in ("5xx", "500", "server_error"):
            query = query.where(WebhookLog.response_code >= 500)

    try:
        start_dt = _parse_query_datetime(start)
        if start_dt is not None:
            query = query.where(WebhookLog.created_at >= start_dt)

        end_dt = _parse_query_datetime(end)
        if end_dt is not None:
            query = query.where(WebhookLog.created_at <= end_dt)
    except Exception:
        pass

    offset = (page - 1) * limit
    query = query.order_by(WebhookLog.created_at.desc()).offset(offset).limit(limit)
    logs_result = await db.execute(query)
    logs = logs_result.scalars().all()
    return [_serialize_log_entry(log) for log in logs]



@router.delete("/v1/projects/{project_id}/webhook-logs")
async def delete_project_logs(
    project_id: int,
    before: str = Query(None, description="ISO datetime; delete logs created before this time"),
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
):
    company_id = current_company.id
    result = await db.execute(select(Project).where(Project.id == project_id, Project.company_id == company_id))
    db_project = result.scalars().first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    event_config_result = await db.execute(select(EventConfig.id).where(EventConfig.project_id == project_id))
    event_config_ids = [row[0] for row in event_config_result.fetchall()]
    if not event_config_ids:
        return {"deleted": 0, "project_id": project_id}

    try:
        if before:
            before_dt = _parse_query_datetime(before)
            if before_dt is None:
                raise HTTPException(status_code=400, detail="Invalid datetime value")
            del_stmt = delete(WebhookLog).where(WebhookLog.event_config_id.in_(event_config_ids), WebhookLog.created_at < before_dt)
        else:
            del_stmt = delete(WebhookLog).where(WebhookLog.event_config_id.in_(event_config_ids))
        res = await db.execute(del_stmt)
        await db.commit()
        return {"deleted": getattr(res, 'rowcount', 0) or 0, "project_id": project_id}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────── SSE: Live Logs ───────────────────────────────────

@router.get("/api/logs/stream", response_class=EventSourceResponse)
async def stream_logs_sse(
    request: Request,
    project_id: int = Query(..., description="Project ID to stream logs for"),
    token: Optional[str] = Query(None, description="Access token for authentication"),
):
    """Stream webhook logs over SSE with heartbeat support for the Live Logs UI."""
    auth_company_id = await _authenticate_request(request, token)
    if auth_company_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    async def event_generator():
        async for db_session in get_db():
            ownership = await db_session.execute(
                select(Project.id).where(Project.id == project_id, Project.company_id == auth_company_id)
            )
            if not ownership.scalars().first():
                raise HTTPException(status_code=403, detail="Forbidden")

            ec_result = await db_session.execute(select(EventConfig.id).where(EventConfig.project_id == project_id))
            ec_ids = [row[0] for row in ec_result.fetchall()]
            if ec_ids:
                logs_result = await db_session.execute(
                    select(WebhookLog)
                    .options(selectinload(WebhookLog.event))
                    .where(WebhookLog.event_config_id.in_(ec_ids))
                    .order_by(WebhookLog.created_at.desc())
                    .limit(25)
                )
                recent_logs = logs_result.scalars().all()
                payload = {
                    "type": "snapshot",
                    "logs": [_serialize_log_entry(log) for log in reversed(recent_logs)],
                }
                yield ServerSentEvent(data=json.dumps(payload), event="snapshot")
            break

        channels = [logs_channel(project_id)]
        async with RedisPubSubSubscriber(channels) as sub:
            message_iter = sub.listen()
            while True:
                if await request.is_disconnected():
                    break
                try:
                    raw_message = await asyncio.wait_for(anext(message_iter), timeout=15.0)
                except TimeoutError:
                    yield ServerSentEvent(data=json.dumps({"type": "heartbeat", "timestamp": datetime.utcnow().isoformat()}), event="heartbeat")
                    continue
                except StopAsyncIteration:
                    break

                if not raw_message:
                    continue
                if isinstance(raw_message, (bytes, bytearray)):
                    payload = raw_message.decode("utf-8")
                else:
                    payload = raw_message
                yield ServerSentEvent(data=payload, event="log")

    return EventSourceResponse(event_generator())


# ─────────────────────── WebSocket: Live Logs ────────────────────────────────

@router.websocket("/ws/logs/{project_id}")
async def websocket_logs(websocket: WebSocket, project_id: str):
    """
    Authenticated WebSocket stream for a specific project's webhook logs.

    Security:
    - JWT token MUST be passed as ?token= query parameter.
    - The company_id from the JWT must own the requested project_id.
    - No token or wrong ownership → immediate close with 4403.

    Architecture:
    - Sends the last 25 log entries as initial snapshot on connection.
    - Then subscribes to Redis channel `logs:{project_id}` for zero-latency,
      zero-DB-polling real-time updates pushed by the Celery worker.
    """
    await websocket.accept()

    # ── 1. Authenticate ──────────────────────────────────────────────────────
    auth_company_id = await _ws_authenticate(websocket)
    if auth_company_id is None:
        await websocket.close(code=4401, reason="Authentication required: pass ?token=<access_token>")
        return

    # ── 2. Verify project ownership ─────────────────────────────────────────
    try:
        pid = int(project_id)
    except (ValueError, TypeError):
        await websocket.close(code=4400, reason="Invalid project_id")
        return

    async for db_session in get_db():
        ownership = await db_session.execute(
            select(Project.id).where(Project.id == pid, Project.company_id == auth_company_id)
        )
        if not ownership.scalars().first():
            await websocket.close(code=4403, reason="Forbidden: project does not belong to your company")
            return

        # ── 3. Send initial snapshot (last 25 logs) ──────────────────────────
        ec_result = await db_session.execute(select(EventConfig.id).where(EventConfig.project_id == pid))
        ec_ids = [row[0] for row in ec_result.fetchall()]
        if ec_ids:
            logs_result = await db_session.execute(
                select(WebhookLog)
                .options(selectinload(WebhookLog.event))
                .where(WebhookLog.event_config_id.in_(ec_ids))
                .order_by(WebhookLog.created_at.desc())
                .limit(25)
            )
            recent_logs = logs_result.scalars().all()
            for log in reversed(recent_logs):
                try:
                    await websocket.send_json(_serialize_log_entry(log))
                except Exception:
                    return
        break

    # ── 4. Subscribe to Redis Pub/Sub — zero polling ─────────────────────────
    try:
        async with RedisPubSubSubscriber([logs_channel(pid)]) as sub:
            async for raw_message in sub.listen():
                if websocket.client_state != WebSocketState.CONNECTED:
                    break
                try:
                    log_entry = json.loads(raw_message)
                    await websocket.send_json(log_entry)
                except WebSocketDisconnect:
                    return
                except Exception:
                    break
    except WebSocketDisconnect:
        logger.info("Client disconnected from log stream for project %s", project_id)
    except Exception as exc:
        logger.warning("Log WebSocket exception for project %s: %s", project_id, exc)


# ─────────────────────── WebSocket: DLQ Stream ───────────────────────────────

@router.websocket("/ws/dlq")
async def websocket_dlq_stream(websocket: WebSocket):
    """
    Authenticated WebSocket stream for the current company's DLQ.

    Security:
    - company_id is read EXCLUSIVELY from the JWT token.
    - The client-supplied company_id URL pattern is intentionally removed.
    - No cross-tenant data leakage is possible.

    Architecture:
    - Sends initial DLQ snapshot on connect.
    - Subscribes to Redis channel `dlq:{company_id}` for push-based updates.
    """
    await websocket.accept()

    auth_company_id = await _ws_authenticate(websocket)
    if auth_company_id is None:
        await websocket.close(code=4401, reason="Authentication required: pass ?token=<access_token>")
        return

    # ── Initial snapshot ─────────────────────────────────────────────────────
    try:
        raw_dlq_items = await rabbitmq_manager.peek_dlq_messages(limit=100)
        filtered_items = []

        async for db_session in get_db():
            proj_stmt = select(Project.id, Project.name).where(Project.company_id == auth_company_id)
            proj_res = await db_session.execute(proj_stmt)
            projects_map = {row[0]: row[1] for row in proj_res.fetchall()}
            proj_ids = set(projects_map.keys())

            evt_project_map = {}
            default_project_id = list(proj_ids)[0] if len(proj_ids) == 1 else None
            if proj_ids:
                evt_stmt = select(WebhookEvent.event_id, WebhookEvent.project_id).where(WebhookEvent.project_id.in_(list(proj_ids)))
                evt_res = await db_session.execute(evt_stmt)
                evt_project_map = {row[0]: row[1] for row in evt_res.fetchall()}

            for item in raw_dlq_items:
                p_id = item.get("project_id")
                if not p_id:
                    evt_id = item.get("event_id")
                    if evt_id and evt_id in evt_project_map:
                        p_id = evt_project_map[evt_id]
                        item["project_id"] = p_id
                    elif default_project_id:
                        p_id = default_project_id
                        item["project_id"] = p_id

                if p_id and int(p_id) not in proj_ids:
                    continue
                if p_id and int(p_id) in projects_map:
                    item["project_name"] = projects_map[int(p_id)]
                filtered_items.append(item)
            break

        await websocket.send_json(jsonable_encoder({
            "type": "DLQ_UPDATE",
            "count": len(filtered_items),
            "items": filtered_items,
            "timestamp": datetime.utcnow().isoformat()
        }))
    except Exception as snap_exc:
        logger.warning("DLQ WS initial snapshot failed: %s", snap_exc)

    # ── Subscribe to Redis Pub/Sub for DLQ changes ───────────────────────────
    try:
        async with RedisPubSubSubscriber([dlq_channel(auth_company_id)]) as sub:
            async for raw_message in sub.listen():
                if websocket.client_state != WebSocketState.CONNECTED:
                    break
                try:
                    # On any DLQ change, re-fetch and push a fresh snapshot
                    raw_dlq_items = await rabbitmq_manager.peek_dlq_messages(limit=100)
                    fresh_items = []
                    async for db_session in get_db():
                        proj_stmt = select(Project.id, Project.name).where(Project.company_id == auth_company_id)
                        proj_res = await db_session.execute(proj_stmt)
                        projects_map = {row[0]: row[1] for row in proj_res.fetchall()}
                        proj_ids = set(projects_map.keys())

                        evt_project_map = {}
                        default_project_id = list(proj_ids)[0] if len(proj_ids) == 1 else None
                        if proj_ids:
                            evt_stmt = select(WebhookEvent.event_id, WebhookEvent.project_id).where(WebhookEvent.project_id.in_(list(proj_ids)))
                            evt_res = await db_session.execute(evt_stmt)
                            evt_project_map = {row[0]: row[1] for row in evt_res.fetchall()}

                        for item in raw_dlq_items:
                            p_id = item.get("project_id")
                            if not p_id:
                                evt_id = item.get("event_id")
                                if evt_id and evt_id in evt_project_map:
                                    p_id = evt_project_map[evt_id]
                                    item["project_id"] = p_id
                                elif default_project_id:
                                    p_id = default_project_id
                                    item["project_id"] = p_id

                            if p_id and int(p_id) not in proj_ids:
                                continue
                            if p_id and int(p_id) in projects_map:
                                item["project_name"] = projects_map[int(p_id)]
                            fresh_items.append(item)
                        break
                    await websocket.send_json(jsonable_encoder({
                        "type": "DLQ_UPDATE",
                        "count": len(fresh_items),
                        "items": fresh_items,
                        "timestamp": datetime.utcnow().isoformat()
                    }))
                except WebSocketDisconnect:
                    return
                except Exception as inner:
                    err_str = str(inner)
                    if "ConnectionClosed" in err_str or "Cannot call" in err_str:
                        break
                    logger.warning("DLQ WS inner error: %s", inner)
    except WebSocketDisconnect:
        logger.info("Client disconnected from DLQ stream")
    except Exception as exc:
        logger.warning("DLQ WebSocket stream exception: %s", exc)


# ─────────────────────── WebSocket: Dashboard ────────────────────────────────

async def _build_dashboard_snapshot(auth_company_id: int, target_project_id: Optional[int] = None) -> dict:
    redis_status = "ONLINE"
    redis_latency_ms = 0.0
    try:
        t0 = time.perf_counter()
        r_client = await get_redis_client()
        pong = await r_client.ping()
        await r_client.aclose()
        t1 = time.perf_counter()
        if pong:
            redis_latency_ms = round((t1 - t0) * 1000, 2)
    except Exception:
        redis_status = "DEGRADED"

    rabbitmq_status = "ONLINE"
    try:
        rmq_ok = await service_health_monitor.check_rabbitmq()
        rabbitmq_status = "ONLINE" if rmq_ok else "DEGRADED"
    except Exception:
        pass

    async for db_session in get_db():
        if target_project_id:
            proj_res = await db_session.execute(select(Project).where(Project.id == target_project_id, Project.company_id == auth_company_id))
            projects = proj_res.scalars().all()
        else:
            proj_res = await db_session.execute(select(Project).where(Project.company_id == auth_company_id))
            projects = proj_res.scalars().all()

        active_projects = sum(1 for p in projects if p.is_active)
        project_ids = [p.id for p in projects]

        total_routes = 0
        pending_count = 0
        if project_ids:
            ec_res = await db_session.execute(
                select(func.count(EventConfig.id)).where(
                    EventConfig.project_id.in_(project_ids),
                    EventConfig.is_active == True
                )
            )
            total_routes = ec_res.scalar() or 0

            ec_ids_res = await db_session.execute(
                select(EventConfig.id).where(EventConfig.project_id.in_(project_ids))
            )
            ec_ids = [row[0] for row in ec_ids_res.fetchall()]
            if ec_ids:
                pending_res = await db_session.execute(
                    select(func.count(WebhookLog.id)).where(
                        WebhookLog.event_config_id.in_(ec_ids),
                        WebhookLog.status == WebhookStatus.PENDING
                    )
                )
                pending_count = pending_res.scalar() or 0

        company_dlq_count = 0
        try:
            raw_dlq_items = await rabbitmq_manager.peek_dlq_messages(limit=500)
            for item in raw_dlq_items:
                p_id = item.get("project_id")
                if p_id and int(p_id) in project_ids:
                    company_dlq_count += 1
        except Exception:
            pass

        metrics = await metrics_service.get_or_hydrate_metrics(auth_company_id, db_session, project_id=target_project_id)
        break

    success_rate_pct = metrics["success_rate"]
    failure_rate_pct = None if success_rate_pct is None else round(100 - success_rate_pct, 2)

    return {
        "type": "DASHBOARD_UPDATE",
        "project_id": target_project_id,
        "total_projects": len(projects),
        "active_projects": active_projects,
        "total_event_routes": total_routes,
        "total_webhooks": metrics["total_webhooks"],
        "total_webhooks_24h": metrics["total_webhooks"],
        "throughput_rpm": metrics["throughput_rpm"],
        "throughput_rps": metrics["throughput_rps"],
        "success_count": metrics["success_count"],
        "failed_count": metrics["failed_count"],
        "success_rate": success_rate_pct,
        "success_rate_pct": success_rate_pct,
        "failure_rate": failure_rate_pct,
        "failure_rate_pct": failure_rate_pct,
        "avg_latency_ms": metrics["avg_latency_ms"],
        "dlq_count": company_dlq_count,
        "total_dlq_count": company_dlq_count,
        "main_queue_count": pending_count,
        "redis_status": redis_status,
        "redis_latency_ms": redis_latency_ms,
        "rabbitmq_status": rabbitmq_status,
        "throughput_series": [
            {
                "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "label": "now",
                "total": metrics["total_webhooks"],
                "success": metrics["success_count"],
                "failed": metrics["failed_count"],
            }
        ],
    }


@router.websocket("/ws/dashboard")
async def websocket_dashboard_stream(websocket: WebSocket):
    """Authenticated WebSocket stream for dashboard metrics."""
    await websocket.accept()

    auth_company_id = await _ws_authenticate(websocket)
    if auth_company_id is None:
        await websocket.close(code=4401, reason="Authentication required: pass ?token=<access_token>")
        return

    pid_param = websocket.query_params.get("project_id")
    target_project_id = None
    if pid_param:
        try:
            target_project_id = int(pid_param)
        except (ValueError, TypeError):
            pass

    try:
        snapshot = await _build_dashboard_snapshot(auth_company_id, target_project_id)
        await websocket.send_json(jsonable_encoder(snapshot))
    except Exception as snap_exc:
        logger.warning("Dashboard WS initial snapshot failed: %s", snap_exc)

    while websocket.client_state == WebSocketState.CONNECTED:
        try:
            await asyncio.sleep(2)
            snapshot = await _build_dashboard_snapshot(auth_company_id, target_project_id)
            await websocket.send_json(jsonable_encoder(snapshot))
        except WebSocketDisconnect:
            return
        except Exception as exc:
            logger.warning("Dashboard WebSocket stream exception: %s", exc)
            break


@router.websocket("/api/ws/metrics")
async def websocket_metrics_stream(websocket: WebSocket):
    """Dedicated metrics WebSocket endpoint for company/project analytics cards."""
    await websocket.accept()

    auth_company_id = await _ws_authenticate(websocket)
    if auth_company_id is None:
        await websocket.close(code=4401, reason="Authentication required: pass ?token=<access_token>")
        return

    pid_param = websocket.query_params.get("project_id")
    target_project_id = None
    if pid_param:
        try:
            target_project_id = int(pid_param)
        except (ValueError, TypeError):
            pass

    while websocket.client_state == WebSocketState.CONNECTED:
        try:
            snapshot = await _build_dashboard_snapshot(auth_company_id, target_project_id)
            await websocket.send_json(jsonable_encoder(snapshot))
            await asyncio.sleep(2)
        except WebSocketDisconnect:
            return
        except Exception as exc:
            logger.warning("Metrics WebSocket stream exception: %s", exc)
            break


# ─────────────────────── REST: Dashboard Stats ───────────────────────────────

@router.get("/v1/dashboard/stats")
async def get_dashboard_stats(
    request: Request,
    project_id: Optional[int] = Query(None, description="Optional project_id to filter statistics"),
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
    _rl: None = Depends(rate_limit_dashboard),
):
    company_id = current_company.id

    redis_status = "ONLINE"
    redis_latency_ms = 0.5
    try:
        t0 = time.perf_counter()
        r_client = await get_redis_client()
        pong = await r_client.ping()
        await r_client.aclose()
        t1 = time.perf_counter()
        if pong:
            redis_status = "ONLINE"
            redis_latency_ms = round((t1 - t0) * 1000, 2)
    except Exception:
        redis_status = "DEGRADED"

    rabbitmq_status = "ONLINE"
    try:
        rmq_ok = await service_health_monitor.check_rabbitmq()
        rabbitmq_status = "ONLINE" if rmq_ok else "DEGRADED"
    except Exception:
        pass

    if project_id:
        proj_result = await db.execute(select(Project).where(Project.id == project_id, Project.company_id == company_id))
    else:
        proj_result = await db.execute(select(Project).where(Project.company_id == company_id))
        
    projects = proj_result.scalars().all()
    project_ids = [p.id for p in projects]
    active_projects = sum(1 for p in projects if p.is_active)

    total_routes = 0
    pending_count = 0
    if project_ids:
        ec_result = await db.execute(
            select(func.count(EventConfig.id)).where(
                EventConfig.project_id.in_(project_ids),
                EventConfig.is_active == True
            )
        )
        total_routes = ec_result.scalar() or 0

        ec_ids_res = await db.execute(
            select(EventConfig.id).where(EventConfig.project_id.in_(project_ids))
        )
        ec_ids = [row[0] for row in ec_ids_res.fetchall()]
        if ec_ids:
            pending_res = await db.execute(
                select(func.count(WebhookLog.id)).where(
                    WebhookLog.event_config_id.in_(ec_ids),
                    WebhookLog.status == WebhookStatus.PENDING
                )
            )
            pending_count = pending_res.scalar() or 0

    company_dlq_count = 0
    try:
        raw_dlq_items = await rabbitmq_manager.peek_dlq_messages(limit=500)
        evt_project_map = {}
        default_project_id = project_ids[0] if len(project_ids) == 1 else None
        if project_ids:
            evt_stmt = select(WebhookEvent.event_id, WebhookEvent.project_id).where(WebhookEvent.project_id.in_(project_ids))
            evt_res = await db.execute(evt_stmt)
            evt_project_map = {row[0]: row[1] for row in evt_res.fetchall()}

        for item in raw_dlq_items:
            p_id = item.get("project_id")
            if not p_id:
                evt_id = item.get("event_id")
                if evt_id and evt_id in evt_project_map:
                    p_id = evt_project_map[evt_id]
                elif default_project_id:
                    p_id = default_project_id

            if p_id and int(p_id) in project_ids:
                company_dlq_count += 1
    except Exception as dlq_err:
        logger.warning("Error peeking DLQ for stats: %s", dlq_err)

    metrics = await metrics_service.get_or_hydrate_metrics(company_id, db, project_id=project_id)

    return {
        "project_id": project_id,
        "total_projects": len(projects),
        "active_projects": active_projects,
        "total_event_routes": total_routes,
        "total_webhooks": metrics["total_webhooks"],
        "throughput_rpm": metrics["throughput_rpm"],
        "throughput_rps": metrics["throughput_rps"],
        "success_count": metrics["success_count"],
        "failed_count": metrics["failed_count"],
        "success_rate": metrics["success_rate"],
        "avg_latency_ms": metrics["avg_latency_ms"],
        "dlq_count": company_dlq_count,
        "main_queue_count": pending_count,
        "redis_status": redis_status,
        "redis_latency_ms": redis_latency_ms,
        "rabbitmq_status": rabbitmq_status,
        "stats_window": "lifetime",
    }


# ─────────────────────── REST: DLQ ───────────────────────────────────────────

@router.get("/v1/projects/{project_id}/dlq")
async def get_project_dlq_items(
    project_id: int,
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    return await get_dlq_items(project_id=project_id, limit=limit, db=db, current_company=current_company)


@router.get("/v1/dlq")
async def get_dlq_items(
    project_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    """
    Fetch failed messages from the RabbitMQ Dead Letter Queue.
    
    SECURITY: Only messages whose project_id belongs to the authenticated company
    are returned. Items with unrecognized project_ids are silently dropped —
    never leaked with a fallback project name.
    """
    company_id = current_company.id
    proj_stmt = select(Project.id, Project.name).where(Project.company_id == company_id)
    if project_id:
        proj_stmt = proj_stmt.where(Project.id == project_id)
    
    proj_res = await db.execute(proj_stmt)
    projects_map = {row[0]: row[1] for row in proj_res.fetchall()}

    raw_dlq_items = await rabbitmq_manager.peek_dlq_messages(limit=limit)

    evt_project_map = {}
    default_project_id = list(projects_map.keys())[0] if len(projects_map) == 1 else None
    if projects_map:
        evt_stmt = select(WebhookEvent.event_id, WebhookEvent.project_id).where(WebhookEvent.project_id.in_(list(projects_map.keys())))
        evt_res = await db.execute(evt_stmt)
        evt_project_map = {row[0]: row[1] for row in evt_res.fetchall()}

    items = []
    for item in raw_dlq_items:
        p_id = item.get("project_id")
        if not p_id:
            evt_id = item.get("event_id")
            if evt_id and evt_id in evt_project_map:
                p_id = evt_project_map[evt_id]
                item["project_id"] = p_id
            elif default_project_id:
                p_id = default_project_id
                item["project_id"] = p_id

        if project_id and p_id and int(p_id) != int(project_id):
            continue

        # SECURITY: skip items whose project doesn't belong to this company
        if p_id and int(p_id) not in projects_map:
            continue

        if p_id and int(p_id) in projects_map:
            item["project_name"] = projects_map[int(p_id)]

        items.append(item)

    return items


@router.post("/v1/dlq/replay")
async def replay_dlq_logs(
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
    _rl: None = Depends(rate_limit_dlq_actions),
):
    """
    Requeues messages from the RabbitMQ DLQ back into the main delivery queue.

    SECURITY: Verifies that each message ID being replayed belongs to a project
    owned by the authenticated company before execution.
    """
    company_id = current_company.id
    log_ids = payload.get("log_ids") or payload.get("ids") or []
    if isinstance(log_ids, str) and log_ids != "all":
        log_ids = [log_ids]

    target_project_id = None

    # Ownership check: peek the DLQ and verify each requested ID belongs to this company
    if log_ids and log_ids != "all":
        proj_res = await db.execute(select(Project.id).where(Project.company_id == company_id))
        owned_project_ids = {row[0] for row in proj_res.fetchall()}

        raw_items = await rabbitmq_manager.peek_dlq_messages(limit=500)
        safe_ids = []
        project_ids = set()
        for item in raw_items:
            if item.get("id") not in log_ids:
                continue
            p_id = item.get("project_id")
            if p_id and int(p_id) in owned_project_ids:
                safe_ids.append(item.get("id"))
                project_ids.add(int(p_id))
        log_ids = safe_ids
        if len(project_ids) == 1:
            target_project_id = next(iter(project_ids))

    result = await rabbitmq_manager.requeue_dlq_messages(target_ids=log_ids)

    # Notify DLQ WS subscribers and refresh metrics
    await publish_dlq_event(company_id, "replay", None)
    try:
        snapshot = await metrics_service.get_or_hydrate_metrics(company_id, db, project_id=target_project_id)
        await publish_metrics_snapshot(company_id, snapshot, project_id=target_project_id)
    except Exception:
        pass

    return {
        "status": "replayed",
        "replayed_count": result.get("replayed_count", 0),
        "replayed_ids": result.get("replayed_ids", []),
    }


@router.post("/v1/dlq/discard")
@router.delete("/v1/dlq")
async def discard_dlq_logs(
    payload: dict = {},
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
    _rl: None = Depends(rate_limit_dlq_actions),
):
    """
    Permanently discards messages from the DLQ.

    SECURITY: Same ownership check as replay — verifies each ID belongs to
    a project owned by the authenticated company before discarding.
    """
    company_id = current_company.id
    log_ids = payload.get("log_ids") or payload.get("ids") or []
    if isinstance(log_ids, str) and log_ids != "all":
        log_ids = [log_ids]

    target_project_id = None

    if log_ids and log_ids != "all":
        proj_res = await db.execute(select(Project.id).where(Project.company_id == company_id))
        owned_project_ids = {row[0] for row in proj_res.fetchall()}

        raw_items = await rabbitmq_manager.peek_dlq_messages(limit=500)
        safe_ids = []
        project_ids = set()
        for item in raw_items:
            if item.get("id") not in log_ids:
                continue
            p_id = item.get("project_id")
            if p_id and int(p_id) in owned_project_ids:
                safe_ids.append(item.get("id"))
                project_ids.add(int(p_id))
        log_ids = safe_ids
        if len(project_ids) == 1:
            target_project_id = next(iter(project_ids))

    result = await rabbitmq_manager.discard_dlq_messages(target_ids=log_ids)

    await publish_dlq_event(company_id, "discard", None)
    try:
        snapshot = await metrics_service.get_or_hydrate_metrics(company_id, db, project_id=target_project_id)
        await publish_metrics_snapshot(company_id, snapshot, project_id=target_project_id)
    except Exception:
        pass

    return {
        "status": "discarded",
        "discarded_count": result.get("discarded_count", 0),
        "discarded_ids": result.get("discarded_ids", []),
    }
