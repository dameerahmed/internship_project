from datetime import datetime, timezone
import json
import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.app.services.redis_client import get_redis
from backend.app.utils.security import WebhookSecurity
from backend.app.schemas.project import ProjectCreate, ProjectResponse, ProjectSummary, ProjectDetail, ProjectUpdate
from backend.app.schemas.event_config import EventConfigUpdate
from backend.app.services.dependencies import get_current_company 
from backend.app.services.project_service import normalize_event_config_payload

# Models
from backend.app.models.project import Project
from backend.app.models.event_config import EventConfig
from backend.app.models.webhook_log import WebhookLog
from backend.app.models.webhook_event import WebhookEvent

router = APIRouter(prefix="/v1/projects", tags=["Projects"])
logger = logging.getLogger("project_router")

@router.get("", response_model=List[ProjectSummary])
@router.get("/", response_model=List[ProjectSummary])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    company_id = current_company.id
    result = await db.execute(select(Project).where(Project.company_id == company_id))
    projects = result.scalars().all()

    return [
        {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "is_active": project.is_active,
            "company_id": project.company_id,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }
        for project in projects
    ]

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
@router.post("/Create", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    redis_conn = Depends(get_redis),
    current_company = Depends(get_current_company) 
):
    try:
        company_id = current_company.id
        
        # 1. Check duplicate project name within the scope of the company
        existing_project_result = await db.execute(
            select(Project).where(Project.company_id == company_id, Project.name == payload.name)
        )
        existing_project = existing_project_result.scalars().first()
        if existing_project is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project name already exists")

        # 2. Setup minimalist core project model without raw credential provisioning leaks
        # We store initial state; keys rotation will happen exclusively via the rotation endpoint on demand.
        db_project = Project(
            name=payload.name,
            description=getattr(payload, "description", None),
            company_id=company_id,
            is_active=True,
            retention_days=getattr(payload, "retention_days", 30) or 30,
            hashed_secret="temp_provisioning",
            secret_key="temp_provisioning"
        )
        db.add(db_project)
        await db.flush()  # Generates db_project.id immediately without committing transaction

        project_id = db_project.id

        # Generate real production API key & secret key
        client_api_key, hashed_secret = WebhookSecurity.generate_raw_and_hash_key(
            project_id=project_id,
            company_id=company_id
        )
        secret_key = WebhookSecurity.generate_webhook_secret()

        db_project.hashed_secret = hashed_secret
        db_project.secret_key = secret_key

        allowed_events_list = []
        
        # 3. Safely map and attach multi-event configurations
        if getattr(payload, "event_configs", None):
            for event in payload.event_configs:
                normalized_event = normalize_event_config_payload(event)
                db_event = EventConfig(
                    project_id=project_id,
                    event_type=normalized_event["event_type"],
                    target_url=normalized_event["target_url"],
                    metadata_json=normalized_event["metadata_json"],
                    is_active=getattr(event, "is_active", True),
                    retention_days=normalized_event.get("retention_days"),
                    delete_time=normalized_event.get("delete_time"),
                    payload_keys=normalized_event.get("payload_keys") or None,
                    payload_types=normalized_event.get("payload_types") or None,
                )
                db.add(db_event)
                if getattr(event, "is_active", True):
                    allowed_events_list.append(normalized_event["event_type"])

        # 4. Commit to DB and avoid calling explicit lazy-loading db.refresh()
        await db.commit()
        
        # Capture fixed timestamps manually after flush/commit to prevent thread attachment crashes
        created_at_snapshot = db_project.created_at or datetime.utcnow()
        updated_at_snapshot = db_project.updated_at or datetime.utcnow()

        # 5. Async-safe synchronization with Redis broker cache state
        try:
            from backend.app.services.project_service import refresh_project_cache
            await refresh_project_cache(project_id, db, redis_conn)
        except Exception as redis_err:
            logger.warning("Redis engine sync skipped on initialization: %s", redis_err)
        
        # 6. Return layout payload matching security & UI requirements
        return {
            "id": project_id,
            "name": db_project.name,
            "description": db_project.description,
            "is_active": db_project.is_active,
            "retention_days": db_project.retention_days,
            "company_id": company_id,
            "api_key": client_api_key,
            "secret_key": secret_key,
            "created_at": created_at_snapshot,
            "updated_at": updated_at_snapshot
        }
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Failed to commit project footprint setup: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create secure project: {str(e)}"
        )


@router.post("/{project_id}/settings/pruning")
async def schedule_pruning(
    project_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
):
    company_id = current_company.id
    result = await db.execute(select(Project).where(Project.id == project_id, Project.company_id == company_id))
    db_project = result.scalars().first()
    if db_project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    retention_days = payload.get("retention_days")
    if retention_days is not None:
        db_project.retention_days = int(retention_days)
    await db.commit()
    return {"status": "scheduled", "project_id": project_id, "retention_days": db_project.retention_days}


