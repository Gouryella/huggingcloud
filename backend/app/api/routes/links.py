from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session
from app.core.config import get_settings
from app.models import ShareLink, User
from app.schemas.links import CreateLinkRequest, CreateLinkResponse, LinkRecord, RevokeLinkResponse
from app.services.acl import has_permission
from app.services.audit import log_audit
from app.services.link_service import build_short_share_url, create_share_link
from app.services.system_settings import get_effective_domain_config
from app.utils.paths import PathValidationError, is_allowed_prefix, normalize_repo_path

router = APIRouter(prefix='/api', tags=['links'])


@router.post('/links', response_model=CreateLinkResponse)
async def create_link(
    payload: CreateLinkRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    settings = get_settings()
    try:
        path = normalize_repo_path(payload.path)
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not is_allowed_prefix(path, settings.allow_prefix_list):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='path prefix not allowed')

    allowed = await has_permission(db, user, path, 'share')
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied')

    domains = await get_effective_domain_config(db)
    share, url = await create_share_link(
        db,
        path=path,
        user_id=user.id,
        expires_in_sec=payload.expires_in_sec,
        max_downloads=payload.max_downloads,
        one_time=payload.one_time,
        ip_allowlist=payload.ip_allowlist,
        speed_limit_mbps=payload.speed_limit_mbps,
        base_url=domains.dl_domain,
    )

    await log_audit(
        db,
        action='link.create',
        resource=share.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={
            'path': path,
            'expires_at': share.expires_at.isoformat(),
        },
    )

    return CreateLinkResponse(
        link_id=share.id,
        url=url,
        short_url=build_short_share_url(share, base_url=domains.dl_domain),
        expires_at=share.expires_at,
    )


@router.get('/links', response_model=list[LinkRecord])
async def list_links(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    domains = await get_effective_domain_config(db)
    if user.role.value in {'owner', 'admin'}:
        rows = (await db.execute(select(ShareLink).order_by(ShareLink.created_at.desc()).limit(300))).scalars().all()
    else:
        rows = (
            await db.execute(
                select(ShareLink)
                .where(ShareLink.created_by == user.id)
                .order_by(ShareLink.created_at.desc())
                .limit(300),
            )
        ).scalars().all()
    records: list[LinkRecord] = []
    for row in rows:
        record = LinkRecord.model_validate(row).model_copy(update={'short_url': build_short_share_url(row, base_url=domains.dl_domain)})
        records.append(record)
    return records


@router.post('/links/{link_id}/revoke', response_model=RevokeLinkResponse)
async def revoke_link(
    link_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    row = (await db.execute(select(ShareLink).where(ShareLink.id == link_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='link not found')

    if user.role.value not in {'owner', 'admin'} and row.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='forbidden')

    row.revoked_at = datetime.now(UTC)
    await db.commit()

    await log_audit(
        db,
        action='link.revoke',
        resource=link_id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'path': row.path},
    )
    return RevokeLinkResponse(revoked=True)
