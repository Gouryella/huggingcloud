from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import APIModel

class CreateLinkRequest(BaseModel):
    path: str
    expires_in_sec: int = Field(default=3600, ge=0, le=60 * 60 * 24 * 14)
    max_downloads: int | None = Field(default=None, ge=1, le=1_000_000)
    one_time: bool = False
    ip_allowlist: list[str] | None = None
    speed_limit_mbps: int | None = Field(default=None, ge=1, le=5000)


class LinkRecord(APIModel):
    id: str
    path: str
    short_url: str | None = None
    expires_at: datetime
    revoked_at: datetime | None
    max_downloads: int | None
    download_count: int
    one_time: bool
    ip_allowlist: list[str] | None
    speed_limit_mbps: int | None
    created_at: datetime


class CreateLinkResponse(APIModel):
    link_id: str
    url: str
    short_url: str
    expires_at: datetime


class RevokeLinkResponse(APIModel):
    revoked: bool
