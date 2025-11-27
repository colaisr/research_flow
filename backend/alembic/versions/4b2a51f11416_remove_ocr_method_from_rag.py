"""remove_ocr_method_from_rag

Revision ID: 4b2a51f11416
Revises: 8fc2e34e77c1
Create Date: 2025-11-27 09:07:06.818203

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4b2a51f11416'
down_revision = '8fc2e34e77c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove ocr_method column from rag_knowledge_bases table
    op.drop_column('rag_knowledge_bases', 'ocr_method')


def downgrade() -> None:
    # Add ocr_method column back (for rollback)
    op.add_column('rag_knowledge_bases', 
                  sa.Column('ocr_method', sa.String(length=50), nullable=False, server_default='local'))

