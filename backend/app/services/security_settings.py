from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import SystemSetting

SIGNING_SECRET_KEY = 'security.signing_secret'
_ENV_PLACEHOLDER_SECRETS = {
    '',
    'replace-me-in-prod',
    'replace-with-long-random-secret',
}
_runtime_signing_secret: str | None = None


def _normalize_secret(value: str | None) -> str:
    return (value or '').strip()


def _generate_signing_secret() -> str:
    # 48 random bytes gives a high-entropy url-safe secret.
    return secrets.token_urlsafe(48)


def _resolve_bootstrap_secret() -> str:
    env_secret = _normalize_secret(get_settings().signing_secret)
    if env_secret and env_secret not in _ENV_PLACEHOLDER_SECRETS:
        return env_secret
    return _generate_signing_secret()


def get_runtime_signing_secret() -> str:
    cached = _normalize_secret(_runtime_signing_secret)
    if cached:
        return cached

    fallback = _normalize_secret(get_settings().signing_secret)
    if fallback:
        return fallback

    raise RuntimeError('SIGNING_SECRET is not initialized')


async def ensure_runtime_signing_secret(db: AsyncSession) -> str:
    global _runtime_signing_secret

    row = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == SIGNING_SECRET_KEY).limit(1),
        )
    ).scalar_one_or_none()

    if row is not None:
        existing = _normalize_secret(row.value_text)
        if existing:
            _runtime_signing_secret = existing
            return existing

    candidate = _resolve_bootstrap_secret()

    if row is None:
        db.add(SystemSetting(key=SIGNING_SECRET_KEY, value_text=candidate, updated_by=None))
    else:
        # Key exists but is empty: treat as uninitialized and set it once.
        row.value_text = candidate
        row.updated_by = None

    try:
        await db.commit()
    except IntegrityError:
        # Another instance initialized the key first; load that value.
        await db.rollback()

    row = (
        await db.execute(
            select(SystemSetting).where(SystemSetting.key == SIGNING_SECRET_KEY).limit(1),
        )
    ).scalar_one_or_none()
    resolved = _normalize_secret(row.value_text if row else None)
    if not resolved:
        raise RuntimeError('failed to initialize runtime signing secret')
    _runtime_signing_secret = resolved
    return resolved


def reset_runtime_signing_secret_cache() -> None:
    global _runtime_signing_secret
    _runtime_signing_secret = None
