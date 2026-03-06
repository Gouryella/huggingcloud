from __future__ import annotations

from app.api.routes.download import _build_content_disposition


def test_content_disposition_uses_filename_star_and_ascii_fallback() -> None:
    header = _build_content_disposition(path='uploads/你好 world.png', inline=False)
    assert header.startswith('attachment; ')
    assert 'filename="' in header
    assert "filename*=UTF-8''" in header
    assert '%E4%BD%A0%E5%A5%BD%20world.png' in header


def test_content_disposition_sanitizes_control_and_quote_characters() -> None:
    header = _build_content_disposition(path='uploads/a"\r\nb.txt', inline=True)
    assert header.startswith('inline; ')
    assert '\r' not in header
    assert '\n' not in header
    assert 'filename="a___b.txt"' in header
    assert '%0D%0A' in header
