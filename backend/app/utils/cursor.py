from __future__ import annotations

import base64


def encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode('utf-8')).decode('ascii')


def decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        value = base64.urlsafe_b64decode(cursor.encode('ascii')).decode('utf-8')
        parsed = int(value)
        return max(parsed, 0)
    except Exception:
        return 0
