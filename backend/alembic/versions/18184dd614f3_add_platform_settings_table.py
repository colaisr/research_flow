"""add_platform_settings_table

Revision ID: 18184dd614f3
Revises: 13f0b0a59f14
Create Date: 2025-11-21 12:26:22.941223

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '18184dd614f3'
down_revision = '13f0b0a59f14'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Check if platform_settings table exists
    result = conn.execute(text("SHOW TABLES LIKE 'platform_settings'"))
    table_exists = result.fetchone() is not None
    
    # Create platform_settings table if it doesn't exist
    if not table_exists:
        op.create_table(
            'platform_settings',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('key', sa.String(255), nullable=False, unique=True),
            sa.Column('value', sa.Text(), nullable=False),  # JSON stored as text
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_platform_settings_key', 'platform_settings', ['key'], unique=True)
    
    # Seed initial settings (only if they don't exist)
    initial_settings = [
        ('allow_public_registration', 'true'),
        ('default_user_role', 'user'),
    ]
    
    for key, value in initial_settings:
        # Check if setting already exists
        result = conn.execute(
            text("SELECT COUNT(*) FROM platform_settings WHERE `key` = :key"),
            {"key": key}
        )
        exists = result.scalar() > 0
        
        if not exists:
            conn.execute(
                text("INSERT INTO platform_settings (`key`, `value`) VALUES (:key, :value)"),
                {"key": key, "value": value}
            )


def downgrade() -> None:
    op.drop_table('platform_settings')
