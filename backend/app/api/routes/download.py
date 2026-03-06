from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from html import escape
from ipaddress import ip_address, ip_network
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from sqlalchemy import or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_db_session, get_optional_user, get_redis_client
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.core.security import as_utc, now_utc
from app.models import DownloadEvent, ShareLink, User
from app.services.acl import has_permission
from app.services.audit import log_audit
from app.services.cache import CacheClient
from app.services.hf_client import hf_client
from app.services.link_service import build_share_signature_fields, get_share
from app.services.rate_limit import ConcurrencyLimitExceeded, check_rate_limit, concurrent_download_guard
from app.services.security_settings import get_runtime_signing_secret
from app.services.signer import constraints_hash, is_expired, verify_signature
from app.services.system_settings import get_effective_hf_config
from app.utils.paths import PathValidationError, is_allowed_prefix, normalize_repo_path

router = APIRouter(tags=['download'])
logger = logging.getLogger(__name__)
_SHARE_STATUS_FAVICON_DATA_URL = 'data:image/png;base64,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'


def _wants_html_response(request: Request) -> bool:
    accept = request.headers.get('accept', '')
    return 'text/html' in accept.lower()


def _share_status_page(
    *,
    status_code: int,
    title: str,
    message: str,
    badge: str,
    alt_title: str | None = None,
    alt_message: str | None = None,
) -> HTMLResponse:
    safe_title = escape(title)
    safe_message = escape(message)
    safe_badge = escape(badge)
    safe_app_name = 'Hugging Cloud'
    page_title = f'{safe_title} - {safe_app_name}'
    safe_alt_title = escape(alt_title) if alt_title else ''
    safe_alt_message = escape(alt_message) if alt_message else ''
    alt_block = (
        f"""
      <div class="divider"></div>
      <section class="lang-block">
        <p class="title">{safe_alt_title}</p>
        <p class="message">{safe_alt_message}</p>
      </section>"""
        if alt_title and alt_message
        else ''
    )

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{page_title}</title>
    <link rel="icon" type="image/png" href="{_SHARE_STATUS_FAVICON_DATA_URL}" />
    <link rel="shortcut icon" href="{_SHARE_STATUS_FAVICON_DATA_URL}" />
    <style>
      :root {{
        color-scheme: light dark;
      }}
      * {{
        box-sizing: border-box;
      }}
      body {{
        margin: 0;
        min-height: 100vh;
        font-family: "Manrope", "Segoe UI", system-ui, -apple-system, sans-serif;
        color: rgb(24, 24, 27);
        background:
          radial-gradient(circle at 2px 2px, rgba(24, 24, 27, 0.04) 1px, transparent 0),
          linear-gradient(to bottom, rgb(250, 250, 250), rgb(255, 255, 255));
        background-size: 22px 22px, 100% 100%;
        display: grid;
        place-items: center;
        padding: 28px 18px;
      }}
      .card {{
        width: min(680px, 100%);
        border: 1px solid rgba(24, 24, 27, 0.1);
        background: rgba(255, 255, 255, 0.92);
        border-radius: 18px;
        padding: clamp(24px, 4vw, 34px);
        box-shadow: 0 16px 60px rgba(24, 24, 27, 0.08);
      }}
      .badge {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        border: 1px solid rgba(24, 24, 27, 0.14);
        background: rgba(24, 24, 27, 0.04);
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }}
      .lang-block {{
        margin-top: 16px;
      }}
      .title {{
        margin: 0;
        font-size: clamp(24px, 5vw, 40px);
        line-height: 1.12;
        letter-spacing: -0.02em;
        font-weight: 700;
      }}
      .message {{
        margin: 0;
        margin-top: 10px;
        font-size: clamp(14px, 2.8vw, 16px);
        color: rgba(24, 24, 27, 0.75);
      }}
      .divider {{
        margin-top: 18px;
        margin-bottom: 16px;
        border-top: 1px dashed rgba(24, 24, 27, 0.18);
      }}
      @media (prefers-color-scheme: dark) {{
        body {{
          color: rgb(244, 244, 245);
          background:
            radial-gradient(circle at 2px 2px, rgba(228, 228, 231, 0.08) 1px, transparent 0),
            linear-gradient(to bottom, rgb(9, 9, 11), rgb(3, 3, 5));
          background-size: 22px 22px, 100% 100%;
        }}
        .card {{
          border-color: rgba(228, 228, 231, 0.18);
          background: rgba(10, 10, 12, 0.86);
          box-shadow: 0 16px 60px rgba(0, 0, 0, 0.45);
        }}
        .badge {{
          border-color: rgba(228, 228, 231, 0.28);
          background: rgba(228, 228, 231, 0.1);
        }}
        .message {{
          color: rgba(228, 228, 231, 0.76);
        }}
        .divider {{
          border-top-color: rgba(228, 228, 231, 0.26);
        }}
      }}
    </style>
  </head>
  <body>
    <article class="card">
      <div class="badge">{safe_badge}</div>
      <section class="lang-block">
        <p class="title">{safe_title}</p>
        <p class="message">{safe_message}</p>
      </section>
{alt_block}
    </article>
  </body>
