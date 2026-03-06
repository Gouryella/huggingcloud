from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import get_settings
from app.core.security import as_utc, now_utc
from app.models import PasskeyChallenge, PasskeyChallengeFlow, PasskeyCredential, User
from app.services.system_settings import get_effective_domain_config

PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60
# Source (Chrome Dev): iCloud Keychain AAGUID in passkey flows is all-zero.
# https://developer.chrome.com/blog/passkeys-on-icloud-keychain
ICLOUD_KEYCHAIN_AAGUIDS = {
    # Common iCloud Keychain AAGUID
    'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
    # Managed iCloud Keychain
    'dd4ec289-e01d-41c9-bb89-70fa845d4bf2',
    # Some Apple passkey flows may return zeroed AAGUID.
    '00000000-0000-0000-0000-000000000000',
}
DEFAULT_PASSKEY_NAME = 'Passkey'
ICLOUD_PASSKEY_NAME = 'iCloud Passkey'
THIS_DEVICE_PASSKEY_NAME = 'This Device Passkey'
SECURITY_KEY_PASSKEY_NAME = 'Security Key Passkey'
HYBRID_PASSKEY_NAME = 'Phone Passkey'


@dataclass(frozen=True)
class PasskeyRPContext:
    rp_id: str
    expected_origins: list[str]


@dataclass(frozen=True)
class PasskeyOptionsResult:
    challenge_id: str
    options: dict[str, Any]


def _normalize_origin(value: str | None) -> str | None:
    raw = (value or '').strip()
    if not raw:
        return None
    parsed = urlparse(raw)
    if parsed.scheme not in {'http', 'https'}:
        return None
    if not parsed.netloc:
        return None
    return f'{parsed.scheme}://{parsed.netloc}'


def _resolve_rp_id(*, app_domain: str, request_origin: str | None, request_base_url: str | None) -> str:
    # Prefer the live request origin first so passkeys bind to the actual host
    # users are visiting (important when app_domain is still default localhost).
    for candidate in (request_origin, app_domain, request_base_url):
        origin = _normalize_origin(candidate)
        if origin is None:
            continue
        hostname = urlparse(origin).hostname
        if hostname:
            return hostname
    return 'localhost'


def _resolve_expected_origins(*, app_domain: str, request_origin: str | None, request_base_url: str | None) -> list[str]:
    origins = {
        origin
        for origin in (
            _normalize_origin(app_domain),
            _normalize_origin(request_origin),
            _normalize_origin(request_base_url),
        )
        if origin is not None
    }
    if not origins:
        origins.add('http://localhost:3000')
    return sorted(origins)


async def _cleanup_expired_challenges(db: AsyncSession) -> None:
    await db.execute(
        delete(PasskeyChallenge).where(PasskeyChallenge.expires_at < now_utc()),
    )
    await db.commit()


async def get_rp_context(
    db: AsyncSession,
    *,
    request_origin: str | None,
    request_base_url: str | None,
) -> PasskeyRPContext:
    domain = await get_effective_domain_config(db)
    rp_id = _resolve_rp_id(
        app_domain=domain.app_domain,
        request_origin=request_origin,
        request_base_url=request_base_url,
    )
    expected_origins = _resolve_expected_origins(
        app_domain=domain.app_domain,
        request_origin=request_origin,
        request_base_url=request_base_url,
    )
    return PasskeyRPContext(
        rp_id=rp_id,
        expected_origins=expected_origins,
    )


async def list_passkeys_for_user(db: AsyncSession, *, user_id: str) -> list[PasskeyCredential]:
    return list(
        (
            await db.execute(
                select(PasskeyCredential)
                .where(PasskeyCredential.user_id == user_id)
                .order_by(PasskeyCredential.created_at.asc()),
            )
        ).scalars().all(),
    )


