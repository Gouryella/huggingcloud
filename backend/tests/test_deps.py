from __future__ import annotations

from collections.abc import Mapping

from starlette.requests import Request

from app.api.deps import get_client_ip
from app.core.config import get_settings


def _make_request(*, forwarded_for: str | None, client_ip: str, extra_headers: Mapping[str, str] | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if forwarded_for is not None:
        headers.append((b'x-forwarded-for', forwarded_for.encode('utf-8')))
    if extra_headers:
        for key, value in extra_headers.items():
            headers.append((key.lower().encode('utf-8'), value.encode('utf-8')))
    scope = {
        'type': 'http',
        'method': 'GET',
        'path': '/',
        'headers': headers,
        'client': (client_ip, 12345),
    }
    return Request(scope)


def test_get_client_ip_uses_forwarded_header_by_default() -> None:
    request = _make_request(forwarded_for='1.1.1.1, 2.2.2.2', client_ip='9.9.9.9')
    assert get_client_ip(request) == '1.1.1.1'


def test_get_client_ip_can_disable_forwarded_header_explicitly() -> None:
    settings = get_settings()
    previous = settings.trust_x_forwarded_for
    settings.trust_x_forwarded_for = False
    try:
        request = _make_request(forwarded_for='1.1.1.1, 2.2.2.2', client_ip='9.9.9.9')
        assert get_client_ip(request) == '9.9.9.9'
    finally:
        settings.trust_x_forwarded_for = previous


def test_get_client_ip_uses_forwarded_header_when_explicitly_trusted() -> None:
    settings = get_settings()
    previous = settings.trust_x_forwarded_for
    settings.trust_x_forwarded_for = True
    try:
        request = _make_request(forwarded_for='1.1.1.1, 2.2.2.2', client_ip='9.9.9.9')
        assert get_client_ip(request) == '1.1.1.1'
    finally:
        settings.trust_x_forwarded_for = previous


def test_get_client_ip_prefers_cloudflare_header_when_explicitly_trusted() -> None:
    settings = get_settings()
    previous = settings.trust_x_forwarded_for
    settings.trust_x_forwarded_for = True
    try:
        request = _make_request(
            forwarded_for='1.1.1.1, 2.2.2.2',
            client_ip='9.9.9.9',
            extra_headers={'cf-connecting-ip': '8.8.8.8'},
        )
        assert get_client_ip(request) == '8.8.8.8'
    finally:
        settings.trust_x_forwarded_for = previous


def test_get_client_ip_can_disable_cloudflare_header_explicitly() -> None:
    settings = get_settings()
    previous = settings.trust_x_forwarded_for
    settings.trust_x_forwarded_for = False
    try:
        request = _make_request(
            forwarded_for=None,
            client_ip='9.9.9.9',
            extra_headers={'cf-connecting-ip': '8.8.8.8'},
        )
        assert get_client_ip(request) == '9.9.9.9'
    finally:
        settings.trust_x_forwarded_for = previous