</html>"""
    return HTMLResponse(
        content=html,
        status_code=status_code,
        headers={'cache-control': 'no-store'},
    )


def _revoked_share_response(request: Request) -> HTMLResponse:
    _ = request
    return _share_status_page(
        status_code=status.HTTP_410_GONE,
        title='Share Revoked',
        message='This share link has been revoked by its owner and is no longer available.',
        alt_title='分享已撤销',
        alt_message='该分享链接已被创建者撤销，无法继续访问文件。',
        badge='410 GONE',
    )


def _expired_share_response(request: Request) -> HTMLResponse:
    _ = request
    return _share_status_page(
        status_code=status.HTTP_403_FORBIDDEN,
        title='Share Expired',
        message='This share link has expired and can no longer be used.',
        alt_title='分享已过期',
        alt_message='该分享链接已过期，无法继续访问文件。',
        badge='403 FORBIDDEN',
    )


def _share_error_response_or_none(
    request: Request,
    *,
    reason: Literal['expired', 'revoked'],
) -> HTMLResponse | None:
    if request.method != 'GET' or not _wants_html_response(request):
        return None
    if reason == 'expired':
        return _expired_share_response(request)
    return _revoked_share_response(request)


def _ip_allowed(ip: str | None, allowlist: list[str] | None) -> bool:
    if not allowlist:
        return True
    if not ip:
        return False
    try:
        parsed = ip_address(ip)
    except ValueError:
        return False

    for block in allowlist:
        try:
            if parsed in ip_network(block, strict=False):
                return True
        except ValueError:
            continue
    return False


def _constraints(share: ShareLink) -> dict:
    return {
        'max_downloads': share.max_downloads,
        'one_time': share.one_time,
        'ip_allowlist': share.ip_allowlist or [],
        'speed_limit_mbps': share.speed_limit_mbps,
    }


def _safe_headers(headers: dict[str, str]) -> dict[str, str]:
    allowed = {
        'content-type',
        'content-length',
        'content-range',
        'etag',
        'last-modified',
        'accept-ranges',
        'content-disposition',
    }
    return {k: v for k, v in headers.items() if k.lower() in allowed}


def _build_ascii_filename_fallback(filename: str) -> str:
    # Keep ASCII-safe bytes only for quoted filename fallback, replacing
    # non-ASCII/control/header-sensitive bytes with underscore.
    fallback = ''.join(
        ch if 32 <= ord(ch) < 127 and ch not in {'"', '\\', ';'} else '_'
        for ch in filename
    ).strip()
    return fallback or 'download'


def _build_content_disposition(*, path: str, inline: bool) -> str:
    raw_filename = (path.rsplit('/', maxsplit=1)[-1] or '').strip() or 'download'
    disposition = 'inline' if inline else 'attachment'
    ascii_fallback = _build_ascii_filename_fallback(raw_filename)
    encoded = quote(raw_filename, safe='')
    return f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"


def _verify_share_request_signature(
    *,
    signing_secret: str,
    method: str,
    path: str,
    sid: str,
    exp: int,
    nonce: str,
    ch: str,
    sig: str,
) -> bool:
    if verify_signature(
        signing_secret,
        method=method,
        path=path,
        sid=sid,
        exp=exp,
        nonce=nonce,
        ch=ch,
        sig=sig,
    ):
        return True
    if method != 'HEAD':
        return False
    return verify_signature(
        signing_secret,
        method='GET',
        path=path,
        sid=sid,
        exp=exp,
        nonce=nonce,
        ch=ch,
        sig=sig,
    )


async def _persist_download_side_effects(
    *,
    share_id: str | None,
    user_id: str | None,
    path: str,
    ip: str | None,
    user_agent: str | None,
    status_code: int,
    bytes_sent: int,
    range_header: str | None,
    audit_action: Literal['download.proxy', 'download.redirect'] = 'download.proxy',
) -> None:
    try:
        async with SessionLocal() as write_db:
            event = DownloadEvent(
                share_link_id=share_id,
                user_id=user_id,
                path=path,
                ip=ip,
                user_agent=user_agent,
                status_code=status_code,
                bytes_sent=bytes_sent,
                range_header=range_header,
            )
            write_db.add(event)
            await write_db.commit()

            await log_audit(
                write_db,
                action=audit_action,
                resource=path,
                user_id=user_id,
                ip=ip,
                metadata={
                    'share_id': share_id,
                    'status_code': status_code,
                    'range': range_header,
                    'bytes_sent': bytes_sent,
                    'mode': audit_action.split('.', 1)[1],
                },
            )
    except Exception:
        # Download response should not fail due to best-effort telemetry persistence.
        logger.exception('failed to persist download side effects')


async def _reserve_share_download_slot(db: AsyncSession, *, share: ShareLink) -> bool:
    result = await db.execute(
        update(ShareLink)
        .where(
            ShareLink.id == share.id,
            ShareLink.revoked_at.is_(None),
            or_(ShareLink.max_downloads.is_(None), ShareLink.download_count < ShareLink.max_downloads),
            or_(ShareLink.one_time.is_(False), ShareLink.download_count < 1),
        )
        .values(download_count=ShareLink.download_count + 1),
    )
    await db.commit()
    return (result.rowcount or 0) > 0


async def _release_share_download_slot(*, share_id: str) -> None:
    try:
        async with SessionLocal() as write_db:
            await write_db.execute(
                update(ShareLink)
                .where(ShareLink.id == share_id, ShareLink.download_count > 0)
                .values(download_count=ShareLink.download_count - 1),
            )
            await write_db.commit()
    except Exception:
        logger.exception('failed to release reserved download slot', extra={'extra': {'share_id': share_id}})


@dataclass(frozen=True)
class DownloadAccessContext:
    share: ShareLink | None
    speed_limit_mbps: int | None
    limiter_key: str
    count_download: bool


def _has_signed_share_params(
    *,
    sid: str | None,
    exp: int | None,
    nonce: str | None,
    ch: str | None,
    sig: str | None,
) -> bool:
    return bool(sid and exp is not None and nonce and ch and sig)


async def _resolve_download_access_context(
    *,
    request: Request,
    db: AsyncSession,
    user: User | None,
    path: str,
    client_ip: str | None,
    signing_secret: str,
    sid: str | None,
    exp: int | None,
    nonce: str | None,
    ch: str | None,
    sig: str | None,
) -> DownloadAccessContext | HTMLResponse:
    if _has_signed_share_params(sid=sid, exp=exp, nonce=nonce, ch=ch, sig=sig):
        assert sid is not None
        assert exp is not None
        assert nonce is not None
        assert ch is not None
        assert sig is not None

        if is_expired(exp):
            share_error_response = _share_error_response_or_none(request, reason='expired')
            if share_error_response is not None:
                return share_error_response
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='link expired')

        share = await get_share(db, sid)
        if not share:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='share not found')

        if share.path != path:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='path mismatch')
        if share.revoked_at is not None:
            share_error_response = _share_error_response_or_none(request, reason='revoked')
            if share_error_response is not None:
                return share_error_response
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='link revoked')
        if as_utc(share.expires_at) < now_utc():
            share_error_response = _share_error_response_or_none(request, reason='expired')
            if share_error_response is not None:
                return share_error_response
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='link expired')

        expected_ch = constraints_hash(_constraints(share))
        if ch != expected_ch:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='constraint mismatch')

        if not _verify_share_request_signature(
            signing_secret=signing_secret,
            method=request.method,
            path=path,
            sid=sid,
            exp=exp,
            nonce=nonce,
            ch=ch,
            sig=sig,
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='invalid signature')

        if share.one_time and share.download_count >= 1:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='one-time link already used')
        if share.max_downloads is not None and share.download_count >= share.max_downloads:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='download limit reached')
        if not _ip_allowed(client_ip, share.ip_allowlist):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='ip not allowed')

        return DownloadAccessContext(
            share=share,
            speed_limit_mbps=share.speed_limit_mbps,
            limiter_key=sid,
            count_download=True,
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='missing signed parameters or authenticated session',
        )
    if not await has_permission(db, user, path, 'download'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied')

    return DownloadAccessContext(
        share=None,
        speed_limit_mbps=None,
        limiter_key=f'user:{user.id}',
        count_download=False,
    )


@router.api_route('/dl/{repo_path:path}', methods=['GET', 'HEAD'])
async def download(
    repo_path: str,
    request: Request,
    sid: str | None = Query(default=None),
    exp: int | None = Query(default=None),
    nonce: str | None = Query(default=None),
    ch: str | None = Query(default=None),
    sig: str | None = Query(default=None),
    inline: bool = Query(default=False),
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
    user: User | None = Depends(get_optional_user),
):
    settings = get_settings()

    try:
        path = normalize_repo_path(repo_path)
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not is_allowed_prefix(path, settings.allow_prefix_list):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='path prefix not allowed')

    client_ip = get_client_ip(request)
    access_context = await _resolve_download_access_context(
        request=request,
        db=db,
        user=user,
        path=path,
        client_ip=client_ip,
        signing_secret=get_runtime_signing_secret(),
        sid=sid,
        exp=exp,
        nonce=nonce,
        ch=ch,
        sig=sig,
    )
    if isinstance(access_context, HTMLResponse):
        return access_context

    share = access_context.share
    speed_limit = access_context.speed_limit_mbps
    limiter_key = access_context.limiter_key
    count_download = access_context.count_download

    within_rate = await check_rate_limit(redis, limiter_key, settings.rate_limit_per_minute)
    if not within_rate:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail='rate limit exceeded')

    hf_runtime = await get_effective_hf_config(db)
    download_mode = hf_runtime.download_mode
    range_header = request.headers.get('range')

    try:
        async with concurrent_download_guard(redis, limiter_key, settings.concurrent_downloads_per_link):
            reserved_share_slot = False
            try:
                if count_download and request.method == 'GET' and share is not None:
                    reserved_share_slot = await _reserve_share_download_slot(db, share=share)
                    if not reserved_share_slot:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='download limit reached')

                redirect_allowed_for_request = request.method in {'GET', 'HEAD'}
                redirect_compatible_with_constraints = speed_limit is None

                if download_mode in {'auto', 'redirect'} and redirect_allowed_for_request:
                    if redirect_compatible_with_constraints:
                        redirect_url = await hf_client.resolve_redirect_url(path=path, range_header=range_header)
                        if redirect_url:
                            if request.method == 'GET':
                                await _persist_download_side_effects(
                                    share_id=share.id if share else None,
                                    user_id=user.id if user else None,
                                    path=path,
                                    ip=client_ip,
                                    user_agent=request.headers.get('user-agent'),
                                    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
                                    bytes_sent=0,
                                    range_header=range_header,
                                    audit_action='download.redirect',
                                )
                            return RedirectResponse(
                                url=redirect_url,
                                status_code=status.HTTP_307_TEMPORARY_REDIRECT,
                                headers={'cache-control': 'no-store'},
                            )
                    if download_mode == 'redirect':
                        if not redirect_compatible_with_constraints:
                            raise HTTPException(
                                status_code=status.HTTP_409_CONFLICT,
                                detail='redirect mode is incompatible with speed-limited links',
                            )
                        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='redirect target unavailable for this file')

                upstream = await hf_client.stream_file(path=path, method=request.method, range_header=range_header)

                if upstream.status_code >= 400:
                    body = await upstream.aread()
                    await upstream.aclose()
                    raise HTTPException(status_code=upstream.status_code, detail=body.decode('utf-8', errors='ignore')[:512])

                headers = _safe_headers(dict(upstream.headers))
                headers.setdefault('accept-ranges', 'bytes')
                if 'content-disposition' not in {k.lower() for k in headers.keys()}:
                    headers['Content-Disposition'] = _build_content_disposition(path=path, inline=inline)

                if request.method == 'HEAD':
                    await upstream.aclose()
                    return Response(status_code=upstream.status_code, headers=headers)

                bytes_sent = 0
                share_id = share.id if share else None
                user_id = user.id if user else None
                user_agent = request.headers.get('user-agent')
                status_code = upstream.status_code

                async def iterator():
                    nonlocal bytes_sent
                    try:
                        async for chunk in upstream.aiter_bytes(chunk_size=1024 * 1024):
                            bytes_sent += len(chunk)
                            if speed_limit:
                                # Basic token-sleep throttling per chunk.
                                seconds = len(chunk) / (speed_limit * 1024 * 1024)
                                if seconds > 0:
                                    await asyncio.sleep(seconds)
                            yield chunk
                    finally:
                        await upstream.aclose()
                        await _persist_download_side_effects(
                            share_id=share_id,
                            user_id=user_id,
                            path=path,
                            ip=client_ip,
                            user_agent=user_agent,
                            status_code=status_code,
                            bytes_sent=bytes_sent,
                            range_header=range_header,
                        )

                response = StreamingResponse(iterator(), status_code=upstream.status_code, headers=headers)
                return response
            except Exception:
                if reserved_share_slot and share is not None:
                    await _release_share_download_slot(share_id=share.id)
                raise
    except ConcurrencyLimitExceeded as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail='concurrency limit exceeded') from exc


async def _download_via_share(
    sid: str,
    request: Request,
    db: AsyncSession,
    redis: CacheClient,
    user: User | None,
):
    share = await get_share(db, sid)
    if share is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='share not found')

    exp, ch, sig = build_share_signature_fields(share, method=request.method)
    return await download(
        repo_path=share.path,
        request=request,
        sid=share.id,
        exp=exp,
        nonce=share.token_nonce,
        ch=ch,
        sig=sig,
        inline=True,
        db=db,
        redis=redis,
        user=user,
    )


@router.api_route('/s/{sid}', methods=['GET', 'HEAD'])
async def short_download(
    sid: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
    user: User | None = Depends(get_optional_user),
):
    return await _download_via_share(sid=sid, request=request, db=db, redis=redis, user=user)


@router.api_route('/s/{sid}/{filename:path}', methods=['GET', 'HEAD'])
async def short_download_with_name(
    sid: str,
    filename: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    redis: CacheClient = Depends(get_redis_client),
    user: User | None = Depends(get_optional_user),
):
    _ = filename
    return await _download_via_share(sid=sid, request=request, db=db, redis=redis, user=user)
