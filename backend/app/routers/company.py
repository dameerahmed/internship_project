from fastapi import APIRouter, Depends, HTTPException, status, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select
from backend.app.models.project import Project
from backend.app.models.event_config import EventConfig
from backend.app.models.webhook_event import WebhookEvent
from backend.app.models.webhook_log import WebhookLog

from backend.database import get_db
from backend.app.models.company import Company
from backend.app.schemas.company import CompanyDeleteResponse
from backend.app.services.redis_client import get_redis_client
from backend.app.services.dependencies import get_current_company  

router = APIRouter(prefix="/company", tags=["Company Profile"])

# 🟡 1. DEACTIVATE (Soft Delete) — Sirf account temporarily band karna
@router.post("/deactivate", response_model=CompanyDeleteResponse)
async def deactivate_account(
    response: Response,
    current_company: Company = Depends(get_current_company),
    db: AsyncSession = Depends(get_db)
):
    """
    Temporarily deactivates the company. Data remains safe in DB, but logins are blocked.
    """
    try:
        current_company.is_active = False
        await db.commit()
        
        # Redis mein session block karo taake banda fauran logout ho jaye
        try:
            redis_client = await get_redis_client()
            try:
                await redis_client.set(f"company_block:{current_company.id}", "true", ex=86400)
            finally:
                await redis_client.close()
        except Exception:
            pass

        response.delete_cookie(key="refresh_token", path="/")
        
        return {
            "status": "success",
            "message": "Your account has been deactivated. Your data is safe but sessions are locked."
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# 🔴 2. PERMANENT DELETE (Hard Delete) — Sab kuch khatam, full data wipe!
@router.delete("/terminate", response_model=CompanyDeleteResponse)
async def terminate_account(
    response: Response,
    current_company: Company = Depends(get_current_company),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Permanently deletes the company and all associated projects/logs from the system.
    """
    try:
        company_id = current_company.id

        project_result = await db.execute(select(Project).where(Project.company_id == company_id))
        projects = project_result.scalars().all()

        for project in projects:
            project_id = getattr(project, "id", project)
            event_config_result = await db.execute(select(EventConfig.id).where(EventConfig.project_id == project_id))
            event_config_ids = [row[0] for row in event_config_result.fetchall()]

            if event_config_ids:
                await db.execute(delete(WebhookLog).where(WebhookLog.event_config_id.in_(event_config_ids)))
                await db.execute(delete(WebhookEvent).where(WebhookEvent.event_config_id.in_(event_config_ids)))
                await db.execute(delete(EventConfig).where(EventConfig.id.in_(event_config_ids)))

            await db.execute(delete(Project).where(Project.id == project_id))

        db.delete(current_company)
        await db.commit()

        try:
            redis_client = await get_redis_client()
            try:
                await redis_client.delete(f"company_block:{company_id}")
            finally:
                await redis_client.close()
        except Exception:
            pass

        response.delete_cookie(key="refresh_token", path="/")

        return {
            "status": "success",
            "message": "Your company and all associated projects/gateways have been permanently deleted from our servers."
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Termination pipeline failed: {str(e)}"
        )