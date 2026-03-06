import asyncio

from app.services.cache import InMemoryCache


async def _exercise_cache() -> None:
    cache = InMemoryCache()

    await cache.setex('otp:test@example.com', 1, '123456')
    assert await cache.get('otp:test@example.com') == '123456'

    await asyncio.sleep(1.1)
    assert await cache.get('otp:test@example.com') is None

    assert await cache.incr('counter') == 1
    assert await cache.incr('counter') == 2
    assert await cache.decr('counter') == 1

    assert await cache.expire('counter', 1) is True
    await asyncio.sleep(1.1)
    assert await cache.get('counter') is None


def test_inmemory_cache_roundtrip() -> None:
    asyncio.run(_exercise_cache())
