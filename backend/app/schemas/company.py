from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, HttpUrl

# --- COMPANY / PROJECT SCHEMAS ---
class CompanyRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)

class CompanyLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    company_name: str
    email: EmailStr
    company_id: int

    class Config:
        from_attributes = True

class CompanyResponse(BaseModel):
    name: str
    email: EmailStr
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    password: Optional[str] = Field(None, min_length=6)  # Optional password change

    class Config:
        from_attributes = True


class CompanyDeleteResponse(BaseModel):
    status: str
    message: str

    class Config:
        from_attributes = True