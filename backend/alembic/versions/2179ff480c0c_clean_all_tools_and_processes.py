"""clean_all_tools_and_processes

Revision ID: 2179ff480c0c
Revises: ef388599882b
Create Date: 2025-11-22 22:11:36.003166

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '2179ff480c0c'
down_revision = 'ef388599882b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Clean all existing tools and processes from production.
    This migration removes all user-created and system processes and tools
    to ensure a clean state before recreating system processes.
    
    Temporarily disables foreign key checks to allow deletion in any order.
    """
    conn = op.get_bind()
    
    # Temporarily disable foreign key checks (MySQL-specific)
    conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    
    try:
        # Delete all analysis_steps
        steps_deleted = conn.execute(text("DELETE FROM analysis_steps")).rowcount
        print(f"Deleted {steps_deleted} analysis step(s)")
        
        # Delete all analysis_runs
        runs_deleted = conn.execute(text("DELETE FROM analysis_runs")).rowcount
        print(f"Deleted {runs_deleted} analysis run(s)")
        
        # Delete all analysis_types (all processes)
        processes_deleted = conn.execute(text("DELETE FROM analysis_types")).rowcount
        print(f"Deleted {processes_deleted} analysis process(es)")
        
        # Delete all organization_tool_access entries
        access_deleted = conn.execute(text("DELETE FROM organization_tool_access")).rowcount
        print(f"Deleted {access_deleted} organization tool access entry(ies)")
        
        # Delete all user_tools (all tools)
        tools_deleted = conn.execute(text("DELETE FROM user_tools")).rowcount
        print(f"Deleted {tools_deleted} user tool(s)")
        
        print(f"\n✅ Cleanup complete: Removed all processes and tools from database")
        print(f"   - Processes: {processes_deleted}")
        print(f"   - Tools: {tools_deleted}")
        print(f"   - Runs: {runs_deleted}")
        print(f"   - Steps: {steps_deleted}")
        print(f"   - Access entries: {access_deleted}")
        
    finally:
        # Re-enable foreign key checks
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))


def downgrade() -> None:
    """
    Downgrade is not possible - this migration permanently deletes all data.
    Data cannot be restored without backups.
    """
    print("⚠️  Warning: This migration permanently deletes all processes and tools.")
    print("   Downgrade is not possible - data cannot be restored without backups.")
    pass

