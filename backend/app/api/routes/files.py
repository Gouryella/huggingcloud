from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session
from app.models import FileIndex, User
from app.schemas.files import DeleteFileRequest, FileItem, FileListResponse, MoveFileRequest, RefreshResponse
from app.services.acl import has_permission
from app.services.audit import log_audit
from app.services.file_index_service import get_indexed_file_totals, list_indexed_files, sync_file_index
from app.services.hf_client import HFRepoNotConfiguredError, hf_client
from app.services.system_settings import get_effective_hf_config, get_effective_storage_config
from app.utils.cursor import decode_cursor, encode_cursor
from app.utils.paths import PathValidationError, normalize_repo_path

router = APIRouter(prefix='/api', tags=['files'])
ACL_SCAN_BATCH_SIZE = 200


def _is_admin_like(user: User) -> bool:
    return user.role.value in {'owner', 'admin'}


async def _list_authorized_files(
    db: AsyncSession,
    *,
    user: User,
    q: str | None,
    cursor: str | None,
    limit: int,
) -> tuple[list[FileIndex], str | None]:
    if _is_admin_like(user):
        return await list_indexed_files(db, prefix=None, q=q, cursor=cursor, limit=limit)

    scan_offset = decode_cursor(cursor)
    rows: list[FileIndex] = []

    while True:
        batch_cursor = encode_cursor(scan_offset) if scan_offset > 0 else None
        batch_rows, batch_next_cursor = await list_indexed_files(
            db,
            prefix=None,
            q=q,
            cursor=batch_cursor,
            limit=max(limit * 2, ACL_SCAN_BATCH_SIZE),
        )
        if not batch_rows:
            return rows, None

        consumed = 0
        for row in batch_rows:
            consumed += 1
            if await has_permission(db, user, row.path, 'list'):
                rows.append(row)
                if len(rows) > limit:
                    # Keep cursor pointing to the first row beyond this page so
                    # no authorized item is skipped on the next request.
                    return rows[:limit], encode_cursor(scan_offset + consumed - 1)

        scan_offset += consumed
        if batch_next_cursor is None:
            return rows, None


async def _authorized_repo_totals(
    db: AsyncSession,
    *,
    user: User,
) -> tuple[int, int]:
    if _is_admin_like(user):
        return await get_indexed_file_totals(db, prefix=None, q=None)

    total_files = 0
    total_size_bytes = 0
    scan_offset = 0

    while True:
        batch_cursor = encode_cursor(scan_offset) if scan_offset > 0 else None
        batch_rows, batch_next_cursor = await list_indexed_files(
            db,
            prefix=None,
            q=None,
            cursor=batch_cursor,
            limit=ACL_SCAN_BATCH_SIZE,
        )
        if not batch_rows:
            return total_files, total_size_bytes

        for row in batch_rows:
            if await has_permission(db, user, row.path, 'list'):
                total_files += 1
                total_size_bytes += int(row.size or 0)

        scan_offset += len(batch_rows)
        if batch_next_cursor is None:
            return total_files, total_size_bytes


