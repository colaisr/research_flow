"""add_model_failure_status

Revision ID: 24ed1729fa7e
Revises: ef8c5657bee7
Create Date: 2025-11-15 09:42:03.840835

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '24ed1729fa7e'
down_revision = 'ef8c5657bee7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Modify ENUM to add 'model_failure' status
    # MySQL requires ALTER TABLE to modify ENUM
    op.execute("""
        ALTER TABLE analysis_runs 
        MODIFY COLUMN status ENUM('queued', 'running', 'succeeded', 'failed', 'model_failure') 
        NOT NULL DEFAULT 'queued'
    """)


def downgrade() -> None:
    # Remove 'model_failure' from ENUM
    op.execute("""
        ALTER TABLE analysis_runs 
        MODIFY COLUMN status ENUM('queued', 'running', 'succeeded', 'failed') 
        NOT NULL DEFAULT 'queued'
    """)

