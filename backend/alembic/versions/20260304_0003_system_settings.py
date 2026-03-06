"""add system settings table"""

from alembic import op
import sqlalchemy as sa


revision = '20260304_0003'
down_revision = '20260302_0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'system_settings',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('key', sa.String(length=128), nullable=False, unique=True),
        sa.Column('value_text', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_system_settings_key', 'system_settings', ['key'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_system_settings_key', table_name='system_settings')
    op.drop_table('system_settings')

