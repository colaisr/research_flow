"""add_settings_tables

Revision ID: adc7809d520e
Revises: 723a33257914
Create Date: 2025-11-11 22:51:36.741360

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = 'adc7809d520e'
down_revision = '723a33257914'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create available_models table
    op.create_table(
        'available_models',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('provider', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('max_tokens', sa.Integer(), nullable=True),
        sa.Column('cost_per_1k_tokens', sa.String(length=50), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_available_models_id'), 'available_models', ['id'], unique=False)
    
    # Create available_data_sources table
    op.create_table(
        'available_data_sources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('supports_crypto', sa.Boolean(), nullable=False),
        sa.Column('supports_stocks', sa.Boolean(), nullable=False),
        sa.Column('supports_forex', sa.Boolean(), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_available_data_sources_id'), 'available_data_sources', ['id'], unique=False)
    
    # Create app_settings table
    op.create_table(
        'app_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_secret', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key')
    )
    op.create_index(op.f('ix_app_settings_id'), 'app_settings', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_app_settings_id'), table_name='app_settings')
    op.drop_table('app_settings')
    op.drop_index(op.f('ix_available_data_sources_id'), table_name='available_data_sources')
    op.drop_table('available_data_sources')
    op.drop_index(op.f('ix_available_models_id'), table_name='available_models')
    op.drop_table('available_models')

