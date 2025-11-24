"""add_schedules_table

Revision ID: a1b2c3d4e5f6
Revises: 6234b1e1a62d
Create Date: 2025-11-24 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '6234b1e1a62d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create schedules table
    op.create_table(
        'schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('analysis_type_id', sa.Integer(), nullable=False),
        sa.Column('schedule_type', sa.String(length=20), nullable=False),
        sa.Column('schedule_config', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['analysis_type_id'], ['analysis_types.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_schedules_id'), 'schedules', ['id'], unique=False)
    op.create_index(op.f('ix_schedules_user_id'), 'schedules', ['user_id'], unique=False)
    op.create_index(op.f('ix_schedules_organization_id'), 'schedules', ['organization_id'], unique=False)
    op.create_index(op.f('ix_schedules_analysis_type_id'), 'schedules', ['analysis_type_id'], unique=False)
    op.create_index(op.f('ix_schedules_is_active'), 'schedules', ['is_active'], unique=False)
    op.create_index(op.f('ix_schedules_next_run_at'), 'schedules', ['next_run_at'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_schedules_next_run_at'), table_name='schedules')
    op.drop_index(op.f('ix_schedules_is_active'), table_name='schedules')
    op.drop_index(op.f('ix_schedules_analysis_type_id'), table_name='schedules')
    op.drop_index(op.f('ix_schedules_organization_id'), table_name='schedules')
    op.drop_index(op.f('ix_schedules_user_id'), table_name='schedules')
    op.drop_index(op.f('ix_schedules_id'), table_name='schedules')
    
    # Drop table
    op.drop_table('schedules')

