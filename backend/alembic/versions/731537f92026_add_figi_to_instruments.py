"""add_figi_to_instruments

Revision ID: 731537f92026
Revises: 491867374311
Create Date: 2025-11-13 01:23:12.494017

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '731537f92026'
down_revision = '491867374311'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add figi column for Tinkoff FIGI identifier (used for MOEX instruments)
    op.add_column('instruments', sa.Column('figi', sa.String(length=50), nullable=True))
    op.create_index(op.f('ix_instruments_figi'), 'instruments', ['figi'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_instruments_figi'), table_name='instruments')
    op.drop_column('instruments', 'figi')

