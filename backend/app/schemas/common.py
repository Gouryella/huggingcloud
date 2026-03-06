from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CursorResponse(APIModel):
    next_cursor: str | None = None


class MessageResponse(APIModel):
    message: str


class ErrorResponse(APIModel):
    detail: str


class AuditEntry(APIModel):
    id: str
    user_id: str | None
    user_email: str | None = None
    action: str
    resource: str
    metadata_json: dict[str, Any] | None
    ip: str | None
    created_at: datetime
