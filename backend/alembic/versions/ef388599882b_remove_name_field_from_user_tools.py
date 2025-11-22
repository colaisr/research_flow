"""remove_name_field_from_user_tools

Revision ID: ef388599882b
Revises: b8e1ea509028
Create Date: 2025-11-22 11:04:15.127541

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ef388599882b'
down_revision = 'b8e1ea509028'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop name column from user_tools table
    op.drop_column('user_tools', 'name')


def downgrade() -> None:
    # Re-add name column (nullable for backward compatibility)
    op.add_column('user_tools', sa.Column('name', sa.String(255), nullable=True))

