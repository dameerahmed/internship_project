from typing import Any, Dict


from typing import Any, Dict, Optional
from sqlalchemy.future import select
import json
import logging

logger = logging.getLogger("project_cache")


def _coerce_string_list(value: Any) -> list:
    if isinstance(value, list):
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _get_value(event: Any, attribute: str) -> Any:
    if isinstance(event, dict):
        return event.get(attribute)
    return getattr(event, attribute, None)


def normalize_event_config_payload(event: Any) -> Dict[str, Any]:
    metadata = {}
    if isinstance(event, dict):
        metadata = dict(event.get("metadata_json") or {})
    elif getattr(event, "metadata_json", None):
        metadata = dict(event.metadata_json or {})

    candidate_urls = []
    raw_target_urls = _get_value(event, "target_urls")
    if raw_target_urls:
        candidate_urls = [item.strip() for item in raw_target_urls if isinstance(item, str) and item.strip()]

    if not candidate_urls:
        raw_target_url = _get_value(event, "target_url")
        if isinstance(raw_target_url, str) and raw_target_url.strip():
            candidate_urls = [raw_target_url.strip()]

    if not candidate_urls:
        candidate_urls = ["https://example.com/webhook"]

    metadata["urls"] = candidate_urls

    payload_keys = _coerce_string_list(_get_value(event, "payload_keys") or _get_value(event, "payload_key"))
    payload_types = _coerce_string_list(_get_value(event, "payload_types") or _get_value(event, "payload_type"))
    metadata["payload_keys"] = payload_keys
    metadata["payload_types"] = payload_types
    metadata["retention_days"] = _get_value(event, "retention_days")
    metadata["delete_time"] = _get_value(event, "delete_time")

    event_type = _get_value(event, "event_type")
    normalized_event_type = event_type.strip() if isinstance(event_type, str) else event_type

    return {
        "event_type": normalized_event_type,
        "target_url": candidate_urls[0],
        "metadata_json": metadata,
        "payload_keys": payload_keys,
        "payload_types": payload_types,
        "retention_days": _get_value(event, "retention_days"),
        "delete_time": _get_value(event, "delete_time"),
    }


async def refresh_project_cache(project_id: int, db_session, redis_client=None) -> dict:
    """
    Fetches the project and all active event configs from PostgreSQL,
    builds the expanded auth:project_{project_id} JSON payload,
    stores it in Redis, and returns the payload.
    """
    from backend.app.models.project import Project
    from backend.app.models.event_config import EventConfig

    # 1. Fetch project
    proj_result = await db_session.execute(
        select(Project).where(Project.id == project_id)
    )
    project = proj_result.scalars().first()
    if not project:
        # If project does not exist, delete cache
        if redis_client is not None:
            try:
                await redis_client.delete(f"auth:project_{project_id}")
            except Exception as e:
                logger.warning("Failed to delete stale cache for project %s: %s", project_id, e)
        else:
            try:
                from backend.app.services.redis_client import get_redis_client
                rc = await get_redis_client()
                try:
                    await rc.delete(f"auth:project_{project_id}")
                finally:
                    await rc.close()
            except Exception as e:
                logger.warning("Failed to delete stale cache for project %s: %s", project_id, e)
        return {}

    # 2. Fetch active event configs for the project
    ec_result = await db_session.execute(
        select(EventConfig).where(
            EventConfig.project_id == project_id,
            EventConfig.is_active == True
        )
    )
    event_configs = ec_result.scalars().all()

    # 3. Build allowed_events list and event_configs map
    allowed_events_list = [ec.event_type for ec in event_configs]

    event_configs_map = {}
    for ec in event_configs:
        event_configs_map[ec.event_type] = {
            "id": ec.id,
            "target_url": ec.target_url,
            "metadata_json": ec.metadata_json,
            "is_active": ec.is_active
        }

    redis_payload = {
        "project_id": project.id,
        "company_id": project.company_id,
        "hashed_secret": project.hashed_secret,
        "secret_key": project.secret_key,
        "is_active": project.is_active,
        "allowed_events": allowed_events_list,
        "event_configs": event_configs_map
    }

    # 4. Save to Redis
    should_close = False
    if redis_client is None:
        try:
            from backend.app.services.redis_client import get_redis_client
            redis_client = await get_redis_client()
            should_close = True
        except Exception as e:
            logger.warning("Could not get redis client in refresh_project_cache: %s", e)
            redis_client = None

    if redis_client:
        try:
            redis_auth_key = f"auth:project_{project_id}"
            await redis_client.set(name=redis_auth_key, value=json.dumps(redis_payload))
        except Exception as redis_err:
            logger.warning("Redis engine sync skipped on refresh_project_cache: %s", redis_err)
        finally:
            if should_close:
                try:
                    await redis_client.close()
                except Exception:
                    pass

    return redis_payload

