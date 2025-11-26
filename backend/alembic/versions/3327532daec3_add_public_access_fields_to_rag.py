"""add_public_access_fields_to_rag

Revision ID: 3327532daec3
Revises: 6fefc43b07b9
Create Date: 2025-11-26 01:17:23.278140

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3327532daec3'
down_revision = '6fefc43b07b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add public access fields to rag_knowledge_bases table
    op.add_column('rag_knowledge_bases', sa.Column('public_access_token', sa.String(length=64), nullable=True))
    op.add_column('rag_knowledge_bases', sa.Column('public_access_mode', sa.String(length=50), nullable=True))
    op.add_column('rag_knowledge_bases', sa.Column('public_access_enabled', sa.Boolean(), nullable=False, server_default='0'))
    
    # Create unique index on public_access_token
    op.create_index(op.f('ix_rag_knowledge_bases_public_access_token'), 'rag_knowledge_bases', ['public_access_token'], unique=True)


def downgrade() -> None:
    # Remove indexes and columns
    op.drop_index(op.f('ix_rag_knowledge_bases_public_access_token'), table_name='rag_knowledge_bases')
    op.drop_column('rag_knowledge_bases', 'public_access_enabled')
    op.drop_column('rag_knowledge_bases', 'public_access_mode')
    op.drop_column('rag_knowledge_bases', 'public_access_token')

