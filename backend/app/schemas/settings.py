from __future__ import annotations

from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, Field, model_validator


HFRepoType = Literal['dataset', 'model', 'space']
DownloadMode = Literal['auto', 'proxy', 'redirect']


class SystemHFSettingsResponse(BaseModel):
    hf_repo_id: str
    hf_repo_type: HFRepoType
    hf_revision: str
    download_mode: DownloadMode
    has_hf_token: bool
    hf_token_masked: str | None = None


class SystemDomainSettingsResponse(BaseModel):
    app_domain: str
    dl_domain: str
    use_app_domain_for_dl: bool


class SystemStorageSettingsResponse(BaseModel):
    private_storage_capacity_gb: int = Field(ge=1)
    private_storage_capacity_bytes: int = Field(ge=1)


class SystemAuthSettingsResponse(BaseModel):
    login_persistence_ttl_hours: int = Field(ge=1, le=14 * 24)
    passkey_enabled: bool = False


class UpdateSystemDomainSettingsRequest(BaseModel):
    app_domain: AnyHttpUrl

    @model_validator(mode='after')
    def normalize_fields(self) -> 'UpdateSystemDomainSettingsRequest':
        self.app_domain = self.app_domain.unicode_string().rstrip('/')
        return self


class UpdateSystemStorageSettingsRequest(BaseModel):
    private_storage_capacity_gb: int = Field(ge=1, le=1_000_000)


class UpdateSystemAuthSettingsRequest(BaseModel):
    login_persistence_ttl_hours: int = Field(ge=1, le=14 * 24)
    passkey_enabled: bool | None = None


class UpdateSystemHFSettingsRequest(BaseModel):
    hf_repo_id: str = Field(min_length=1, max_length=255)
    hf_repo_type: HFRepoType = 'dataset'
    hf_revision: str = Field(min_length=1, max_length=128)
    download_mode: DownloadMode | None = None
    hf_token: str | None = Field(default=None, max_length=4096)
    replace_hf_token: bool = False

    @model_validator(mode='after')
    def normalize_fields(self) -> 'UpdateSystemHFSettingsRequest':
        self.hf_repo_id = self.hf_repo_id.strip()
        self.hf_revision = self.hf_revision.strip()
        if not self.hf_repo_id:
            raise ValueError('hf_repo_id cannot be empty')
        if not self.hf_revision:
            raise ValueError('hf_revision cannot be empty')
        if self.hf_token is not None:
            self.hf_token = self.hf_token.strip()
        return self