@router.get('/files', response_model=FileListResponse)
async def list_files(
    prefix: str | None = Query(default=None),
    q: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    safe_prefix = None
    if prefix:
        try:
            safe_prefix = normalize_repo_path(prefix)
        except PathValidationError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if safe_prefix and not await has_permission(db, user, safe_prefix, 'list'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied')

    if safe_prefix:
        rows, next_cursor = await list_indexed_files(
            db,
            prefix=safe_prefix,
            q=q,
            cursor=cursor,
            limit=limit,
        )
    else:
        rows, next_cursor = await _list_authorized_files(
            db,
            user=user,
            q=q,
            cursor=cursor,
            limit=limit,
        )

    if not rows or all(row.size is None for row in rows):
        try:
            await sync_file_index(db, prefix=safe_prefix)
        except HFRepoNotConfiguredError:
            # Fresh installs may not have HF repo settings yet. Keep file list usable
            # (empty index) instead of failing the whole page render with 500.
            pass
        if safe_prefix:
            rows, next_cursor = await list_indexed_files(db, prefix=safe_prefix, q=q, cursor=cursor, limit=limit)
        else:
            rows, next_cursor = await _list_authorized_files(
                db,
                user=user,
                q=q,
                cursor=cursor,
                limit=limit,
            )
    # Dashboard stats should reflect repository-wide usage, independent from
    # current folder prefix or search keyword.
    total_files, total_size_bytes = await _authorized_repo_totals(db, user=user)

    storage_config = await get_effective_storage_config(db)
    storage_capacity_bytes = storage_config.capacity_bytes if storage_config.capacity_bytes > 0 else None
    storage_remaining_bytes = None
    if storage_capacity_bytes is not None:
        storage_remaining_bytes = max(0, storage_capacity_bytes - total_size_bytes)
    hf_runtime = await get_effective_hf_config(db)
    hf_repo_configured = bool(hf_runtime.repo_id.strip())

    return FileListResponse(
        items=[FileItem.model_validate(r) for r in rows],
        next_cursor=next_cursor,
        total_files=total_files,
        total_size_bytes=total_size_bytes,
        storage_capacity_bytes=storage_capacity_bytes,
        storage_remaining_bytes=storage_remaining_bytes,
        hf_repo_configured=hf_repo_configured,
    )


@router.post('/files/refresh', response_model=RefreshResponse)
async def refresh_files(
    prefix: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    try:
        safe_prefix = normalize_repo_path(prefix) if prefix else None
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if safe_prefix:
        if not await has_permission(db, user, safe_prefix, 'list'):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied')
    elif not _is_admin_like(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied')

    try:
        await sync_file_index(db, prefix=safe_prefix)
    except HFRepoNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Hugging Face repository is not configured. Configure it in Settings first.',
        ) from exc
    return RefreshResponse(queued=True)


@router.delete('/files')
async def delete_file(
    payload: DeleteFileRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    try:
        path = normalize_repo_path(payload.path)
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if payload.recursive:
        target_paths = (
            await db.execute(
                select(FileIndex.path).where(
                    or_(
                        FileIndex.path == path,
                        FileIndex.path.startswith(f'{path}/'),
                    ),
                ),
            )
        ).scalars().all()
        if not target_paths:
            target_paths = [path]
    else:
        target_paths = [path]

    for target_path in target_paths:
        if not await has_permission(db, user, target_path, 'delete'):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied')

    for target_path in target_paths:
        await hf_client.delete_file(path_in_repo=target_path, commit_message=f'delete {target_path}')

    if payload.recursive:
        await db.execute(
            delete(FileIndex).where(
                or_(
                    FileIndex.path == path,
                    FileIndex.path.startswith(f'{path}/'),
                ),
            ),
        )
    else:
        await db.execute(delete(FileIndex).where(FileIndex.path == path))
    await db.commit()

    await log_audit(
        db,
        action='file.delete',
        resource=path,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'path': path, 'recursive': payload.recursive, 'deleted_count': len(target_paths)},
    )
    return {'deleted': True, 'deleted_count': len(target_paths)}


@router.post('/files/move')
async def move_file(
    payload: MoveFileRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    try:
        source = normalize_repo_path(payload.source_path)
        destination = normalize_repo_path(payload.destination_path)
    except PathValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not await has_permission(db, user, source, 'delete'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied for source')
    if not await has_permission(db, user, destination, 'upload'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='permission denied for destination')

    await hf_client.move_file(
        source_path=source,
        destination_path=destination,
        commit_message=f'move {source} -> {destination}',
    )

    row = (await db.execute(select(FileIndex).where(FileIndex.path == source))).scalar_one_or_none()
    if row:
        row.path = destination
        await db.commit()

    await log_audit(
        db,
        action='file.move',
        resource=source,
        user_id=user.id,
        ip=get_client_ip(request),
        metadata={'source': source, 'destination': destination},
    )

    return {'moved': True, 'source': source, 'destination': destination}
