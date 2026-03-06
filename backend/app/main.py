from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from contextlib import suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.runtime_schema import ensure_runtime_schema
from app.db.session import SessionLocal, engine
from app.services.acl import ensure_default_acl_rules
from app.services.bootstrap_service import ensure_bootstrap_user
from app.services.file_index_service import periodic_sync_loop
from app.services.hf_client import hf_client
from app.services.quota import ensure_default_quota_policies
from app.services.redis_client import close_redis
from app.services.security_settings import ensure_runtime_signing_secret

settings = get_settings()
_index_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _index_task
    configure_logging()

    if settings.database_url.startswith('sqlite'):
        db_file = settings.database_url.replace('sqlite+aiosqlite:///', '')
        if db_file.startswith('./'):
            db_file = db_file[2:]
        Path(db_file).parent.mkdir(parents=True, exist_ok=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(ensure_runtime_schema)

    async with SessionLocal() as db:
        await ensure_runtime_signing_secret(db)
        await ensure_default_acl_rules(db)
        await ensure_default_quota_policies(db)
        await ensure_bootstrap_user(db)

    if settings.index_sync_enabled:
        _index_task = asyncio.create_task(periodic_sync_loop(SessionLocal, settings.index_sync_interval_seconds))

    yield

    if _index_task:
        _index_task.cancel()
        with suppress(asyncio.CancelledError):
            await _index_task

    await hf_client.close()
    await close_redis()


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(api_router)
