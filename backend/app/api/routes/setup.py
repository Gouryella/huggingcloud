from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session, get_redis_client
from app.core.config import get_settings
from app.models import User
from app.schemas.auth import LoginResponse, UserMe
from app.schemas.setup import CreateRootAdminRequest
from app.services.auth_service import AuthService
from app.services.audit import log_audit
from app.services.bootstrap_service import create_root_admin_from_bootstrap
from app.services.cache import CacheClient
from app.services.system_settings import get_effective_auth_config

router = APIRouter(prefix='/api', tags=['setup'])
SECONDS_PER_HOUR = 60 * 60


@router.post('/setup/root-admin', response_model=LoginResponse)
async def setup_root_admin(
    payload: CreateRootAdminRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
    user: User = Depends(get_current_user),
):
    if not user.force_root_admin_setup:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='root admin setup is not required for current user')

    try:
        root = await create_root_admin_from_bootstrap(
            db,
            bootstrap_user=user,
            email=payload.email,
            password=payload.password,
            username=payload.username,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    settings = get_settings()
    auth_config = await get_effective_auth_config(db)
    session_ttl_seconds = auth_config.login_persistence_ttl_hours * SECONDS_PER_HOUR
    auth = AuthService(db, redis)
    raw_token, session = await auth.create_session(root, ttl_seconds=session_ttl_seconds)
    cookie_kwargs: dict[str, str | bool | int] = {
        'httponly': True,
        'secure': settings.auth_cookie_secure,
        'samesite': 'lax',
        'path': '/',
        'max_age': session_ttl_seconds,
    }
    response.set_cookie(settings.auth_cookie_name, raw_token, **cookie_kwargs)

    await log_audit(
        db,
        action='setup.root_admin.create',
        resource=root.id,
        user_id=root.id,
        ip=get_client_ip(request),
        metadata={
            'email': root.email,
            'username': root.username,
            'persist_session': True,
            'session_ttl_seconds': session_ttl_seconds,
        },
    )

    return LoginResponse(user=UserMe.model_validate(root), session_expires_at=session.expires_at)
