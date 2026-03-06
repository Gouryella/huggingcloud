from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models import UploadStatus
from app.schemas.common import APIModel


class UploadInitRequest(BaseModel):
    path: str
    size: int = Field(gt=0)
    chunk_size: int = Field(default=5 * 1024 * 1024, gt=0, le=1024 * 1024 * 64)
    sha256: str | None = None


class UploadInitResponse(APIModel):
    upload_id: str
    accepted_chunk_size: int


class UploadChunkResponse(APIModel):
    received_chunks: list[int]


class UploadCancelRequest(BaseModel):
    reason: str | None = None


class UploadSessionInfo(APIModel):
    id: str
    user_id: str
    path: str
    size: int
    chunk_size: int
    sha256: str | None
    status: UploadStatus
    received_chunks: list[int]
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class UploadCompleteResponse(APIModel):
    file_path: str
    revision: str | None
