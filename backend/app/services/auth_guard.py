from __future__ import annotations

import hashlib

from fastapi import HTTPException, status

from app.services.cache import CacheClient
from app.services.rate_limit import check_rate_limit

AUTH_GUARD_ERROR_DETAIL = 'too many authentication attempts, try again later'

AUTH_FAILURE_WINDOW_SECONDS = 15 * 60
AUTH_LOCK_SECONDS = 15 * 60
AUTH_FAILURE_LIMIT_IP = 24
AUTH_FAILURE_LIMIT_SUBJECT = 8

LOGIN_RATE_LIMIT_IP_PER_MINUTE = 40
LOGIN_RATE_LIMIT_SUBJECT_PER_MINUTE = 16
PASSKEY_OPTIONS_RATE_LIMIT_IP_PER_MINUTE = 50
PASSKEY_OPTIONS_RATE_LIMIT_SUBJECT_PER_MINUTE = 24
PASSKEY_VERIFY_RATE_LIMIT_IP_PER_MINUTE = 40
PASSKEY_VERIFY_RATE_LIMIT_SUBJECT_PER_MINUTE = 16

_SUBJECT_MAX_LENGTH = 512
_BUCKET_HASH_LENGTH = 32


def _normalize_subject(value: str | None, *, case_insensitive: bool) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > _SUBJECT_MAX_LENGTH:
        normalized = normalized[:_SUBJECT_MAX_LENGTH]
    if case_insensitive:
        normalized = normalized.casefold()
    return normalized


def _bucket_token(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:_BUCKET_HASH_LENGTH]


def _ip_bucket(client_ip: str | None) -> str:
    return (client_ip or '').strip() or 'unknown'


def _rate_sid(*, endpoint: str, axis: str, bucket: str) -> str:
    return f'auth:{endpoint}:rl:{axis}:{bucket}'


def _failure_key(*, axis: str, bucket: str) -> str:
    return f'auth:fail:{axis}:{bucket}'


def _lock_key(*, axis: str, bucket: str) -> str:
    return f'auth:lock:{axis}:{bucket}'


def _raise_auth_guard_error() -> None:
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=AUTH_GUARD_ERROR_DETAIL,
    )


async def _ensure_not_locked(
    redis: CacheClient,
    *,
    ip_bucket: str,
    subject_bucket: str | None,
) -> None:
    if await redis.get(_lock_key(axis='ip', bucket=ip_bucket)):
        _raise_auth_guard_error()
    if subject_bucket and await redis.get(_lock_key(axis='subject', bucket=subject_bucket)):
        _raise_auth_guard_error()


async def _enforce_rate_limit(
    redis: CacheClient,
    *,
    endpoint: str,
    axis: str,
    bucket: str,
    limit_per_minute: int,
) -> None:
    if limit_per_minute <= 0:
        return
    within_limit = await check_rate_limit(
        redis,
        _rate_sid(endpoint=endpoint, axis=axis, bucket=bucket),
        limit_per_minute,
    )
    if not within_limit:
        _raise_auth_guard_error()


async def _record_failure(
    redis: CacheClient,
    *,
    axis: str,
    bucket: str,
    lock_threshold: int,
) -> None:
    key = _failure_key(axis=axis, bucket=bucket)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, AUTH_FAILURE_WINDOW_SECONDS)
    if count >= lock_threshold:
        await redis.setex(_lock_key(axis=axis, bucket=bucket), AUTH_LOCK_SECONDS, '1')
        await redis.delete(key)


async def _guard_attempt(
    redis: CacheClient,
    *,
    endpoint: str,
    client_ip: str | None,
    subject: str | None,
    ip_rate_limit: int,
    subject_rate_limit: int,
) -> None:
    ip_bucket = _bucket_token(_ip_bucket(client_ip))
    subject_bucket = _bucket_token(subject) if subject else None

    await _ensure_not_locked(redis, ip_bucket=ip_bucket, subject_bucket=subject_bucket)
    await _enforce_rate_limit(
        redis,
        endpoint=endpoint,
        axis='ip',
        bucket=ip_bucket,
        limit_per_minute=ip_rate_limit,
    )
    if subject_bucket:
        await _enforce_rate_limit(
            redis,
            endpoint=endpoint,
            axis='subject',
            bucket=subject_bucket,
            limit_per_minute=subject_rate_limit,
        )


async def guard_login_attempt(
    redis: CacheClient,
    *,
    client_ip: str | None,
    identifier: str | None,
) -> None:
    subject = _normalize_subject(identifier, case_insensitive=True)
    await _guard_attempt(
        redis,
        endpoint='login',
        client_ip=client_ip,
        subject=subject,
        ip_rate_limit=LOGIN_RATE_LIMIT_IP_PER_MINUTE,
        subject_rate_limit=LOGIN_RATE_LIMIT_SUBJECT_PER_MINUTE,
    )


async def guard_passkey_options_attempt(
    redis: CacheClient,
    *,
    client_ip: str | None,
    identifier: str | None,
) -> None:
    subject = _normalize_subject(identifier, case_insensitive=True)
    await _guard_attempt(
        redis,
        endpoint='passkey_options',
        client_ip=client_ip,
        subject=subject,
        ip_rate_limit=PASSKEY_OPTIONS_RATE_LIMIT_IP_PER_MINUTE,
        subject_rate_limit=PASSKEY_OPTIONS_RATE_LIMIT_SUBJECT_PER_MINUTE,
    )


async def guard_passkey_verify_attempt(
    redis: CacheClient,
    *,
    client_ip: str | None,
    credential_id: str | None,
) -> None:
    subject = _normalize_subject(credential_id, case_insensitive=False)
    await _guard_attempt(
        redis,
        endpoint='passkey_verify',
        client_ip=client_ip,
        subject=subject,
        ip_rate_limit=PASSKEY_VERIFY_RATE_LIMIT_IP_PER_MINUTE,
        subject_rate_limit=PASSKEY_VERIFY_RATE_LIMIT_SUBJECT_PER_MINUTE,
    )


async def register_failed_auth_attempt(
    redis: CacheClient,
    *,
    client_ip: str | None,
    subject: str | None,
    subject_case_insensitive: bool,
) -> None:
    ip_bucket = _bucket_token(_ip_bucket(client_ip))
    await _record_failure(
        redis,
        axis='ip',
        bucket=ip_bucket,
        lock_threshold=AUTH_FAILURE_LIMIT_IP,
    )

    normalized_subject = _normalize_subject(subject, case_insensitive=subject_case_insensitive)
    if normalized_subject is None:
        return
    await _record_failure(
        redis,
        axis='subject',
        bucket=_bucket_token(normalized_subject),
        lock_threshold=AUTH_FAILURE_LIMIT_SUBJECT,
    )


async def clear_subject_auth_failures(
    redis: CacheClient,
    *,
    subject: str | None,
    subject_case_insensitive: bool,
) -> None:
    normalized_subject = _normalize_subject(subject, case_insensitive=subject_case_insensitive)
    if normalized_subject is None:
        return
    bucket = _bucket_token(normalized_subject)
    await redis.delete(_failure_key(axis='subject', bucket=bucket))
    await redis.delete(_lock_key(axis='subject', bucket=bucket))
