from sqlalchemy import Column, Integer, String, Text, DateTime, func, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from backend.database import Base
from datetime import datetime






class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    event_id = Column(String(50), primary_key=True, index=True)
    
    project_id = Column(Integer, nullable=False, index=True)
    event_config_id = Column(Integer, ForeignKey("event_configs.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    target_url = Column(Text, nullable=True)
    payload = Column(JSONB, nullable=False)
    metadata_json = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    event_config = relationship("EventConfig", back_populates="webhook_events", lazy="selectin")
    logs = relationship(
        "WebhookLog",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
        primaryjoin="WebhookEvent.event_id == WebhookLog.event_id",
        foreign_keys="[WebhookLog.event_id]",
        lazy="selectin",
    )