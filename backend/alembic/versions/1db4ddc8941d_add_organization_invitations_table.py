"""add_organization_invitations_table

Revision ID: 1db4ddc8941d
Revises: 18184dd614f3
Create Date: 2025-11-21 13:11:55.652588

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '1db4ddc8941d'
down_revision = '18184dd614f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Check if organization_invitations table exists
    result = conn.execute(text("SHOW TABLES LIKE 'organization_invitations'"))
    table_exists = result.fetchone() is not None
    
    # Create organization_invitations table if it doesn't exist
    if not table_exists:
        op.create_table(
            'organization_invitations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('organization_id', sa.Integer(), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('token', sa.String(length=255), nullable=False),
            sa.Column('role', sa.String(length=50), nullable=False),
            sa.Column('invited_by', sa.Integer(), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name='fk_organization_invitations_organization_id'),
            sa.ForeignKeyConstraint(['invited_by'], ['users.id'], name='fk_organization_invitations_invited_by'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('token', name='uq_organization_invitations_token')
        )
        op.create_index('ix_organization_invitations_email', 'organization_invitations', ['email'], unique=False)
        op.create_index('ix_organization_invitations_organization_id', 'organization_invitations', ['organization_id'], unique=False)
        op.create_index('ix_organization_invitations_token', 'organization_invitations', ['token'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_organization_invitations_token'), table_name='organization_invitations')
    op.drop_index(op.f('ix_organization_invitations_organization_id'), table_name='organization_invitations')
    op.drop_index(op.f('ix_organization_invitations_email'), table_name='organization_invitations')
    op.drop_table('organization_invitations')

