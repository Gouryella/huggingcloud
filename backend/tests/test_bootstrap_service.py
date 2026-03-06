from __future__ import annotations

import logging

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.models import User, UserRole
from app.services import bootstrap_service


@pytest.mark.asyncio
async def test_ensure_bootstrap_user_creates_one_time_random_password(monkeypatch, caplog) -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    bootstrap_plain = 'OneTime-Bootstrap-Password!'
    monkeypatch.setattr(bootstrap_service, '_generate_bootstrap_password', lambda: bootstrap_plain)

    try:
        async with session_factory() as db:
            caplog.set_level(logging.WARNING)
            await bootstrap_service.ensure_bootstrap_user(db)

            created = (
                await db.execute(select(User).where(User.is_bootstrap.is_(True)).limit(1))
            ).scalar_one()
            assert created.is_active is True
            assert created.force_root_admin_setup is True
            assert verify_password(bootstrap_plain, created.hashed_password or '')
            assert any('password      : OneTime-Bootstrap-Password!' in rec.getMessage() for rec in caplog.records)

            previous_hash = created.hashed_password
            caplog.clear()
            await bootstrap_service.ensure_bootstrap_user(db)
            await db.refresh(created)

            # Must not rotate bootstrap password on subsequent startup checks.
            assert created.hashed_password == previous_hash
            assert verify_password(bootstrap_plain, created.hashed_password or '')
            assert not any('password      :' in rec.getMessage() for rec in caplog.records)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_ensure_bootstrap_user_does_not_reset_existing_active_bootstrap_password(caplog) -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    original_password = 'Already-Set-Strong-Password!'

    try:
        async with session_factory() as db:
            existing = User(
                email='admin@local.invalid',
                username='admin',
                hashed_password=hash_password(original_password),
                role=UserRole.admin,
                is_active=True,
                is_bootstrap=True,
                force_root_admin_setup=True,
            )
            db.add(existing)
            await db.commit()
            await db.refresh(existing)

            caplog.set_level(logging.WARNING)
            await bootstrap_service.ensure_bootstrap_user(db)
            await db.refresh(existing)

            assert verify_password(original_password, existing.hashed_password or '')
            assert not any('password      :' in rec.getMessage() for rec in caplog.records)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_ensure_bootstrap_user_reactivates_existing_bootstrap_without_password_rotation() -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    old_password = 'Persisted-Old-Bootstrap-Password!'

    try:
        async with session_factory() as db:
            existing = User(
                email='admin@local.invalid',
                username='admin',
                hashed_password=hash_password(old_password),
                role=UserRole.admin,
                is_active=False,
                is_bootstrap=True,
                force_root_admin_setup=False,
            )
            db.add(existing)
            await db.commit()
            await db.refresh(existing)

            await bootstrap_service.ensure_bootstrap_user(db)
            await db.refresh(existing)

            assert existing.is_active is True
            assert existing.force_root_admin_setup is True
            assert verify_password(old_password, existing.hashed_password or '')
    finally:
        await engine.dispose()
