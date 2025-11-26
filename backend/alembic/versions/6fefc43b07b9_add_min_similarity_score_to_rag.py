"""add_min_similarity_score_to_rag

Revision ID: 6fefc43b07b9
Revises: 7216daacb1a8
Create Date: 2025-11-25 23:29:09.273872

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6fefc43b07b9'
down_revision = '7216daacb1a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add min_similarity_score column to rag_knowledge_bases
    op.add_column('rag_knowledge_bases', sa.Column('min_similarity_score', sa.Float(), nullable=True))


def downgrade() -> None:
    # Remove min_similarity_score column
    op.drop_column('rag_knowledge_bases', 'min_similarity_score')

