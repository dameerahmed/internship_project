from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, UniqueConstraint
from datetime import datetime
from sqlalchemy.orm import relationship
from backend.database import Base


# The database schema in this workspace does not consistently include the legacy
# delete_time column on projects, so we keep the model attribute but mark it as
# nullable and compatible with older migrations.

class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_project_company_name"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True,index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    hashed_secret = Column(String(255), unique=True, nullable=False, index=True)
    secret_key = Column(String(255), nullable=False)  # For HMAC Security Verification
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    retention_days = Column(Integer, default=30, nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    company = relationship("Company", back_populates="projects")
    event_configs = relationship("EventConfig", back_populates="project", cascade="all, delete-orphan", lazy="selectin")