"""add_pipeline_editor_schema

Revision ID: 62681ea9e3d9
Revises: 60ce831a1552
Create Date: 2025-11-15 15:06:13.236554

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
import json


# revision identifiers, used by Alembic.
revision = '62681ea9e3d9'
down_revision = '60ce831a1552'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add pipeline editor schema: user_id, is_system, and update existing configs."""
    conn = op.get_bind()
    
    # Step 1: Add new columns to analysis_types table
    try:
        op.add_column('analysis_types', sa.Column('user_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_analysis_types_user_id',
            'analysis_types', 'users',
            ['user_id'], ['id']
        )
        print("Added user_id column to analysis_types")
    except Exception as e:
        print(f"user_id column might already exist or error: {e}")
    
    try:
        op.add_column('analysis_types', sa.Column('is_system', sa.Boolean(), nullable=False, server_default='1'))
        print("Added is_system column to analysis_types")
    except Exception as e:
        print(f"is_system column might already exist or error: {e}")
    
    # Step 2: Update all existing analysis types
    result = conn.execute(text("SELECT id, name, config FROM analysis_types"))
    analysis_types = result.fetchall()
    
    updated_count = 0
    for analysis_id, name, config_json in analysis_types:
        if not config_json:
            continue
        
        try:
            config = json.loads(config_json) if isinstance(config_json, str) else config_json
            
            # Update steps: add order, publish_to_telegram, include_context
            if "steps" in config:
                updated_steps = []
                for index, step in enumerate(config["steps"], start=1):
                    updated_step = step.copy()
                    
                    # Add order field
                    updated_step["order"] = index
                    
                    step_name = step.get("step_name", "")
                    
                    # Add publish_to_telegram for merge steps
                    if step_name == "merge":
                        updated_step["publish_to_telegram"] = True
                    
                    # Add include_context for steps that use previous steps
                    if step_name == "ict":
                        # ICT uses Wyckoff and SMC
                        # Check which steps exist in this pipeline
                        available_step_names = [s.get("step_name") for s in config["steps"]]
                        ict_context_steps = []
                        if "wyckoff" in available_step_names:
                            ict_context_steps.append("wyckoff")
                        if "smc" in available_step_names:
                            ict_context_steps.append("smc")
                        
                        if ict_context_steps:
                            updated_step["include_context"] = {
                                "steps": ict_context_steps,
                                "placement": "before",
                                "format": "summary",
                                "auto_detected": ict_context_steps
                            }
                    elif step_name == "merge":
                        # Merge uses ALL previous steps
                        # Get all step names except merge itself
                        all_step_names = [
                            s.get("step_name") 
                            for s in config["steps"] 
                            if s.get("step_name") != "merge"
                        ]
                        
                        if all_step_names:
                            updated_step["include_context"] = {
                                "steps": all_step_names,
                                "placement": "before",
                                "format": "full",
                                "auto_detected": all_step_names
                            }
                    
                    updated_steps.append(updated_step)
                
                config["steps"] = updated_steps
            
            # Mark as system pipeline (existing ones are all system)
            # Update config in database
            conn.execute(
                text("""
                    UPDATE analysis_types 
                    SET config = :config, is_system = 1, user_id = NULL
                    WHERE id = :id
                """),
                {
                    "id": analysis_id,
                    "config": json.dumps(config)
                }
            )
            updated_count += 1
            print(f"Updated analysis_type id={analysis_id} (name={name}): added order, publish_to_telegram, include_context")
        except Exception as e:
            print(f"Error updating analysis_type id={analysis_id} (name={name}): {e}")
            continue
    
    conn.commit()
    print(f"Migration complete: updated {updated_count} analysis type(s)")


def downgrade() -> None:
    """Revert migration (optional - for rollback)."""
    conn = op.get_bind()
    
    # Remove new columns
    try:
        op.drop_constraint('fk_analysis_types_user_id', 'analysis_types', type_='foreignkey')
        op.drop_column('analysis_types', 'user_id')
        print("Removed user_id column from analysis_types")
    except Exception as e:
        print(f"Error removing user_id column: {e}")
    
    try:
        op.drop_column('analysis_types', 'is_system')
        print("Removed is_system column from analysis_types")
    except Exception as e:
        print(f"Error removing is_system column: {e}")
    
    # Note: We don't revert config changes (order, publish_to_telegram, include_context)
    # as they're backward compatible - old code will just ignore them
    print("Note: Config changes (order, publish_to_telegram, include_context) are not reverted as they're backward compatible")
