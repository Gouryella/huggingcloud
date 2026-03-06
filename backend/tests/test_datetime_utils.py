from datetime import UTC, datetime

from app.core.security import as_utc


def test_as_utc_keeps_aware_utc() -> None:
    aware = datetime(2026, 3, 2, 12, 0, 0, tzinfo=UTC)
    converted = as_utc(aware)
    assert converted.tzinfo is not None
    assert converted == aware


def test_as_utc_normalizes_naive_as_utc() -> None:
    naive = datetime(2026, 3, 2, 12, 0, 0)
    converted = as_utc(naive)
    assert converted.tzinfo is not None
    assert converted.tzinfo == UTC
    assert converted.hour == 12

