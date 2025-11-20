"""Change data_cache payload to MEDIUMTEXT

Revision ID: 9963977ecdac
Revises: 98123ae8bfcd
Create Date: 2025-11-11 21:37:03.968747

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9963977ecdac'
down_revision = '98123ae8bfcd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('data_cache', 'payload',
                    existing_type=sa.Text(),
                    type_=sa.Text(length=16777215),  # MEDIUMTEXT in MySQL
                    existing_nullable=False)


def downgrade() -> None:
    op.alter_column('data_cache', 'payload',
                    existing_type=sa.Text(length=16777215),
                    type_=sa.Text(),
                    existing_nullable=False)

