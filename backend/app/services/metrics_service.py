import time
import logging
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.services.redis_client import get_redis_client
from backend.app.models.project import Project
from backend.app.models.event_config import EventConfig
from backend.app.models.webhook_log import WebhookLog

logger = logging.getLogger("app.metrics_service")

class MetricsService:
    def __init__(self):
        self.ttl = 86400 * 30  # 30 days expiry to keep Redis clean for dead companies

    def _keys(self, company_id: int):
        base = f"company:{company_id}:metrics"
        return {
            "hydrated": f"{base}:hydrated",
            "total": f"{base}:total",
            "success": f"{base}:success",
            "failed": f"{base}:failed",
            "latency_sum": f"{base}:latency_sum",
            "throughput": f"{base}:throughput",
        }

    async def increment_gateway_throughput(self, company_id: int):
        """
        Record an incoming webhook for real-time throughput calculation.
        Uses a sliding window of 60 seconds.
        """
        keys = self._keys(company_id)
        redis = await get_redis_client()
        try:
            now_ms = int(time.time() * 1000)
            window_start_ms = now_ms - 60000

            async with redis.pipeline(transaction=True) as pipe:
                # Add current timestamp
                pipe.zadd(keys["throughput"], {str(now_ms): now_ms})
                # Remove items older than 60 seconds
                pipe.zremrangebyscore(keys["throughput"], 0, window_start_ms)
                # Expire key so it doesn't leak memory if no activity
                pipe.expire(keys["throughput"], 120)
                await pipe.execute()
        except Exception as e:
            logger.error(f"Redis throughput INCR failed: {e}")
        finally:
            await redis.aclose()

    async def record_delivery_result(self, company_id: int, is_success: bool, latency_ms: float):
        """
        Increment absolute lifetime counters when a webhook delivery finishes.
        """
        keys = self._keys(company_id)
        redis = await get_redis_client()
        try:
            async with redis.pipeline(transaction=True) as pipe:
                pipe.incr(keys["total"])
                if is_success:
                    pipe.incr(keys["success"])
                else:
                    pipe.incr(keys["failed"])
                
                if latency_ms:
                    pipe.incrbyfloat(keys["latency_sum"], latency_ms)
                
                # Refresh TTL
                for k in ["total", "success", "failed", "latency_sum"]:
                    pipe.expire(keys[k], self.ttl)
                    
                await pipe.execute()
        except Exception as e:
            logger.error(f"Redis delivery INCR failed: {e}")
        finally:
            await redis.aclose()

    async def get_or_hydrate_metrics(self, company_id: int, db: AsyncSession) -> dict:
        """
        Strict Read-Through cache pattern.
        Returns live metrics from Redis. If completely empty, hydrates from PostgreSQL.
        """
        keys = self._keys(company_id)
        redis = await get_redis_client()
        try:
            # 1. Check if hydrated
            is_hydrated = await redis.get(keys["hydrated"])
            
            if not is_hydrated:
                # 2. HYDRATION (Intelligent State Safeguard)
                logger.info(f"Hydrating metrics for company {company_id} from PostgreSQL to Redis...")
                await self._hydrate_from_db(company_id, redis, db, keys)
            
            # 3. Read live metrics
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

            # Prune old RPM to get fresh counts
            now_ms = int(time.time() * 1000)
            await redis.zremrangebyscore(keys["throughput"], 0, now_ms - 60000)

            throughput_rps = round(throughput_rpm / 60.0, 1) if throughput_rpm > 0 else 0.0
            success_rate = 100.0 if total == 0 else round((success / total) * 100, 1)
            avg_latency = round(latency_sum / (success + failed), 1) if (success + failed) > 0 else 0.0

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
            # Degraded return
            return {
                "total_webhooks": 0, "success_count": 0, "failed_count": 0,
                "success_rate": 100.0, "avg_latency_ms": 0.0,
                "throughput_rpm": 0, "throughput_rps": 0.0,
            }
        finally:
            await redis.aclose()

    async def _hydrate_from_db(self, company_id: int, redis, db: AsyncSession, keys: dict):
        # Only run this once! Find all EventConfigs for this company
        proj_res = await db.execute(select(Project.id).where(Project.company_id == company_id))
        project_ids = [row[0] for row in proj_res.fetchall()]
        
        if not project_ids:
            # Set empty state to avoid re-hydrating
            await redis.set(keys["hydrated"], "1", ex=self.ttl)
            return
            
        ec_res = await db.execute(select(EventConfig.id).where(EventConfig.project_id.in_(project_ids)))
        ec_ids = [row[0] for row in ec_res.fetchall()]

        total = 0
        success = 0
        failed = 0
        lat_sum = 0.0

        if ec_ids:
            # Aggregate all WebhookLogs
            stmt = select(
                func.count(WebhookLog.id),
                func.sum(case((WebhookLog.response_code < 300, 1), else_=0)),
                func.sum(case((WebhookLog.response_code >= 300, 1), else_=0)),
                func.sum(WebhookLog.processing_duration_ms)
            ).where(WebhookLog.event_config_id.in_(ec_ids))
            
            res = await db.execute(stmt)
            row = res.first()
            if row:
                total = row[0] or 0
                success = row[1] or 0
                failed = row[2] or 0
                lat_sum = float(row[3] or 0.0)

        async with redis.pipeline(transaction=True) as pipe:
            # SETNX (Set if Not Exists) to ensure we don't overwrite if another process just updated it
            pipe.setnx(keys["total"], total)
            pipe.setnx(keys["success"], success)
            pipe.setnx(keys["failed"], failed)
            pipe.setnx(keys["latency_sum"], lat_sum)
            pipe.set(keys["hydrated"], "1", ex=self.ttl)
            
            for k in ["total", "success", "failed", "latency_sum"]:
                pipe.expire(keys[k], self.ttl)
                
            await pipe.execute()

metrics_service = MetricsService()
