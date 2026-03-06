from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import SystemSetting
from app.services.security_settings import SIGNING_SECRET_KEY
from app.schemas.settings import (
    DownloadMode,
    HFRepoType,
    SystemAuthSettingsResponse,
    SystemDomainSettingsResponse,
    SystemHFSettingsResponse,
    SystemStorageSettingsResponse,
    UpdateSystemAuthSettingsRequest,
    UpdateSystemDomainSettingsRequest,
    UpdateSystemHFSettingsRequest,
    UpdateSystemStorageSettingsRequest,
)

HF_KEY_REPO_ID = 'hf.repo_id'
HF_KEY_REPO_TYPE = 'hf.repo_type'
HF_KEY_REVISION = 'hf.revision'
HF_KEY_TOKEN = 'hf.token'
DOWNLOAD_KEY_MODE = 'download.mode'
DOMAIN_KEY_APP = 'domain.app'
DOMAIN_KEY_DL = 'domain.dl'
STORAGE_KEY_CAPACITY_GB = 'storage.capacity_gb'
AUTH_KEY_LOGIN_PERSISTENCE_TTL_HOURS = 'auth.login_persistence_ttl_hours'
AUTH_KEY_PASSKEY_ENABLED = 'auth.passkey_enabled'
HF_FIXED_BASE_URL = 'https://huggingface.co'
BYTES_PER_GB = 1024 * 1024 * 1024
SECONDS_PER_HOUR = 60 * 60
LOGIN_PERSISTENCE_TTL_HOURS_MIN = 1
LOGIN_PERSISTENCE_TTL_HOURS_MAX = 14 * 24

HF_SETTING_KEYS = (
    HF_KEY_REPO_ID,
    HF_KEY_REPO_TYPE,
    HF_KEY_REVISION,
    DOWNLOAD_KEY_MODE,
    HF_KEY_TOKEN,
)

DOMAIN_SETTING_KEYS = (
    DOMAIN_KEY_APP,
)

STORAGE_SETTING_KEYS = (
    STORAGE_KEY_CAPACITY_GB,
)

AUTH_SETTING_KEYS = (
    AUTH_KEY_LOGIN_PERSISTENCE_TTL_HOURS,
    AUTH_KEY_PASSKEY_ENABLED,
)


@dataclass(frozen=True)
class HFRuntimeConfig:
    repo_id: str
    repo_type: str
    revision: str
    download_mode: DownloadMode
    base_url: str
    token: str


@dataclass(frozen=True)
class DomainRuntimeConfig:
    app_domain: str
    dl_domain: str


@dataclass(frozen=True)
class StorageRuntimeConfig:
    capacity_gb: int
    capacity_bytes: int


@dataclass(frozen=True)
class AuthRuntimeConfig:
    login_persistence_ttl_hours: int
    passkey_enabled: bool


def _normalize_repo_type(value: str | None, default: str) -> str:
    normalized = (value or '').strip().lower()
    if normalized in {'dataset', 'model', 'space'}:
        return normalized
    return default


def _normalize_download_mode(value: str | None, default: DownloadMode) -> DownloadMode:
    normalized = (value or '').strip().lower()
    if normalized in {'auto', 'proxy', 'redirect'}:
        return cast(DownloadMode, normalized)
    return default


def _mask_secret(secret: str) -> str | None:
    token = secret.strip()
    if not token:
        return None
    if len(token) <= 8:
        return '*' * len(token)
    return f'{token[:4]}{"*" * (len(token) - 8)}{token[-4:]}'


async def _load_setting_values(db: AsyncSession, keys: tuple[str, ...]) -> dict[str, str | None]:
    rows = (
        await db.execute(
            select(SystemSetting.key, SystemSetting.value_text).where(SystemSetting.key.in_(keys)),
        )
    ).all()
    return {key: value_text for key, value_text in rows}


async def _load_hf_overrides(db: AsyncSession) -> dict[str, str | None]:
    return await _load_setting_values(db, HF_SETTING_KEYS)


async def _load_domain_overrides(db: AsyncSession) -> dict[str, str | None]:
    return await _load_setting_values(db, DOMAIN_SETTING_KEYS)


async def _load_storage_overrides(db: AsyncSession) -> dict[str, str | None]:
    return await _load_setting_values(db, STORAGE_SETTING_KEYS)


def _normalize_domain(value: str | None, default: str) -> str:
    normalized = (value or '').strip().rstrip('/')
    if not normalized:
        return default
    if not normalized.startswith('http://') and not normalized.startswith('https://'):
        return default
    return normalized


