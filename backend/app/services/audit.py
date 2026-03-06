from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def log_audit(
    db: AsyncSession,
    *,
    action: str,
    resource: str,
    user_id: str | None,
    ip: str | None,
    metadata: dict | None = None,
) -> None:
    entry = AuditLog(
        action=action,
        resource=resource,
        user_id=user_id,
        ip=ip,
        metadata_json=metadata or {},
    )
    db.add(entry)
    await db.commit()
