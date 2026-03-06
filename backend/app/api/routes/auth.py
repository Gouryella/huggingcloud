from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session, get_redis_client
from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.models import User
from app.schemas.auth import (
    LoginOptionsResponse,
    LoginRequest,
    LoginResponse,
    PasskeyAuthenticationOptionsRequest,
    PasskeyAuthenticationVerifyRequest,
    PasskeyCredentialInfo,
    PasskeyOptionsResponse,
    PasskeyRegistrationVerifyRequest,
    UpdateMeRequest,
    UpdatePasswordRequest,
    RegisterRequest,
    UserMe,
)
from app.services.auth_service import AuthService
from app.services.audit import log_audit
from app.services.bootstrap_service import has_active_root_owner
from app.services.cache import CacheClient
from app.services.auth_guard import (
    clear_subject_auth_failures,
    guard_login_attempt,
    guard_passkey_options_attempt,
    guard_passkey_verify_attempt,
    register_failed_auth_attempt,
)
from app.services.passkey_service import (
    create_authentication_options,
    create_registration_options,
    delete_passkey,
    get_rp_context,
    is_icloud_credential,
    list_passkeys_for_user,
    resolve_user_and_passkeys_by_identifier,
    resolve_user_and_passkeys_by_user_id,
    verify_authentication,
    verify_registration,
)
from app.services.system_settings import get_effective_auth_config

router = APIRouter(prefix='/api', tags=['auth'])
SECONDS_PER_HOUR = 60 * 60
PASSKEY_LAST_USER_COOKIE_NAME = 'hfs_passkey_last_user'
PASSKEY_LAST_USER_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60


def _set_auth_cookie(response: Response, token: str, *, max_age_seconds: int | None = None) -> None:
    settings = get_settings()
    cookie_kwargs: dict[str, str | bool | int] = {
        'httponly': True,
        'secure': settings.auth_cookie_secure,
        'samesite': 'lax',
        'path': '/',
    }
    if max_age_seconds is not None and max_age_seconds > 0:
        cookie_kwargs['max_age'] = max_age_seconds

    response.set_cookie(
        settings.auth_cookie_name,
        token,
        **cookie_kwargs,
    )


def _set_last_passkey_user_cookie(response: Response, *, user_id: str) -> None:
    settings = get_settings()
    response.set_cookie(
        PASSKEY_LAST_USER_COOKIE_NAME,
        user_id,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite='lax',
        path='/',
        max_age=PASSKEY_LAST_USER_COOKIE_MAX_AGE_SECONDS,
    )


def _raise_if_passkey_disabled(*, enabled: bool) -> None:
    if not enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='passkey login is disabled')


async def _ensure_login_allowed_for_user(db: AsyncSession, *, user: User) -> None:
    if user.is_bootstrap:
        return
    if await has_active_root_owner(db):
        return
    raise HTTPException(
        status_code=status.HTTP_428_PRECONDITION_REQUIRED,
        detail='root admin setup required. login with bootstrap account first.',
    )


def _resolve_login_ttl_seconds(
    *,
    persist_session: bool | None,
    login_persistence_ttl_hours: int,
    fallback_session_ttl_seconds: int,
) -> tuple[bool, int]:
    should_persist_session = True if persist_session is None else persist_session
    persistence_ttl_seconds = login_persistence_ttl_hours * SECONDS_PER_HOUR
    session_ttl_seconds = persistence_ttl_seconds if should_persist_session else fallback_session_ttl_seconds
    return should_persist_session, session_ttl_seconds


async def _issue_login_response(
    *,
    db: AsyncSession,
    redis: CacheClient,
    response: Response,
    user: User,
    client_ip: str,
    persist_session: bool,
    session_ttl_seconds: int,
    method: str,
    extra_audit_metadata: dict[str, str | int | bool] | None = None,
) -> LoginResponse:
    auth = AuthService(db, redis)
    raw_token, session = await auth.create_session(user, ttl_seconds=session_ttl_seconds)
    _set_auth_cookie(response, raw_token, max_age_seconds=session_ttl_seconds if persist_session else None)
    _set_last_passkey_user_cookie(response, user_id=user.id)

    metadata: dict[str, str | int | bool] = {
        'method': method,
        'persist_session': persist_session,
        'session_ttl_seconds': session_ttl_seconds,
    }
    if extra_audit_metadata:
        metadata.update(extra_audit_metadata)

    await log_audit(
        db,
        action='auth.login',
        resource=user.id,
        user_id=user.id,
        ip=client_ip,
        metadata=metadata,
    )
    return LoginResponse(user=UserMe.model_validate(user), session_expires_at=session.expires_at)


async def _resolve_rp_context_for_request(*, db: AsyncSession, request: Request):
    return await get_rp_context(
        db,
        request_origin=request.headers.get('origin'),
        request_base_url=str(request.base_url),
    )


@router.get('/auth/login-options', response_model=LoginOptionsResponse)
async def get_login_options(
    db: AsyncSession = Depends(get_db_session),
):
    auth_config = await get_effective_auth_config(db)
    return LoginOptionsResponse(
        login_persistence_ttl_hours=auth_config.login_persistence_ttl_hours,
        passkey_enabled=auth_config.passkey_enabled,
    )


