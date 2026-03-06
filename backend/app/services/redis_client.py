from __future__ import annotations

import logging

from redis.asyncio import Redis

from app.core.config import get_settings
from app.services.cache import CacheClient, InMemoryCache

logger = logging.getLogger(__name__)
_redis: CacheClient | None = None


async def get_redis() -> CacheClient:
    global _redis
    if _redis is None:
        settings = get_settings()
        should_try_redis = bool(settings.redis_url.strip())
        if should_try_redis:
            try:
                client = Redis.from_url(settings.redis_url, decode_responses=True)
                await client.ping()
                _redis = client
                logger.info('Redis connected')
            except Exception as exc:
                if settings.redis_required:
                    raise RuntimeError(f'Redis connection failed and REDIS_REQUIRED=true: {exc}') from exc
                logger.warning('Redis unavailable, falling back to in-memory cache: %s', exc)
                _redis = InMemoryCache()
        else:
            logger.info('REDIS_URL is empty, using in-memory cache')
            _redis = InMemoryCache()
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None