async def create_registration_options(
    db: AsyncSession,
    *,
    user: User,
    rp_context: PasskeyRPContext,
) -> PasskeyOptionsResult:
    await _cleanup_expired_challenges(db)
    settings = get_settings()

    credentials = await list_passkeys_for_user(db, user_id=user.id)
    exclude_credentials: list[PublicKeyCredentialDescriptor] = []
    for cred in credentials:
        try:
            exclude_credentials.append(
                PublicKeyCredentialDescriptor(
                    id=base64url_to_bytes(cred.credential_id),
                ),
            )
        except Exception:
            continue

    user_name = (user.username or user.email or user.id).strip()
    display_name = (user.username or user.email or user.id).strip()

    options = generate_registration_options(
        rp_id=rp_context.rp_id,
        rp_name=settings.app_name,
        user_id=user.id.encode('utf-8'),
        user_name=user_name,
        user_display_name=display_name,
        exclude_credentials=exclude_credentials,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        attestation=AttestationConveyancePreference.NONE,
    )
    challenge = bytes_to_base64url(options.challenge)
    challenge_row = PasskeyChallenge(
        challenge=challenge,
        flow=PasskeyChallengeFlow.registration,
        user_id=user.id,
        expires_at=now_utc() + timedelta(seconds=PASSKEY_CHALLENGE_TTL_SECONDS),
    )
    db.add(challenge_row)
    await db.commit()
    await db.refresh(challenge_row)

    options_json = cast_dict(json.loads(options_to_json(options)))
    # Best-effort UX hint: prefer local platform passkeys first (e.g. Touch ID / iCloud Keychain).
    options_json['hints'] = ['client-device', 'hybrid']

    return PasskeyOptionsResult(challenge_id=challenge_row.id, options=options_json)


def cast_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _normalize_aaguid(value: str | None) -> str | None:
    raw = (value or '').strip().lower()
    if len(raw) != 36:
        return None
    return raw


def is_icloud_credential(credential: PasskeyCredential) -> bool:
    normalized = _normalize_aaguid(credential.aaguid)
    if normalized is None:
        return False
    return normalized in ICLOUD_KEYCHAIN_AAGUIDS


def _base_nickname_for_credential(*, aaguid: str | None, transports: list[str] | None) -> str:
    normalized_aaguid = _normalize_aaguid(aaguid)
    if normalized_aaguid in ICLOUD_KEYCHAIN_AAGUIDS:
        return ICLOUD_PASSKEY_NAME

    normalized_transports = {item.strip().lower() for item in (transports or []) if isinstance(item, str) and item.strip()}
    if 'internal' in normalized_transports:
        return THIS_DEVICE_PASSKEY_NAME
    if {'usb', 'nfc', 'ble'} & normalized_transports:
        return SECURITY_KEY_PASSKEY_NAME
    if 'hybrid' in normalized_transports:
        return HYBRID_PASSKEY_NAME
    return DEFAULT_PASSKEY_NAME


async def _suggest_nickname_for_credential(
    db: AsyncSession,
    *,
    user_id: str,
    aaguid: str | None,
    transports: list[str] | None,
) -> str:
    base = _base_nickname_for_credential(aaguid=aaguid, transports=transports)
    rows = (
        await db.execute(
            select(PasskeyCredential.nickname).where(
                PasskeyCredential.user_id == user_id,
                PasskeyCredential.nickname.is_not(None),
            ),
        )
    ).all()
    pattern = re.compile(rf'^{re.escape(base)}(?: #(\d+))?$')
    max_index = 0
    for (candidate,) in rows:
        if not isinstance(candidate, str):
            continue
        normalized = candidate.strip()
        if not normalized:
            continue
        matched = pattern.match(normalized)
        if not matched:
            continue
        index_text = matched.group(1)
        if index_text is None:
            max_index = max(max_index, 1)
            continue
        try:
            max_index = max(max_index, int(index_text))
        except ValueError:
            continue

    if max_index <= 0:
        return base
    return f'{base} #{max_index + 1}'


