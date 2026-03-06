from __future__ import annotations

import hashlib
import math
import mimetypes
import os
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import FileIndex, UploadSession, UploadStatus, User
from app.services.hf_client import hf_client
from app.services.quota import validate_upload_quota

MIN_UPLOAD_CHUNK_SIZE_BYTES = 256 * 1024
MAX_UPLOAD_CHUNK_SIZE_BYTES = 64 * 1024 * 1024
MAX_UPLOAD_CHUNKS = 1024
SINGLE_CHUNK_SIZE_CAP_BYTES = 8 * 1024 * 1024


def resolve_upload_chunk_size(*, file_size: int, requested_chunk_size: int) -> int:
    if file_size <= 0:
        raise ValueError('invalid file size')

    if requested_chunk_size <= 0:
        raise ValueError('invalid chunk size')

    max_chunk_for_file = min(MAX_UPLOAD_CHUNK_SIZE_BYTES, file_size)
    if max_chunk_for_file <= MIN_UPLOAD_CHUNK_SIZE_BYTES:
        return max_chunk_for_file

    single_chunk_limit = min(
        max_chunk_for_file,
        max(MIN_UPLOAD_CHUNK_SIZE_BYTES, min(requested_chunk_size, SINGLE_CHUNK_SIZE_CAP_BYTES)),
    )
    if file_size <= single_chunk_limit:
        return file_size

    min_chunk_by_count = math.ceil(file_size / MAX_UPLOAD_CHUNKS)
    lower_bound = max(MIN_UPLOAD_CHUNK_SIZE_BYTES, min_chunk_by_count)
    aligned_requested = math.ceil(requested_chunk_size / MIN_UPLOAD_CHUNK_SIZE_BYTES) * MIN_UPLOAD_CHUNK_SIZE_BYTES
    aligned_lower_bound = math.ceil(lower_bound / MIN_UPLOAD_CHUNK_SIZE_BYTES) * MIN_UPLOAD_CHUNK_SIZE_BYTES
    return min(max_chunk_for_file, max(aligned_requested, aligned_lower_bound))


