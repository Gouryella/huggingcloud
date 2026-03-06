from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection


def ensure_runtime_schema(conn: Connection) -> None:
    inspector = inspect(conn)
    table_names = set(inspector.get_table_names())
    if 'users' not in table_names:
        return

    cols = {col['name'] for col in inspector.get_columns('users')}

    if 'is_bootstrap' not in cols:
        conn.execute(text('ALTER TABLE users ADD COLUMN is_bootstrap BOOLEAN NOT NULL DEFAULT 0'))

    if 'force_root_admin_setup' not in cols:
        conn.execute(text('ALTER TABLE users ADD COLUMN force_root_admin_setup BOOLEAN NOT NULL DEFAULT 0'))

    if 'avatar_emoji' not in cols:
        conn.execute(text('ALTER TABLE users ADD COLUMN avatar_emoji VARCHAR(16)'))
