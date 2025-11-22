"""add_tool_id_to_analysis_runs

Revision ID: b8e1ea509028
Revises: 728180b1919f
Create Date: 2025-11-22 10:58:42.530044

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8e1ea509028'
down_revision = '728180b1919f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tool_id column to analysis_runs table
    op.add_column('analysis_runs', sa.Column('tool_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_analysis_runs_tool_id',
        'analysis_runs',
        'user_tools',
        ['tool_id'],
        ['id'],
        ondelete='SET NULL'
    )
    op.create_index(op.f('ix_analysis_runs_tool_id'), 'analysis_runs', ['tool_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_analysis_runs_tool_id'), table_name='analysis_runs')
    op.drop_constraint('fk_analysis_runs_tool_id', 'analysis_runs', type_='foreignkey')
    op.drop_column('analysis_runs', 'tool_id')

