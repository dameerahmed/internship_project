from fastapi import APIRouter, Depends, HTTPException, status, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select
from  app.models.project import Project
from  app.models.event_config import EventConfig
from  app.models.webhook_event import WebhookEvent
from  app.models.webhook_log import WebhookLog

from  database import get_db
from  app.models.company import Company
from  app.schemas.company import CompanyDeleteResponse
from  app.services.redis_client import get_redis_client
from  app.services.dependencies import get_current_company  

router = APIRouter(prefix="", tags=["Company Profile"])


def _get_or_generate_rsa_public_key() -> str:
    from config import settings
    if settings.SYSTEM_PUBLIC_KEY and settings.SYSTEM_PUBLIC_KEY.strip():
        return settings.SYSTEM_PUBLIC_KEY.strip()
    try:
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_key = private_key.public_key()
        pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return pem.decode("utf-8")
    except Exception:
        return "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuP0...\n-----END PUBLIC KEY-----"


@router.get("/company/rsa-public-key")
@router.get("/v1/companies/rsa-public-key")
@router.get("/v1/companies/keys")
async def get_company_rsa_public_key(current_company: Company = Depends(get_current_company)):
    """Return the organization's RSA Public Key for downstream/external signature verification."""
    public_key_pem = _get_or_generate_rsa_public_key()
    return {
        "company_id": current_company.id,
        "company_name": current_company.name,
        "rsa_public_key": public_key_pem,
        "algorithm": "RSA-SHA256",
        "format": "PEM",
    }


@router.get("/v1/companies/me")
@router.get("/company/me")
async def get_company_profile(current_company: Company = Depends(get_current_company)):
    public_key_pem = _get_or_generate_rsa_public_key()
    return {
        "id": current_company.id,
        "company_name": current_company.name,
        "name": current_company.name,
        "email": current_company.email,
        "support_email": current_company.email,
        "is_active": current_company.is_active,
        "rsa_public_key": public_key_pem,
        "created_at": current_company.created_at,
        "updated_at": current_company.updated_at,
    }


@router.put("/v1/companies/me")
async def update_company_profile(
    payload: dict,
    current_company: Company = Depends(get_current_company),
    db: AsyncSession = Depends(get_db)
):
    name = payload.get("company_name") or payload.get("name")
    if name:
        current_company.name = name
    email = payload.get("support_email") or payload.get("email")
    if email:
        current_company.email = email
    await db.commit()
    await db.refresh(current_company)
    return {
        "status": "success",
        "company_name": current_company.name,
        "support_email": current_company.email
    }


# 🟡 1. DEACTIVATE (Soft Delete) — Sirf account temporarily band karna
@router.post("/company/deactivate")
@router.post("/v1/companies/archive")
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

        await db.delete(current_company)
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