"""add_ocr_method_to_rag

Revision ID: 8fc2e34e77c1
Revises: 7f1937ceaf66
Create Date: 2025-11-27 07:48:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8fc2e34e77c1'
down_revision = '7f1937ceaf66'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add ocr_method column to rag_knowledge_bases table
    op.add_column('rag_knowledge_bases', 
                  sa.Column('ocr_method', sa.String(length=50), nullable=False, server_default='local'))


def downgrade() -> None:
    # Remove ocr_method column
    op.drop_column('rag_knowledge_bases', 'ocr_method')
