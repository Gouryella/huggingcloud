import pytest
from pydantic import ValidationError

from app.schemas.auth import (
    LoginRequest,
    PasskeyAuthenticationOptionsRequest,
    PasskeyAuthenticationVerifyRequest,
    PasskeyRegistrationVerifyRequest,
    UpdateMeRequest,
    UpdatePasswordRequest,
)


def test_update_me_request_trims_username() -> None:
    payload = UpdateMeRequest(username='  alice  ')
    assert payload.username == 'alice'


def test_update_me_request_rejects_blank_username() -> None:
    with pytest.raises(ValidationError):
        UpdateMeRequest(username='   ')


def test_update_me_request_accepts_avatar_only() -> None:
    payload = UpdateMeRequest(avatar_emoji='😀')
    assert payload.username is None
    assert payload.avatar_emoji == '😀'


def test_update_me_request_normalizes_avatar_emoji_blank_to_none() -> None:
    payload = UpdateMeRequest(avatar_emoji='   ')
    assert payload.avatar_emoji is None


def test_update_password_request_rejects_same_password() -> None:
    with pytest.raises(ValidationError):
        UpdatePasswordRequest(current_password='password123', new_password='password123')


def test_login_request_accepts_persist_session() -> None:
    payload = LoginRequest(identifier='alice', password='secret', persist_session=False)
    assert payload.identifier == 'alice'
    assert payload.persist_session is False


def test_login_request_falls_back_to_email_identifier() -> None:
    payload = LoginRequest(email='alice@example.com', password='secret')
    assert payload.identifier == 'alice@example.com'


def test_passkey_registration_verify_request_trims_nickname() -> None:
    payload = PasskeyRegistrationVerifyRequest(
        challenge_id='challenge-id',
        credential={'id': 'credential-id', 'response': {}},
        nickname='  laptop  ',
    )
    assert payload.nickname == 'laptop'


def test_passkey_authentication_verify_request_accepts_persist_session() -> None:
    payload = PasskeyAuthenticationVerifyRequest(
        challenge_id='challenge-id',
        credential={'id': 'credential-id', 'response': {}},
        persist_session=False,
    )
    assert payload.persist_session is False


def test_passkey_authentication_options_request_normalizes_identifier() -> None:
    payload = PasskeyAuthenticationOptionsRequest(identifier='  alice  ', allow_non_icloud_fallback=True)
    assert payload.identifier == 'alice'
    assert payload.allow_non_icloud_fallback is True


def test_passkey_authentication_options_request_allows_identifier_omitted() -> None:
    payload = PasskeyAuthenticationOptionsRequest()
    assert payload.identifier is None
