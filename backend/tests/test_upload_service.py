from __future__ import annotations

import math
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.models import ShareLink, UploadSession, UploadStatus, User, UserRole
from app.services import upload_service as upload_service_module
from app.services.upload_service import UploadService, resolve_upload_chunk_size


def test_resolve_upload_chunk_size_uses_single_chunk_for_tiny_file() -> None:
    size = 100 * 1024
    chunk_size = resolve_upload_chunk_size(
        file_size=size,
        requested_chunk_size=5 * 1024 * 1024,
    )
    assert chunk_size == size


def test_resolve_upload_chunk_size_uses_single_chunk_for_small_file() -> None:
    size = 4 * 1024 * 1024
    chunk_size = resolve_upload_chunk_size(
        file_size=size,
        requested_chunk_size=5 * 1024 * 1024,
    )
    assert chunk_size == size


def test_resolve_upload_chunk_size_bounds_chunk_count_for_large_file() -> None:
    size = 20 * 1024 * 1024 * 1024
    chunk_size = resolve_upload_chunk_size(
        file_size=size,
        requested_chunk_size=5 * 1024 * 1024,
    )
    assert math.ceil(size / chunk_size) <= 1024


@pytest.mark.asyncio
async def test_complete_upload_does_not_create_share_link(tmp_path: Path, monkeypatch) -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def fake_upload_file(*, local_path: str, path_in_repo: str, commit_message: str) -> str:
        assert local_path
        assert path_in_repo == 'uploads/demo.bin'
        assert 'upload uploads/demo.bin' in commit_message
        return 'revision-1'

    monkeypatch.setattr(upload_service_module.hf_client, 'upload_file', fake_upload_file)

    temp_dir = tmp_path / 'upload-session'
    temp_dir.mkdir(parents=True, exist_ok=True)
    (temp_dir / '0.part').write_bytes(b'hello')

    try:
        async with session_factory() as db:
            user = User(email='demo@example.com', hashed_password='x', role=UserRole.owner)
            db.add(user)
            await db.flush()

            upload = UploadSession(
                user_id=user.id,
                path='uploads/demo.bin',
                size=5,
                chunk_size=5,
                sha256=None,
                status=UploadStatus.uploading,
                received_chunks=[0],
                temp_dir=str(temp_dir),
            )
            db.add(upload)
            await db.commit()
            await db.refresh(upload)

            service = UploadService(db, user)
            file_path, revision = await service.complete_upload(upload)
            assert file_path == 'uploads/demo.bin'
            assert revision == 'revision-1'

            link_count = (await db.execute(select(func.count(ShareLink.id)))).scalar_one()
            assert link_count == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_add_chunk_validates_chunk_index_and_size(tmp_path: Path) -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    temp_dir = tmp_path / 'upload-session-validate'
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        async with session_factory() as db:
            user = User(email='chunk@example.com', hashed_password='x', role=UserRole.owner)
            db.add(user)
            await db.flush()

            upload = UploadSession(
                user_id=user.id,
                path='uploads/chunk.bin',
                size=6,
                chunk_size=4,
                sha256=None,
                status=UploadStatus.uploading,
                received_chunks=[],
                temp_dir=str(temp_dir),
            )
            db.add(upload)
            await db.commit()
            await db.refresh(upload)

            service = UploadService(db, user)
            with pytest.raises(ValueError, match='chunk index out of range'):
                await service.add_chunk(upload=upload, chunk_index=2, payload=b'xx')

            with pytest.raises(ValueError, match='invalid chunk size'):
                await service.add_chunk(upload=upload, chunk_index=1, payload=b'xyz')
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_complete_upload_marks_failed_on_upstream_error_and_cleans_temp(tmp_path: Path, monkeypatch) -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def fake_upload_file(*, local_path: str, path_in_repo: str, commit_message: str) -> str:
        _ = (local_path, path_in_repo, commit_message)
        raise RuntimeError('upstream unavailable')

    monkeypatch.setattr(upload_service_module.hf_client, 'upload_file', fake_upload_file)

    temp_dir = tmp_path / 'upload-session-fail'
    temp_dir.mkdir(parents=True, exist_ok=True)
    (temp_dir / '0.part').write_bytes(b'hello')

    try:
        async with session_factory() as db:
            user = User(email='fail@example.com', hashed_password='x', role=UserRole.owner)
            db.add(user)
            await db.flush()

            upload = UploadSession(
                user_id=user.id,
                path='uploads/fail.bin',
                size=5,
                chunk_size=5,
                sha256=None,
                status=UploadStatus.uploading,
                received_chunks=[0],
                temp_dir=str(temp_dir),
            )
            db.add(upload)
            await db.commit()
            await db.refresh(upload)

            service = UploadService(db, user)
            with pytest.raises(RuntimeError, match='upstream unavailable'):
                await service.complete_upload(upload)

            await db.refresh(upload)
            assert upload.status == UploadStatus.failed
            assert upload.error_message is not None
            assert 'upstream unavailable' in upload.error_message
            assert not temp_dir.exists()
    finally:
        await engine.dispose()
