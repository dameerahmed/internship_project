# app/routers/dependencies.py (Updated for Integer ID)
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.database import get_db
from backend.app.models.company import Company
from backend.app.utils.security import JWTManager

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_company(
    token: str = Depends(oauth2_scheme), 
    db: AsyncSession = Depends(get_db)
) -> Company:
    """
    Dependency to validate the JWT token and return the current company using Integer ID.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials, please login again.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = JWTManager.decode_access_token(token)
        if payload is None:
            raise credentials_exception

        company_id_str: str = payload.get("sub")
        if company_id_str is None:
            raise credentials_exception

        company_id = int(company_id_str)

    except (ValueError, TypeError):
        raise credentials_exception
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or expired. Please login again.",
        )

    try:
        result = await db.execute(select(Company).where(Company.id == company_id))
        company = result.scalars().first()
        
        if company is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found."
            )

        if not getattr(company, "is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated."
            )
            
        return company
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database lookup failed: {str(e)}"
        )