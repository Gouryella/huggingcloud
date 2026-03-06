from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from app.core.security import hmac_sha256, timing_safe_compare


def constraints_hash(payload: dict) -> str:
    stable = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    return hashlib.sha256(stable.encode('utf-8')).hexdigest()


def canonical_string(*, method: str, path: str, sid: str, exp: int, nonce: str, ch: str) -> str:
    return '\n'.join([
        method.upper(),
        path,
        sid,
        str(exp),
        nonce,
        ch,
    ])


def sign_payload(secret: str, *, method: str, path: str, sid: str, exp: int, nonce: str, ch: str) -> str:
    payload = canonical_string(method=method, path=path, sid=sid, exp=exp, nonce=nonce, ch=ch)
    return hmac_sha256(secret, payload)


def verify_signature(
    secret: str,
    *,
    method: str,
    path: str,
    sid: str,
    exp: int,
    nonce: str,
    ch: str,
    sig: str,
) -> bool:
    expected = sign_payload(secret, method=method, path=path, sid=sid, exp=exp, nonce=nonce, ch=ch)
    return timing_safe_compare(expected, sig)


def is_expired(exp: int) -> bool:
    if exp <= 0:
        return False
    now_ts = int(datetime.now(UTC).timestamp())
    return now_ts > exp
