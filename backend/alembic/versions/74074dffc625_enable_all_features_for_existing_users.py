"""enable_all_features_for_existing_users

Revision ID: 74074dffc625
Revises: 0c3d8f320f1a
Create Date: 2025-11-21 21:58:24.057473

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '74074dffc625'
down_revision = '0c3d8f320f1a'
branch_labels = None
depends_on = None

# Available features
FEATURES = [
    'local_llm',
    'openrouter',
    'rag',
    'api_tools',
    'database_tools',
    'scheduling',
    'webhooks',
]


def upgrade() -> None:
    """
    Enable all features for all existing users.
    This is a temporary measure until payment is implemented.
    """
    conn = op.get_bind()
    
    # Get all user IDs
    result = conn.execute(text("SELECT id FROM users"))
    user_ids = [row[0] for row in result]
    
    # Enable all features for each user
    for user_id in user_ids:
        for feature_name in FEATURES:
            # Check if feature already exists for this user
            check_result = conn.execute(
                text("SELECT id FROM user_features WHERE user_id = :user_id AND feature_name = :feature_name"),
                {"user_id": user_id, "feature_name": feature_name}
            )
            existing = check_result.fetchone()
            
            if existing:
                # Update existing feature to enabled
                conn.execute(
                    text("""
                        UPDATE user_features 
                        SET enabled = 1, updated_at = NOW() 
                        WHERE user_id = :user_id AND feature_name = :feature_name
                    """),
                    {"user_id": user_id, "feature_name": feature_name}
                )
            else:
                # Insert new feature record
                conn.execute(
                    text("""
                        INSERT INTO user_features (user_id, feature_name, enabled, created_at, updated_at)
                        VALUES (:user_id, :feature_name, 1, NOW(), NOW())
                    """),
                    {"user_id": user_id, "feature_name": feature_name}
                )
    
    conn.commit()


def downgrade() -> None:
    """
    Remove all feature records (users will get default True behavior from code).
    Note: This will remove explicit feature settings.
    """
    # We don't delete features on downgrade since default is now True
    pass

