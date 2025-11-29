"""add_cancelled_reason_to_subscriptions

Revision ID: bbf9b5bfbae2
Revises: 81a7d4759088
Create Date: 2025-11-28 09:02:45.960261

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'bbf9b5bfbae2'
down_revision = '81a7d4759088'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add cancelled_reason column to user_subscriptions table
    op.add_column('user_subscriptions', sa.Column('cancelled_reason', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove cancelled_reason column from user_subscriptions table
    op.drop_column('user_subscriptions', 'cancelled_reason')

