"""disable_all_instruments_by_default

Revision ID: 491867374311
Revises: 9e981001da58
Create Date: 2025-11-13 00:46:03.140937

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '491867374311'
down_revision = '9e981001da58'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Disable all existing instruments (admin will enable what they need)
    op.execute("UPDATE instruments SET is_enabled = 0")
    
    # Change the default value to False (0) for new instruments
    op.alter_column('instruments', 'is_enabled',
                    server_default='0',
                    existing_nullable=False,
                    existing_type=sa.Boolean())


def downgrade() -> None:
    # Revert default back to True
    op.alter_column('instruments', 'is_enabled',
                    server_default='1',
                    existing_nullable=False,
                    existing_type=sa.Boolean())

