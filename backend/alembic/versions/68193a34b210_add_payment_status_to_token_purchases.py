"""add_payment_status_to_token_purchases

Revision ID: 68193a34b210
Revises: a1b2c3d4e5f7
Create Date: 2026-01-20 10:54:30.613585

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '68193a34b210'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add payment tracking fields to token_purchases table
    op.add_column('token_purchases', sa.Column('payment_status', sa.String(length=50), nullable=True, server_default='pending'))
    op.add_column('token_purchases', sa.Column('payment_id', sa.String(length=255), nullable=True))
    op.add_column('token_purchases', sa.Column('payment_url', sa.String(length=500), nullable=True))
    op.add_column('token_purchases', sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('token_purchases', sa.Column('payment_error', sa.Text(), nullable=True))
    
    # Create index on payment_status for faster queries
    op.create_index('idx_payment_status', 'token_purchases', ['payment_status'], unique=False)
    op.create_index('idx_payment_id', 'token_purchases', ['payment_id'], unique=False)


def downgrade() -> None:
    # Remove indexes
    op.drop_index('idx_payment_id', table_name='token_purchases')
    op.drop_index('idx_payment_status', table_name='token_purchases')
    
    # Remove payment tracking columns
    op.drop_column('token_purchases', 'payment_error')
    op.drop_column('token_purchases', 'paid_at')
    op.drop_column('token_purchases', 'payment_url')
    op.drop_column('token_purchases', 'payment_id')
    op.drop_column('token_purchases', 'payment_status')

