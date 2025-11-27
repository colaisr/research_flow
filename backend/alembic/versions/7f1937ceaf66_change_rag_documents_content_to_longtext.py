"""change_rag_documents_content_to_longtext

Revision ID: 7f1937ceaf66
Revises: 3327532daec3
Create Date: 2025-11-27 07:25:57.864106

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7f1937ceaf66'
down_revision = '3327532daec3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change content column from TEXT to LONGTEXT to support large PDF documents
    # LONGTEXT can store up to 4GB of text (supports documents with tables and structure)
    op.alter_column('rag_documents', 'content',
                    existing_type=sa.Text(),
                    type_=sa.Text(length=4294967295),  # LONGTEXT in MySQL (4GB)
                    existing_nullable=False)


def downgrade() -> None:
    # Revert back to TEXT (65KB limit)
    op.alter_column('rag_documents', 'content',
                    existing_type=sa.Text(length=4294967295),
                    type_=sa.Text(),
                    existing_nullable=False)
