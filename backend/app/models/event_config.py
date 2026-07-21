from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint, Boolean
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from backend.database import Base

class EventConfig(Base):
    __tablename__ = "event_configs"
    __table_args__ = (
        UniqueConstraint("project_id", "event_type", name="uq_event_config_project_event"),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(100), nullable=False, index=True)  # e.g., 'user.signup'
    target_url = Column(String(2048), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    metadata_json = Column(JSONB, nullable=True)  # Key-value or config headers
    retention_days = Column(Integer, nullable=True)
    delete_time = Column(String(16), nullable=True)
    payload_keys = Column(JSONB, nullable=True)
    payload_types = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="event_configs", lazy="selectin")
    webhook_events = relationship("WebhookEvent", back_populates="event_config", lazy="selectin")