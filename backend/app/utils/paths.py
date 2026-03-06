from __future__ import annotations

import posixpath
from urllib.parse import unquote


class PathValidationError(ValueError):
    pass


def _contains_control_chars(value: str) -> bool:
    return any(ord(ch) < 32 or ord(ch) == 127 for ch in value)


def _contains_disallowed_quotes(value: str) -> bool:
    return '"' in value or "'" in value


def normalize_repo_path(raw_path: str) -> str:
    if raw_path is None:
        raise PathValidationError('path is required')

    decoded = unquote(raw_path).strip()
    if not decoded:
        raise PathValidationError('path cannot be empty')
    if _contains_control_chars(decoded):
        raise PathValidationError('path contains invalid control characters')
    if _contains_disallowed_quotes(decoded):
        raise PathValidationError('path contains invalid quote characters')

    norm = posixpath.normpath(decoded.replace('\\', '/'))
    norm = norm.lstrip('/')

    if norm in {'', '.'}:
        raise PathValidationError('path cannot be empty')

    if norm.startswith('../') or '/..' in norm or norm == '..':
        raise PathValidationError('path traversal is not allowed')

    if '//' in norm:
        norm = norm.replace('//', '/')

    return norm


def _normalize_prefixes(prefixes: list[str]) -> tuple[bool, list[str]]:
    wildcard = False
    normalized: list[str] = []
    for raw_prefix in prefixes:
        if raw_prefix is None:
            continue
        prefix = str(raw_prefix).strip()
        if not prefix:
            continue
        if prefix in {'*', '/', './'}:
            wildcard = True
            continue
        compact = prefix.replace('\\', '/').strip('/')
        if not compact:
            wildcard = True
            continue
        normalized.append(compact)
    return wildcard, normalized


def is_allowed_prefix(path: str, allow_prefixes: list[str]) -> bool:
    wildcard, normalized_prefixes = _normalize_prefixes(allow_prefixes)
    if wildcard:
        return True
    if not normalized_prefixes:
        return True
    return any(path == p or path.startswith(f'{p}/') for p in normalized_prefixes)


def is_blocked_prefix(path: str, block_prefixes: list[str]) -> bool:
    wildcard, normalized_prefixes = _normalize_prefixes(block_prefixes)
    if wildcard:
        return True
    if not normalized_prefixes:
        return False
    return any(path == p or path.startswith(f'{p}/') for p in normalized_prefixes)
