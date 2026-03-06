from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_roles
from app.models import AuditLog, User
from app.schemas.audit import AuditListResponse
from app.schemas.common import AuditEntry
from app.utils.cursor import decode_cursor, encode_cursor

router = APIRouter(prefix='/api', tags=['audit'])


@router.get('/audit', response_model=AuditListResponse)
async def list_audit(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db_session),
    _user: User = Depends(require_roles('owner', 'admin')),
):
    offset = decode_cursor(cursor)
    rows = (
        await db.execute(
            select(AuditLog, User.email)
            .outerjoin(User, AuditLog.user_id == User.id)
            .order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(limit + 1),
        )
    ).all()

    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor(offset + limit)

    entries = [
        AuditEntry.model_validate(
            {
                'id': audit_log.id,
                'user_id': audit_log.user_id,
                'user_email': user_email,
                'action': audit_log.action,
                'resource': audit_log.resource,
                'metadata_json': audit_log.metadata_json,
                'ip': audit_log.ip,
                'created_at': audit_log.created_at,
            },
        )
        for audit_log, user_email in rows
    ]

    return AuditListResponse(items=entries, next_cursor=next_cursor)
