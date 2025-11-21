"""simplify_users_role_to_platform_level_only

Revision ID: 292467e06363
Revises: 74074dffc625
Create Date: 2025-01-21 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '292467e06363'
down_revision = '74074dffc625'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Simplify users.role to platform-level only:
    - 'admin' -> 'admin' (platform admin)
    - 'org_admin' -> 'user' (regular user)
    - 'org_user' -> 'user' (regular user)
    
    Organization-specific roles remain in organization_members.role
    """
    conn = op.get_bind()
    
    # Update all org_admin and org_user to 'user'
    conn.execute(text("""
        UPDATE users 
        SET role = 'user' 
        WHERE role IN ('org_admin', 'org_user')
    """))
    
    # Verify: all non-admin users should now be 'user'
    # (admin users remain 'admin')


def downgrade() -> None:
    """
    Revert to old role system:
    - 'admin' -> 'admin'
    - 'user' -> 'org_admin' (default for regular users)
    
    Note: We cannot restore org_user distinction as it's lost.
    """
    conn = op.get_bind()
    
    # Revert all 'user' back to 'org_admin' (default)
    conn.execute(text("""
        UPDATE users 
        SET role = 'org_admin' 
        WHERE role = 'user'
    """))
