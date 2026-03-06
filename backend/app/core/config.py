from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=('.env', '../.env'), env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'hf-storage-gateway'
    environment: Literal['dev', 'staging', 'prod'] = 'dev'
    debug: bool = False

    database_url: str = 'sqlite+aiosqlite:///./data/app.db'
    redis_url: str = 'redis://redis:6379/0'
    redis_required: bool = False

    hf_repo_id: str = ''
    hf_repo_type: str = 'dataset'
    hf_revision: str = 'main'
    download_mode: Literal['auto', 'proxy', 'redirect'] = 'auto'
    hf_token: str = ''

    signing_secret: str = 'replace-with-long-random-secret'
    session_ttl_seconds: int = 60 * 60 * 12
    link_default_ttl_seconds: int = 60 * 60

    app_domain: str = 'http://localhost:3000'
    dl_domain: str | None = None

    allow_prefixes: str = '/,private/,share/,public/,uploads/'
    index_sync_interval_seconds: int = 300
    index_sync_enabled: bool = True

    rate_limit_per_minute: int = 120
    concurrent_downloads_per_link: int = 8

    upload_temp_dir: str = '/tmp/hf-gateway-uploads'
    default_chunk_size: int = 5 * 1024 * 1024
    max_file_size_bytes: int = 20 * 1024 * 1024 * 1024
    max_daily_upload_bytes: int = 100 * 1024 * 1024 * 1024
    private_storage_capacity_gb: int = Field(default=100, ge=1)
    private_storage_capacity_bytes_legacy: int | None = Field(default=None, validation_alias='PRIVATE_STORAGE_CAPACITY_BYTES')

    allow_self_register: bool = False

    auth_cookie_name: str = 'session_token'
    auth_cookie_secure: bool = False
    trust_x_forwarded_for: bool = True

    cors_allow_origins: str | None = None

    @model_validator(mode='after')
    def apply_domain_defaults(self):
        app_domain = (self.app_domain or '').strip().rstrip('/')
        if not app_domain:
            app_domain = 'http://localhost:3000'
        self.app_domain = app_domain

        # Download domain is always aligned with app domain.
        self.dl_domain = app_domain

        cors_allow_origins = (self.cors_allow_origins or '').strip()
        self.cors_allow_origins = cors_allow_origins or app_domain
        return self

    @property
    def allow_prefix_list(self) -> list[str]:
        return [p.strip() for p in self.allow_prefixes.split(',') if p.strip()]

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(',') if o.strip()]

    @property
    def private_storage_capacity_bytes(self) -> int:
        # Backward compatible: if legacy bytes env var is present, it overrides GB setting.
        if self.private_storage_capacity_bytes_legacy and self.private_storage_capacity_bytes_legacy > 0:
            return self.private_storage_capacity_bytes_legacy
        return self.private_storage_capacity_gb * 1024 * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
