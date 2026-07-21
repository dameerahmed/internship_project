from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel
from backend.app.models.webhook_log import WebhookStatus

class WebhookLogBase(BaseModel):
    event_id: Optional[str]
    status: WebhookStatus
    retry_count: int = 0
    response_code: Optional[int] = None
    error_message: Optional[str] = None

class WebhookLogResponse(WebhookLogBase):
    id: int
    event_config_id: Optional[int]
    event_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True