async def _get_effective_hf_config(db: AsyncSession) -> HFRuntimeConfig:
    settings = get_settings()
    overrides = await _load_hf_overrides(db)

    env_repo_id = settings.hf_repo_id.strip()
    env_repo_type = _normalize_repo_type(settings.hf_repo_type, 'dataset')
    env_revision = settings.hf_revision.strip() or 'main'
    env_download_mode = _normalize_download_mode(settings.download_mode, 'auto')
    env_token = settings.hf_token.strip()

    repo_id = env_repo_id
    if HF_KEY_REPO_ID in overrides:
        override_repo_id = (overrides.get(HF_KEY_REPO_ID) or '').strip()
        if override_repo_id:
            repo_id = override_repo_id

    repo_type = env_repo_type
    if HF_KEY_REPO_TYPE in overrides:
        repo_type = _normalize_repo_type(overrides.get(HF_KEY_REPO_TYPE), env_repo_type)

    revision = env_revision
    if HF_KEY_REVISION in overrides:
        override_revision = (overrides.get(HF_KEY_REVISION) or '').strip()
        if override_revision:
            revision = override_revision

    download_mode = env_download_mode
    if DOWNLOAD_KEY_MODE in overrides:
        download_mode = _normalize_download_mode(overrides.get(DOWNLOAD_KEY_MODE), env_download_mode)

    # For token, explicit DB value (including empty) overrides env to support token removal.
    token = env_token
    if HF_KEY_TOKEN in overrides:
        token = (overrides.get(HF_KEY_TOKEN) or '').strip()

    return HFRuntimeConfig(
        repo_id=repo_id,
        repo_type=repo_type,
        revision=revision,
        download_mode=download_mode,
        base_url=HF_FIXED_BASE_URL,
        token=token,
    )


async def get_effective_hf_config(db: AsyncSession | None = None) -> HFRuntimeConfig:
    if db is not None:
        return await _get_effective_hf_config(db)
    async with SessionLocal() as session:
        return await _get_effective_hf_config(session)


async def _get_effective_domain_config(db: AsyncSession) -> DomainRuntimeConfig:
    settings = get_settings()
    overrides = await _load_domain_overrides(db)

    env_app = _normalize_domain(settings.app_domain, 'http://localhost:3000')

    app_domain = env_app
    if DOMAIN_KEY_APP in overrides:
        app_domain = _normalize_domain(overrides.get(DOMAIN_KEY_APP), env_app)

    # Download domain always follows the app domain.
    return DomainRuntimeConfig(app_domain=app_domain, dl_domain=app_domain)


async def get_effective_domain_config(db: AsyncSession | None = None) -> DomainRuntimeConfig:
    if db is not None:
        return await _get_effective_domain_config(db)
    async with SessionLocal() as session:
        return await _get_effective_domain_config(session)


def _normalize_capacity_gb(value: str | int | None, default: int) -> int:
    if isinstance(value, int):
        parsed = value
    else:
        try:
            parsed = int((value or '').strip())
        except (TypeError, ValueError):
            return default
    if parsed < 1:
        return default
    return parsed


def _normalize_positive_hours(value: str | int | None, default: int) -> int:
    if isinstance(value, int):
        parsed = value
    else:
        try:
            parsed = int((value or '').strip())
        except (TypeError, ValueError):
            return default
    if parsed < LOGIN_PERSISTENCE_TTL_HOURS_MIN:
        return default
    if parsed > LOGIN_PERSISTENCE_TTL_HOURS_MAX:
        return LOGIN_PERSISTENCE_TTL_HOURS_MAX
    return parsed


def _normalize_bool(value: str | bool | int | None, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    normalized = (value or '').strip().lower()
    if normalized in {'1', 'true', 'yes', 'on'}:
        return True
    if normalized in {'0', 'false', 'no', 'off'}:
        return False
    return default


async def _get_effective_storage_config(db: AsyncSession) -> StorageRuntimeConfig:
    settings = get_settings()
    overrides = await _load_storage_overrides(db)

    env_capacity_bytes = settings.private_storage_capacity_bytes
    env_capacity_gb = max(1, (env_capacity_bytes + BYTES_PER_GB - 1) // BYTES_PER_GB)

    capacity_gb = env_capacity_gb
    if STORAGE_KEY_CAPACITY_GB in overrides:
        capacity_gb = _normalize_capacity_gb(overrides.get(STORAGE_KEY_CAPACITY_GB), env_capacity_gb)

    return StorageRuntimeConfig(
        capacity_gb=capacity_gb,
        capacity_bytes=capacity_gb * BYTES_PER_GB,
    )


async def get_effective_storage_config(db: AsyncSession | None = None) -> StorageRuntimeConfig:
    if db is not None:
        return await _get_effective_storage_config(db)
    async with SessionLocal() as session:
        return await _get_effective_storage_config(session)


async def _load_auth_overrides(db: AsyncSession) -> dict[str, str | None]:
    return await _load_setting_values(db, AUTH_SETTING_KEYS)


async def _get_effective_auth_config(db: AsyncSession) -> AuthRuntimeConfig:
    settings = get_settings()
    overrides = await _load_auth_overrides(db)

    default_hours = min(
        LOGIN_PERSISTENCE_TTL_HOURS_MAX,
        max(LOGIN_PERSISTENCE_TTL_HOURS_MIN, (settings.session_ttl_seconds + SECONDS_PER_HOUR - 1) // SECONDS_PER_HOUR),
    )
    if AUTH_KEY_LOGIN_PERSISTENCE_TTL_HOURS in overrides:
        default_hours = _normalize_positive_hours(overrides.get(AUTH_KEY_LOGIN_PERSISTENCE_TTL_HOURS), default_hours)
    passkey_enabled = False
    if AUTH_KEY_PASSKEY_ENABLED in overrides:
        passkey_enabled = _normalize_bool(overrides.get(AUTH_KEY_PASSKEY_ENABLED), passkey_enabled)

    return AuthRuntimeConfig(
        login_persistence_ttl_hours=default_hours,
        passkey_enabled=passkey_enabled,
    )


async def get_effective_auth_config(db: AsyncSession | None = None) -> AuthRuntimeConfig:
    if db is not None:
        return await _get_effective_auth_config(db)
    async with SessionLocal() as session:
        return await _get_effective_auth_config(session)


async def _upsert_setting(db: AsyncSession, *, key: str, value_text: str, updated_by: str | None) -> None:
    if key == SIGNING_SECRET_KEY:
        raise ValueError('security signing secret is immutable')
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == key))).scalar_one_or_none()
    if row is None:
        row = SystemSetting(key=key, value_text=value_text, updated_by=updated_by)
        db.add(row)
        return
    row.value_text = value_text
    row.updated_by = updated_by


