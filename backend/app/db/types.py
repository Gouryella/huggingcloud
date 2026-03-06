from __future__ import annotations

import json
from typing import Any

from sqlalchemy import Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


class JSONType(TypeDecorator[Any]):
    """Portable JSON storage: JSONB on Postgres, TEXT elsewhere."""

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(JSONB(astext_type=Text()))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect: Dialect):
        if value is None:
            return None
        if dialect.name == 'postgresql':
            return value
        return json.dumps(value, ensure_ascii=True)

    def process_result_value(self, value: Any, dialect: Dialect):
        if value is None:
            return None
        if dialect.name == 'postgresql':
            return value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return value
