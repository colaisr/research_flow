"""add_source_name_to_token_consumption

Revision ID: 5376fd52db07
Revises: 4b2a51f11416
Create Date: 2025-11-29 21:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5376fd52db07'
down_revision = 'bbf9b5bfbae2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add source_name column to token_consumption table
    op.add_column('token_consumption', sa.Column('source_name', sa.String(length=255), nullable=True))


def downgrade() -> None:
    # Remove source_name column
    op.drop_column('token_consumption', 'source_name')
