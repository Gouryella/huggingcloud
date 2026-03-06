from __future__ import annotations

from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


def _resolve_sqlite_database_url(url: str) -> str:
    marker = 'sqlite+aiosqlite:///'
    if not url.startswith(marker):
        return url

    raw_path = url[len(marker):]
    if raw_path.startswith('/'):
        return url

    backend_root = Path(__file__).resolve().parents[2]
    abs_path = (backend_root / raw_path).resolve()
    return f'{marker}{abs_path.as_posix()}'


settings = get_settings()
settings.database_url = _resolve_sqlite_database_url(settings.database_url)
engine = create_async_engine(settings.database_url, echo=settings.debug, pool_pre_ping=True)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
