from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.link_service import build_share_signature_fields, build_signed_share_url, share_exp_param
from app.services.security_settings import get_runtime_signing_secret
from app.services.signer import verify_signature


def test_share_exp_param_supports_permanent_timestamp() -> None:
    assert share_exp_param(datetime(9999, 12, 31, 23, 59, 59, tzinfo=UTC)) == 0
    assert share_exp_param(datetime(2030, 1, 1, tzinfo=UTC)) > 0


def test_build_share_signature_fields_roundtrip() -> None:
    signing_secret = get_runtime_signing_secret()
    share = SimpleNamespace(
        id='sid-1',
        path='uploads/demo.gif',
        token_nonce='nonce-1',
        expires_at=datetime(9999, 12, 31, 23, 59, 59, tzinfo=UTC),
        max_downloads=None,
        one_time=False,
        ip_allowlist=None,
        speed_limit_mbps=None,
    )
    exp, ch, sig = build_share_signature_fields(share, method='GET')

    assert exp == 0
    assert verify_signature(
        signing_secret,
        method='GET',
        path=share.path,
        sid=share.id,
        exp=exp,
        nonce=share.token_nonce,
        ch=ch,
        sig=sig,
    )


def test_build_signed_share_url_encodes_repo_path() -> None:
    share = SimpleNamespace(
        id='sid-2',
        path='uploads/model v1/#weights?.bin',
        token_nonce='nonce-2',
        expires_at=datetime(9999, 12, 31, 23, 59, 59, tzinfo=UTC),
        max_downloads=None,
        one_time=False,
        ip_allowlist=None,
        speed_limit_mbps=None,
    )
    url = build_signed_share_url(share, method='GET', base_url='https://files.example.com')
    assert '/dl/uploads/model%20v1/%23weights%3F.bin' in url
