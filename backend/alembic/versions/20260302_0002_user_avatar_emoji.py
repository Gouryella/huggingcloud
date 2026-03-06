"""add user avatar emoji"""

from alembic import op
import sqlalchemy as sa


revision = '20260302_0002'
down_revision = '20260302_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar_emoji', sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_emoji')
