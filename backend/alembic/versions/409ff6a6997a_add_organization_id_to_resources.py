"""add_organization_id_to_resources

Revision ID: 409ff6a6997a
Revises: 1db4ddc8941d
Create Date: 2025-11-21 13:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '409ff6a6997a'
down_revision = '1db4ddc8941d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Check if organization_id column exists in analysis_types
    result = conn.execute(text("SHOW COLUMNS FROM analysis_types LIKE 'organization_id'"))
    org_id_exists_analysis_types = result.fetchone() is not None
    
    # Add organization_id to analysis_types (nullable - system pipelines can be NULL)
    if not org_id_exists_analysis_types:
        op.add_column('analysis_types', sa.Column('organization_id', sa.Integer(), nullable=True))
        op.create_index('ix_analysis_types_organization_id', 'analysis_types', ['organization_id'])
        op.create_foreign_key(
            'fk_analysis_types_organization_id',
            'analysis_types', 'organizations',
            ['organization_id'], ['id']
        )
    
    # Check if organization_id column exists in analysis_runs
    result = conn.execute(text("SHOW COLUMNS FROM analysis_runs LIKE 'organization_id'"))
    org_id_exists_analysis_runs = result.fetchone() is not None
    
    # Add organization_id to analysis_runs (nullable initially, will be made NOT NULL after migration)
    if not org_id_exists_analysis_runs:
        op.add_column('analysis_runs', sa.Column('organization_id', sa.Integer(), nullable=True))
        op.create_index('ix_analysis_runs_organization_id', 'analysis_runs', ['organization_id'])
        op.create_foreign_key(
            'fk_analysis_runs_organization_id',
            'analysis_runs', 'organizations',
            ['organization_id'], ['id']
        )
    
    # Migrate existing data: Assign resources to users' personal organizations
    # For analysis_types: Assign user-created analyses (is_system=False and user_id is set) to user's personal org
    conn.execute(text("""
        UPDATE analysis_types at
        INNER JOIN users u ON at.user_id = u.id
        INNER JOIN organizations o ON o.owner_id = u.id AND o.is_personal = 1
        SET at.organization_id = o.id
        WHERE at.is_system = 0 AND at.user_id IS NOT NULL AND at.organization_id IS NULL
    """))
    
    # For analysis_runs: Assign runs based on analysis_type's organization_id
    # If analysis_type has organization_id, use it
    conn.execute(text("""
        UPDATE analysis_runs ar
        INNER JOIN analysis_types at ON ar.analysis_type_id = at.id
        SET ar.organization_id = at.organization_id
        WHERE at.organization_id IS NOT NULL AND ar.organization_id IS NULL
    """))
    
    # For runs without analysis_type or with system analysis_type, assign to user's personal org
    # We need to find the user who created the run - we'll use a default approach
    # Since we don't have a direct user_id on runs, we'll assign orphaned runs to the first admin's personal org
    # Or we can leave them NULL and handle them separately
    
    # For runs that still don't have organization_id, assign to first user's personal org as fallback
    conn.execute(text("""
        UPDATE analysis_runs ar
        INNER JOIN (
            SELECT o.id as org_id
            FROM organizations o
            INNER JOIN users u ON o.owner_id = u.id
            WHERE o.is_personal = 1
            ORDER BY u.id
            LIMIT 1
        ) AS default_org
        SET ar.organization_id = default_org.org_id
        WHERE ar.organization_id IS NULL
    """))
    
    # Now make organization_id NOT NULL for analysis_runs
    # First, ensure all runs have organization_id
    result = conn.execute(text("SELECT COUNT(*) FROM analysis_runs WHERE organization_id IS NULL"))
    null_count = result.scalar()
    
    if null_count > 0:
        # Some runs still don't have organization_id - assign them to a default org
        conn.execute(text("""
            UPDATE analysis_runs
            SET organization_id = (
                SELECT o.id
                FROM organizations o
                INNER JOIN users u ON o.owner_id = u.id
                WHERE o.is_personal = 1
                ORDER BY u.id
                LIMIT 1
            )
            WHERE organization_id IS NULL
        """))
    
    # Drop foreign key constraint before altering column (MySQL requirement)
    # Check if constraint exists first
    result = conn.execute(text("""
        SELECT CONSTRAINT_NAME 
        FROM information_schema.TABLE_CONSTRAINTS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'analysis_runs' 
        AND CONSTRAINT_NAME = 'fk_analysis_runs_organization_id'
    """))
    constraint_exists = result.fetchone() is not None
    
    if constraint_exists:
        op.drop_constraint('fk_analysis_runs_organization_id', 'analysis_runs', type_='foreignkey')
    
    # Now make it NOT NULL
    op.alter_column('analysis_runs', 'organization_id',
                   existing_type=sa.Integer(),
                   nullable=False)
    
    # Recreate the foreign key constraint
    if constraint_exists:
        op.create_foreign_key(
            'fk_analysis_runs_organization_id',
            'analysis_runs', 'organizations',
            ['organization_id'], ['id']
        )


def downgrade() -> None:
    # Remove foreign keys and indexes first
    op.drop_constraint('fk_analysis_runs_organization_id', 'analysis_runs', type_='foreignkey')
    op.drop_index('ix_analysis_runs_organization_id', table_name='analysis_runs')
    op.drop_column('analysis_runs', 'organization_id')

    op.drop_constraint('fk_analysis_types_organization_id', 'analysis_types', type_='foreignkey')
    op.drop_index('ix_analysis_types_organization_id', table_name='analysis_types')
    op.drop_column('analysis_types', 'organization_id')
