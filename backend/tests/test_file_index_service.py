from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.models import FileIndex
from app.services import file_index_service


def _to_utc_timestamp(value: datetime) -> float:
    # sqlite may drop tz info when reading DateTime(timezone=True).
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.timestamp()


@pytest.mark.asyncio
async def test_sync_file_index_preserves_indexed_at_for_existing_rows(monkeypatch) -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    original_indexed_at = datetime.now(UTC) - timedelta(days=2)
    async with session_factory() as db:
        db.add(
            FileIndex(
                path='uploads/demo.bin',
                size=1,
                mime='application/octet-stream',
                indexed_at=original_indexed_at,
            ),
        )
        await db.commit()

    async def fake_list_repo_file_entries() -> list[dict[str, int | str | None]]:
        return [{'path': 'uploads/demo.bin', 'size': 2, 'blob_id': 'blob-2'}]

    monkeypatch.setattr(file_index_service.hf_client, 'list_repo_file_entries', fake_list_repo_file_entries)

    try:
        async with session_factory() as db:
            count = await file_index_service.sync_file_index(db)
        assert count == 1

        async with session_factory() as db:
            row = (await db.execute(select(FileIndex).where(FileIndex.path == 'uploads/demo.bin'))).scalar_one()
            assert row.size == 2
            assert row.etag == 'blob-2'
            assert _to_utc_timestamp(row.indexed_at) == pytest.approx(
                _to_utc_timestamp(original_indexed_at),
                abs=1e-3,
            )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_list_and_totals_exclude_gitattributes() -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as db:
        db.add(
            FileIndex(
                path='.gitattributes',
                size=10,
                mime='text/plain',
            ),
        )
        db.add(
            FileIndex(
                path='uploads/.gitattributes',
                size=10,
                mime='text/plain',
            ),
        )
        db.add(
            FileIndex(
                path='uploads/demo.bin',
                size=2,
                mime='application/octet-stream',
            ),
        )
        await db.commit()

    try:
        async with session_factory() as db:
            rows, _next_cursor = await file_index_service.list_indexed_files(
                db,
                prefix=None,
                q=None,
                cursor=None,
                limit=100,
            )
            total_files, total_size_bytes = await file_index_service.get_indexed_file_totals(db, prefix=None, q=None)

        assert [row.path for row in rows] == ['uploads/demo.bin']
        assert total_files == 1
        assert total_size_bytes == 2
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_indexed_file_totals_supports_filtered_and_global_stats() -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as db:
        db.add(
            FileIndex(
                path='uploads/demo.bin',
                size=2,
                mime='application/octet-stream',
            ),
        )
        db.add(
            FileIndex(
                path='private/weights.bin',
                size=5,
                mime='application/octet-stream',
            ),
        )
        await db.commit()

    try:
        async with session_factory() as db:
            uploads_files, uploads_size = await file_index_service.get_indexed_file_totals(db, prefix='uploads', q=None)
            private_files, private_size = await file_index_service.get_indexed_file_totals(db, prefix=None, q='weights')
            all_files, all_size = await file_index_service.get_indexed_file_totals(db, prefix=None, q=None)

        assert uploads_files == 1
        assert uploads_size == 2
        assert private_files == 1
        assert private_size == 5
        assert all_files == 2
        assert all_size == 7
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_list_indexed_files_search_escapes_like_wildcards() -> None:
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as db:
        db.add(
            FileIndex(
                path='uploads/run_1/report.txt',
                size=1,
                mime='text/plain',
            ),
        )
        db.add(
            FileIndex(
                path='uploads/runA1/report.txt',
                size=1,
                mime='text/plain',
            ),
        )
        db.add(
            FileIndex(
                path='uploads/100%real.bin',
                size=1,
                mime='application/octet-stream',
            ),
        )
        db.add(
            FileIndex(
                path='uploads/100xreal.bin',
                size=1,
                mime='application/octet-stream',
            ),
        )
        await db.commit()

    try:
        async with session_factory() as db:
            underscore_rows, _ = await file_index_service.list_indexed_files(
                db,
                prefix=None,
                q='run_1',
                cursor=None,
                limit=100,
            )
            percent_rows, _ = await file_index_service.list_indexed_files(
                db,
                prefix=None,
                q='100%real',
                cursor=None,
                limit=100,
            )

        assert [row.path for row in underscore_rows] == ['uploads/run_1/report.txt']
        assert [row.path for row in percent_rows] == ['uploads/100%real.bin']
    finally:
        await engine.dispose()
