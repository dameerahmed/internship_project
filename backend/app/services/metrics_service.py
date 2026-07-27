import time
import logging
from sqlalchemy import select, func, case, or_
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
        self.ttl = 86400 * 30  # 30 days expiry to keep Redis clean

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
            await redis.aclose()

    async def record_delivery_result(self, company_id: int, is_success: bool, latency_ms: float, project_id: Optional[int] = None):
        """
        Increment absolute lifetime counters when a webhook delivery finishes.
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
                    
                    if latency_ms:
                        pipe.incrbyfloat(keys["latency_sum"], latency_ms)
                    
                    for k in ["total", "success", "failed", "latency_sum"]:
                        pipe.expire(keys[k], self.ttl)
                        
                    await pipe.execute()
        except Exception as e:
            logger.error(f"Redis delivery INCR failed: {e}")
        finally:
            await redis.aclose()

    async def get_or_hydrate_metrics(self, company_id: int, db: AsyncSession, project_id: Optional[int] = None) -> dict:
        """
        Strict Read-Through cache pattern.
        Returns live metrics from Redis. If completely empty, hydrates from PostgreSQL.
        Supports filtering by specific project_id or overall company.
        """
        keys = self._keys(company_id, project_id)
        redis = await get_redis_client()
        try:
            is_hydrated = await redis.get(keys["hydrated"])
            
            if not is_hydrated:
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
                results = await pipe.execute()

            total = int(results[0] or 0)
            success = int(results[1] or 0)
            failed = int(results[2] or 0)
            latency_sum = float(results[3] or 0.0)
            throughput_rpm = int(results[4] or 0)

            throughput_rps = round(throughput_rpm / 60.0, 2) if throughput_rpm > 0 else 0.0

            completed_attempts = success + failed
            if completed_attempts == 0:
                success_rate = None  # Rendered as "N/A"
            else:
                success_rate = round((success / completed_attempts) * 100, 2)

            avg_latency = round(latency_sum / completed_attempts, 1) if completed_attempts > 0 else 0.0

            return {
                "total_webhooks": total,
                "success_count": success,
                "failed_count": failed,
                "success_rate": success_rate,
                "avg_latency_ms": avg_latency,
                "throughput_rpm": throughput_rpm,
                "throughput_rps": throughput_rps,
            }
        except Exception as e:
            logger.error(f"Metrics Read-Through Failed: {e}")
            return {
                "total_webhooks": 0, "success_count": 0, "failed_count": 0,
                "success_rate": None, "avg_latency_ms": 0.0,
                "throughput_rpm": 0, "throughput_rps": 0.0,
            }
        finally:
            await redis.aclose()

    async def _hydrate_from_db(self, company_id: int, project_id: Optional[int], redis, db: AsyncSession, keys: dict):
        if project_id:
            project_ids = [project_id]
        else:
            proj_res = await db.execute(select(Project.id).where(Project.company_id == company_id))
            project_ids = [row[0] for row in proj_res.fetchall()]
        
        if not project_ids:
            await redis.set(keys["hydrated"], "1", ex=self.ttl)
            return

        total = 0
        success = 0
        failed = 0
        lat_sum = 0.0

        stmt = select(
            func.count(WebhookLog.id),
            func.sum(case((WebhookLog.status == WebhookStatus.SUCCESS, 1), else_=0)),
            func.sum(case((WebhookLog.status == WebhookStatus.FAILED, 1), else_=0)),
            func.sum(WebhookLog.processing_duration_ms)
        ).join(
            WebhookEvent, WebhookLog.event_id == WebhookEvent.event_id, isouter=True
        ).join(
            EventConfig, WebhookLog.event_config_id == EventConfig.id, isouter=True
        ).where(
            or_(
                WebhookEvent.project_id.in_(project_ids),
                EventConfig.project_id.in_(project_ids)
            )
        )
        
        res = await db.execute(stmt)
        row = res.first()
        if row:
            total = row[0] or 0
            success = row[1] or 0
            failed = row[2] or 0
            lat_sum = float(row[3] or 0.0)

        async with redis.pipeline(transaction=True) as pipe:
            pipe.set(keys["total"], total)
            pipe.set(keys["success"], success)
            pipe.set(keys["failed"], failed)
            pipe.set(keys["latency_sum"], lat_sum)
            pipe.set(keys["hydrated"], "1", ex=self.ttl)
            
            for k in ["total", "success", "failed", "latency_sum"]:
                pipe.expire(keys[k], self.ttl)
                
            await pipe.execute()

metrics_service = MetricsService()
