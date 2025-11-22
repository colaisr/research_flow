"""
Migration script to convert existing data adapters to user tools.

This script:
1. Creates tools for each existing user based on current adapters:
   - CCXT → "Binance API" tool
   - yfinance → "Yahoo Finance API" tool
   - Tinkoff → "Tinkoff Invest API" tool (if token configured)
2. Auto-creates organization_tool_access entries for all orgs where user is owner
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.models.organization import Organization
from app.models.user_tool import UserTool, ToolType
from app.models.organization_tool_access import OrganizationToolAccess
from app.models.settings import AppSettings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_tinkoff_token(db: Session) -> str | None:
    """Get Tinkoff API token from Settings."""
    setting = db.query(AppSettings).filter(AppSettings.key == "tinkoff_api_token").first()
    return setting.value if setting and setting.value else None


def get_user_owned_organizations(db: Session, user_id: int) -> list[Organization]:
    """Get all organizations where user is owner."""
    return db.query(Organization).filter(Organization.owner_id == user_id).all()


def create_tool_for_user(
    db: Session,
    user: User,
    tool_type: str,
    display_name: str,
    config: dict,
    home_org_id: int
) -> UserTool:
    """Create a tool for a user."""
    # Check if tool already exists
    existing = db.query(UserTool).filter(
        UserTool.user_id == user.id,
        UserTool.display_name == display_name
    ).first()
    
    if existing:
        logger.info(f"Tool '{display_name}' already exists for user {user.email}, skipping")
        return existing
    
    tool = UserTool(
        user_id=user.id,
        organization_id=home_org_id,
        tool_type=tool_type,
        display_name=display_name,
        config=config,
        is_active=True,
        is_shared=True  # Default to shared
    )
    
    db.add(tool)
    db.commit()
    db.refresh(tool)
    
    logger.info(f"Created tool '{display_name}' for user {user.email}")
    
    return tool


def ensure_tool_access_entries(db: Session, tool: UserTool, user: User):
    """Ensure organization_tool_access entries exist for all orgs where user is owner."""
    owned_orgs = get_user_owned_organizations(db, user.id)
    
    for org in owned_orgs:
        # Check if access entry already exists
        existing = db.query(OrganizationToolAccess).filter(
            OrganizationToolAccess.organization_id == org.id,
            OrganizationToolAccess.tool_id == tool.id
        ).first()
        
        if not existing:
            # Create access entry with is_enabled=True by default
            access = OrganizationToolAccess(
                organization_id=org.id,
                tool_id=tool.id,
                is_enabled=True
            )
            db.add(access)
            logger.info(f"Created tool access entry for org '{org.name}' (id: {org.id})")
    
    db.commit()


def migrate_user_tools(db: Session):
    """Migrate adapters to tools for all users."""
    users = db.query(User).filter(User.is_active == True).all()
    logger.info(f"Found {len(users)} active users to migrate")
    
    # Get global Tinkoff token (if configured)
    tinkoff_token = get_tinkoff_token(db)
    
    for user in users:
        logger.info(f"Processing user: {user.email} (id: {user.id})")
        
        # Get user's personal organization (home org)
        personal_org = db.query(Organization).filter(
            Organization.owner_id == user.id,
            Organization.is_personal == True
        ).first()
        
        if not personal_org:
            logger.warning(f"User {user.email} has no personal organization, skipping")
            continue
        
        # Create CCXT/Binance API tool
        binance_tool = create_tool_for_user(
            db=db,
            user=user,
            tool_type=ToolType.API.value,
            display_name="Binance API",
            config={
                "connector_type": "predefined",
                "connector_name": "binance",
                "adapter_config": {
                    "adapter_type": "ccxt",
                    "exchange_name": "binance"
                }
            },
            home_org_id=personal_org.id
        )
        ensure_tool_access_entries(db, binance_tool, user)
        
        # Create yfinance/Yahoo Finance API tool
        yfinance_tool = create_tool_for_user(
            db=db,
            user=user,
            tool_type=ToolType.API.value,
            display_name="Yahoo Finance API",
            config={
                "connector_type": "predefined",
                "connector_name": "yfinance",
                "adapter_config": {
                    "adapter_type": "yfinance"
                }
            },
            home_org_id=personal_org.id
        )
        ensure_tool_access_entries(db, yfinance_tool, user)
        
        # Create Tinkoff Invest API tool (only if token is configured)
        if tinkoff_token:
            tinkoff_tool = create_tool_for_user(
                db=db,
                user=user,
                tool_type=ToolType.API.value,
                display_name="Tinkoff Invest API",
                config={
                    "connector_type": "predefined",
                    "connector_name": "tinkoff",
                    "adapter_config": {
                        "adapter_type": "tinkoff"
                    },
                    "api_token": tinkoff_token  # Store token in tool config
                },
                home_org_id=personal_org.id
            )
            ensure_tool_access_entries(db, tinkoff_tool, user)
        else:
            logger.info(f"Tinkoff token not configured, skipping Tinkoff tool for user {user.email}")
    
    logger.info("Migration completed successfully")


def main():
    """Run migration."""
    db = SessionLocal()
    try:
        logger.info("Starting adapter to tools migration...")
        migrate_user_tools(db)
        logger.info("Migration finished")
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()


