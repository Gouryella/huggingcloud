from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.models import SystemSetting
from app.services.security_settings import (
    SIGNING_SECRET_KEY,
    ensure_runtime_signing_secret,
    reset_runtime_signing_secret_cache,
)


@pytest.mark.asyncio
async def test_ensure_runtime_signing_secret_initializes_once() -> None:
    reset_runtime_signing_secret_cache()
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        async with session_factory() as db:
            first = await ensure_runtime_signing_secret(db)
            second = await ensure_runtime_signing_secret(db)

            row = (
                await db.execute(
                    select(SystemSetting).where(SystemSetting.key == SIGNING_SECRET_KEY).limit(1),
                )
            ).scalar_one()

            assert first
            assert second == first
            assert row.value_text == first
    finally:
        reset_runtime_signing_secret_cache()
        await engine.dispose()


@pytest.mark.asyncio
async def test_ensure_runtime_signing_secret_does_not_override_existing_value() -> None:
    reset_runtime_signing_secret_cache()
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    existing_secret = 'existing-signing-secret-value'

    try:
        async with session_factory() as db:
            db.add(SystemSetting(key=SIGNING_SECRET_KEY, value_text=existing_secret, updated_by=None))
            await db.commit()

            resolved = await ensure_runtime_signing_secret(db)
            row = (
                await db.execute(
                    select(SystemSetting).where(SystemSetting.key == SIGNING_SECRET_KEY).limit(1),
                )
            ).scalar_one()

            assert resolved == existing_secret
            assert row.value_text == existing_secret
    finally:
        reset_runtime_signing_secret_cache()
        await engine.dispose()
