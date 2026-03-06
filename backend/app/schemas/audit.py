from __future__ import annotations

from pydantic import BaseModel

from app.schemas.common import AuditEntry


class AuditListResponse(BaseModel):
    items: list[AuditEntry]
    next_cursor: str | None = None
