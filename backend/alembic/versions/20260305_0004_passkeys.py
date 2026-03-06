"""add passkey credentials and challenge tables"""

from alembic import op
import sqlalchemy as sa


revision = '20260305_0004'
down_revision = '20260304_0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    passkey_challenge_flow = sa.Enum('registration', 'authentication', name='passkeychallengeflow')
    passkey_challenge_flow.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'passkey_credentials',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('credential_id', sa.String(length=1024), nullable=False, unique=True),
        sa.Column('public_key', sa.Text(), nullable=False),
        sa.Column('sign_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('transports', sa.JSON(), nullable=True),
        sa.Column('nickname', sa.String(length=120), nullable=True),
        sa.Column('device_type', sa.String(length=32), nullable=True),
        sa.Column('backed_up', sa.Boolean(), nullable=True),
        sa.Column('aaguid', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_passkey_credentials_user_id', 'passkey_credentials', ['user_id'])

    op.create_table(
        'passkey_challenges',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('challenge', sa.String(length=1024), nullable=False),
        sa.Column('flow', passkey_challenge_flow, nullable=False),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_passkey_challenges_user_id', 'passkey_challenges', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_passkey_challenges_user_id', table_name='passkey_challenges')
    op.drop_table('passkey_challenges')

    op.drop_index('ix_passkey_credentials_user_id', table_name='passkey_credentials')
    op.drop_table('passkey_credentials')

    passkey_challenge_flow = sa.Enum('registration', 'authentication', name='passkeychallengeflow')
    passkey_challenge_flow.drop(op.get_bind(), checkfirst=True)
