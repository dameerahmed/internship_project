import time
import logging
from sqlalchemy import select, func, case, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.redis_client import get_redis_client
from app.models.project import Project
from app.models.event_config import EventConfig
from app.models.webhook_event import WebhookEvent
from app.models.webhook_log import WebhookLog, WebhookStatus

logger = logging.getLogger("app.metrics_service")

from typing import Optional

class MetricsService:
    def __init__(self):
        self.counter_ttl = 86400 * 30  # 30 days for counters (they're additive, safe to keep)
        self.hydrated_ttl = 86400       # 24h for the hydrated flag — forces daily DB re-sync
        self.ttl = self.counter_ttl     # backwards-compat alias

    def _keys(self, company_id: int, project_id: Optional[int] = None):
        if project_id:
            base = f"company:{company_id}:project:{project_id}:metrics"
        else:
            base = f"company:{company_id}:metrics"
        return {
            "hydrated": f"{base}:hydrated",
            "total": f"{base}:total",
            "success": f"{base}:success",
            "failed": f"{base}:failed",
            "latency_sum": f"{base}:latency_sum",
            "throughput": f"{base}:throughput",
            "ingress_total": f"{base}:ingress_total",
            "ingress_success": f"{base}:ingress_success",
            "ingress_failed": f"{base}:ingress_failed",
            "replay_total": f"{base}:replay_total",
            "replay_success": f"{base}:replay_success",
            "replay_failed": f"{base}:replay_failed",
        }

    async def increment_gateway_throughput(self, company_id: int, project_id: Optional[int] = None):
        """
        Record an incoming webhook for real-time throughput calculation.
        Uses a sliding window of 60 seconds. Increments both company and project metrics.
        """
        redis = await get_redis_client()
        try:
            now_ms = int(time.time() * 1000)
            window_start_ms = now_ms - 60000

            company_keys = self._keys(company_id)
            async with redis.pipeline(transaction=True) as pipe:
                pipe.zadd(company_keys["throughput"], {str(now_ms): now_ms})
                pipe.zremrangebyscore(company_keys["throughput"], 0, window_start_ms)
                pipe.expire(company_keys["throughput"], 120)
                await pipe.execute()

            if project_id:
                proj_keys = self._keys(company_id, project_id)
                async with redis.pipeline(transaction=True) as pipe:
                    pipe.zadd(proj_keys["throughput"], {str(now_ms): now_ms})
                    pipe.zremrangebyscore(proj_keys["throughput"], 0, window_start_ms)
                    pipe.expire(proj_keys["throughput"], 120)
                    await pipe.execute()
        except Exception as e:
            logger.error(f"Redis throughput INCR failed: {e}")
        finally:
            await redis.close()

    async def record_delivery_result(self, company_id: int, is_success: bool, latency_ms: float, project_id: Optional[int] = None, is_replay: bool = False):
        """
        Increment absolute lifetime counters when a webhook delivery finishes.
        Separates primary ingress vs DLQ replay metrics.
        """
        redis = await get_redis_client()
        try:
            keys_list = [self._keys(company_id)]
            if project_id:
                keys_list.append(self._keys(company_id, project_id))

            for keys in keys_list:
                async with redis.pipeline(transaction=True) as pipe:
                    pipe.incr(keys["total"])
                    if is_success:
                        pipe.incr(keys["success"])
                    else:
                        pipe.incr(keys["failed"])

                    if is_replay:
                        pipe.incr(keys["replay_total"])
                        if is_success:
                            pipe.incr(keys["replay_success"])
                        else:
                            pipe.incr(keys["replay_failed"])
                    else:
                        pipe.incr(keys["ingress_total"])
                        if is_success:
                            pipe.incr(keys["ingress_success"])
                        else:
                            pipe.incr(keys["ingress_failed"])
                    
                    if latency_ms:
                        pipe.incrbyfloat(keys["latency_sum"], latency_ms)
                    
                    for k in ["total", "success", "failed", "latency_sum", "ingress_total", "ingress_success", "ingress_failed", "replay_total", "replay_success", "replay_failed"]:
                        pipe.expire(keys[k], self.counter_ttl)
                        
                    await pipe.execute()
        except Exception as e:
            logger.error(f"Redis delivery INCR failed: {e}")
        finally:
            await redis.close()

    async def get_or_hydrate_metrics(self, company_id: int, db: AsyncSession, project_id: Optional[int] = None, force_refresh: bool = False) -> dict:
        """
        Strict Read-Through cache pattern.
        Returns live metrics from Redis. If completely empty or force_refresh=True,
        hydrates from PostgreSQL.
        Supports filtering by specific project_id or overall company.

        force_refresh=True: bypasses the hydrated check and re-syncs from DB.
        This is used by the dashboard REST endpoint to ensure data accuracy.
        """
        keys = self._keys(company_id, project_id)
        redis = await get_redis_client()
        try:
            is_hydrated = await redis.get(keys["hydrated"])

            if not is_hydrated or force_refresh:
                logger.info(f"Hydrating metrics for company {company_id} (project {project_id}) from DB to Redis...")
                await self._hydrate_from_db(company_id, project_id, redis, db, keys)
            
            now_ms = int(time.time() * 1000)
            await redis.zremrangebyscore(keys["throughput"], 0, now_ms - 60000)

            async with redis.pipeline(transaction=False) as pipe:
                pipe.get(keys["total"])
                pipe.get(keys["success"])
                pipe.get(keys["failed"])
                pipe.get(keys["latency_sum"])
                pipe.zcard(keys["throughput"])
                pipe.get(f"{keys['total']}:p50")
                pipe.get(f"{keys['total']}:p90")
                pipe.get(f"{keys['total']}:p95")
                pipe.get(f"{keys['total']}:p99")
                pipe.get(keys["ingress_total"])
                pipe.get(keys["ingress_success"])
                pipe.get(keys["ingress_failed"])
                pipe.get(keys["replay_total"])
                pipe.get(keys["replay_success"])
                pipe.get(keys["replay_failed"])
                results = await pipe.execute()

            total = int(results[0] or 0)
            success = int(results[1] or 0)
            failed = int(results[2] or 0)
            latency_sum = float(results[3] or 0.0)
            throughput_rpm = int(results[4] or 0)
            p50 = float(results[5] or 0.0)
            p90 = float(results[6] or 0.0)
            p95 = float(results[7] or 0.0)
            p99 = float(results[8] or 0.0)
            ingress_total = int(results[9] or 0)
            ingress_success = int(results[10] or 0)
            ingress_failed = int(results[11] or 0)
            replay_total = int(results[12] or 0)
            replay_success = int(results[13] or 0)
            replay_failed = int(results[14] or 0)

            throughput_rps = round(throughput_rpm / 60.0, 2) if throughput_rpm > 0 else 0.0

            completed_attempts = success + failed
            success_rate = round((success / completed_attempts) * 100, 2) if completed_attempts > 0 else None
            avg_latency = round(latency_sum / completed_attempts, 1) if completed_attempts > 0 else 0.0

            ingress_rate = round((ingress_success / ingress_total) * 100, 2) if ingress_total > 0 else None
            replay_recovery_rate = round((replay_success / replay_total) * 100, 2) if replay_total > 0 else None
            retry_efficiency = round(((ingress_success + replay_success) / max(1, ingress_total + replay_total)) * 100, 2) if total > 0 else 100.0

            return {
                "total_webhooks": total,
                "success_count": success,
                "failed_count": failed,
                "success_rate": success_rate,
                "avg_latency_ms": avg_latency,
                "p50_latency_ms": p50,
                "p90_latency_ms": p90,
                "p95_latency_ms": p95,
                "p99_latency_ms": p99,
                "throughput_rpm": throughput_rpm,
                "throughput_rps": throughput_rps,
                "ingress_total": ingress_total,
                "ingress_success": ingress_success,
                "ingress_failed": ingress_failed,
                "ingress_success_rate": ingress_rate,
                "replay_total": replay_total,
                "replay_success": replay_success,
                "replay_failed": replay_failed,
                "replay_recovery_rate": replay_recovery_rate,
                "retry_efficiency": retry_efficiency,
            }
        except Exception as e:
            logger.error(f"Metrics Read-Through Failed: {e}")
            return {
                "total_webhooks": 0, "success_count": 0, "failed_count": 0,
                "success_rate": None, "avg_latency_ms": 0.0,
                "p50_latency_ms": 0.0, "p90_latency_ms": 0.0,
                "p95_latency_ms": 0.0, "p99_latency_ms": 0.0,
                "throughput_rpm": 0, "throughput_rps": 0.0,
                "ingress_total": 0, "ingress_success": 0, "ingress_failed": 0, "ingress_success_rate": None,
                "replay_total": 0, "replay_success": 0, "replay_failed": 0, "replay_recovery_rate": None,
                "retry_efficiency": 100.0,
            }
        finally:
            await redis.close()

    async def _hydrate_from_db(self, company_id: int, project_id: Optional[int], redis, db: AsyncSession, keys: dict):
        if project_id:
            project_ids = [project_id]
        else:
            proj_res = await db.execute(select(Project.id).where(Project.company_id == company_id))
            project_ids = [row[0] for row in proj_res.fetchall()]
        
        if not project_ids:
            await redis.set(keys["hydrated"], "1", ex=self.hydrated_ttl)
            return

        total = success = failed = 0
        ingress_tot = ingress_suc = ingress_fai = 0
        replay_tot = replay_suc = replay_fai = 0
        lat_sum = 0.0
        p50 = p90 = p95 = p99 = 0.0

        ec_res = await db.execute(select(EventConfig.id).where(EventConfig.project_id.in_(project_ids)))
        ec_ids = [row[0] for row in ec_res.fetchall()]

        evt_res = await db.execute(select(WebhookEvent.event_id).where(WebhookEvent.project_id.in_(project_ids)))
        evt_ids = [row[0] for row in evt_res.fetchall()]

        where_clause = []
        if ec_ids:
            where_clause.append(WebhookLog.event_config_id.in_(ec_ids))
        if evt_ids:
            where_clause.append(WebhookLog.event_id.in_(evt_ids))

        if where_clause:
            stmt = select(
                func.count(WebhookLog.id),
                func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)),
                func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)),
                func.sum(WebhookLog.processing_duration_ms),
                func.sum(case((WebhookLog.attempt_number <= 5, 1), else_=0)),
                func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)),
                func.sum(case((and_(WebhookLog.attempt_number <= 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)),
                func.sum(case((WebhookLog.attempt_number > 5, 1), else_=0)),
                func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.SUCCESS), 1), else_=0)),
                func.sum(case((and_(WebhookLog.attempt_number > 5, WebhookLog.status == WebhookStatus.FAILED), 1), else_=0)),
            ).where(or_(*where_clause))
            
            res = await db.execute(stmt)
            row = res.first()
            if row:
                total = row[0] or 0
                success = row[1] or 0
                failed = row[2] or 0
                lat_sum = float(row[3] or 0.0)
                ingress_tot = row[4] or 0
                ingress_suc = row[5] or 0
                ingress_fai = row[6] or 0
                replay_tot = row[7] or 0
                replay_suc = row[8] or 0
                replay_fai = row[9] or 0

            # Compute percentiles
            dur_stmt = select(WebhookLog.processing_duration_ms).where(
                or_(*where_clause),
                WebhookLog.processing_duration_ms.isnot(None)
            ).order_by(WebhookLog.processing_duration_ms.asc())
            dur_res = await db.execute(dur_stmt)
            durations = [float(r[0]) for r in dur_res.fetchall() if r[0] is not None]
            if durations:
                n = len(durations)
                p50 = round(durations[int(n * 0.50)], 1)
                p90 = round(durations[min(int(n * 0.90), n - 1)], 1)
                p95 = round(durations[min(int(n * 0.95), n - 1)], 1)
                p99 = round(durations[min(int(n * 0.99), n - 1)], 1)

        async with redis.pipeline(transaction=True) as pipe:
            pipe.set(keys["total"], total)
            pipe.set(keys["success"], success)
            pipe.set(keys["failed"], failed)
            pipe.set(keys["latency_sum"], lat_sum)
            pipe.set(keys["ingress_total"], ingress_tot)
            pipe.set(keys["ingress_success"], ingress_suc)
            pipe.set(keys["ingress_failed"], ingress_fai)
            pipe.set(keys["replay_total"], replay_tot)
            pipe.set(keys["replay_success"], replay_suc)
            pipe.set(keys["replay_failed"], replay_fai)
            pipe.set(f"{keys['total']}:p50", p50)
            pipe.set(f"{keys['total']}:p90", p90)
            pipe.set(f"{keys['total']}:p95", p95)
            pipe.set(f"{keys['total']}:p99", p99)
            pipe.set(keys["hydrated"], "1", ex=self.hydrated_ttl)

            for k in ["total", "success", "failed", "latency_sum", "ingress_total", "ingress_success", "ingress_failed", "replay_total", "replay_success", "replay_failed"]:
                pipe.expire(keys[k], self.counter_ttl)

            await pipe.execute()

metrics_service = MetricsService()