@router.post("/{project_id}/dlq/replay")
async def replay_dlq_items(
    project_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
):
    company_id = current_company.id
    result = await db.execute(select(Project).where(Project.id == project_id, Project.company_id == company_id))
    db_project = result.scalars().first()
    if db_project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    ids = payload.get("ids") or []
    if not isinstance(ids, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ids must be provided as a list")

    return {"status": "queued", "project_id": project_id, "replayed_ids": ids}


@router.post("/{project_id}/dlq/discard")
async def discard_dlq_items(
    project_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
):
    company_id = current_company.id
    result = await db.execute(select(Project).where(Project.id == project_id, Project.company_id == company_id))
    db_project = result.scalars().first()
    if db_project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    ids = payload.get("ids") or []
    if not isinstance(ids, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ids must be provided as a list")

    return {"status": "discarded", "project_id": project_id, "discarded_ids": ids}


@router.get("/{project_id}/refresh_keys", response_model=dict)
async def refresh_project_keys(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
):
    company_id = current_company.id
    result = await db.execute(select(Project).where(Project.id == project_id, Project.company_id == company_id))
    db_project = result.scalars().first()
    if db_project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    client_api_key, hashed_secret = WebhookSecurity.generate_raw_and_hash_key(project_id=project_id, company_id=company_id)
    db_project.hashed_secret = hashed_secret
    db_project.secret_key = WebhookSecurity.generate_webhook_secret()
    await db.commit()
    await db.refresh(db_project)

    return {
        "api_key": client_api_key,
        "secret_key": db_project.secret_key,
        "project_id": project_id,
        "company_id": company_id,
    }


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    company_id = current_company.id
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.event_configs))
        .where(Project.id == project_id, Project.company_id == company_id)
    )
    db_project = result.scalars().first()
    if db_project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    event_result = await db.execute(select(EventConfig).where(EventConfig.project_id == project_id))
    event_configs = event_result.scalars().all()

    return {
        "id": db_project.id,
        "name": db_project.name,
        "description": db_project.description,
        "is_active": db_project.is_active,
        "retention_days": db_project.retention_days,
        "delete_time": None,
        "company_id": company_id,
        "created_at": db_project.created_at,
        "updated_at": db_project.updated_at,
        "event_configs": [
            {
                "id": event.id,
                "project_id": event.project_id,
                "event_type": event.event_type,
                "target_url": event.target_url,
                "metadata_json": event.metadata_json,
                "is_active": getattr(event, "is_active", True),
                "retention_days": getattr(event, "retention_days", None),
                "delete_time": getattr(event, "delete_time", None),
                "payload_keys": getattr(event, "payload_keys", None),
                "payload_types": getattr(event, "payload_types", None),
                "created_at": event.created_at,
                "updated_at": event.updated_at,
            }
            for event in event_configs
        ],
    }



@router.patch("/{project_id}/events/{event_id}", response_model=dict)
async def update_event_active_state(
    project_id: int,
    event_id: int,
    payload: EventConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company),
    redis_conn = Depends(get_redis),
):
    """Toggle or update an EventConfig's active state for a project belonging to the current company."""
    try:
        company_id = current_company.id
        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.company_id == company_id)
        )
        db_project = result.scalars().first()
        if db_project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        event_result = await db.execute(
            select(EventConfig).where(EventConfig.id == event_id, EventConfig.project_id == project_id)
        )
        db_event = event_result.scalars().first()
        if db_event is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event config not found")

        if payload.is_active is not None:
            db_event.is_active = payload.is_active

        await db.commit()
        await db.refresh(db_event)

        # Refresh redis allowed events list and project-level cache
        try:
            from backend.app.services.project_service import refresh_project_cache
            await refresh_project_cache(project_id, db, redis_conn)
        except Exception as redis_err:
            logger.warning("Redis cache synchronization skipped: %s", redis_err)

        return {
            "id": db_event.id,
            "project_id": db_event.project_id,
            "event_type": db_event.event_type,
            "is_active": db_event.is_active,
            "target_url": db_event.target_url,
            "metadata_json": db_event.metadata_json,
            "created_at": db_event.created_at,
            "updated_at": db_event.updated_at,
        }

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update event: {str(e)}")

