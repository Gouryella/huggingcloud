from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


def now_utc() -> datetime:
    return datetime.now(UTC)


def as_utc(dt: datetime) -> datetime:
    """Normalize potentially naive datetimes to UTC-aware values."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def generate_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def expire_at(seconds: int) -> datetime:
    return now_utc() + timedelta(seconds=seconds)


def hmac_sha256(secret: str, payload: str) -> str:
    digest = hmac.new(secret.encode('utf-8'), payload.encode('utf-8'), hashlib.sha256).digest()
    return digest.hex()


def timing_safe_compare(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
