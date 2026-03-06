from __future__ import annotations

import asyncio
import time
from typing import Protocol


class CacheClient(Protocol):
    async def get(self, key: str) -> str | None: ...

    async def setex(self, key: str, ttl_seconds: int, value: str) -> object: ...

    async def delete(self, key: str) -> object: ...

    async def incr(self, key: str) -> int: ...

    async def decr(self, key: str) -> int: ...

    async def expire(self, key: str, ttl_seconds: int) -> object: ...

    async def close(self) -> object: ...


class InMemoryCache:
    """Fallback cache for local development when Redis is unavailable.

    This is process-local and non-distributed by design.
    """

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float | None]] = {}
        self._lock = asyncio.Lock()

    def _now(self) -> float:
        return time.time()

    def _is_expired(self, expires_at: float | None) -> bool:
        return expires_at is not None and expires_at <= self._now()

    async def _prune_if_needed(self, key: str) -> None:
        entry = self._data.get(key)
        if entry is None:
            return
        _, expires_at = entry
        if self._is_expired(expires_at):
            self._data.pop(key, None)

    async def get(self, key: str) -> str | None:
        async with self._lock:
            await self._prune_if_needed(key)
            entry = self._data.get(key)
            if entry is None:
                return None
            return entry[0]

    async def setex(self, key: str, ttl_seconds: int, value: str) -> bool:
        async with self._lock:
            expires_at = self._now() + ttl_seconds
            self._data[key] = (str(value), expires_at)
            return True

    async def delete(self, key: str) -> int:
        async with self._lock:
            existed = key in self._data
            self._data.pop(key, None)
            return 1 if existed else 0

    async def incr(self, key: str) -> int:
        async with self._lock:
            await self._prune_if_needed(key)
            entry = self._data.get(key)
            if entry is None:
                value = 1
                expires_at = None
            else:
                raw, expires_at = entry
                try:
                    value = int(raw) + 1
                except ValueError:
                    value = 1
            self._data[key] = (str(value), expires_at)
            return value

    async def decr(self, key: str) -> int:
        async with self._lock:
            await self._prune_if_needed(key)
            entry = self._data.get(key)
            if entry is None:
                value = -1
                expires_at = None
            else:
                raw, expires_at = entry
                try:
                    value = int(raw) - 1
                except ValueError:
                    value = -1
            self._data[key] = (str(value), expires_at)
            return value

    async def expire(self, key: str, ttl_seconds: int) -> bool:
        async with self._lock:
            await self._prune_if_needed(key)
            entry = self._data.get(key)
            if entry is None:
                return False
            value, _ = entry
            self._data[key] = (value, self._now() + ttl_seconds)
            return True

    async def close(self) -> bool:
        async with self._lock:
            self._data.clear()
            return True