@router.patch("/{project_id}", response_model=ProjectSummary)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    redis_conn = Depends(get_redis),
    current_company = Depends(get_current_company)
):
    try:
        company_id = current_company.id
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.event_configs))
            .where(Project.id == project_id, Project.company_id == company_id)
        )
        db_project = result.scalars().first()
        if db_project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        if payload.name is not None and payload.name.strip():
            existing_project_result = await db.execute(
                select(Project).where(Project.company_id == company_id, Project.name == payload.name.strip())
            )
            existing_project = existing_project_result.scalars().first()
            if existing_project is not None and existing_project.id != project_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project name already exists")
            db_project.name = payload.name.strip()

        if payload.is_active is not None:
            db_project.is_active = payload.is_active

        if payload.description is not None:
            db_project.description = payload.description.strip() or None

        if getattr(payload, "retention_days", None) is not None:
            db_project.retention_days = payload.retention_days

        if payload.event_configs is not None:
            await db.execute(delete(EventConfig).where(EventConfig.project_id == project_id))
            allowed_events_list = []
            for event in payload.event_configs:
                normalized_event = normalize_event_config_payload(event)
                db_event = EventConfig(
                    project_id=project_id,
                    event_type=normalized_event["event_type"],
                    target_url=normalized_event["target_url"],
                    metadata_json=normalized_event["metadata_json"],
                    is_active=getattr(event, "is_active", True),
                    retention_days=normalized_event.get("retention_days"),
                    delete_time=normalized_event.get("delete_time"),
                    payload_keys=normalized_event.get("payload_keys") or None,
                    payload_types=normalized_event.get("payload_types") or None,
                )
                db.add(db_event)
                allowed_events_list.append(normalized_event["event_type"])
        else:
            allowed_events_list = [
                event_config.event_type for event_config in db_project.event_configs if getattr(event_config, "is_active", True)
            ]

        await db.commit()
        await db.refresh(db_project)

        try:
            from backend.app.services.project_service import refresh_project_cache
            await refresh_project_cache(project_id, db, redis_conn)
        except Exception as redis_err:
            logger.warning("Redis cache synchronization skipped: %s", redis_err)

        return {
            "id": project_id,
            "name": db_project.name,
            "description": db_project.description,
            "is_active": db_project.is_active,
            "retention_days": db_project.retention_days,
            "company_id": company_id,
            "created_at": db_project.created_at,
            "updated_at": db_project.updated_at,
        }

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update project: {str(e)}"
        )


@router.delete("/{project_id}", response_model=dict)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    redis_conn = Depends(get_redis),
    current_company = Depends(get_current_company)
):
    try:
        company_id = current_company.id
        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.company_id == company_id)
        )
        db_project = result.scalars().first()
        if db_project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        await db.delete(db_project)
        await db.commit()
        await redis_conn.delete(f"auth:project_{project_id}")
        return {"message": "Project deleted successfully.", "id": project_id}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete project: {str(e)}"
        )


@router.get("/refresh_keys/{project_id}", response_model=ProjectResponse)
async def new_api_and_secret_generation(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    redis_conn = Depends(get_redis),
    current_company = Depends(get_current_company)
):
    try:
        company_id = current_company.id
        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.company_id == company_id)
        )
        db_project = result.scalars().first()
        if db_project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        new_client_api_key, new_hashed_secret = WebhookSecurity.generate_raw_and_hash_key(
            project_id=project_id,
            company_id=company_id
        )
        new_secret_key = WebhookSecurity.generate_webhook_secret()

        db_project.hashed_secret = new_hashed_secret
        db_project.secret_key = new_secret_key
        await db.commit()
        await db.refresh(db_project)

        try:
            from backend.app.services.project_service import refresh_project_cache
            await refresh_project_cache(project_id, db, redis_conn)
        except Exception as redis_err:
            logger.warning("Redis cache synchronization skipped: %s", redis_err)

        return {
            "id": project_id,
            "name": db_project.name,
            "description": db_project.description,
            "is_active": db_project.is_active,
            "company_id": company_id,
            "api_key": new_client_api_key,
            "secret_key": new_secret_key,
            "created_at": db_project.created_at,
            "updated_at": db_project.updated_at
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate new API and secret keys: {str(e)}"
        )


@router.post("/{project_id}/purge")
async def purge_project_data(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    try:
        company_id = current_company.id
        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.company_id == company_id)
        )
        db_project = result.scalars().first()
        if db_project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        ec_res = await db.execute(select(EventConfig.id).where(EventConfig.project_id == project_id))
        ec_ids = [row[0] for row in ec_res.fetchall()]

        # 1. Delete Webhook Logs for this project
        if ec_ids:
            await db.execute(delete(WebhookLog).where(WebhookLog.event_config_id.in_(ec_ids)))

        # 2. Delete Webhook Events for this project
        await db.execute(delete(WebhookEvent).where(WebhookEvent.project_id == project_id))

        await db.commit()
        return {"message": f"Webhook events and delivery logs purged successfully for project #{project_id}."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to purge project data: {str(e)}"
        )