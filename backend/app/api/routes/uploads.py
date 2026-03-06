from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session
from app.core.config import get_settings
from app.models import User
from app.schemas.uploads import (
    UploadCancelRequest,
    UploadChunkResponse,
    UploadCompleteResponse,
    UploadInitRequest,
    UploadInitResponse,
    UploadSessionInfo,
)
from app.services.acl import has_permission
from app.services.audit import log_audit
from app.services.upload_service import UploadService
from app.utils.paths import PathValidationError, is_allowed_prefix, normalize_repo_path

router = APIRouter(prefix='/api', tags=['uploads'])
logger = logging.getLogger(__name__)


@router.post('/uploads/init', response_model=UploadInitResponse)
async def init_upload(
    payload: UploadInitRequest,
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

    if not await has_permission(db, user, path, 'upload'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied')

    service = UploadService(db, user)
    try:
        session = await service.init_upload(path=path, size=payload.size, chunk_size=payload.chunk_size, sha256=payload.sha256)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await log_audit(
        db,
        action='upload.init',
        resource=session.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'path': path, 'size': payload.size},
    )

    return UploadInitResponse(upload_id=session.id, accepted_chunk_size=session.chunk_size)


@router.put('/uploads/{upload_id}/chunk', response_model=UploadChunkResponse)
async def upload_chunk(
    upload_id: str,
    request: Request,
    chunk_index: int = Query(..., ge=0),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    payload = await request.body()
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='empty chunk payload')

    service = UploadService(db, user)
    upload = await service.get_upload(upload_id)
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='upload session not found')

    try:
        upload = await service.add_chunk(upload=upload, chunk_index=chunk_index, payload=payload)
    except ValueError as exc:
        logger.warning(
            'upload chunk rejected: upload_id=%s user_id=%s status=%s chunk_index=%s bytes=%s reason=%s',
            upload_id,
            user.id,
            upload.status,
            chunk_index,
            len(payload),
            str(exc),
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return UploadChunkResponse(received_chunks=upload.received_chunks or [])


@router.post('/uploads/{upload_id}/complete', response_model=UploadCompleteResponse)
async def complete_upload(
    upload_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    service = UploadService(db, user)
    upload = await service.get_upload(upload_id)
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='upload session not found')

    try:
        file_path, revision = await service.complete_upload(upload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception('upload commit failed: upload_id=%s user_id=%s', upload_id, user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail='upload failed while committing to upstream storage',
        ) from exc

    await log_audit(
        db,
        action='upload.complete',
        resource=upload.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'path': file_path, 'revision': revision},
    )
    return UploadCompleteResponse(file_path=file_path, revision=revision)


@router.get('/uploads', response_model=list[UploadSessionInfo])
async def list_uploads(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    service = UploadService(db, user)
    await service.reconcile_stale_uploads(stale_seconds=300)
    rows = await service.list_uploads()
    return [UploadSessionInfo.model_validate(r) for r in rows]


@router.post('/uploads/{upload_id}/cancel', response_model=UploadSessionInfo)
async def cancel_upload(
    upload_id: str,
    request: Request,
    payload: UploadCancelRequest | None = None,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    service = UploadService(db, user)
    upload = await service.get_upload(upload_id)
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='upload session not found')

    upload = await service.cancel_upload(upload=upload, reason=payload.reason if payload else None)
    await log_audit(
        db,
        action='upload.cancel',
        resource=upload.id,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'path': upload.path, 'status': upload.status.value, 'reason': upload.error_message},
    )
    return UploadSessionInfo.model_validate(upload)


@router.get('/uploads/{upload_id}', response_model=UploadSessionInfo)
async def get_upload(
    upload_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    service = UploadService(db, user)
    row = await service.get_upload(upload_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='upload session not found')
    return UploadSessionInfo.model_validate(row)
