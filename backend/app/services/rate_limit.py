from __future__ import annotations

import time
from contextlib import asynccontextmanager

from app.services.cache import CacheClient


class ConcurrencyLimitExceeded(RuntimeError):
    pass


async def check_rate_limit(redis: CacheClient, sid: str, limit_per_minute: int) -> bool:
    minute = int(time.time() // 60)
    key = f'rl:{sid}:{minute}'
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, 120)
    return current <= limit_per_minute


@asynccontextmanager
async def concurrent_download_guard(redis: CacheClient, sid: str, max_concurrent: int):
    key = f'conc:{sid}'
    current = await redis.incr(key)
    allowed = current <= max_concurrent
    if not allowed:
        await redis.decr(key)
        raise ConcurrencyLimitExceeded('concurrency limit exceeded')
    try:
        yield
    finally:
        await redis.decr(key)
