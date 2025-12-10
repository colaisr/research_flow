"""add_process_categories_table

Revision ID: a1b2c3d4e5f7
Revises: 8fc2e34e77c1
Create Date: 2025-12-10 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f7'
down_revision = '5376fd52db07'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create process_categories table
    op.create_table(
        'process_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_process_categories_id'), 'process_categories', ['id'], unique=False)
    op.create_index(op.f('ix_process_categories_organization_id'), 'process_categories', ['organization_id'], unique=False)
    
    # Add category_id to analysis_types
    op.add_column('analysis_types', sa.Column('category_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_analysis_types_category_id',
        'analysis_types',
        'process_categories',
        ['category_id'],
        ['id']
    )
    op.create_index(op.f('ix_analysis_types_category_id'), 'analysis_types', ['category_id'], unique=False)


def downgrade() -> None:
    # Drop category_id from analysis_types
    op.drop_index(op.f('ix_analysis_types_category_id'), table_name='analysis_types')
    op.drop_constraint('fk_analysis_types_category_id', 'analysis_types', type_='foreignkey')
    op.drop_column('analysis_types', 'category_id')
    
    # Drop indexes
    op.drop_index(op.f('ix_process_categories_organization_id'), table_name='process_categories')
    op.drop_index(op.f('ix_process_categories_id'), table_name='process_categories')
    
    # Drop table
    op.drop_table('process_categories')
