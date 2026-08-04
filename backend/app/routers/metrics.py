from datetime import datetime, timezone, timedelta
import logging
from typing import List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, case, delete, or_, and_, literal
from sqlalchemy.dialects.postgresql import aggregate_order_by

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

    # 2. Get event config IDs and event IDs under these projects
    ec_res = await db.execute(
        select(EventConfig.id).where(EventConfig.project_id.in_(project_ids))
    )
    event_config_ids = [row[0] for row in ec_res.fetchall()]

    evt_res = await db.execute(
        select(WebhookEvent.event_id).where(WebhookEvent.project_id.in_(project_ids))
    )
    project_event_ids = [row[0] for row in evt_res.fetchall() if row[0]]

    now = datetime.utcnow()
    twenty_four_hours_ago = now - timedelta(hours=24)

    # 3. Aggregate stats from WebhookLog using resilient SQL subqueries
    total_webhooks_24h = 0
    success_count_24h = 0
    failed_count_24h = 0
    avg_latency_ms = 0.0

    ingress_tot = ingress_suc = ingress_fai = 0
    replay_tot = replay_suc = replay_fai = 0

    log_conds = [
        WebhookLog.event_config_id.in_(select(EventConfig.id).where(EventConfig.project_id.in_(project_ids))),
        WebhookLog.event_id.in_(select(WebhookEvent.event_id).where(WebhookEvent.project_id.in_(project_ids)))
    ]

    where_filter = and_(or_(*log_conds), WebhookLog.created_at >= twenty_four_hours_ago)

    agg_stmt = (
        select(
            func.count(WebhookLog.id).label("total"),
            func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
            func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures"),
            func.avg(WebhookLog.processing_duration_ms).label("avg_latency"),
            func.sum(case((WebhookLog.attempt_number <= 5, 1), else_=0)).label("ingress_tot"),
            func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)).label("ingress_suc"),
            func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)).label("ingress_fai"),
            func.sum(case((WebhookLog.attempt_number > 5, 1), else_=0)).label("replay_tot"),
            func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)).label("replay_suc"),
            func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)).label("replay_fai"),
        )
        .where(where_filter)
    )
    agg_res = await db.execute(agg_stmt)
    agg_row = agg_res.fetchone()

    if agg_row and (agg_row.total or 0) > 0:
        total_webhooks_24h = agg_row.total or 0
        success_count_24h = agg_row.successes or 0
        failed_count_24h = agg_row.failures or 0
        avg_latency_ms = round(float(agg_row.avg_latency or 0.0), 2)
        ingress_tot = agg_row.ingress_tot or 0
        ingress_suc = agg_row.ingress_suc or 0
        ingress_fai = agg_row.ingress_fai or 0
        replay_tot = agg_row.replay_tot or 0
        replay_suc = agg_row.replay_suc or 0
        replay_fai = agg_row.replay_fai or 0
    else:
        # Fallback: if no logs in last 24h, fetch overall lifetime stats for company projects
        lifetime_stmt = (
            select(
                func.count(WebhookLog.id).label("total"),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures"),
                func.avg(WebhookLog.processing_duration_ms).label("avg_latency"),
                func.sum(case((WebhookLog.attempt_number <= 5, 1), else_=0)).label("ingress_tot"),
                func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)).label("ingress_suc"),
                func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)).label("ingress_fai"),
                func.sum(case((WebhookLog.attempt_number > 5, 1), else_=0)).label("replay_tot"),
                func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)).label("replay_suc"),
                func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)).label("replay_fai"),
            )
            .where(or_(*log_conds))
        )
        lf_res = await db.execute(lifetime_stmt)
        lf_row = lf_res.fetchone()
        if lf_row:
            total_webhooks_24h = lf_row.total or 0
            success_count_24h = lf_row.successes or 0
            failed_count_24h = lf_row.failures or 0
            avg_latency_ms = round(float(lf_row.avg_latency or 0.0), 2)
            ingress_tot = lf_row.ingress_tot or 0
            ingress_suc = lf_row.ingress_suc or 0
            ingress_fai = lf_row.ingress_fai or 0
            replay_tot = lf_row.replay_tot or 0
            replay_suc = lf_row.replay_suc or 0
            replay_fai = lf_row.replay_fai or 0

    perc_stmt = (
        select(
            func.percentile_cont(0.50).within_group(WebhookLog.processing_duration_ms).label("p50"),
            func.percentile_cont(0.90).within_group(WebhookLog.processing_duration_ms).label("p90"),
            func.percentile_cont(0.95).within_group(WebhookLog.processing_duration_ms).label("p95"),
            func.percentile_cont(0.99).within_group(WebhookLog.processing_duration_ms).label("p99"),
        )
        .where(where_filter, WebhookLog.processing_duration_ms.isnot(None))
    )
    perc_res = await db.execute(perc_stmt)
    perc_row = perc_res.fetchone()

    percentiles = {
        "p50": round(float(perc_row.p50 or 0.0), 2) if log_conds and perc_row else 0.0,
        "p90": round(float(perc_row.p90 or 0.0), 2) if log_conds and perc_row else 0.0,
        "p95": round(float(perc_row.p95 or 0.0), 2) if log_conds and perc_row else 0.0,
        "p99": round(float(perc_row.p99 or 0.0), 2) if log_conds and perc_row else 0.0,
    }
    success_rate_pct = None if total_webhooks_24h == 0 else round((success_count_24h / total_webhooks_24h) * 100, 2)
    failure_rate_pct = 0.0 if total_webhooks_24h == 0 else round((failed_count_24h / total_webhooks_24h) * 100, 2)

    ingress_success_rate_pct = None if ingress_tot == 0 else round((ingress_suc / ingress_tot) * 100, 2)
    replay_recovery_rate_pct = None if replay_tot == 0 else round((replay_suc / replay_tot) * 100, 2)
    retry_efficiency_pct = 100.0 if total_webhooks_24h == 0 else round(((ingress_suc + replay_suc) / max(1, ingress_tot + replay_tot)) * 100, 2)

    # 4. Calculate total DLQ items across company projects
    total_dlq_count = 0
    try:
        rmq_total_dlq = await rabbitmq_manager.get_dlq_message_count()
        total_sys_proj_res = await db.execute(select(func.count(Project.id)))
        total_sys_proj = total_sys_proj_res.scalar() or 0
        default_project_id = project_ids[0] if len(project_ids) == 1 else None

        if total_sys_proj == len(project_ids) or rmq_total_dlq == 0:
            total_dlq_count = rmq_total_dlq
        else:
            raw_dlq = await rabbitmq_manager.peek_dlq_messages(limit=2000)
            proj_id_set = set(project_ids)
            
            evt_res_dlq = await db.execute(
                select(WebhookEvent.event_id, WebhookEvent.project_id)
                .where(WebhookEvent.project_id.in_(project_ids))
            )
            evt_map = {row[0]: row[1] for row in evt_res_dlq.fetchall()}

            for msg in raw_dlq:
                pid = msg.get("project_id")
                if not pid:
                    eid = msg.get("event_id")
                    if eid and eid in evt_map:
                        pid = evt_map[eid]
                    elif default_project_id:
                        pid = default_project_id
                if pid and int(pid) in proj_id_set:
                    total_dlq_count += 1
    except Exception as e:
        logger.warning(f"Error calculating company DLQ count: {e}")

    # 5. Build 24h Hourly Throughput Series
    throughput_series = []
    if log_conds:
        where_filter = and_(or_(*log_conds), WebhookLog.created_at >= twenty_four_hours_ago)
        series_stmt = (
            select(
                func.date_trunc('hour', WebhookLog.created_at).label("hour_bucket"),
                func.count(WebhookLog.id).label("total"),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures")
            )
            .where(where_filter)
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
        "success_count_24h": success_count_24h,
        "failed_count_24h": failed_count_24h,
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
        "throughput_series": throughput_series,
        "ingress_total_24h": ingress_tot,
        "ingress_success_24h": ingress_suc,
        "ingress_failed_24h": ingress_fai,
        "ingress_success_rate_pct": ingress_success_rate_pct,
        "replay_total_24h": replay_tot,
        "replay_success_24h": replay_suc,
        "replay_failed_24h": replay_fai,
        "replay_recovery_rate_pct": replay_recovery_rate_pct,
        "retry_efficiency_pct": retry_efficiency_pct,
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

    # Get event configs and events for this project
    ec_res = await db.execute(
        select(EventConfig.id).where(EventConfig.project_id == project_id)
    )
    event_config_ids = [row[0] for row in ec_res.fetchall()]

    evt_res = await db.execute(
        select(WebhookEvent.event_id).where(WebhookEvent.project_id == project_id)
    )
    project_event_ids = [row[0] for row in evt_res.fetchall() if row[0]]

    now = datetime.utcnow()
    twenty_four_hours_ago = now - timedelta(hours=24)

    total_webhooks_24h = 0
    success_count_24h = 0
    failed_count_24h = 0
    avg_latency_ms = 0.0

    ingress_tot = ingress_suc = ingress_fai = 0
    replay_tot = replay_suc = replay_fai = 0

    log_conds = [
        WebhookLog.event_config_id.in_(select(EventConfig.id).where(EventConfig.project_id == project_id)),
        WebhookLog.event_id.in_(select(WebhookEvent.event_id).where(WebhookEvent.project_id == project_id))
    ]

    where_filter = and_(or_(*log_conds), WebhookLog.created_at >= twenty_four_hours_ago)

    agg_stmt = (
        select(
            func.count(WebhookLog.id).label("total"),
            func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
            func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures"),
            func.avg(WebhookLog.processing_duration_ms).label("avg_latency"),
            func.sum(case((WebhookLog.attempt_number <= 5, 1), else_=0)).label("ingress_tot"),
            func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)).label("ingress_suc"),
            func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)).label("ingress_fai"),
            func.sum(case((WebhookLog.attempt_number > 5, 1), else_=0)).label("replay_tot"),
            func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)).label("replay_suc"),
            func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)).label("replay_fai"),
        )
        .where(where_filter)
    )
    agg_res = await db.execute(agg_stmt)
    agg_row = agg_res.fetchone()

    if agg_row and (agg_row.total or 0) > 0:
        total_webhooks_24h = agg_row.total or 0
        success_count_24h = agg_row.successes or 0
        failed_count_24h = agg_row.failures or 0
        avg_latency_ms = round(float(agg_row.avg_latency or 0.0), 2)
        ingress_tot = agg_row.ingress_tot or 0
        ingress_suc = agg_row.ingress_suc or 0
        ingress_fai = agg_row.ingress_fai or 0
        replay_tot = agg_row.replay_tot or 0
        replay_suc = agg_row.replay_suc or 0
        replay_fai = agg_row.replay_fai or 0
    else:
        # Fallback: if no logs in last 24h, fetch overall lifetime stats for this project
        lifetime_stmt = (
            select(
                func.count(WebhookLog.id).label("total"),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures"),
                func.avg(WebhookLog.processing_duration_ms).label("avg_latency"),
                func.sum(case((WebhookLog.attempt_number <= 5, 1), else_=0)).label("ingress_tot"),
                func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)).label("ingress_suc"),
                func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)).label("ingress_fai"),
                func.sum(case((WebhookLog.attempt_number > 5, 1), else_=0)).label("replay_tot"),
                func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)).label("replay_suc"),
                func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)).label("replay_fai"),
            )
            .where(or_(*log_conds))
        )
        lf_res = await db.execute(lifetime_stmt)
        lf_row = lf_res.fetchone()
        if lf_row:
            total_webhooks_24h = lf_row.total or 0
            success_count_24h = lf_row.successes or 0
            failed_count_24h = lf_row.failures or 0
            avg_latency_ms = round(float(lf_row.avg_latency or 0.0), 2)
            ingress_tot = lf_row.ingress_tot or 0
            ingress_suc = lf_row.ingress_suc or 0
            ingress_fai = lf_row.ingress_fai or 0
            replay_tot = lf_row.replay_tot or 0
            replay_suc = lf_row.replay_suc or 0
            replay_fai = lf_row.replay_fai or 0

        # PostgreSQL percentile_cont() — avoids loading all rows into Python
        perc_stmt = (
            select(
                func.percentile_cont(0.50).within_group(WebhookLog.processing_duration_ms).label("p50"),
                func.percentile_cont(0.90).within_group(WebhookLog.processing_duration_ms).label("p90"),
                func.percentile_cont(0.95).within_group(WebhookLog.processing_duration_ms).label("p95"),
                func.percentile_cont(0.99).within_group(WebhookLog.processing_duration_ms).label("p99"),
            )
            .where(where_filter, WebhookLog.processing_duration_ms.isnot(None))
        )
        perc_res = await db.execute(perc_stmt)
        perc_row = perc_res.fetchone()

    percentiles = {
        "p50": round(float(perc_row.p50 or 0.0), 2) if log_conds and perc_row else 0.0,
        "p90": round(float(perc_row.p90 or 0.0), 2) if log_conds and perc_row else 0.0,
        "p95": round(float(perc_row.p95 or 0.0), 2) if log_conds and perc_row else 0.0,
        "p99": round(float(perc_row.p99 or 0.0), 2) if log_conds and perc_row else 0.0,
    }
    success_rate_pct = None if total_webhooks_24h == 0 else round((success_count_24h / total_webhooks_24h) * 100, 2)
    failure_rate_pct = 0.0 if total_webhooks_24h == 0 else round((failed_count_24h / total_webhooks_24h) * 100, 2)

    ingress_success_rate_pct = None if ingress_tot == 0 else round((ingress_suc / ingress_tot) * 100, 2)
    replay_recovery_rate_pct = None if replay_tot == 0 else round((replay_suc / replay_tot) * 100, 2)
    retry_efficiency_pct = 100.0 if total_webhooks_24h == 0 else round(((ingress_suc + replay_suc) / max(1, ingress_tot + replay_tot)) * 100, 2)

    # DLQ count specific to this project
    project_dlq_count = 0
    try:
        raw_dlq = await rabbitmq_manager.peek_dlq_messages(limit=250)
        evt_set = set(project_event_ids)

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
    if log_conds:
        series_stmt = (
            select(
                func.date_trunc('hour', WebhookLog.created_at).label("hour_bucket"),
                func.count(WebhookLog.id).label("total"),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)).label("successes"),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)).label("failures")
            )
            .where(where_filter)
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
        "throughput_series": throughput_series,
        "ingress_total_24h": ingress_tot,
        "ingress_success_24h": ingress_suc,
        "ingress_failed_24h": ingress_fai,
        "ingress_success_rate_pct": ingress_success_rate_pct,
        "replay_total_24h": replay_tot,
        "replay_success_24h": replay_suc,
        "replay_failed_24h": replay_fai,
        "replay_recovery_rate_pct": replay_recovery_rate_pct,
        "retry_efficiency_pct": retry_efficiency_pct,
    }
