from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import as_utc, generate_token
from app.models import ShareLink
from app.services.security_settings import get_runtime_signing_secret
from app.services.signer import constraints_hash, sign_payload
from app.utils.paths import is_allowed_prefix

PERMANENT_EXPIRES_AT = datetime(9999, 12, 31, 23, 59, 59, tzinfo=UTC)


def _constraints_from_share(share: ShareLink) -> dict:
    return {
        'max_downloads': share.max_downloads,
        'one_time': share.one_time,
        'ip_allowlist': share.ip_allowlist or [],
        'speed_limit_mbps': share.speed_limit_mbps,
    }


def _is_permanent(expires_at: datetime) -> bool:
    return as_utc(expires_at).year >= PERMANENT_EXPIRES_AT.year


def share_exp_param(expires_at: datetime) -> int:
    if _is_permanent(expires_at):
        return 0
    return int(as_utc(expires_at).timestamp())


def build_share_signature_fields(share: ShareLink, *, method: str = 'GET') -> tuple[int, str, str]:
    signing_secret = get_runtime_signing_secret()
    exp = share_exp_param(share.expires_at)
    ch = constraints_hash(_constraints_from_share(share))
    sig = sign_payload(
        signing_secret,
        method=method,
        path=share.path,
        sid=share.id,
        exp=exp,
        nonce=share.token_nonce,
        ch=ch,
    )
    return exp, ch, sig


def build_signed_share_url(share: ShareLink, *, method: str = 'GET', base_url: str | None = None) -> str:
    settings = get_settings()
    exp, ch, sig = build_share_signature_fields(share, method=method)
    base = (base_url or settings.dl_domain).rstrip('/')
    encoded_path = quote(share.path, safe='/')
    return f'{base}/dl/{encoded_path}?sid={share.id}&exp={exp}&nonce={share.token_nonce}&ch={ch}&sig={sig}'


def build_short_share_url(share: ShareLink, *, base_url: str | None = None) -> str:
    settings = get_settings()
    base = (base_url or settings.dl_domain).rstrip('/')
    filename = quote(share.path.rsplit('/', maxsplit=1)[-1], safe='')
    return f'{base}/s/{share.id}/{filename}'


async def create_share_link(
    db: AsyncSession,
    *,
    path: str,
    user_id: str,
    expires_in_sec: int,
    max_downloads: int | None,
    one_time: bool,
    ip_allowlist: list[str] | None,
    speed_limit_mbps: int | None,
    base_url: str | None = None,
) -> tuple[ShareLink, str]:
    settings = get_settings()
    if not is_allowed_prefix(path, settings.allow_prefix_list):
        raise ValueError('path prefix not allowed for sharing')

    never_expires = expires_in_sec <= 0
    expires_at = PERMANENT_EXPIRES_AT if never_expires else datetime.now(UTC) + timedelta(seconds=expires_in_sec)

    share = ShareLink(
        path=path,
        created_by=user_id,
        token_nonce=generate_token(12),
        expires_at=expires_at,
        max_downloads=max_downloads,
        one_time=one_time,
        ip_allowlist=ip_allowlist,
        speed_limit_mbps=speed_limit_mbps,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    url = build_signed_share_url(share, method='GET', base_url=base_url)
    return share, url


async def get_share(db: AsyncSession, sid: str) -> ShareLink | None:
    return (await db.execute(select(ShareLink).where(ShareLink.id == sid))).scalar_one_or_none()
