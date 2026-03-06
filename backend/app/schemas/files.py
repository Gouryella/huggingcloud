from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import APIModel


class FileItem(APIModel):
    path: str
    size: int | None = None
    mime: str | None = None
    etag: str | None = None
    sha256: str | None = None
    last_modified: datetime | None = None
    indexed_at: datetime | None = None


class FileListResponse(APIModel):
    items: list[FileItem]
    next_cursor: str | None = None
    total_files: int = 0
    total_size_bytes: int = 0
    storage_capacity_bytes: int | None = None
    storage_remaining_bytes: int | None = None
    hf_repo_configured: bool = True


class DeleteFileRequest(BaseModel):
    path: str
    recursive: bool = Field(default=False)


class MoveFileRequest(BaseModel):
    source_path: str
    destination_path: str


class RefreshRequest(BaseModel):
    prefix: str | None = None


class RefreshResponse(APIModel):
    queued: bool
