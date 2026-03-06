from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_db_session, require_roles
from app.models import User
from app.schemas.settings import (
    SystemAuthSettingsResponse,
    SystemDomainSettingsResponse,
    SystemHFSettingsResponse,
    SystemStorageSettingsResponse,
    UpdateSystemAuthSettingsRequest,
    UpdateSystemDomainSettingsRequest,
    UpdateSystemHFSettingsRequest,
    UpdateSystemStorageSettingsRequest,
)
from app.services.audit import log_audit
from app.services.system_settings import (
    get_effective_auth_config,
    get_effective_domain_config,
    get_effective_hf_config,
    get_effective_storage_config,
    to_auth_settings_response,
    to_domain_settings_response,
    to_hf_settings_response,
    to_storage_settings_response,
    update_auth_settings,
    update_domain_settings,
    update_hf_settings,
    update_storage_settings,
)

router = APIRouter(prefix='/api/settings', tags=['settings'])


@router.get('/hf', response_model=SystemHFSettingsResponse)
async def get_hf_settings(
    db: AsyncSession = Depends(get_db_session),
    _user: User = Depends(require_roles('owner', 'admin')),
):
    config = await get_effective_hf_config(db)
    return to_hf_settings_response(config)


@router.patch('/hf', response_model=SystemHFSettingsResponse)
async def patch_hf_settings(
    payload: UpdateSystemHFSettingsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_roles('owner', 'admin')),
):
    updated = await update_hf_settings(db, payload=payload, updated_by=user.id)
    await log_audit(
        db,
        action='settings.hf.update',
        resource='hf',
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={
            'hf_repo_id': updated.repo_id,
            'hf_repo_type': updated.repo_type,
            'hf_revision': updated.revision,
            'download_mode': updated.download_mode,
            'replace_hf_token': payload.replace_hf_token,
            'has_hf_token': bool(updated.token),
        },
    )
    return to_hf_settings_response(updated)


@router.get('/domains', response_model=SystemDomainSettingsResponse)
async def get_domain_settings(
    db: AsyncSession = Depends(get_db_session),
    _user: User = Depends(require_roles('owner', 'admin')),
):
    config = await get_effective_domain_config(db)
    return to_domain_settings_response(config)


@router.patch('/domains', response_model=SystemDomainSettingsResponse)
async def patch_domain_settings(
    payload: UpdateSystemDomainSettingsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_roles('owner', 'admin')),
):
    updated = await update_domain_settings(db, payload=payload, updated_by=user.id)
    await log_audit(
        db,
        action='settings.domains.update',
        resource='domains',
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={
            'app_domain': updated.app_domain,
            'download_domain_mode': 'follow_app_domain',
        },
    )
    return to_domain_settings_response(updated)


@router.get('/storage', response_model=SystemStorageSettingsResponse)
async def get_storage_settings(
    db: AsyncSession = Depends(get_db_session),
    _user: User = Depends(require_roles('owner', 'admin')),
):
    config = await get_effective_storage_config(db)
    return to_storage_settings_response(config)


@router.patch('/storage', response_model=SystemStorageSettingsResponse)
async def patch_storage_settings(
    payload: UpdateSystemStorageSettingsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_roles('owner', 'admin')),
):
    updated = await update_storage_settings(db, payload=payload, updated_by=user.id)
    await log_audit(
        db,
        action='settings.storage.update',
        resource='storage',
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={
            'private_storage_capacity_gb': updated.capacity_gb,
            'private_storage_capacity_bytes': updated.capacity_bytes,
        },
    )
    return to_storage_settings_response(updated)


@router.get('/auth', response_model=SystemAuthSettingsResponse)
async def get_auth_settings(
    db: AsyncSession = Depends(get_db_session),
    _user: User = Depends(require_roles('owner', 'admin')),
):
    config = await get_effective_auth_config(db)
    return to_auth_settings_response(config)


@router.patch('/auth', response_model=SystemAuthSettingsResponse)
async def patch_auth_settings(
    payload: UpdateSystemAuthSettingsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_roles('owner', 'admin')),
):
    updated = await update_auth_settings(db, payload=payload, updated_by=user.id)
    await log_audit(
        db,
        action='settings.auth.update',
        resource='auth',
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={
            'login_persistence_ttl_hours': updated.login_persistence_ttl_hours,
            'passkey_enabled': updated.passkey_enabled,
        },
    )
    return to_auth_settings_response(updated)
