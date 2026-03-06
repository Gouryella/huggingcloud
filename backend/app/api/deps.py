from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.models import User
from app.services.auth_service import AuthService
from app.services.cache import CacheClient
from app.services.redis_client import get_redis


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async for db in get_db():
        yield db


async def get_redis_client() -> CacheClient:
    return await get_redis()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
) -> User:
    settings = get_settings()
    session_token = request.cookies.get(settings.auth_cookie_name)
    if session_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Not authenticated')

    auth = AuthService(db, redis)
    user = await auth.get_user_from_session_token(session_token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Session expired or invalid')

    if user.force_root_admin_setup:
        path = request.url.path
        if not (
            path.startswith('/api/setup/')
            or path == '/api/me'
            or path == '/api/auth/logout'
        ):
            raise HTTPException(
                status_code=status.HTTP_428_PRECONDITION_REQUIRED,
                detail='root admin setup required',
            )
    return user


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
) -> User | None:
    settings = get_settings()
    session_token = request.cookies.get(settings.auth_cookie_name)
    if session_token is None:
        return None
    auth = AuthService(db, redis)
    user = await auth.get_user_from_session_token(session_token)
    if user is None:
        return None
    if user.force_root_admin_setup and not request.url.path.startswith('/api/setup/'):
        return None
    return user


def require_roles(*roles: str):
    async def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role.value not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden')
        return user

    return _checker


def _first_forwarded_ip(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    candidate = raw_value.split(',', 1)[0].strip()
    return candidate or None


def get_client_ip(request: Request) -> str | None:
    settings = get_settings()
    if settings.trust_x_forwarded_for:
        # Prefer CDN-specific headers first, then generic proxy headers.
        for header_name in ('cf-connecting-ip', 'true-client-ip', 'x-real-ip', 'x-forwarded-for'):
            candidate = _first_forwarded_ip(request.headers.get(header_name))
            if candidate:
                return candidate
    if request.client:
        return request.client.host
    return None
