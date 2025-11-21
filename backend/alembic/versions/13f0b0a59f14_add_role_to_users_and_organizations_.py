"""add_role_to_users_and_organizations_tables

Revision ID: 13f0b0a59f14
Revises: 62681ea9e3d9
Create Date: 2025-11-21 12:25:33.733233

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '13f0b0a59f14'
down_revision = '62681ea9e3d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Check if organizations table exists
    result = conn.execute(text("SHOW TABLES LIKE 'organizations'"))
    org_table_exists = result.fetchone() is not None
    
    # Create organizations table if it doesn't exist
    if not org_table_exists:
        op.create_table(
            'organizations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('slug', sa.String(255), nullable=True),
            sa.Column('owner_id', sa.Integer(), nullable=True),
            sa.Column('is_personal', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name='fk_organizations_owner_id'),
        )
        op.create_index('ix_organizations_owner_id', 'organizations', ['owner_id'])
        op.create_index('ix_organizations_slug', 'organizations', ['slug'], unique=True)
    
    # Check if organization_members table exists
    result = conn.execute(text("SHOW TABLES LIKE 'organization_members'"))
    org_members_table_exists = result.fetchone() is not None
    
    # Create organization_members table if it doesn't exist
    if not org_members_table_exists:
        op.create_table(
            'organization_members',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('organization_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('role', sa.String(50), nullable=False),  # 'org_admin' or 'org_user'
            sa.Column('invited_by', sa.Integer(), nullable=True),
            sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name='fk_organization_members_organization_id'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_organization_members_user_id'),
            sa.ForeignKeyConstraint(['invited_by'], ['users.id'], name='fk_organization_members_invited_by'),
            sa.UniqueConstraint('organization_id', 'user_id', name='uq_organization_members_org_user'),
        )
        op.create_index('ix_organization_members_organization_id', 'organization_members', ['organization_id'])
        op.create_index('ix_organization_members_user_id', 'organization_members', ['user_id'])
    
    # Check if role column exists
    result = conn.execute(text("SHOW COLUMNS FROM users LIKE 'role'"))
    role_column_exists = result.fetchone() is not None
    
    # Add role column to users table if it doesn't exist
    if not role_column_exists:
        op.add_column('users', sa.Column('role', sa.String(50), nullable=True))
        
        # Migrate existing data: is_admin=True -> role='admin', is_admin=False -> role='org_admin'
        conn.execute(text("UPDATE users SET role = 'admin' WHERE is_admin = 1"))
        conn.execute(text("UPDATE users SET role = 'org_admin' WHERE is_admin = 0 OR is_admin IS NULL"))
        
        # Make role NOT NULL after migration (MySQL requires type specification)
        op.alter_column('users', 'role',
                        existing_type=sa.String(50),
                        nullable=False)
    else:
        # Column exists, just ensure data is migrated
        conn.execute(text("UPDATE users SET role = 'admin' WHERE is_admin = 1 AND (role IS NULL OR role != 'admin')"))
        conn.execute(text("UPDATE users SET role = 'org_admin' WHERE (is_admin = 0 OR is_admin IS NULL) AND (role IS NULL OR role = '')"))


def downgrade() -> None:
    # Remove role column from users
    op.drop_column('users', 'role')
    
    # Drop organization_members table
    op.drop_table('organization_members')
    
    # Drop organizations table
    op.drop_table('organizations')

