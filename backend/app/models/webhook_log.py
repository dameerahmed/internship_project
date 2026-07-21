import enum
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from backend.database import Base


class WebhookStatus(enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class WebhookLog(Base):
    __tablename__ = "webhook_logs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    event_config_id = Column(Integer, ForeignKey("event_configs.id", ondelete="SET NULL"), nullable=True, index=True)
    event_id = Column(String(64), ForeignKey("webhook_events.event_id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(Enum(WebhookStatus), default=WebhookStatus.PENDING, nullable=False, index=True)
    attempt_number = Column(Integer, default=1, nullable=False, index=True)
    response_code = Column(Integer, nullable=True, index=True)
    error_message = Column(Text, nullable=True)
    processing_duration_ms = Column(Integer, nullable=True)
    source_ip = Column(String(64), nullable=True)
    http_method = Column(String(16), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    event = relationship(
        "WebhookEvent",
        back_populates="logs",
        primaryjoin="WebhookLog.event_id == WebhookEvent.event_id",
        foreign_keys="[WebhookLog.event_id]",
        uselist=False,
        passive_deletes=True,
        lazy="selectin",
    )
    