import asyncio
import json
import logging
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import delete
from celery import Task

from backend.database import get_db, engine
from backend.app.models.company import Company
from backend.app.models.project import Project
from backend.app.models.event_config import EventConfig
from backend.app.models.webhook_event import WebhookEvent
from backend.app.services.project_service import refresh_project_cache
from backend.app.services.celery_worker import _process_webhook_delivery, orchestrate_webhook_lifecycle
from backend.app.services.redis_client import get_redis_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_script")

async def test_flow():
    logger.info("Starting Webhook Target URL Resolution Architectural Test...")

    # Step 1: Create a test company & project & event config in the DB
    async for db in get_db():
        # Get or create test project
        result = await db.execute(select(Project).where(Project.name == "Resolution Test Project"))
        project = result.scalars().first()
        if not project:
            # Get first company or create one
            res = await db.execute(select(Company))
            company = res.scalars().first()
            if not company:
                company = Company(
                    name="Test Company",
                    email="test-resolution@example.com",
                    hashed_password="test-hashed-password"
                )
                db.add(company)
                await db.flush()
            
            project = Project(
                name="Resolution Test Project",
                company_id=company.id,
                secret_key="test-secret-key",
                hashed_secret="test-hashed-secret"
            )
            db.add(project)
            await db.flush()
        
        project_id = project.id
        company_id = project.company_id
        
        # Clean up existing event configs for this project to be clean
        await db.execute(delete(EventConfig).where(EventConfig.project_id == project_id))
        await db.commit()

        # Add initial EventConfig pointing to the old URL (error-receiver)
        old_url = "http://localhost:8000/v1/test-targets/error-receiver"
        event_config = EventConfig(
            project_id=project_id,
            event_type="order.created",
            target_url=old_url,
            is_active=True,
            metadata_json={"urls": [old_url]}
        )
        db.add(event_config)
        
        # Clean up existing test events
        await db.execute(delete(WebhookEvent).where(WebhookEvent.project_id == project_id))
        
        # Create WebhookEvent record
        event_id = "evt_test_resolution_123"
        webhook_event = WebhookEvent(
            event_id=event_id,
            project_id=project_id,
            event_config_id=None, # Will be set on execution/logs
            event_type="order.created",
            target_url=old_url,
            payload={"order_id": "123", "amount": 100}
        )
        db.add(webhook_event)
        await db.commit()
        break

    logger.info(f"Test Project ID: {project_id}, Event ID: {event_id}")

    # Step 2: Refresh project cache in Redis
    async for db in get_db():
        logger.info("Initializing cache in Redis...")
        cache_data = await refresh_project_cache(project_id, db)
        logger.info(f"Cache data created: {json.dumps(cache_data, indent=2)}")
        break

    # Step 3: Run worker delivery process with old URL passed in delivery packet.
    # The cache contains old URL, so it should resolve to old URL.
    logger.info("\n--- TEST 1: Cache Hit (Old URL) ---")
    result = await _process_webhook_delivery(
        event_id=event_id,
        project_id=project_id,
        company_id=company_id,
        event_type="order.created",
        data_payload={"order_id": "123", "amount": 100},
        target_url=old_url,
        url_index=0,
        retry_count=0
    )
    logger.info(f"Test 1 Resolved Target URL: {result.get('target_url')}")
    assert result.get("target_url") == old_url, "Should resolve to old URL because it is in cache/db."

    # Step 4: Update target URL in the DB to new URL (success-receiver)
    # But do NOT refresh cache immediately.
    new_url = "http://localhost:8000/v1/test-targets/success-receiver"
    async for db in get_db():
        logger.info(f"\nUpdating database EventConfig target_url to: {new_url}")
        res = await db.execute(select(EventConfig).where(EventConfig.project_id == project_id, EventConfig.event_type == "order.created"))
        ec = res.scalars().first()
        ec.target_url = new_url
        ec.metadata_json = {"urls": [new_url]}
        await db.commit()
        break

    # Step 5: Refresh Redis Cache to simulate UI update trigger
    async for db in get_db():
        logger.info("Simulating dashboard UI save trigger: Refreshing Redis cache...")
        await refresh_project_cache(project_id, db)
        break

    # Step 6: Process webhook delivery. The delivery packet still contains the OLD URL in task args (as it would in Celery payload).
    # Since Redis is updated, the worker must dynamically fetch the NEW URL from Redis and hit that instead of the old URL!
    logger.info("\n--- TEST 2: Dynamic Cache Resolution (New URL) ---")
    result = await _process_webhook_delivery(
        event_id=event_id,
        project_id=project_id,
        company_id=company_id,
        event_type="order.created",
        data_payload={"order_id": "123", "amount": 100},
        target_url=old_url, # Stale URL in task payload args
        url_index=0,
        retry_count=0
    )
    logger.info(f"Test 2 Resolved Target URL: {result.get('target_url')}")
    assert result.get("target_url") == new_url, "Worker failed to fetch updated URL from cache!"
    logger.info("SUCCESS: Worker successfully resolved to the new URL dynamically from cache!")

    # Step 7: Test Read-Through Cache Fallback.
    # We clear the Redis cache key to trigger a Cache Miss.
    # The worker must detect the cache miss, fetch from DB, repopulate Redis cache, and resolve to the NEW URL.
    logger.info("\n--- TEST 3: Cache Miss & Read-Through DB Fallback ---")
    redis = await get_redis_client()
    await redis.delete(f"auth:project_{project_id}")
    await redis.close()
    logger.info("Cleared Redis cache. Simulating Cache Miss...")

    result = await _process_webhook_delivery(
        event_id=event_id,
        project_id=project_id,
        company_id=company_id,
        event_type="order.created",
        data_payload={"order_id": "123", "amount": 100},
        target_url=old_url, # Stale URL in task payload args
        url_index=0,
        retry_count=0
    )
    logger.info(f"Test 3 Resolved Target URL: {result.get('target_url')}")
    assert result.get("target_url") == new_url, "Worker failed to resolve to the new URL during DB fallback!"
    
    # Verify Redis cache was repopulated
    redis = await get_redis_client()
    cache_exists = await redis.exists(f"auth:project_{project_id}")
    cached_payload_raw = await redis.get(f"auth:project_{project_id}")
    await redis.close()
    
    logger.info(f"Redis Cache Repopulated? {'YES' if cache_exists else 'NO'}")
    logger.info(f"Repopulated Cache Data: {cached_payload_raw}")
    assert cache_exists, "Redis cache was not populated after cache miss!"
    logger.info("SUCCESS: Read-through cache fallback is fully functional!")

    # --- TEST 4: Pass-by-Reference Minimalist Payload ---
    # We will simulate how Celery actually executes with the new minimalist payload:
    # {"event_id": event_id, "url_index": 0}
    # This must query the database and cache dynamically to resolve the final target URL.
    logger.info("\n--- TEST 4: Pass-by-Reference Minimalist Payload ---")
    
    
    class MockTask(Task):
        request = type('MockRequest', (), {'retries': 0})()
        max_retries = 5
        
    mock_task = MockTask()
    
    # We first update DB EventConfig URL to final-receiver to verify it gets resolved
    final_url = "http://localhost:8000/v1/test-targets/final-receiver"
    async for db in get_db():
        res = await db.execute(select(EventConfig).where(EventConfig.project_id == project_id, EventConfig.event_type == "order.created"))
        ec = res.scalars().first()
        ec.target_url = final_url
        ec.metadata_json = {"urls": [final_url]}
        await db.commit()
        break
        
    # Update cache to match final URL
    async for db in get_db():
        await refresh_project_cache(project_id, db)
        break

    minimal_packet = {
        "event_id": event_id,
        "url_index": 0
    }
    
    # We run orchestrate_webhook_lifecycle with the minimalist packet
    res_lifecycle = await orchestrate_webhook_lifecycle(mock_task, minimal_packet)
    logger.info(f"Test 4 Lifecycle execution result: {res_lifecycle}")
    
    # Verify the WebhookEvent in the database has final_url as target_url now
    async for db in get_db():
        db_event_check = await db.get(WebhookEvent, event_id)
        logger.info(f"Test 4 WebhookEvent target_url in DB: {db_event_check.target_url}")
        assert db_event_check.target_url == final_url, "Pass-by-Reference target URL resolution failed!"
        break
        
    logger.info("SUCCESS: Pass-by-Reference dynamically resolved the target URL from database/cache!")

    # Clean up test entities
    async for db in get_db():
        await db.execute(delete(WebhookEvent).where(WebhookEvent.project_id == project_id))
        await db.execute(delete(EventConfig).where(EventConfig.project_id == project_id))
        await db.execute(delete(Project).where(Project.id == project_id))
        await db.commit()
        break
        
    redis = await get_redis_client()
    await redis.delete(f"auth:project_{project_id}")
    await redis.close()

    logger.info("\nALL TESTS PASSED SUCCESSFULLY! ARCHITECTURE IS ROBUST AND CORRECT.")

if __name__ == "__main__":
    asyncio.run(test_flow())