async def update_hf_settings(
    db: AsyncSession,
    *,
    payload: UpdateSystemHFSettingsRequest,
    updated_by: str | None,
) -> HFRuntimeConfig:
    await _upsert_setting(db, key=HF_KEY_REPO_ID, value_text=payload.hf_repo_id, updated_by=updated_by)
    await _upsert_setting(db, key=HF_KEY_REPO_TYPE, value_text=payload.hf_repo_type, updated_by=updated_by)
    await _upsert_setting(db, key=HF_KEY_REVISION, value_text=payload.hf_revision, updated_by=updated_by)
    if payload.download_mode is not None:
        await _upsert_setting(db, key=DOWNLOAD_KEY_MODE, value_text=payload.download_mode, updated_by=updated_by)
    if payload.replace_hf_token:
        await _upsert_setting(db, key=HF_KEY_TOKEN, value_text=payload.hf_token or '', updated_by=updated_by)

    await db.commit()
    return await _get_effective_hf_config(db)


async def update_domain_settings(
    db: AsyncSession,
    *,
    payload: UpdateSystemDomainSettingsRequest,
    updated_by: str | None,
) -> DomainRuntimeConfig:
    await _upsert_setting(db, key=DOMAIN_KEY_APP, value_text=payload.app_domain, updated_by=updated_by)
    # Explicitly clear legacy dedicated download-domain override.
    await _upsert_setting(db, key=DOMAIN_KEY_DL, value_text='', updated_by=updated_by)
    await db.commit()
    return await _get_effective_domain_config(db)


async def update_storage_settings(
    db: AsyncSession,
    *,
    payload: UpdateSystemStorageSettingsRequest,
    updated_by: str | None,
) -> StorageRuntimeConfig:
    await _upsert_setting(
        db,
        key=STORAGE_KEY_CAPACITY_GB,
        value_text=str(payload.private_storage_capacity_gb),
        updated_by=updated_by,
    )
    await db.commit()
    return await _get_effective_storage_config(db)


async def update_auth_settings(
    db: AsyncSession,
    *,
    payload: UpdateSystemAuthSettingsRequest,
    updated_by: str | None,
) -> AuthRuntimeConfig:
    await _upsert_setting(
        db,
        key=AUTH_KEY_LOGIN_PERSISTENCE_TTL_HOURS,
        value_text=str(payload.login_persistence_ttl_hours),
        updated_by=updated_by,
    )
    if payload.passkey_enabled is not None:
        await _upsert_setting(
            db,
            key=AUTH_KEY_PASSKEY_ENABLED,
            value_text='1' if payload.passkey_enabled else '0',
            updated_by=updated_by,
        )
    await db.commit()
    return await _get_effective_auth_config(db)


def to_hf_settings_response(config: HFRuntimeConfig) -> SystemHFSettingsResponse:
    return SystemHFSettingsResponse(
        hf_repo_id=config.repo_id,
        hf_repo_type=cast(HFRepoType, config.repo_type),
        hf_revision=config.revision,
        download_mode=config.download_mode,
        has_hf_token=bool(config.token),
        hf_token_masked=_mask_secret(config.token),
    )


def to_domain_settings_response(config: DomainRuntimeConfig) -> SystemDomainSettingsResponse:
    return SystemDomainSettingsResponse(
        app_domain=config.app_domain,
        dl_domain=config.dl_domain,
        use_app_domain_for_dl=config.app_domain == config.dl_domain,
    )


def to_storage_settings_response(config: StorageRuntimeConfig) -> SystemStorageSettingsResponse:
    return SystemStorageSettingsResponse(
        private_storage_capacity_gb=config.capacity_gb,
        private_storage_capacity_bytes=config.capacity_bytes,
    )


def to_auth_settings_response(config: AuthRuntimeConfig) -> SystemAuthSettingsResponse:
    return SystemAuthSettingsResponse(
        login_persistence_ttl_hours=config.login_persistence_ttl_hours,
        passkey_enabled=config.passkey_enabled,
    )
