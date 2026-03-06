from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.routes import files as files_route
from app.api.routes.files import _authorized_repo_totals, _list_authorized_files
from app.db.base import Base
from app.models import ACLRule, FileIndex, User, UserRole
from app.services.hf_client import HFRepoNotConfiguredError


@pytest.mark.asyncio
async def test_authorized_listing_filters_global_results_without_skipping() -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as db:
            user = User(email='member@example.com', hashed_password='x', role=UserRole.member, is_active=True)
            db.add(user)
            db.add_all(
                [
                    ACLRule(role=UserRole.member, path_prefix='share', permissions=['list'], allow=True),
                    ACLRule(role=UserRole.member, path_prefix='private', permissions=['list'], allow=False),
                ],
            )
            db.add_all(
                [
                    FileIndex(path='private/a.txt', size=1, mime='text/plain'),
                    FileIndex(path='share/b.txt', size=2, mime='text/plain'),
                    FileIndex(path='share/c.txt', size=3, mime='text/plain'),
                ],
            )
            await db.commit()

            first_rows, first_cursor = await _list_authorized_files(
                db,
                user=user,
                q=None,
                cursor=None,
                limit=1,
            )
            assert [row.path for row in first_rows] == ['share/b.txt']
            assert first_cursor is not None

            second_rows, second_cursor = await _list_authorized_files(
                db,
                user=user,
                q=None,
                cursor=first_cursor,
                limit=1,
            )
            assert [row.path for row in second_rows] == ['share/c.txt']
            assert second_cursor is None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_authorized_repo_totals_exclude_denied_prefixes() -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as db:
            user = User(email='member2@example.com', hashed_password='x', role=UserRole.member, is_active=True)
            db.add(user)
            db.add_all(
                [
                    ACLRule(role=UserRole.member, path_prefix='share', permissions=['list'], allow=True),
                    ACLRule(role=UserRole.member, path_prefix='private', permissions=['list'], allow=False),
                ],
            )
            db.add_all(
                [
                    FileIndex(path='private/secret.bin', size=10, mime='application/octet-stream'),
                    FileIndex(path='share/public.bin', size=7, mime='application/octet-stream'),
                ],
            )
            await db.commit()

            total_files, total_size = await _authorized_repo_totals(db, user=user)
            assert total_files == 1
            assert total_size == 7
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_list_files_gracefully_handles_unconfigured_hf_repo(monkeypatch) -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def fake_sync_file_index(db, *, prefix=None) -> int:
        _ = (db, prefix)
        raise HFRepoNotConfiguredError('repo is not configured')

    monkeypatch.setattr(files_route, 'sync_file_index', fake_sync_file_index)

    try:
        async with session_factory() as db:
            user = User(email='owner@example.com', hashed_password='x', role=UserRole.owner, is_active=True)
            db.add(user)
            await db.commit()

            resp = await files_route.list_files(
                prefix=None,
                q=None,
                cursor=None,
                limit=100,
                db=db,
                user=user,
            )
            assert resp.items == []
            assert resp.next_cursor is None
            assert resp.total_files == 0
            assert resp.total_size_bytes == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_refresh_files_returns_409_when_hf_repo_is_unconfigured(monkeypatch) -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def fake_sync_file_index(db, *, prefix=None) -> int:
        _ = (db, prefix)
        raise HFRepoNotConfiguredError('repo is not configured')

    monkeypatch.setattr(files_route, 'sync_file_index', fake_sync_file_index)

    try:
        async with session_factory() as db:
            user = User(email='owner2@example.com', hashed_password='x', role=UserRole.owner, is_active=True)
            db.add(user)
            await db.commit()

            with pytest.raises(HTTPException) as exc:
                await files_route.refresh_files(
                    prefix=None,
                    db=db,
                    user=user,
                )
            assert exc.value.status_code == 409
            assert exc.value.detail == 'Hugging Face repository is not configured. Configure it in Settings first.'
    finally:
        await engine.dispose()
