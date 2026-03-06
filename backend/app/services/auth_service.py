from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import as_utc, expire_at, generate_token, hash_password, hash_token, now_utc, verify_password
from app.models import Session, User, UserRole
from app.services.cache import CacheClient


class AuthService:
    def __init__(self, db: AsyncSession, redis: CacheClient) -> None:
        self.db = db
        self.redis = redis
        self.settings = get_settings()

    async def register_local(self, *, email: str, password: str, username: str | None = None) -> User:
        existing = (await self.db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            raise ValueError('email already exists')

        role = UserRole.member
        user_count = (await self.db.execute(select(User.id).limit(1))).scalar_one_or_none()
        if user_count is None:
            role = UserRole.owner

        user = User(
            email=email,
            username=username,
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def login_local(self, *, identifier: str, password: str) -> User:
        user = (
            await self.db.execute(
                select(User).where(
                    or_(
                        User.email == identifier,
                        User.username == identifier,
                    ),
                ),
            )
        ).scalar_one_or_none()
        if not user or not user.hashed_password:
            raise ValueError('invalid credentials')
        if not verify_password(password, user.hashed_password):
            raise ValueError('invalid credentials')
        if not user.is_active:
            raise ValueError('user is disabled')
        return user

    async def create_session(self, user: User, *, ttl_seconds: int | None = None) -> tuple[str, Session]:
        effective_ttl = ttl_seconds if (ttl_seconds is not None and ttl_seconds > 0) else self.settings.session_ttl_seconds
        raw_token = generate_token()
        session = Session(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=expire_at(effective_ttl),
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return raw_token, session

    async def revoke_session(self, token: str) -> None:
        token_h = hash_token(token)
        session = (await self.db.execute(select(Session).where(Session.token_hash == token_h))).scalar_one_or_none()
        if not session:
            return
        session.revoked_at = now_utc()
        await self.db.commit()

    async def get_user_from_session_token(self, token: str | None) -> User | None:
        if not token:
            return None
        token_h = hash_token(token)
        session = (await self.db.execute(select(Session).where(Session.token_hash == token_h))).scalar_one_or_none()
        if not session:
            return None
        if session.revoked_at is not None:
            return None
        if as_utc(session.expires_at) < now_utc():
            return None
        user = (await self.db.execute(select(User).where(User.id == session.user_id))).scalar_one_or_none()
        if not user or not user.is_active:
            return None
        return user
