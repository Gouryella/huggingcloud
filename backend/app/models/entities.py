from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import JSONType


def utc_now() -> datetime:
    return datetime.now(UTC)


class UserRole(str, enum.Enum):
    owner = 'owner'
    admin = 'admin'
    member = 'member'
    viewer = 'viewer'


class UploadStatus(str, enum.Enum):
    pending = 'pending'
    uploading = 'uploading'
    committing = 'committing'
    completed = 'completed'
    failed = 'failed'


class PasskeyChallengeFlow(str, enum.Enum):
    registration = 'registration'
    authentication = 'authentication'


class User(Base):
    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str | None] = mapped_column(String(320), unique=True, nullable=True)
    username: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    avatar_emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.member, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_bootstrap: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    force_root_admin_setup: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    identities: Mapped[list['AuthIdentity']] = relationship(back_populates='user', cascade='all, delete-orphan')


class AuthIdentity(Base):
    __tablename__ = 'auth_identities'
    __table_args__ = (UniqueConstraint('provider', 'provider_user_id', name='uq_provider_identity'),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped['User'] = relationship(back_populates='identities')


class Session(Base):
    __tablename__ = 'sessions'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PasskeyCredential(Base):
    __tablename__ = 'passkey_credentials'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    credential_id: Mapped[str] = mapped_column(String(1024), unique=True, nullable=False)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    sign_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    transports: Mapped[list[str] | None] = mapped_column(JSONType(), nullable=True)
    nickname: Mapped[str | None] = mapped_column(String(120), nullable=True)
    device_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    backed_up: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    aaguid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PasskeyChallenge(Base):
    __tablename__ = 'passkey_challenges'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    challenge: Mapped[str] = mapped_column(String(1024), nullable=False)
    flow: Mapped[PasskeyChallengeFlow] = mapped_column(Enum(PasskeyChallengeFlow), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ACLRule(Base):
    __tablename__ = 'acl_rules'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    path_prefix: Mapped[str] = mapped_column(String(1024), nullable=False)
    permissions: Mapped[list[str]] = mapped_column(JSONType(), nullable=False, default=list)
    allow: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class FileIndex(Base):
    __tablename__ = 'file_index'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    path: Mapped[str] = mapped_column(String(2048), unique=True, index=True, nullable=False)
    size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    mime: Mapped[str | None] = mapped_column(String(255), nullable=True)
    etag: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_modified: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    indexed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ShareLink(Base):
    __tablename__ = 'share_links'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    path: Mapped[str] = mapped_column(String(2048), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    token_nonce: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_downloads: Mapped[int | None] = mapped_column(Integer, nullable=True)
    download_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    one_time: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ip_allowlist: Mapped[list[str] | None] = mapped_column(JSONType(), nullable=True)
    speed_limit_mbps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class DownloadEvent(Base):
    __tablename__ = 'download_events'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    share_link_id: Mapped[str | None] = mapped_column(String(36), ForeignKey('share_links.id', ondelete='SET NULL'))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey('users.id', ondelete='SET NULL'))
    path: Mapped[str] = mapped_column(String(2048), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    bytes_sent: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    range_header: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class UploadSession(Base):
    __tablename__ = 'upload_sessions'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    path: Mapped[str] = mapped_column(String(2048), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[UploadStatus] = mapped_column(Enum(UploadStatus), default=UploadStatus.pending, nullable=False)
    received_chunks: Mapped[list[int]] = mapped_column(JSONType(), default=list, nullable=False)
    temp_dir: Mapped[str] = mapped_column(String(2048), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey('users.id', ondelete='SET NULL'))
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    resource: Mapped[str] = mapped_column(String(512), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSONType(), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SystemSetting(Base):
    __tablename__ = 'system_settings'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey('users.id', ondelete='SET NULL'))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class QuotaPolicy(Base):
    __tablename__ = 'quota_policies'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), unique=True, nullable=False)
    max_file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    max_daily_upload_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    max_total_upload_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
