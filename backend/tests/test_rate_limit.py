from __future__ import annotations

import pytest

from app.services.cache import InMemoryCache
from app.services.rate_limit import ConcurrencyLimitExceeded, concurrent_download_guard


@pytest.mark.asyncio
async def test_concurrent_download_guard_raises_specific_exception() -> None:
    cache = InMemoryCache()

    async with concurrent_download_guard(cache, 'share-1', 1):
        with pytest.raises(ConcurrencyLimitExceeded):
            async with concurrent_download_guard(cache, 'share-1', 1):
                raise AssertionError('guard should have failed before entering context')

    # After outer scope exits, lock should be released and guard should succeed again.
    async with concurrent_download_guard(cache, 'share-1', 1):
        pass
