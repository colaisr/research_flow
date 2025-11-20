"""add_is_enabled_to_instruments

Revision ID: 9e981001da58
Revises: 4b8530710f48
Create Date: 2025-11-13 00:41:01.120009

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9e981001da58'
down_revision = '4b8530710f48'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_enabled column with default True for existing records
    op.add_column('instruments', sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='1'))


def downgrade() -> None:
    op.drop_column('instruments', 'is_enabled')