class UploadService:
    def __init__(self, db: AsyncSession, user: User) -> None:
        self.db = db
        self.user = user
        self.settings = get_settings()

    async def init_upload(self, *, path: str, size: int, chunk_size: int, sha256: str | None) -> UploadSession:
        await validate_upload_quota(self.db, user_id=self.user.id, role=self.user.role, file_size=size)
        accepted_chunk_size = resolve_upload_chunk_size(
            file_size=size,
            requested_chunk_size=chunk_size,
        )

        base = Path(self.settings.upload_temp_dir)
        base.mkdir(parents=True, exist_ok=True)

        session = UploadSession(
            user_id=self.user.id,
            path=path,
            size=size,
            chunk_size=accepted_chunk_size,
            sha256=sha256,
            status=UploadStatus.pending,
            received_chunks=[],
            temp_dir='',
        )
        self.db.add(session)
        await self.db.flush()

        temp_dir = base / session.id
        temp_dir.mkdir(parents=True, exist_ok=True)
        session.temp_dir = str(temp_dir)
        session.status = UploadStatus.uploading
        session.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def get_upload(self, upload_id: str) -> UploadSession | None:
        return (
            await self.db.execute(
                select(UploadSession).where(
                    UploadSession.id == upload_id,
                    UploadSession.user_id == self.user.id,
                ),
            )
        ).scalar_one_or_none()

    async def list_uploads(self, limit: int = 100) -> list[UploadSession]:
        return (
            await self.db.execute(
                select(UploadSession)
                .where(UploadSession.user_id == self.user.id)
                .order_by(UploadSession.created_at.desc())
                .limit(limit),
            )
        ).scalars().all()

    async def cancel_upload(self, *, upload: UploadSession, reason: str | None = None) -> UploadSession:
        if upload.status in {UploadStatus.completed, UploadStatus.failed}:
            return upload

        message = (reason or 'upload cancelled by user').strip() or 'upload cancelled by user'
        upload.status = UploadStatus.failed
        upload.error_message = message[:512]
        upload.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(upload)

        shutil.rmtree(upload.temp_dir, ignore_errors=True)
        return upload

    async def reconcile_stale_uploads(self, *, stale_seconds: int = 300) -> int:
        if stale_seconds <= 0:
            return 0

        cutoff = datetime.now(UTC) - timedelta(seconds=stale_seconds)
        stale_rows = (
            await self.db.execute(
                select(UploadSession).where(
                    UploadSession.user_id == self.user.id,
                    UploadSession.status.in_([UploadStatus.pending, UploadStatus.uploading, UploadStatus.committing]),
                    UploadSession.updated_at < cutoff,
                ),
            )
        ).scalars().all()
        if not stale_rows:
            return 0

        now = datetime.now(UTC)
        for row in stale_rows:
            row.status = UploadStatus.failed
            if not row.error_message:
                row.error_message = 'upload session interrupted or cancelled'
            row.updated_at = now

        await self.db.commit()
        for row in stale_rows:
            shutil.rmtree(row.temp_dir, ignore_errors=True)
        return len(stale_rows)

    async def add_chunk(self, *, upload: UploadSession, chunk_index: int, payload: bytes) -> UploadSession:
        if upload.status not in {UploadStatus.uploading, UploadStatus.pending}:
            raise ValueError(f'upload is not writable (status={upload.status})')
        if not payload:
            raise ValueError('empty chunk payload')

        total_chunks = max(1, math.ceil(upload.size / upload.chunk_size))
        if chunk_index < 0 or chunk_index >= total_chunks:
            raise ValueError('chunk index out of range')

        expected_size = min(upload.chunk_size, upload.size - (chunk_index * upload.chunk_size))
        if expected_size <= 0:
            raise ValueError('invalid chunk size')
        if len(payload) != expected_size:
            raise ValueError(f'invalid chunk size (expected {expected_size}, got {len(payload)})')

        chunk_path = Path(upload.temp_dir) / f'{chunk_index}.part'
        chunk_path.parent.mkdir(parents=True, exist_ok=True)
        chunk_path.write_bytes(payload)

        received = set(upload.received_chunks or [])
        received.add(chunk_index)
        upload.received_chunks = sorted(received)
        upload.status = UploadStatus.uploading
        upload.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(upload)
        return upload

    async def complete_upload(self, upload: UploadSession) -> tuple[str, str | None]:
        total_chunks = math.ceil(upload.size / upload.chunk_size)
        received = set(upload.received_chunks or [])
        missing = [i for i in range(total_chunks) if i not in received]
        if missing:
            raise ValueError(f'missing chunks: {missing[:10]}')

        upload.status = UploadStatus.committing
        upload.updated_at = datetime.now(UTC)
        await self.db.commit()

        merged = Path(upload.temp_dir) / 'merged.bin'
        try:
            with merged.open('wb') as out:
                for i in range(total_chunks):
                    part = Path(upload.temp_dir) / f'{i}.part'
                    with part.open('rb') as src:
                        shutil.copyfileobj(src, out, length=1024 * 1024)

            digest = hashlib.sha256()
            with merged.open('rb') as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                    digest.update(chunk)
            actual_sha = digest.hexdigest()
            if upload.sha256 and upload.sha256.lower() != actual_sha.lower():
                upload.status = UploadStatus.failed
                upload.error_message = 'sha256 mismatch'
                upload.updated_at = datetime.now(UTC)
                await self.db.commit()
                raise ValueError('sha256 mismatch')

            revision = await hf_client.upload_file(
                local_path=str(merged),
                path_in_repo=upload.path,
                commit_message=f'upload {upload.path}',
            )

            # Upsert file index immediately so list API reflects the newly uploaded file
            # without waiting for periodic sync.
            completed_at = datetime.now(UTC)
            mime = mimetypes.guess_type(upload.path)[0]
            index_row = (await self.db.execute(select(FileIndex).where(FileIndex.path == upload.path))).scalar_one_or_none()
            if index_row is None:
                self.db.add(
                    FileIndex(
                        path=upload.path,
                        size=upload.size,
                        mime=mime,
                        last_modified=completed_at,
                        indexed_at=completed_at,
                    ),
                )
            else:
                index_row.size = upload.size
                index_row.mime = mime
                # Uploading a new revision should update file modified time.
                index_row.last_modified = completed_at
                # Preserve first-seen index time for stable list display/sorting.
                if index_row.indexed_at is None:
                    index_row.indexed_at = completed_at

            upload.status = UploadStatus.completed
            upload.completed_at = completed_at
            upload.updated_at = completed_at
            await self.db.commit()
            return upload.path, revision
        except ValueError:
            raise
        except Exception as exc:
            await self.db.rollback()
            upload.status = UploadStatus.failed
            message = str(exc).strip() or 'upload commit failed'
            upload.error_message = message[:512]
            upload.updated_at = datetime.now(UTC)
            await self.db.commit()
            raise
        finally:
            if upload.status in {UploadStatus.completed, UploadStatus.failed}:
                shutil.rmtree(upload.temp_dir, ignore_errors=True)
