from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class CreateRootAdminRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=256)
    username: str | None = Field(default=None, max_length=120)


class CreateRootAdminResponse(BaseModel):
    ok: bool
