from __future__ import annotations

import asyncio
import logging
import mimetypes
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import FileIndex
from app.services.hf_client import hf_client
from app.utils.cursor import decode_cursor, encode_cursor
from app.utils.paths import is_allowed_prefix

logger = logging.getLogger(__name__)


async def sync_file_index(db: AsyncSession, *, prefix: str | None = None) -> int:
    settings = get_settings()
    all_entries = await hf_client.list_repo_file_entries()
    all_entries = [entry for entry in all_entries if is_allowed_prefix(str(entry['path']), settings.allow_prefix_list)]
    if prefix:
        filtered = [entry for entry in all_entries if str(entry['path']) == prefix or str(entry['path']).startswith(f'{prefix}/')]
    else:
        filtered = all_entries

    existing_rows = (await db.execute(select(FileIndex))).scalars().all()
    existing = {row.path: row for row in existing_rows}

    now = datetime.now(UTC)
    seen = set()

    for item in filtered:
        path = str(item['path'])
        seen.add(path)
        row = existing.get(path)
        mime = mimetypes.guess_type(path)[0]
        size = item.get('size')
        blob_id = item.get('blob_id')
        if row is None:
            db.add(
                FileIndex(
                    path=path,
                    size=size if isinstance(size, int) else None,
                    mime=mime,
                    etag=blob_id if isinstance(blob_id, str) else None,
                    indexed_at=now,
                ),
            )
        else:
            row.size = size if isinstance(size, int) else row.size
            row.mime = mime
            row.etag = blob_id if isinstance(blob_id, str) else row.etag
            # Preserve first-seen time so "uploaded/indexed at" remains stable
            # across manual refresh and periodic sync.
            if row.indexed_at is None:
                row.indexed_at = now

    if not prefix:
        for path, row in existing.items():
            if path not in seen:
                await db.delete(row)

    await db.commit()
    return len(filtered)


async def list_indexed_files(
    db: AsyncSession,
    *,
    prefix: str | None,
    q: str | None,
    cursor: str | None,
    limit: int,
) -> tuple[list[FileIndex], str | None]:
    offset = decode_cursor(cursor)
    stmt = _apply_file_filters(select(FileIndex), prefix=prefix, q=q)

    stmt = stmt.order_by(FileIndex.path.asc()).offset(offset).limit(limit + 1)
    rows = (await db.execute(stmt)).scalars().all()

    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor(offset + limit)

    return rows, next_cursor


async def get_indexed_file_totals(
    db: AsyncSession,
    *,
    prefix: str | None,
    q: str | None,
) -> tuple[int, int]:
    stmt = _apply_file_filters(select(func.count(FileIndex.path), func.coalesce(func.sum(FileIndex.size), 0)), prefix=prefix, q=q)
    count_value, size_value = (await db.execute(stmt)).one()
    return int(count_value or 0), int(size_value or 0)


def _apply_file_filters(stmt, *, prefix: str | None, q: str | None):
    # Hide git attribute helper files from default file listing and totals.
    stmt = stmt.where(FileIndex.path != '.gitattributes')
    stmt = stmt.where(~FileIndex.path.like('%/.gitattributes'))

    if prefix:
        stmt = stmt.where(or_(FileIndex.path == prefix, FileIndex.path.startswith(f'{prefix}/')))
    search = (q or '').strip()
    if search:
        escaped_search = _escape_like_for_ilike(search)
        stmt = stmt.where(FileIndex.path.ilike(f'%{escaped_search}%', escape='\\'))
    return stmt


def _escape_like_for_ilike(value: str) -> str:
    # Escape LIKE wildcards so search works on literal file paths.
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


async def periodic_sync_loop(session_factory, interval_seconds: int) -> None:
    while True:
        try:
            async with session_factory() as db:
                count = await sync_file_index(db)
                logger.info('file index sync complete', extra={'extra': {'count': count}})
        except Exception as exc:
            logger.exception('file index sync failed: %s', exc)
        await asyncio.sleep(interval_seconds)
