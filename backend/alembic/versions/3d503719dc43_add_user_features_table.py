"""add_user_features_table

Revision ID: 3d503719dc43
Revises: 409ff6a6997a
Create Date: 2025-11-21 20:43:09.172643

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '3d503719dc43'
down_revision = '409ff6a6997a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Check if user_features table exists
    result = conn.execute(text("SHOW TABLES LIKE 'user_features'"))
    table_exists = result.fetchone() is not None
    
    if not table_exists:
        op.create_table('user_features',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('feature_name', sa.String(length=50), nullable=False),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_user_features_user_id'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id', 'feature_name', name='uq_user_features_user_feature')
        )
        op.create_index('ix_user_features_feature_name', 'user_features', ['feature_name'], unique=False)
        op.create_index('ix_user_features_user_id', 'user_features', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_user_features_user_id', table_name='user_features')
    op.drop_index('ix_user_features_feature_name', table_name='user_features')
    op.drop_table('user_features')

