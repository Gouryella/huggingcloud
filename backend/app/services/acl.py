from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ACLRule, User, UserRole


DEFAULT_ROLE_PERMISSIONS: dict[UserRole, list[str]] = {
    UserRole.owner: ['list', 'download', 'upload', 'delete', 'share', 'admin'],
    UserRole.admin: ['list', 'download', 'upload', 'delete', 'share', 'admin'],
    UserRole.member: ['list', 'download', 'upload', 'delete', 'share'],
    UserRole.viewer: ['list', 'download'],
}


async def ensure_default_acl_rules(db: AsyncSession) -> None:
    count = (await db.execute(select(ACLRule.id).limit(1))).scalar_one_or_none()
    if count:
        return

    defaults = []
    for role, perms in DEFAULT_ROLE_PERMISSIONS.items():
        for prefix in ['private', 'share', 'public', 'uploads']:
            defaults.append(
                ACLRule(role=role, path_prefix=prefix, permissions=perms, allow=True),
            )

    db.add_all(defaults)
    await db.commit()


async def has_permission(db: AsyncSession, user: User, path: str, action: str) -> bool:
    if user.role in {UserRole.owner, UserRole.admin}:
        return True

    rules = (
        await db.execute(
            select(ACLRule).where(ACLRule.role == user.role).order_by(ACLRule.path_prefix.desc()),
        )
    ).scalars().all()

    matched = [r for r in rules if path == r.path_prefix or path.startswith(f'{r.path_prefix}/')]
    if not matched:
        return action in DEFAULT_ROLE_PERMISSIONS.get(user.role, [])

    for rule in matched:
        if action in (rule.permissions or []):
            return bool(rule.allow)

    return False
