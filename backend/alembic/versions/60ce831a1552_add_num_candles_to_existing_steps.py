"""add_num_candles_to_existing_steps

Revision ID: 60ce831a1552
Revises: f830a5a16a5f
Create Date: 2025-11-15 11:19:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
import json


# revision identifiers, used by Alembic.
revision = '60ce831a1552'
down_revision = '8e33ed3086e6'  # Latest migration: add_has_failures_to_models
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add num_candles field to all existing analysis step configurations."""
    conn = op.get_bind()
    
    # Default num_candles values based on step_name
    default_candles = {
        'wyckoff': 20,
        'smc': 50,
        'vsa': 30,
        'delta': 30,
        'ict': 50,
        'price_action': 50,
        # 'merge' doesn't use candles, so we skip it
    }
    
    # Get all analysis types
    result = conn.execute(text("SELECT id, config FROM analysis_types"))
    analyses = result.fetchall()
    
    updated_count = 0
    for analysis_id, config_json in analyses:
        try:
            config = json.loads(config_json) if isinstance(config_json, str) else config_json
            steps = config.get('steps', [])
            updated = False
            
            # Update each step
            for step in steps:
                step_name = step.get('step_name')
                # Skip merge step (doesn't use candles)
                if step_name == 'merge':
                    continue
                
                # Add num_candles if not present
                if 'num_candles' not in step or step.get('num_candles') is None:
                    if step_name in default_candles:
                        step['num_candles'] = default_candles[step_name]
                        updated = True
            
            # Update database if any changes were made
            if updated:
                conn.execute(
                    text("UPDATE analysis_types SET config = :config WHERE id = :id"),
                    {
                        "id": analysis_id,
                        "config": json.dumps(config)
                    }
                )
                updated_count += 1
                print(f"Updated analysis_type id={analysis_id}: added num_candles to steps")
        except Exception as e:
            print(f"Error updating analysis_type id={analysis_id}: {e}")
            continue
    
    print(f"Migration complete: updated {updated_count} analysis type(s)")


def downgrade() -> None:
    """Remove num_candles field from all analysis step configurations."""
    conn = op.get_bind()
    
    # Get all analysis types
    result = conn.execute(text("SELECT id, config FROM analysis_types"))
    analyses = result.fetchall()
    
    updated_count = 0
    for analysis_id, config_json in analyses:
        try:
            config = json.loads(config_json) if isinstance(config_json, str) else config_json
            steps = config.get('steps', [])
            updated = False
            
            # Remove num_candles from each step
            for step in steps:
                if 'num_candles' in step:
                    del step['num_candles']
                    updated = True
            
            # Update database if any changes were made
            if updated:
                conn.execute(
                    text("UPDATE analysis_types SET config = :config WHERE id = :id"),
                    {
                        "id": analysis_id,
                        "config": json.dumps(config)
                    }
                )
                updated_count += 1
        except Exception as e:
            print(f"Error updating analysis_type id={analysis_id}: {e}")
            continue
    
    print(f"Downgrade complete: removed num_candles from {updated_count} analysis type(s)")
