from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import uuid

# Context mapping keys based on your layout
from backend.database import get_db
from backend.config import settings
from backend.app.models.company import Company
from backend.app.schemas.company import CompanyRegister, CompanyUpdate, TokenResponse
from backend.app.services.auth_ops import PasswordManager
from backend.app.utils.security import JWTManager
from backend.app.services.redis_client import get_redis_client
from backend.app.services.dependencies import get_current_company

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_company(payload: CompanyRegister, db: AsyncSession = Depends(get_db)):
    """
    Registers a new company using standard asynchronous pipeline.
    """
    try:
        query = select(Company).where(Company.email == payload.email)
        result = await db.execute(query)
        existing_company = result.scalars().first()
        
        if existing_company:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email address is already registered."
            )
            
        hashed_password = PasswordManager.hash_password(payload.password)
        new_company = Company(
            name=payload.name,
            email=payload.email,
            hashed_password=hashed_password
        )
        
        db.add(new_company)
        await db.commit()      
        await db.refresh(new_company)
        
        return {"status": "success", "message": "Company registered successfully!"}
        
    except HTTPException:
        await db.rollback()    
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failed: {str(e)}"
        )


@router.post("/login", response_model=TokenResponse)
async def login_company(
    response: Response,  # 🚀 Cookie inject karne ke liye response object add kiya
    payload: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticates user, returns Access Token via Body (for Swagger) and Refresh Token via HttpOnly Cookie.
    """
    try:
        query = select(Company).where(Company.email == payload.username)
        result = await db.execute(query)
        company = result.scalars().first()
        
        if not company or not PasswordManager.verify_password(payload.password, company.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password combination."
            )

        if not getattr(company, "is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated."
            )
            
        token_id = str(uuid.uuid4())
        token_data = {"sub": str(company.id), "email": company.email, "company_id": str(company.id), "jti": token_id}
        
        # 1. Generate Tokens using your JWTManager
        access_token = JWTManager.create_access_token(data=token_data)
        refresh_token = JWTManager.create_refresh_token(data=token_data)
        
        # 🍪 2. Set Refresh Token in secure HttpOnly Cookie
        try:
            redis_client = await get_redis_client()
            try:
                await redis_client.set(f"rt:{token_id}", "active", ex=604800)
            finally:
                await redis_client.close()
        except Exception:
            pass

        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
            path="/",
            max_age=604800,
        )
        
        # 3. Return Access token in body for Swagger UI lock compatibility
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "company_name": company.name,
            "email": company.email,
            "company_id": company.id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login verification failed: {str(e)}"
        )


@router.post("/logout")
async def logout_company(response: Response):
    response.delete_cookie(key="refresh_token", path="/")
    return {"status": "success", "message": "Logged out successfully."}


@router.post("/change-password")
async def change_password(
    payload: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    if not payload.password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required.")

    current_company.hashed_password = PasswordManager.hash_password(payload.password)
    await db.commit()
    return {"status": "success", "message": "Password changed successfully."}


@router.post("/refresh")
async def refresh_access_token(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """
    Advanced Token Rotation with Redis-backed Fraud & Reuse Detection.
    Falls back to the current access token when the refresh cookie is unavailable
    so the SPA can stay authenticated during browser cookie issues.
    """
    try:
        refresh_token = request.cookies.get("refresh_token")
        payload = None

        if refresh_token:
            payload = JWTManager.decode_token(refresh_token)

        if not payload or payload.get("type") != "refresh":
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                access_token = auth_header.split(" ", 1)[1].strip()
                access_payload = JWTManager.decode_access_token(access_token)
                if access_payload and access_payload.get("type") == "access":
                    payload = {
                        "sub": access_payload.get("sub"),
                        "email": access_payload.get("email"),
                        "company_id": access_payload.get("company_id"),
                        "jti": access_payload.get("jti"),
                    }

        if not payload or (payload.get("type") != "refresh" and payload.get("sub") is None):
            response.delete_cookie(key="refresh_token", path="/")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token missing. Please login again."
            )

        if payload.get("type") == "refresh":
            company_id = payload.get("sub")
            token_id = payload.get("jti")

            if not token_id:
                raise HTTPException(status_code=401, detail="Malicious token structural layout.")

            # 🚨 3. REDIS FRAUD & REUSE DETECTION LAYER 🚨
            try:
                redis_client = await get_redis_client()
                try:
                    redis_status = await redis_client.get(f"rt:{token_id}")
                    
                    if redis_status == "used" or redis_status == "revoked":
                        await redis_client.set(f"company_block:{company_id}", "true", ex=86400)
                        response.delete_cookie(key="refresh_token", path="/")
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Security Breach Detected! Token reuse identified. All sessions revoked."
                        )

                    is_company_blocked = await redis_client.get(f"company_block:{company_id}")
                    if is_company_blocked:
                        response.delete_cookie(key="refresh_token", path="/")
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Account session locked due to suspicious activity. Please re-login with password."
                        )

                    await redis_client.set(f"rt:{token_id}", "used", ex=604800)
                finally:
                    await redis_client.close()
            except Exception:
                pass

            # 5. Naye Tokens ke liye Fresh Identity Data taiyar karo
            new_token_id = str(uuid.uuid4())
            token_data = {
                "sub": str(company_id),
                "email": payload.get("email"),
                "company_id": str(company_id),
                "jti": new_token_id,
            }
            
            # New Access & Refresh Tokens generation
            new_access_token = JWTManager.create_access_token(data=token_data)
            new_refresh_token = JWTManager.create_refresh_token(data=token_data)

            redis_client = await get_redis_client()
            try:
                await redis_client.set(f"rt:{new_token_id}", "active", ex=604800)
            finally:
                await redis_client.close()
            
            # 🍪 7. Naye Refresh Token ko cookie mein refresh path par update kar dein
            response.set_cookie(
                key="refresh_token",
                value=new_refresh_token,
                httponly=True,
                secure=settings.COOKIE_SECURE,
                samesite="lax",
                path="/",
                max_age=604800,
            )
            
            return {
                "access_token": new_access_token,
                "token_type": "bearer"
            }

        # Fallback path: use the current access token as the identity source when the
        # refresh cookie is not available.
        company_id = payload.get("company_id") or payload.get("sub")
        if not company_id:
            response.delete_cookie(key="refresh_token", path="/")
            raise HTTPException(status_code=401, detail="Refresh token missing. Please login again.")

        token_data = {
            "sub": str(company_id),
            "email": payload.get("email"),
            "company_id": str(company_id),
            "jti": str(uuid.uuid4()),
        }
        new_access_token = JWTManager.create_access_token(data=token_data)
        new_refresh_token = JWTManager.create_refresh_token(data=token_data)

        redis_client = await get_redis_client()
        try:
            await redis_client.set(f"rt:{token_data['jti']}", "active", ex=604800)
        finally:
            await redis_client.close()

        response.set_cookie(
            key="refresh_token",
            value=new_refresh_token,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
            path="/",
            max_age=604800,
        )

        return {
            "access_token": new_access_token,
            "token_type": "bearer"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Token rotation matrix failed: {str(e)}"
        )

