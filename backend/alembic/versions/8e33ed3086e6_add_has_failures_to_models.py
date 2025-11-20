"""add_has_failures_to_models

Revision ID: 8e33ed3086e6
Revises: 24ed1729fa7e
Create Date: 2025-11-15 10:06:51.486658

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8e33ed3086e6'
down_revision = '24ed1729fa7e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add has_failures column to available_models table
    op.add_column('available_models', sa.Column('has_failures', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    # Remove has_failures column
    op.drop_column('available_models', 'has_failures')

