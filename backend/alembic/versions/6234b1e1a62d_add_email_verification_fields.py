"""add_email_verification_fields

Revision ID: 6234b1e1a62d
Revises: cee937ccf7b2
Create Date: 2025-11-24 11:50:30.673897

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '6234b1e1a62d'
down_revision = 'cee937ccf7b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add email verification fields
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('email_verification_token', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('email_verification_token_expires', sa.DateTime(timezone=True), nullable=True))
    
    # Create index on email_verification_token for faster lookups
    op.create_index('ix_users_email_verification_token', 'users', ['email_verification_token'], unique=False)
    
    # Set existing users as verified (backward compatibility)
    op.execute(sa.text("UPDATE users SET email_verified = 1 WHERE email_verified = 0"))


def downgrade() -> None:
    # Drop index
    op.drop_index('ix_users_email_verification_token', table_name='users')
    
    # Drop columns
    op.drop_column('users', 'email_verification_token_expires')
    op.drop_column('users', 'email_verification_token')
    op.drop_column('users', 'email_verified')

