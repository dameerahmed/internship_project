from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, root_validator


class EventConfigBase(BaseModel):
    event_type: str = Field(..., max_length=100)
    target_url: Optional[str] = Field(None, max_length=2048)
    target_urls: Optional[List[str]] = None
    metadata_json: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = True
    retention_days: Optional[int] = None
    delete_time: Optional[str] = None
    payload_key: Optional[str] = None
    payload_type: Optional[str] = None
    payload_keys: Optional[List[str]] = None
    payload_types: Optional[List[str]] = None

    @root_validator(pre=True, skip_on_failure=True)
    def validate_urls(cls, values):
        if not isinstance(values, dict):
            return values

        if "isActive" in values and "is_active" not in values:
            values["is_active"] = values.pop("isActive")

        if "retentionDays" in values and "retention_days" not in values:
            values["retention_days"] = values.pop("retentionDays")

        if "deleteTime" in values and "delete_time" not in values:
            values["delete_time"] = values.pop("deleteTime")

        if "payloadKey" in values and "payload_key" not in values:
            values["payload_key"] = values.pop("payloadKey")
        if "payloadKeys" in values and "payload_keys" not in values:
            values["payload_keys"] = values.pop("payloadKeys")
        if "payloadType" in values and "payload_type" not in values:
            values["payload_type"] = values.pop("payloadType")
        if "payloadTypes" in values and "payload_types" not in values:
            values["payload_types"] = values.pop("payloadTypes")

        if isinstance(values.get("payload_keys"), str):
            values["payload_keys"] = [item.strip() for item in values["payload_keys"].split(",") if item.strip()]
        elif values.get("payload_keys") is None and values.get("payload_key"):
            values["payload_keys"] = [values["payload_key"]]

        if isinstance(values.get("payload_types"), str):
            values["payload_types"] = [item.strip() for item in values["payload_types"].split(",") if item.strip()]
        elif values.get("payload_types") is None and values.get("payload_type"):
            values["payload_types"] = [values["payload_type"]]

        target_url = values.get("target_url")
        target_urls = values.get("target_urls")
        cleaned_urls = []

        if target_urls:
            cleaned_urls = [item.strip() for item in target_urls if isinstance(item, str) and item.strip()]
        elif target_url:
            cleaned_urls = [target_url.strip()] if isinstance(target_url, str) and target_url.strip() else []

        if not cleaned_urls:
            raise ValueError("At least one target URL is required")

        values["target_urls"] = cleaned_urls
        values["target_url"] = cleaned_urls[0]
        return values

class EventConfigCreate(EventConfigBase):
    project_id: int


class EventConfigUpdate(BaseModel):
    is_active: Optional[bool] = None

class EventConfigResponse(EventConfigBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True