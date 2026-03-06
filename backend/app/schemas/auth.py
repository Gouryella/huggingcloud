from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    username: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    # Keep `email` as a legacy field for existing clients and use
    # `identifier` for username-or-email login.
    identifier: str | None = Field(default=None, min_length=1, max_length=320)
    email: str | None = Field(default=None, min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=256)
    persist_session: bool | None = None

    @model_validator(mode='after')
    def ensure_identifier(self) -> 'LoginRequest':
        if not self.identifier and self.email:
            self.identifier = self.email
        if not self.identifier:
            raise ValueError('identifier or email is required')
        return self


class UpdateMeRequest(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=120)
    avatar_emoji: str | None = Field(default=None, max_length=16)

    @model_validator(mode='after')
    def normalize_username(self) -> 'UpdateMeRequest':
        if self.username is not None:
            normalized = self.username.strip()
            if not normalized:
                raise ValueError('username cannot be empty')
            self.username = normalized
        if self.avatar_emoji is not None:
            normalized_emoji = self.avatar_emoji.strip()
            self.avatar_emoji = normalized_emoji or None
        return self


class UpdatePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)

    @model_validator(mode='after')
    def validate_password_change(self) -> 'UpdatePasswordRequest':
        if self.current_password == self.new_password:
            raise ValueError('new password must be different from current password')
        return self


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str | None
    username: str | None
    avatar_emoji: str | None
    role: UserRole
    is_active: bool
    is_bootstrap: bool
    force_root_admin_setup: bool
    created_at: datetime


class LoginResponse(BaseModel):
    user: UserMe
    session_expires_at: datetime


class LoginOptionsResponse(BaseModel):
    login_persistence_ttl_hours: int
    passkey_enabled: bool = False


class PasskeyOptionsResponse(BaseModel):
    challenge_id: str
    options: dict[str, Any]


class PasskeyAuthenticationOptionsRequest(BaseModel):
    identifier: str | None = Field(default=None, max_length=320)
    allow_non_icloud_fallback: bool = False

    @model_validator(mode='after')
    def normalize_identifier(self) -> 'PasskeyAuthenticationOptionsRequest':
        if self.identifier is not None:
            normalized = self.identifier.strip()
            self.identifier = normalized or None
        return self


class PasskeyRegistrationVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=1, max_length=64)
    credential: dict[str, Any]
    nickname: str | None = Field(default=None, max_length=120)

    @model_validator(mode='after')
    def normalize_nickname(self) -> 'PasskeyRegistrationVerifyRequest':
        if self.nickname is not None:
            trimmed = self.nickname.strip()
            self.nickname = trimmed or None
        return self


class PasskeyAuthenticationVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=1, max_length=64)
    credential: dict[str, Any]
    persist_session: bool | None = None


class PasskeyCredentialInfo(BaseModel):
    credential_id: str
    nickname: str | None = None
    transports: list[str] | None = None
    created_at: datetime
    last_used_at: datetime | None = None