async def resolve_user_and_passkeys_by_identifier(
    db: AsyncSession,
    *,
    identifier: str,
) -> tuple[User, list[PasskeyCredential]]:
    normalized = identifier.strip()
    if not normalized:
        raise ValueError('identifier is required')

    user = (
        await db.execute(
            select(User).where(
                or_(
                    User.email == normalized,
                    User.username == normalized,
                ),
            ),
        )
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise ValueError('invalid credentials')

    credentials = await list_passkeys_for_user(db, user_id=user.id)
    if not credentials:
        raise ValueError('no passkey is registered for this account')
    return user, credentials


async def resolve_user_and_passkeys_by_user_id(
    db: AsyncSession,
    *,
    user_id: str,
) -> tuple[User, list[PasskeyCredential]]:
    normalized = user_id.strip()
    if not normalized:
        raise ValueError('user id is required')

    user = (
        await db.execute(
            select(User).where(User.id == normalized),
        )
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise ValueError('invalid credentials')

    credentials = await list_passkeys_for_user(db, user_id=user.id)
    if not credentials:
        raise ValueError('no passkey is registered for this account')
    return user, credentials


async def verify_registration(
    db: AsyncSession,
    *,
    user: User,
    challenge_id: str,
    credential: dict[str, Any],
    nickname: str | None,
    rp_context: PasskeyRPContext,
) -> PasskeyCredential:
    await _cleanup_expired_challenges(db)

    challenge_row = (
        await db.execute(
            select(PasskeyChallenge).where(
                PasskeyChallenge.id == challenge_id,
                PasskeyChallenge.flow == PasskeyChallengeFlow.registration,
                PasskeyChallenge.user_id == user.id,
            ),
        )
    ).scalar_one_or_none()
    if challenge_row is None or as_utc(challenge_row.expires_at) < now_utc():
        raise ValueError('passkey registration challenge expired, please retry')

    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(challenge_row.challenge),
            expected_rp_id=rp_context.rp_id,
            expected_origin=rp_context.expected_origins,
            require_user_verification=True,
        )
    except Exception as exc:
        raise ValueError('invalid passkey registration response') from exc

    credential_id = bytes_to_base64url(verification.credential_id)
    public_key = bytes_to_base64url(verification.credential_public_key)
    aaguid = _normalize_aaguid(str(getattr(verification, 'aaguid', '') or ''))
    transports: list[str] | None = None
    credential_response = cast_dict(credential.get('response'))
    if isinstance(credential_response.get('transports'), list):
        transports = [str(item) for item in credential_response['transports'] if isinstance(item, str) and item.strip()]
        if not transports:
            transports = None

    existing = (
        await db.execute(
            select(PasskeyCredential).where(PasskeyCredential.credential_id == credential_id),
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.user_id != user.id:
            raise ValueError('passkey credential already belongs to another user')
        existing.public_key = public_key
        existing.sign_count = verification.sign_count
        existing.last_used_at = now_utc()
        existing.transports = transports
        existing.aaguid = aaguid
        if nickname is not None:
            existing.nickname = nickname
        elif not (existing.nickname or '').strip():
            existing.nickname = await _suggest_nickname_for_credential(
                db,
                user_id=user.id,
                aaguid=aaguid,
                transports=transports,
            )
        await db.delete(challenge_row)
        await db.commit()
        await db.refresh(existing)
        return existing

    resolved_nickname = nickname
    if resolved_nickname is None:
        resolved_nickname = await _suggest_nickname_for_credential(
            db,
            user_id=user.id,
            aaguid=aaguid,
            transports=transports,
        )

    new_credential = PasskeyCredential(
        user_id=user.id,
        credential_id=credential_id,
        public_key=public_key,
        sign_count=verification.sign_count,
        transports=transports,
        nickname=resolved_nickname,
        device_type=str(getattr(verification, 'credential_device_type', '') or '') or None,
        backed_up=getattr(verification, 'credential_backed_up', None),
        aaguid=aaguid,
    )
    db.add(new_credential)
    await db.delete(challenge_row)
    await db.commit()
    await db.refresh(new_credential)
    return new_credential


async def create_authentication_options(
    db: AsyncSession,
    *,
    rp_context: PasskeyRPContext,
    user_id: str | None = None,
    credentials: list[PasskeyCredential] | None = None,
) -> PasskeyOptionsResult:
    await _cleanup_expired_challenges(db)

    allow_credentials: list[PublicKeyCredentialDescriptor] = []
    if credentials:
        for cred in credentials:
            try:
                allow_credentials.append(
                    PublicKeyCredentialDescriptor(
                        id=base64url_to_bytes(cred.credential_id),
                    ),
                )
            except Exception:
                continue

    options = generate_authentication_options(
        rp_id=rp_context.rp_id,
        user_verification=UserVerificationRequirement.PREFERRED,
        allow_credentials=allow_credentials or None,
    )
    challenge = bytes_to_base64url(options.challenge)
    challenge_row = PasskeyChallenge(
        challenge=challenge,
        flow=PasskeyChallengeFlow.authentication,
        user_id=user_id,
        expires_at=now_utc() + timedelta(seconds=PASSKEY_CHALLENGE_TTL_SECONDS),
    )
    db.add(challenge_row)
    await db.commit()
    await db.refresh(challenge_row)

    options_json = cast_dict(json.loads(options_to_json(options)))
    options_json['hints'] = ['client-device', 'hybrid']

    return PasskeyOptionsResult(challenge_id=challenge_row.id, options=options_json)


async def verify_authentication(
    db: AsyncSession,
    *,
    challenge_id: str,
    credential: dict[str, Any],
    rp_context: PasskeyRPContext,
) -> tuple[User, PasskeyCredential]:
    await _cleanup_expired_challenges(db)

    challenge_row = (
        await db.execute(
            select(PasskeyChallenge).where(
                PasskeyChallenge.id == challenge_id,
                PasskeyChallenge.flow == PasskeyChallengeFlow.authentication,
            ),
        )
    ).scalar_one_or_none()
    if challenge_row is None or as_utc(challenge_row.expires_at) < now_utc():
        raise ValueError('passkey authentication challenge expired, please retry')

    credential_id = str(credential.get('id') or '').strip()
    if not credential_id:
        raise ValueError('invalid passkey credential id')

    passkey_credential = (
        await db.execute(
            select(PasskeyCredential).where(PasskeyCredential.credential_id == credential_id),
        )
    ).scalar_one_or_none()
    if passkey_credential is None:
        raise ValueError('passkey credential not found')
    if challenge_row.user_id and passkey_credential.user_id != challenge_row.user_id:
        raise ValueError('passkey credential does not match requested account')

    user = (
        await db.execute(
            select(User).where(User.id == passkey_credential.user_id),
        )
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise ValueError('user is disabled')

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(challenge_row.challenge),
            expected_rp_id=rp_context.rp_id,
            expected_origin=rp_context.expected_origins,
            credential_public_key=base64url_to_bytes(passkey_credential.public_key),
            credential_current_sign_count=passkey_credential.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:
        raise ValueError('invalid passkey authentication response') from exc

    passkey_credential.sign_count = verification.new_sign_count
    passkey_credential.last_used_at = now_utc()
    await db.delete(challenge_row)
    await db.commit()
    await db.refresh(passkey_credential)
    return user, passkey_credential


async def delete_passkey(
    db: AsyncSession,
    *,
    user_id: str,
    credential_id: str,
) -> bool:
    credential = (
        await db.execute(
            select(PasskeyCredential).where(
                PasskeyCredential.user_id == user_id,
                PasskeyCredential.credential_id == credential_id,
            ),
        )
    ).scalar_one_or_none()
    if credential is None:
        return False

    await db.delete(credential)
    await db.commit()
    return True
