from __future__ import annotations

import json
import logging
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            'ts': datetime.now(UTC).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'msg': record.getMessage(),
        }
        if hasattr(record, 'extra') and isinstance(record.extra, dict):
            payload.update(record.extra)
        return json.dumps(payload, ensure_ascii=True)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
