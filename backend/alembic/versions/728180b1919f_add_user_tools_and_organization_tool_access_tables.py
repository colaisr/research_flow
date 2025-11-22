"""add_user_tools_and_organization_tool_access_tables

Revision ID: 728180b1919f
Revises: 060b1fea3a75
Create Date: 2025-11-21 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision = '728180b1919f'
down_revision = '060b1fea3a75'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user_tools table
    op.create_table('user_tools',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('tool_type', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=False),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('is_shared', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_tools_id'), 'user_tools', ['id'], unique=False)
    op.create_index(op.f('ix_user_tools_user_id'), 'user_tools', ['user_id'], unique=False)
    op.create_index(op.f('ix_user_tools_organization_id'), 'user_tools', ['organization_id'], unique=False)
    op.create_index(op.f('ix_user_tools_tool_type'), 'user_tools', ['tool_type'], unique=False)

    # Create organization_tool_access table
    op.create_table('organization_tool_access',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('tool_id', sa.Integer(), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['tool_id'], ['user_tools.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'tool_id', name='uq_organization_tool_access_org_tool')
    )
    op.create_index(op.f('ix_organization_tool_access_id'), 'organization_tool_access', ['id'], unique=False)
    op.create_index(op.f('ix_organization_tool_access_organization_id'), 'organization_tool_access', ['organization_id'], unique=False)
    op.create_index(op.f('ix_organization_tool_access_tool_id'), 'organization_tool_access', ['tool_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_organization_tool_access_tool_id'), table_name='organization_tool_access')
    op.drop_index(op.f('ix_organization_tool_access_organization_id'), table_name='organization_tool_access')
    op.drop_index(op.f('ix_organization_tool_access_id'), table_name='organization_tool_access')
    op.drop_table('organization_tool_access')
    op.drop_index(op.f('ix_user_tools_tool_type'), table_name='user_tools')
    op.drop_index(op.f('ix_user_tools_organization_id'), table_name='user_tools')
    op.drop_index(op.f('ix_user_tools_user_id'), table_name='user_tools')
    op.drop_index(op.f('ix_user_tools_id'), table_name='user_tools')
    op.drop_table('user_tools')