@router.post('/auth/register', response_model=UserMe)
async def register(
    payload: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
):
    settings = get_settings()
    if not await has_active_root_owner(db):
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail='root admin setup required before registration',
        )
    if not settings.allow_self_register:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='self registration is disabled')

    auth = AuthService(db, redis)
    try:
        user = await auth.register_local(email=payload.email, password=payload.password, username=payload.username)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await log_audit(
        db,
        action='auth.register',
        resource=user.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'email': user.email},
    )
    return UserMe.model_validate(user)


@router.patch('/me/password')
async def update_my_password(
    payload: UpdatePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    if not user.hashed_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='password login is not enabled for current account')

    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='current password is incorrect')

    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    await db.refresh(user)

    await log_audit(
        db,
        action='auth.password.update',
        resource=user.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'method': 'password'},
    )
    return {'ok': True}


@router.post('/auth/login', response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
):
    settings = get_settings()
    client_ip = get_client_ip(request)
    identifier = payload.identifier or ''
    await guard_login_attempt(redis, client_ip=client_ip, identifier=identifier)

    auth = AuthService(db, redis)
    try:
        user = await auth.login_local(identifier=identifier, password=payload.password)
    except ValueError as exc:
        await register_failed_auth_attempt(
            redis,
            client_ip=client_ip,
            subject=identifier,
            subject_case_insensitive=True,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await clear_subject_auth_failures(
        redis,
        subject=identifier,
        subject_case_insensitive=True,
    )

    await _ensure_login_allowed_for_user(db, user=user)

    auth_config = await get_effective_auth_config(db)
    persist_session, session_ttl_seconds = _resolve_login_ttl_seconds(
        persist_session=payload.persist_session,
        login_persistence_ttl_hours=auth_config.login_persistence_ttl_hours,
        fallback_session_ttl_seconds=settings.session_ttl_seconds,
    )
    return await _issue_login_response(
        db=db,
        redis=redis,
        response=response,
        user=user,
        client_ip=client_ip,
        persist_session=persist_session,
        session_ttl_seconds=session_ttl_seconds,
        method='password',
    )


@router.post('/auth/passkeys/authenticate/options', response_model=PasskeyOptionsResponse)
async def passkey_authentication_options(
    payload: PasskeyAuthenticationOptionsRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
):
    client_ip = get_client_ip(request)
    await guard_passkey_options_attempt(
        redis,
        client_ip=client_ip,
        identifier=payload.identifier,
    )

    auth_config = await get_effective_auth_config(db)
    _raise_if_passkey_disabled(enabled=auth_config.passkey_enabled)
    rp_context = await _resolve_rp_context_for_request(db=db, request=request)
    options_result = None
    selected_user_id: str | None = None
    selected_credentials = None
    if payload.identifier is not None:
        try:
            user, credentials = await resolve_user_and_passkeys_by_identifier(
                db,
                identifier=payload.identifier,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
        selected_user_id = user.id
        selected_credentials = credentials
    else:
        preferred_user_id = (request.cookies.get(PASSKEY_LAST_USER_COOKIE_NAME) or '').strip()
        if preferred_user_id:
            try:
                user, credentials = await resolve_user_and_passkeys_by_user_id(
                    db,
                    user_id=preferred_user_id,
                )
            except ValueError:
                response.delete_cookie(PASSKEY_LAST_USER_COOKIE_NAME, path='/')
            else:
                selected_user_id = user.id
                selected_credentials = credentials

    if selected_user_id is not None and selected_credentials is not None:
        icloud_credentials = [item for item in selected_credentials if is_icloud_credential(item)]
        scoped_credentials = selected_credentials
        if icloud_credentials and not payload.allow_non_icloud_fallback:
            scoped_credentials = icloud_credentials
        options_result = await create_authentication_options(
            db,
            rp_context=rp_context,
            user_id=selected_user_id,
            credentials=scoped_credentials,
        )
    else:
        # Identifier-free discoverable login flow.
        options_result = await create_authentication_options(
            db,
            rp_context=rp_context,
        )
    return PasskeyOptionsResponse(
        challenge_id=options_result.challenge_id,
        options=options_result.options,
    )


@router.post('/auth/passkeys/authenticate/verify', response_model=LoginResponse)
async def passkey_authentication_verify(
    payload: PasskeyAuthenticationVerifyRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
):
    settings = get_settings()
    client_ip = get_client_ip(request)
    credential_id: str | None = None
    raw_credential_id = payload.credential.get('id')
    if isinstance(raw_credential_id, str):
        credential_id = raw_credential_id
    elif raw_credential_id is not None:
        credential_id = str(raw_credential_id)

    await guard_passkey_verify_attempt(
        redis,
        client_ip=client_ip,
        credential_id=credential_id,
    )

    auth_config = await get_effective_auth_config(db)
    _raise_if_passkey_disabled(enabled=auth_config.passkey_enabled)
    rp_context = await _resolve_rp_context_for_request(db=db, request=request)
    try:
        user, passkey_credential = await verify_authentication(
            db,
            challenge_id=payload.challenge_id,
            credential=payload.credential,
            rp_context=rp_context,
        )
    except ValueError as exc:
        await register_failed_auth_attempt(
            redis,
            client_ip=client_ip,
            subject=credential_id,
            subject_case_insensitive=False,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    await clear_subject_auth_failures(
        redis,
        subject=passkey_credential.credential_id,
        subject_case_insensitive=False,
    )

    await _ensure_login_allowed_for_user(db, user=user)
    persist_session, session_ttl_seconds = _resolve_login_ttl_seconds(
        persist_session=payload.persist_session,
        login_persistence_ttl_hours=auth_config.login_persistence_ttl_hours,
        fallback_session_ttl_seconds=settings.session_ttl_seconds,
    )
    return await _issue_login_response(
        db=db,
        redis=redis,
        response=response,
        user=user,
        client_ip=client_ip,
        persist_session=persist_session,
        session_ttl_seconds=session_ttl_seconds,
        method='passkey',
        extra_audit_metadata={'credential_id': passkey_credential.credential_id},
    )


@router.post('/auth/logout')
async def logout(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
):
    settings = get_settings()
    token = request.cookies.get(settings.auth_cookie_name)
    auth = AuthService(db, redis)
    if token:
        await auth.revoke_session(token)

    response.delete_cookie(settings.auth_cookie_name, path='/')
    return {'ok': True}


@router.get('/me', response_model=UserMe)
async def me(user: User = Depends(get_current_user)):
    return UserMe.model_validate(user)


@router.get('/me/passkeys', response_model=list[PasskeyCredentialInfo])
async def list_my_passkeys(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    credentials = await list_passkeys_for_user(db, user_id=user.id)
    return [
        PasskeyCredentialInfo(
            credential_id=item.credential_id,
            nickname=item.nickname,
            transports=item.transports,
            created_at=item.created_at,
            last_used_at=item.last_used_at,
        )
        for item in credentials
    ]


@router.post('/me/passkeys/register/options', response_model=PasskeyOptionsResponse)
async def passkey_registration_options(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    auth_config = await get_effective_auth_config(db)
    _raise_if_passkey_disabled(enabled=auth_config.passkey_enabled)
    rp_context = await _resolve_rp_context_for_request(db=db, request=request)
    options_result = await create_registration_options(
        db,
        user=user,
        rp_context=rp_context,
    )
    return PasskeyOptionsResponse(
        challenge_id=options_result.challenge_id,
        options=options_result.options,
    )


@router.post('/me/passkeys/register/verify', response_model=PasskeyCredentialInfo)
async def passkey_registration_verify(
    payload: PasskeyRegistrationVerifyRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    auth_config = await get_effective_auth_config(db)
    _raise_if_passkey_disabled(enabled=auth_config.passkey_enabled)
    rp_context = await _resolve_rp_context_for_request(db=db, request=request)
    try:
        registered = await verify_registration(
            db,
            user=user,
            challenge_id=payload.challenge_id,
            credential=payload.credential,
            nickname=payload.nickname,
            rp_context=rp_context,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await log_audit(
        db,
        action='auth.passkey.register',
        resource=user.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={
            'credential_id': registered.credential_id,
            'nickname': registered.nickname,
        },
    )
    _set_last_passkey_user_cookie(response, user_id=user.id)
    return PasskeyCredentialInfo(
        credential_id=registered.credential_id,
        nickname=registered.nickname,
        transports=registered.transports,
        created_at=registered.created_at,
        last_used_at=registered.last_used_at,
    )


@router.delete('/me/passkeys/{credential_id}')
async def remove_my_passkey(
    credential_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    auth_config = await get_effective_auth_config(db)
    _raise_if_passkey_disabled(enabled=auth_config.passkey_enabled)

    removed = await delete_passkey(
        db,
        user_id=user.id,
        credential_id=credential_id,
    )
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='passkey not found')

    await log_audit(
        db,
        action='auth.passkey.delete',
        resource=user.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'credential_id': credential_id},
    )
    return {'ok': True}


@router.patch('/me', response_model=UserMe)
async def update_me(
    payload: UpdateMeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    username_provided = 'username' in payload.model_fields_set
    avatar_provided = 'avatar_emoji' in payload.model_fields_set

    if not username_provided and not avatar_provided:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='no updatable field provided')

    if username_provided:
        if payload.username is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='username cannot be empty')
        existing = (
            await db.execute(
                select(User.id).where(
                    User.username == payload.username,
                    User.id != user.id,
                ),
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='username already exists')
        user.username = payload.username

    if avatar_provided:
        user.avatar_emoji = payload.avatar_emoji

    await db.commit()
    await db.refresh(user)

    await log_audit(
        db,
        action='auth.profile.update',
        resource=user.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'username': user.username, 'avatar_emoji': user.avatar_emoji},
    )
    return UserMe.model_validate(user)
