from sqlalchemy import Boolean, Column, Integer, String,DateTime
from datetime import datetime
from sqlalchemy.orm import relationship
from backend.database import Base
class Company(Base):
    
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, autoincrement=True,index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    # Relationships
    projects = relationship("Project", back_populates="company", cascade="all, delete-orphan")