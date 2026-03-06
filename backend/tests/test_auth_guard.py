from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.auth_guard import (
    AUTH_FAILURE_LIMIT_IP,
    AUTH_FAILURE_LIMIT_SUBJECT,
    LOGIN_RATE_LIMIT_IP_PER_MINUTE,
    PASSKEY_OPTIONS_RATE_LIMIT_SUBJECT_PER_MINUTE,
    clear_subject_auth_failures,
    guard_login_attempt,
    guard_passkey_options_attempt,
    guard_passkey_verify_attempt,
    register_failed_auth_attempt,
)
from app.services.cache import InMemoryCache


@pytest.mark.asyncio
async def test_login_guard_locks_and_clears_subject_bucket() -> None:
    cache = InMemoryCache()
    client_ip = '203.0.113.5'
    identifier = 'Admin@Example.COM'

    for _ in range(AUTH_FAILURE_LIMIT_SUBJECT):
        await register_failed_auth_attempt(
            cache,
            client_ip=client_ip,
            subject=identifier,
            subject_case_insensitive=True,
        )

    with pytest.raises(HTTPException) as exc:
        await guard_login_attempt(cache, client_ip=client_ip, identifier=identifier)
    assert exc.value.status_code == 429

    await clear_subject_auth_failures(
        cache,
        subject=identifier,
        subject_case_insensitive=True,
    )
    await guard_login_attempt(cache, client_ip=client_ip, identifier=identifier)


@pytest.mark.asyncio
async def test_auth_guard_locks_ip_after_repeated_failures() -> None:
    cache = InMemoryCache()
    client_ip = '198.51.100.10'

    for _ in range(AUTH_FAILURE_LIMIT_IP):
        await register_failed_auth_attempt(
            cache,
            client_ip=client_ip,
            subject=None,
            subject_case_insensitive=False,
        )

    with pytest.raises(HTTPException) as exc:
        await guard_passkey_verify_attempt(cache, client_ip=client_ip, credential_id=None)
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_passkey_options_guard_limits_subject_rate() -> None:
    cache = InMemoryCache()
    client_ip = '192.0.2.8'
    identifier = 'demo-user'

    for _ in range(PASSKEY_OPTIONS_RATE_LIMIT_SUBJECT_PER_MINUTE):
        await guard_passkey_options_attempt(
            cache,
            client_ip=client_ip,
            identifier=identifier,
        )

    with pytest.raises(HTTPException) as exc:
        await guard_passkey_options_attempt(
            cache,
            client_ip=client_ip,
            identifier=identifier,
        )
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_login_guard_limits_ip_rate_even_with_rotating_identifiers() -> None:
    cache = InMemoryCache()
    client_ip = '192.0.2.99'

    for i in range(LOGIN_RATE_LIMIT_IP_PER_MINUTE):
        await guard_login_attempt(
            cache,
            client_ip=client_ip,
            identifier=f'user-{i}',
        )

    with pytest.raises(HTTPException) as exc:
        await guard_login_attempt(
            cache,
            client_ip=client_ip,
            identifier='fresh-user',
        )
    assert exc.value.status_code == 429
