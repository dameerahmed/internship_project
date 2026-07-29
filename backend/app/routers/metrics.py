from datetime import datetime, timezone, timedelta
import logging
from typing import List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, case, delete

from database import get_db
from app.services.dependencies import get_current_company
from app.models.company import Company
from app.models.project import Project
from app.models.event_config import EventConfig
from app.models.webhook_log import WebhookLog, WebhookStatus
from app.models.webhook_event import WebhookEvent
from app.services.queue_client import rabbitmq_manager

router = APIRouter(prefix="/v1/metrics", tags=["Metrics"])
logger = logging.getLogger("metrics_router")

def calculate_percentiles(latencies: List[float]) -> Dict[str, float]:
    """Calculate empirical P50, P90, P95, P99 latency percentiles in ms."""
    if not latencies:
        return {"p50": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0}
    
    sorted_lat = sorted(latencies)
    n = len(sorted_lat)
    
    return {
        "p50": round(sorted_lat[int(n * 0.50)], 2),
        "p90": round(sorted_lat[min(int(n * 0.90), n - 1)], 2),
        "p95": round(sorted_lat[min(int(n * 0.95), n - 1)], 2),
        "p99": round(sorted_lat[min(int(n * 0.99), n - 1)], 2),
    }

@router.get("/company")
async def get_company_aggregated_metrics(
    db: AsyncSession = Depends(get_db),
    current_company: Company = Depends(get_current_company)
) -> Dict[str, Any]:
    """
    Aggregate metrics across all projects owned by the authenticated company:
    - Total webhooks received (24h rolling window)
    - Overall success vs failure rate percentage
    - Global average round-trip latency (ms) & real P50/P90/P95/P99 percentiles
    - Total active projects count
    - Total items across all projects' Dead Letter Queues (DLQ)
    - 24h hourly throughput series
    """
    company_id = current_company.id

    # 1. Fetch active projects count for company
    projects_res = await db.execute(
        select(Project).where(Project.company_id == company_id)
    )
    company_projects = projects_res.scalars().all()
    project_ids = [p.id for p in company_projects]
    active_projects_count = sum(1 for p in company_projects if p.is_active)

    if not project_ids:
        return {
            "total_webhooks_24h": 0,
            "success_rate_pct": 100.0,
            "failure_rate_pct": 0.0,
            "avg_latency_ms": 0.0,
            "p50_latency_ms": 0.0,
            "p90_latency_ms": 0.0,
            "p95_latency_ms": 0.0,
            "p99_latency_ms": 0.0,
            "active_projects_count": 0,
            "total_projects_count": 0,
            "total_dlq_count": 0,
            "throughput_series": []
        }

    # 2. Get event config IDs under these projects
    ec_res = await db.execute(
        select(EventConfig.id).where(EventConfig.project_id.in_(project_ids))
    )
    event_config_ids = [row[0] for row in ec_res.fetchall()]

    now = datetime.utcnow()
    twenty_four_hours_ago = now - timedelta(hours=24)

    # 3. Aggregate 24h rolling stats from WebhookLog
    total_webhooks_24h = 0
    success_count_24h = 0
    failed_count_24h = 0
    avg_latency_ms = 0.0
    latencies_list = []

    if event_config_ids:
        agg_stmt = (
            select(
                func.count(WebhookLog.id).label("total"),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures"),
                func.avg(WebhookLog.processing_duration_ms).label("avg_latency")
            )
            .where(
                WebhookLog.event_config_id.in_(event_config_ids),
                WebhookLog.created_at >= twenty_four_hours_ago
            )
        )
        agg_res = await db.execute(agg_stmt)
        agg_row = agg_res.fetchone()

        if agg_row:
            total_webhooks_24h = agg_row.total or 0
            success_count_24h = agg_row.successes or 0
            failed_count_24h = agg_row.failures or 0
            avg_latency_ms = round(float(agg_row.avg_latency or 0.0), 2)

        # Real latency values for percentile calculation
        lat_stmt = (
            select(WebhookLog.processing_duration_ms)
            .where(
                WebhookLog.event_config_id.in_(event_config_ids),
                WebhookLog.created_at >= twenty_four_hours_ago,
                WebhookLog.processing_duration_ms.isnot(None)
            )
        )
        lat_res = await db.execute(lat_stmt)
        latencies_list = [row[0] for row in lat_res.fetchall() if row[0] is not None]

    percentiles = calculate_percentiles(latencies_list)
    success_rate_pct = None if total_webhooks_24h == 0 else round((success_count_24h / total_webhooks_24h) * 100, 2)
    failure_rate_pct = 0.0 if total_webhooks_24h == 0 else round((failed_count_24h / total_webhooks_24h) * 100, 2)

    # 4. Calculate total DLQ items across company projects
    total_dlq_count = 0
    try:
        raw_dlq = await rabbitmq_manager.peek_dlq_messages(limit=250)
        proj_id_set = set(project_ids)
        
        evt_res = await db.execute(
            select(WebhookEvent.event_id, WebhookEvent.project_id)
            .where(WebhookEvent.project_id.in_(project_ids))
        )
        evt_map = {row[0]: row[1] for row in evt_res.fetchall()}

        for msg in raw_dlq:
            pid = msg.get("project_id")
            if not pid:
                eid = msg.get("event_id")
                if eid and eid in evt_map:
                    pid = evt_map[eid]
            if pid and int(pid) in proj_id_set:
                total_dlq_count += 1
    except Exception as e:
        logger.warning(f"Error calculating company DLQ count: {e}")

    # 5. Build 24h Hourly Throughput Series
    throughput_series = []
    if event_config_ids:
        series_stmt = (
            select(
                func.date_trunc('hour', WebhookLog.created_at).label("hour_bucket"),
                func.count(WebhookLog.id).label("total"),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures")
            )
            .where(
                WebhookLog.event_config_id.in_(event_config_ids),
                WebhookLog.created_at >= twenty_four_hours_ago
            )
            .group_by("hour_bucket")
            .order_by("hour_bucket")
        )
        series_res = await db.execute(series_stmt)
        series_rows = series_res.fetchall()
        
        bucket_map = {
            row.hour_bucket.strftime("%Y-%m-%dT%H:00:00Z"): {
                "total": row.total or 0,
                "success": row.successes or 0,
                "failed": row.failures or 0
            }
            for row in series_rows if row.hour_bucket
        }

        for i in range(23, -1, -1):
            h_time = (now - timedelta(hours=i)).replace(minute=0, second=0, microsecond=0)
            h_key = h_time.strftime("%Y-%m-%dT%H:00:00Z")
            data = bucket_map.get(h_key, {"total": 0, "success": 0, "failed": 0})
            throughput_series.append({
                "timestamp": h_key,
                "label": h_time.strftime("%H:00"),
                "total": data["total"],
                "success": data["success"],
                "failed": data["failed"]
            })

    return {
        "total_webhooks_24h": total_webhooks_24h,
        "success_rate_pct": success_rate_pct,
        "failure_rate_pct": failure_rate_pct,
        "avg_latency_ms": avg_latency_ms,
        "p50_latency_ms": percentiles["p50"],
        "p90_latency_ms": percentiles["p90"],
        "p95_latency_ms": percentiles["p95"],
        "p99_latency_ms": percentiles["p99"],
        "active_projects_count": active_projects_count,
        "total_projects_count": len(company_projects),
        "total_dlq_count": total_dlq_count,
        "throughput_series": throughput_series
    }


