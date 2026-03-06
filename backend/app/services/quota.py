from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import QuotaPolicy, UploadSession, UploadStatus, UserRole


async def ensure_default_quota_policies(db: AsyncSession) -> None:
    exists = (await db.execute(select(QuotaPolicy.id).limit(1))).scalar_one_or_none()
    if exists:
        return

    settings = get_settings()
    defaults = {
        UserRole.owner: QuotaPolicy(
            role=UserRole.owner,
            max_file_size_bytes=settings.max_file_size_bytes * 10,
            max_daily_upload_bytes=settings.max_daily_upload_bytes * 10,
            max_total_upload_bytes=None,
        ),
        UserRole.admin: QuotaPolicy(
            role=UserRole.admin,
            max_file_size_bytes=settings.max_file_size_bytes * 5,
            max_daily_upload_bytes=settings.max_daily_upload_bytes * 5,
            max_total_upload_bytes=None,
        ),
        UserRole.member: QuotaPolicy(
            role=UserRole.member,
            max_file_size_bytes=settings.max_file_size_bytes,
            max_daily_upload_bytes=settings.max_daily_upload_bytes,
            max_total_upload_bytes=None,
        ),
        UserRole.viewer: QuotaPolicy(
            role=UserRole.viewer,
            max_file_size_bytes=0,
            max_daily_upload_bytes=0,
            max_total_upload_bytes=0,
        ),
    }
    db.add_all(defaults.values())
    await db.commit()


async def validate_upload_quota(db: AsyncSession, *, user_id: str, role: UserRole, file_size: int) -> None:
    policy = (await db.execute(select(QuotaPolicy).where(QuotaPolicy.role == role))).scalar_one_or_none()
    if not policy:
        raise ValueError('quota policy not found')

    if file_size > policy.max_file_size_bytes:
        raise ValueError('file exceeds max_file_size_bytes quota')

    today = datetime.now(UTC).date()
    used_today = (
        await db.execute(
            select(func.coalesce(func.sum(UploadSession.size), 0)).where(
                UploadSession.user_id == user_id,
                UploadSession.status == UploadStatus.completed,
                func.date(UploadSession.completed_at) == today,
            ),
        )
    ).scalar_one()

    if (used_today or 0) + file_size > policy.max_daily_upload_bytes:
        raise ValueError('daily upload quota exceeded')
