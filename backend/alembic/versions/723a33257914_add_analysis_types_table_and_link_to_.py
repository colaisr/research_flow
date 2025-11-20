"""Add analysis_types table and link to analysis_runs

Revision ID: 723a33257914
Revises: 9963977ecdac
Create Date: 2025-11-11 22:12:54.868573

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '723a33257914'
down_revision = '9963977ecdac'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create analysis_types table
    op.create_table(
        'analysis_types',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('version', sa.String(length=20), nullable=True),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('is_active', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_analysis_types_id'), 'analysis_types', ['id'], unique=False)
    
    # Add analysis_type_id to analysis_runs
    op.add_column('analysis_runs', sa.Column('analysis_type_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_analysis_runs_analysis_type_id',
        'analysis_runs', 'analysis_types',
        ['analysis_type_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_analysis_runs_analysis_type_id', 'analysis_runs', type_='foreignkey')
    op.drop_column('analysis_runs', 'analysis_type_id')
    op.drop_index(op.f('ix_analysis_types_id'), table_name='analysis_types')
    op.drop_table('analysis_types')

