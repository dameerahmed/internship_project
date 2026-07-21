import math
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, validator, root_validator
from backend.app.schemas.event_config import EventConfigBase, EventConfigResponse


def _normalize_project_payload(values):
    if not isinstance(values, dict):
        return values

    if "isActive" in values and "is_active" not in values:
        values["is_active"] = values.pop("isActive")

    if "retentionDays" in values and "retention_days" not in values:
        values["retention_days"] = values.pop("retentionDays")
    if "deleteTime" in values and "delete_time" not in values:
        values["delete_time"] = values.pop("deleteTime")

    if "eventConfigs" in values and "event_configs" not in values:
        values["event_configs"] = values.pop("eventConfigs")

    event_configs = values.get("event_configs")
    if isinstance(event_configs, list):
        normalized_event_configs = []
        for event_config in event_configs:
            if not isinstance(event_config, dict):
                normalized_event_configs.append(event_config)
                continue

            if "isActive" in event_config and "is_active" not in event_config:
                event_config["is_active"] = event_config.pop("isActive")
            if "targetUrl" in event_config and "target_url" not in event_config:
                event_config["target_url"] = event_config.pop("targetUrl")
            if "targetUrls" in event_config and "target_urls" not in event_config:
                event_config["target_urls"] = event_config.pop("targetUrls")
            if "retentionDays" in event_config and "retention_days" not in event_config:
                event_config["retention_days"] = event_config.pop("retentionDays")
            if "deleteTime" in event_config and "delete_time" not in event_config:
                event_config["delete_time"] = event_config.pop("deleteTime")
            if "payloadKey" in event_config and "payload_key" not in event_config:
                event_config["payload_key"] = event_config.pop("payloadKey")
            if "payloadKeys" in event_config and "payload_keys" not in event_config:
                event_config["payload_keys"] = event_config.pop("payloadKeys")
            if "payloadType" in event_config and "payload_type" not in event_config:
                event_config["payload_type"] = event_config.pop("payloadType")
            if "payloadTypes" in event_config and "payload_types" not in event_config:
                event_config["payload_types"] = event_config.pop("payloadTypes")

            normalized_event_configs.append(event_config)

        values["event_configs"] = normalized_event_configs

    retention_days = values.get("retention_days")
    if retention_days is None:
        return values

    if isinstance(retention_days, str):
        stripped = retention_days.strip()
        if not stripped:
            values["retention_days"] = None
        else:
            try:
                values["retention_days"] = int(float(stripped))
            except ValueError:
                values["retention_days"] = None
    elif isinstance(retention_days, float) and not math.isfinite(retention_days):
        values["retention_days"] = None

    return values

class ProjectBase(BaseModel):
    name: str = Field(..., max_length=255)
    is_active: bool = True
    retention_days: int = 30
    delete_time: Optional[str] = None

class ProjectCreate(ProjectBase):
    event_configs: List[EventConfigBase]

    @root_validator(pre=True, skip_on_failure=True)
    def normalize_payload(cls, values):
        return _normalize_project_payload(values)

    @validator("event_configs")
    def unique_event_types(cls, event_configs):
        event_types = [event.event_type.strip().lower() for event in event_configs]
        if len(event_types) != len(set(event_types)):
            raise ValueError("Duplicate event_type entries are not allowed within a project.")
        return event_configs

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    event_configs: Optional[List[EventConfigBase]] = None
    retention_days: Optional[int] = None
    delete_time: Optional[str] = None

    @root_validator(pre=True, skip_on_failure=True)
    def normalize_payload(cls, values):
        return _normalize_project_payload(values)

    @validator("event_configs")
    def unique_event_types(cls, event_configs):
        if event_configs is None:
            return event_configs
        event_types = [event.event_type.strip().lower() for event in event_configs]
        if len(event_types) != len(set(event_types)):
            raise ValueError("Duplicate event_type entries are not allowed within a project.")
        return event_configs

class ProjectSummary(ProjectBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ProjectResponse(ProjectBase):
    id: int
    company_id: int
    api_key: str
    secret_key: str

    class Config:
        from_attributes = True

class ProjectDetail(ProjectSummary):
    event_configs: List[EventConfigResponse] = []

    class Config:
        from_attributes = True

