import pytest
from pydantic import ValidationError

from app.schemas.settings import (
    UpdateSystemAuthSettingsRequest,
    UpdateSystemDomainSettingsRequest,
    UpdateSystemHFSettingsRequest,
    UpdateSystemStorageSettingsRequest,
)


def test_update_system_hf_settings_request_trims_fields() -> None:
    payload = UpdateSystemHFSettingsRequest(
        hf_repo_id='  org/repo  ',
        hf_repo_type='dataset',
        hf_revision='  main  ',
        download_mode='redirect',
        hf_token='  hf_xxx  ',
        replace_hf_token=True,
    )

    assert payload.hf_repo_id == 'org/repo'
    assert payload.hf_revision == 'main'
    assert payload.download_mode == 'redirect'
    assert payload.hf_token == 'hf_xxx'


def test_update_system_domain_settings_request_normalizes_urls() -> None:
    payload = UpdateSystemDomainSettingsRequest(
        app_domain='https://files.example.com/',
    )

    assert payload.app_domain == 'https://files.example.com'


def test_update_system_domain_settings_request_ignores_dl_domain() -> None:
    payload = UpdateSystemDomainSettingsRequest(
        app_domain='https://files.example.com/',
        dl_domain='https://download.example.com/',
    )

    assert payload.app_domain == 'https://files.example.com'
    assert not hasattr(payload, 'dl_domain')


def test_update_system_storage_settings_request_accepts_positive_value() -> None:
    payload = UpdateSystemStorageSettingsRequest(private_storage_capacity_gb=100)
    assert payload.private_storage_capacity_gb == 100


def test_update_system_storage_settings_request_rejects_zero() -> None:
    with pytest.raises(ValidationError):
        UpdateSystemStorageSettingsRequest(private_storage_capacity_gb=0)


def test_update_system_auth_settings_request_accepts_positive_hours() -> None:
    payload = UpdateSystemAuthSettingsRequest(login_persistence_ttl_hours=72, passkey_enabled=True)
    assert payload.login_persistence_ttl_hours == 72
    assert payload.passkey_enabled is True


def test_update_system_auth_settings_request_allows_passkey_toggle_omitted() -> None:
    payload = UpdateSystemAuthSettingsRequest(login_persistence_ttl_hours=72)
    assert payload.passkey_enabled is None


def test_update_system_auth_settings_request_rejects_zero() -> None:
    with pytest.raises(ValidationError):
        UpdateSystemAuthSettingsRequest(login_persistence_ttl_hours=0)


def test_update_system_auth_settings_request_rejects_above_max() -> None:
    with pytest.raises(ValidationError):
        UpdateSystemAuthSettingsRequest(login_persistence_ttl_hours=337)
