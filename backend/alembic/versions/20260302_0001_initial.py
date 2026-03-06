"""initial schema"""

from alembic import op
import sqlalchemy as sa


revision = '20260302_0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role = sa.Enum('owner', 'admin', 'member', 'viewer', name='userrole')
    upload_status = sa.Enum('pending', 'uploading', 'committing', 'completed', 'failed', name='uploadstatus')

    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('email', sa.String(length=320), unique=True, nullable=True),
        sa.Column('username', sa.String(length=120), unique=True, nullable=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=True),
        sa.Column('role', user_role, nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_bootstrap', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('force_root_admin_setup', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'auth_identities',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('provider_user_id', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('provider', 'provider_user_id', name='uq_provider_identity'),
    )

    op.create_table(
        'sessions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=64), unique=True, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'acl_rules',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('role', user_role, nullable=False),
        sa.Column('path_prefix', sa.String(length=1024), nullable=False),
        sa.Column('permissions', sa.JSON(), nullable=False),
        sa.Column('allow', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'file_index',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('path', sa.String(length=2048), nullable=False, unique=True),
        sa.Column('size', sa.BigInteger(), nullable=True),
        sa.Column('mime', sa.String(length=255), nullable=True),
        sa.Column('etag', sa.String(length=255), nullable=True),
        sa.Column('sha256', sa.String(length=128), nullable=True),
        sa.Column('last_modified', sa.DateTime(timezone=True), nullable=True),
        sa.Column('indexed_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_file_index_path', 'file_index', ['path'], unique=True)

    op.create_table(
        'share_links',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('path', sa.String(length=2048), nullable=False),
        sa.Column('created_by', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_nonce', sa.String(length=128), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_downloads', sa.Integer(), nullable=True),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('one_time', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('ip_allowlist', sa.JSON(), nullable=True),
        sa.Column('speed_limit_mbps', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_share_links_path', 'share_links', ['path'])

    op.create_table(
        'download_events',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('share_link_id', sa.String(length=36), sa.ForeignKey('share_links.id', ondelete='SET NULL')),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('path', sa.String(length=2048), nullable=False),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.Column('bytes_sent', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('range_header', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'upload_sessions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('path', sa.String(length=2048), nullable=False),
        sa.Column('size', sa.BigInteger(), nullable=False),
        sa.Column('chunk_size', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(length=128), nullable=True),
        sa.Column('status', upload_status, nullable=False),
        sa.Column('received_chunks', sa.JSON(), nullable=False),
        sa.Column('temp_dir', sa.String(length=2048), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('action', sa.String(length=128), nullable=False),
        sa.Column('resource', sa.String(length=512), nullable=False),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'quota_policies',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('role', user_role, nullable=False, unique=True),
        sa.Column('max_file_size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('max_daily_upload_bytes', sa.BigInteger(), nullable=False),
        sa.Column('max_total_upload_bytes', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('quota_policies')
    op.drop_table('audit_logs')
    op.drop_table('upload_sessions')
    op.drop_table('download_events')
    op.drop_index('ix_share_links_path', table_name='share_links')
    op.drop_table('share_links')
    op.drop_index('ix_file_index_path', table_name='file_index')
    op.drop_table('file_index')
    op.drop_table('acl_rules')
    op.drop_table('sessions')
    op.drop_table('auth_identities')
    op.drop_table('users')

    upload_status = sa.Enum('pending', 'uploading', 'committing', 'completed', 'failed', name='uploadstatus')
    user_role = sa.Enum('owner', 'admin', 'member', 'viewer', name='userrole')
    upload_status.drop(op.get_bind(), checkfirst=True)
    user_role.drop(op.get_bind(), checkfirst=True)
