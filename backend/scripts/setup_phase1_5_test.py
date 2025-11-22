"""
Setup script for Phase 1.5 testing.

This script:
1. Clones the "Дневной анализ" (Daily Analysis) pipeline for test1@mail.ru
2. Updates it to use tool references instead of hardcoded adapters
3. Creates a test script to verify tool execution works
"""
import sys
import os
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.models.analysis_type import AnalysisType
from app.models.user_tool import UserTool
from app.models.organization import Organization
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_user_tools(db: Session, user_id: int) -> dict:
    """Get user's tools and return mapping by display_name."""
    tools = db.query(UserTool).filter(
        UserTool.user_id == user_id,
        UserTool.is_active == True
    ).all()
    
    tool_map = {}
    for tool in tools:
        # Map by display_name (sanitized for variable name)
        var_name = tool.display_name.lower().replace(' ', '_').replace('-', '_')
        tool_map[var_name] = tool
    
    logger.info(f"Found {len(tools)} tools for user:")
    for var_name, tool in tool_map.items():
        logger.info(f"  - {var_name}: {tool.display_name} (id: {tool.id}, type: {tool.tool_type})")
    
    return tool_map


def clone_pipeline_with_tool_references(db: Session, source_analysis_id: int, user_id: int, org_id: int) -> AnalysisType:
    """Clone pipeline and add tool references to steps."""
    # Get source pipeline
    source = db.query(AnalysisType).filter(AnalysisType.id == source_analysis_id).first()
    if not source:
        raise ValueError(f"Source analysis with id {source_analysis_id} not found")
    
    logger.info(f"Cloning pipeline: {source.display_name} (id: {source.id})")
    
    # Get user's tools
    tool_map = get_user_tools(db, user_id)
    
    # Clone config
    config = json.loads(json.dumps(source.config))  # Deep copy
    
    # Add tool references to steps
    # Map tool names to tool IDs
    tool_references_map = {
        'binance_api': 'Binance API',
        'yahoo_finance_api': 'Yahoo Finance API',
        'tinkoff_invest_api': 'Tinkoff Invest API',
    }
    
    tool_references_added = False
    for step in config.get('steps', []):
        # Check if step uses market data (would benefit from tool reference)
        # For now, add Binance API tool to first step as example
        if step.get('step_name') == 'wyckoff' and 'binance_api' in tool_map:
            step['tool_references'] = [
                {
                    'tool_id': tool_map['binance_api'].id,
                    'variable_name': 'binance_api',
                    'extraction_method': 'natural_language',
                    'extraction_config': {
                        'context_window': 200
                    }
                }
            ]
            # Update prompt template to actually use the tool reference
            original_prompt = step.get('user_prompt_template', '')
            if '{binance_api}' not in original_prompt:
                # Add tool reference at the beginning of prompt
                updated_prompt = 'Market data from {binance_api}:\n\n' + original_prompt
                step['user_prompt_template'] = updated_prompt
                logger.info(f"Updated prompt template for step: {step['step_name']}")
            tool_references_added = True
            logger.info(f"Added tool reference to step: {step['step_name']}")
    
    if not tool_references_added:
        logger.warning("No tool references added - tools may not be available")
    
    # Create cloned pipeline
    cloned = AnalysisType(
        name=f"{source.name}_test_phase1_5",
        display_name=f"{source.display_name} (Phase 1.5 Test)",
        description=f"{source.description or ''} - Test version with tool references",
        version="1.0.1",
        config=config,
        user_id=user_id,
        is_system=False,
        organization_id=org_id,
        is_active=1
    )
    
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    
    logger.info(f"Created cloned pipeline: {cloned.display_name} (id: {cloned.id})")
    return cloned


def main():
    """Main setup function."""
    db = SessionLocal()
    try:
        # Get test user
        user = db.query(User).filter(User.email == 'test1@mail.ru').first()
        if not user:
            raise ValueError("User test1@mail.ru not found")
        
        logger.info(f"Found user: {user.email} (id: {user.id})")
        
        # Get user's personal organization
        org = db.query(Organization).filter(
            Organization.owner_id == user.id,
            Organization.is_personal == True
        ).first()
        if not org:
            raise ValueError(f"Personal organization not found for user {user.email}")
        
        logger.info(f"Found organization: {org.name} (id: {org.id})")
        
        # Get source pipeline (Дневной анализ)
        source = db.query(AnalysisType).filter(
            AnalysisType.display_name == 'Дневной анализ'
        ).first()
        if not source:
            raise ValueError("Source pipeline 'Дневной анализ' not found")
        
        # Check if test pipeline already exists
        existing = db.query(AnalysisType).filter(
            AnalysisType.name == f"{source.name}_test_phase1_5",
            AnalysisType.organization_id == org.id
        ).first()
        
        if existing:
            logger.info(f"Test pipeline already exists: {existing.display_name} (id: {existing.id})")
            logger.info("Deleting and recreating...")
            db.delete(existing)
            db.commit()
        
        # Clone pipeline with tool references
        cloned = clone_pipeline_with_tool_references(db, source.id, user.id, org.id)
        
        logger.info("=" * 60)
        logger.info("SETUP COMPLETE")
        logger.info("=" * 60)
        logger.info(f"Test Pipeline ID: {cloned.id}")
        logger.info(f"Test Pipeline Name: {cloned.display_name}")
        logger.info(f"User: {user.email}")
        logger.info(f"Organization: {org.name}")
        logger.info("")
        logger.info("Next steps:")
        logger.info("1. Test in UI: Go to /analyses/{cloned.id} and run the pipeline")
        logger.info("2. Run test script: python scripts/test_phase1_5_tools.py")
        
    except Exception as e:
        logger.error(f"Setup failed: {e}", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

