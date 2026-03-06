from __future__ import annotations

import logging
import secrets

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, now_utc
from app.models import Session, User, UserRole

logger = logging.getLogger(__name__)

DEFAULT_BOOTSTRAP_USERNAME = 'admin'
DEFAULT_BOOTSTRAP_EMAIL = 'admin@local.invalid'
BOOTSTRAP_PASSWORD_TOKEN_BYTES = 18


def _generate_bootstrap_password() -> str:
    # Random one-time password, emitted to logs only on first bootstrap creation.
    return secrets.token_urlsafe(BOOTSTRAP_PASSWORD_TOKEN_BYTES)


async def has_active_root_owner(db: AsyncSession) -> bool:
    owner = (
        await db.execute(
            select(User.id).where(
                User.role == UserRole.owner,
                User.is_active.is_(True),
                User.is_bootstrap.is_(False),
            ).limit(1),
        )
    ).scalar_one_or_none()
    return owner is not None


async def ensure_bootstrap_user(db: AsyncSession) -> None:
    if await has_active_root_owner(db):
        return

    bootstrap = (
        await db.execute(
            select(User).where(User.is_bootstrap.is_(True)).order_by(User.created_at.asc()).limit(1),
        )
    ).scalar_one_or_none()
    if bootstrap:
        changed = False
        if not bootstrap.is_active:
            bootstrap.is_active = True
            changed = True
        if not bootstrap.force_root_admin_setup:
            bootstrap.force_root_admin_setup = True
            changed = True
        if changed:
            await db.commit()

        logger.warning(
            'No root owner found. Existing bootstrap user %s is active and must complete root admin setup.',
            bootstrap.username,
        )
        logger.warning('Bootstrap password is not reset automatically after first creation.')
        return

    bootstrap_password = _generate_bootstrap_password()
    user = User(
        email=DEFAULT_BOOTSTRAP_EMAIL,
        username=DEFAULT_BOOTSTRAP_USERNAME,
        hashed_password=hash_password(bootstrap_password),
        role=UserRole.admin,
        is_active=True,
        is_bootstrap=True,
        force_root_admin_setup=True,
    )
    db.add(user)
    await db.commit()

    logger.warning('===============================================================')
    logger.warning('Bootstrap account created (one-time local setup)')
    logger.warning('username      : %s', DEFAULT_BOOTSTRAP_USERNAME)
    logger.warning('email         : %s', DEFAULT_BOOTSTRAP_EMAIL)
    logger.warning('password      : %s', bootstrap_password)
    logger.warning('This one-time bootstrap password is only printed on first creation.')
    logger.warning('After login you must create root admin in setup flow.')
    logger.warning('===============================================================')


async def create_root_admin_from_bootstrap(
    db: AsyncSession,
    *,
    bootstrap_user: User,
    email: str,
    password: str,
    username: str | None,
) -> User:
    if not bootstrap_user.is_bootstrap or not bootstrap_user.force_root_admin_setup:
        raise ValueError('current user is not an active bootstrap account')

    existing_owner = (
        await has_active_root_owner(db)
    )
    if existing_owner:
        raise ValueError('root admin already exists')

    existing_email = (await db.execute(select(User.id).where(User.email == email).limit(1))).scalar_one_or_none()
    if existing_email:
        raise ValueError('email already exists')

    if username:
        existing_name = (await db.execute(select(User.id).where(User.username == username).limit(1))).scalar_one_or_none()
        if existing_name:
            raise ValueError('username already exists')

    root = User(
        email=email,
        username=username,
        hashed_password=hash_password(password),
        role=UserRole.owner,
        is_active=True,
        is_bootstrap=False,
        force_root_admin_setup=False,
    )
    db.add(root)
    await db.flush()

    bootstrap_user.is_active = False
    bootstrap_user.force_root_admin_setup = False

    await db.execute(
        update(Session)
        .where(Session.user_id == bootstrap_user.id, Session.revoked_at.is_(None))
        .values(revoked_at=now_utc()),
    )

    await db.commit()
    await db.refresh(root)
    return root