@router.get("/project/{project_id}")
async def get_project_specific_metrics(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_company: Company = Depends(get_current_company)
) -> Dict[str, Any]:
    """
    Granular real-time throughput, success rates, and latency specific ONLY to this project.
    Strict company_id authorization.
    """
    company_id = current_company.id

    # Verify ownership
    proj_res = await db.execute(
        select(Project).where(Project.id == project_id, Project.company_id == company_id)
    )
    db_project = proj_res.scalars().first()
    if not db_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or unauthorized"
        )

    # Get event configs for this project
    ec_res = await db.execute(
        select(EventConfig.id).where(EventConfig.project_id == project_id)
    )
    event_config_ids = [row[0] for row in ec_res.fetchall()]

    now = datetime.utcnow()
    twenty_four_hours_ago = now - timedelta(hours=24)

    total_webhooks_24h = 0
    success_count_24h = 0
    failed_count_24h = 0
    avg_latency_ms = 0.0
    latencies_list = []

    if event_config_ids:
        agg_stmt = (
            select(
                func.count(WebhookLog.id).label("total"),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures"),
                func.avg(WebhookLog.processing_duration_ms).label("avg_latency")
            )
            .where(
                WebhookLog.event_config_id.in_(event_config_ids),
                WebhookLog.created_at >= twenty_four_hours_ago
            )
        )
        agg_res = await db.execute(agg_stmt)
        agg_row = agg_res.fetchone()

        if agg_row:
            total_webhooks_24h = agg_row.total or 0
            success_count_24h = agg_row.successes or 0
            failed_count_24h = agg_row.failures or 0
            avg_latency_ms = round(float(agg_row.avg_latency or 0.0), 2)

        lat_stmt = (
            select(WebhookLog.processing_duration_ms)
            .where(
                WebhookLog.event_config_id.in_(event_config_ids),
                WebhookLog.created_at >= twenty_four_hours_ago,
                WebhookLog.processing_duration_ms.isnot(None)
            )
        )
        lat_res = await db.execute(lat_stmt)
        latencies_list = [row[0] for row in lat_res.fetchall() if row[0] is not None]

    percentiles = calculate_percentiles(latencies_list)
    success_rate_pct = None if total_webhooks_24h == 0 else round((success_count_24h / total_webhooks_24h) * 100, 2)
    failure_rate_pct = 0.0 if total_webhooks_24h == 0 else round((failed_count_24h / total_webhooks_24h) * 100, 2)

    # DLQ count specific to this project
    project_dlq_count = 0
    try:
        raw_dlq = await rabbitmq_manager.peek_dlq_messages(limit=250)
        evt_res = await db.execute(
            select(WebhookEvent.event_id).where(WebhookEvent.project_id == project_id)
        )
        evt_set = set(row[0] for row in evt_res.fetchall())

        for msg in raw_dlq:
            pid = msg.get("project_id")
            if pid and int(pid) == project_id:
                project_dlq_count += 1
            elif msg.get("event_id") in evt_set:
                project_dlq_count += 1
    except Exception as e:
        logger.warning(f"Error calculating project DLQ count: {e}")

    # Hourly throughput series for this project
    throughput_series = []
    if event_config_ids:
        series_stmt = (
            select(
                func.date_trunc('hour', WebhookLog.created_at).label("hour_bucket"),
                func.count(WebhookLog.id).label("total"),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures")
            )
            .where(
                WebhookLog.event_config_id.in_(event_config_ids),
                WebhookLog.created_at >= twenty_four_hours_ago
            )
            .group_by("hour_bucket")
            .order_by("hour_bucket")
        )
        series_res = await db.execute(series_stmt)
        series_rows = series_res.fetchall()

        bucket_map = {
            row.hour_bucket.strftime("%Y-%m-%dT%H:00:00Z"): {
                "total": row.total or 0,
                "success": row.successes or 0,
                "failed": row.failures or 0
            }
            for row in series_rows if row.hour_bucket
        }

        for i in range(23, -1, -1):
            h_time = (now - timedelta(hours=i)).replace(minute=0, second=0, microsecond=0)
            h_key = h_time.strftime("%Y-%m-%dT%H:00:00Z")
            data = bucket_map.get(h_key, {"total": 0, "success": 0, "failed": 0})
            throughput_series.append({
                "timestamp": h_key,
                "label": h_time.strftime("%H:00"),
                "total": data["total"],
                "success": data["success"],
                "failed": data["failed"]
            })

    return {
        "project_id": project_id,
        "project_name": db_project.name,
        "is_active": db_project.is_active,
        "total_webhooks_24h": total_webhooks_24h,
        "success_rate_pct": success_rate_pct,
        "failure_rate_pct": failure_rate_pct,
        "avg_latency_ms": avg_latency_ms,
        "p50_latency_ms": percentiles["p50"],
        "p90_latency_ms": percentiles["p90"],
        "p95_latency_ms": percentiles["p95"],
        "p99_latency_ms": percentiles["p99"],
        "dlq_count": project_dlq_count,
        "throughput_series": throughput_series
    }
