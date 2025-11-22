"""
Test script for Phase 1.5 tool references.

This script:
1. Finds the test pipeline for test1@mail.ru
2. Creates a test run
3. Executes the pipeline
4. Verifies tool execution worked correctly
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
from app.models.analysis_run import AnalysisRun, RunStatus
from app.models.instrument import Instrument
from app.models.organization import Organization
from app.services.analysis.pipeline import AnalysisPipeline
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def find_test_pipeline(db: Session, user_id: int) -> AnalysisType:
    """Find the Phase 1.5 test pipeline."""
    # Find the most recent test pipeline
    pipeline = db.query(AnalysisType).filter(
        AnalysisType.name.like('%test_phase1_5'),
        AnalysisType.user_id == user_id
    ).order_by(AnalysisType.id.desc()).first()
    
    if not pipeline:
        raise ValueError("Test pipeline not found. Run setup_phase1_5_test.py first.")
    
    return pipeline


def create_test_run(db: Session, analysis_type_id: int, instrument_symbol: str, timeframe: str, tool_id: int = None) -> AnalysisRun:
    """Create a test analysis run."""
    from app.models.user_tool import UserTool
    
    # Get instrument
    instrument = db.query(Instrument).filter(Instrument.symbol == instrument_symbol).first()
    if not instrument:
        # Try to find any available instrument
        fallback = db.query(Instrument).first()
        if fallback:
            logger.warning(f"Instrument {instrument_symbol} not found, using {fallback.symbol} instead")
            instrument = fallback
        else:
            raise ValueError(f"Instrument {instrument_symbol} not found and no fallback available")
    
    # Get organization (from analysis type)
    analysis = db.query(AnalysisType).filter(AnalysisType.id == analysis_type_id).first()
    if not analysis:
        raise ValueError(f"Analysis type {analysis_type_id} not found")
    
    # If tool_id not provided, try to find Binance API tool
    if not tool_id:
        user = db.query(User).filter(User.email == 'test1@mail.ru').first()
        if user:
            binance_tool = db.query(UserTool).filter(
                UserTool.user_id == user.id,
                UserTool.display_name == 'Binance API',
                UserTool.is_active == True
            ).first()
            if binance_tool:
                tool_id = binance_tool.id
                logger.info(f"Using Binance API tool (id: {tool_id}) for market data fetching")
    
    # Create run
    run = AnalysisRun(
        trigger_type='manual',
        analysis_type_id=analysis_type_id,
        instrument_id=instrument.id,
        organization_id=analysis.organization_id,
        timeframe=timeframe,
        tool_id=tool_id,  # Use tool for market data fetching
        status=RunStatus.QUEUED
    )
    
    db.add(run)
    db.commit()
    db.refresh(run)
    
    logger.info(f"Created test run: id={run.id}, instrument={instrument.symbol}, timeframe={timeframe}, tool_id={tool_id}")
    return run


def verify_tool_execution(db: Session, run_id: int) -> bool:
    """Verify that tool execution worked correctly."""
    from app.models.analysis_step import AnalysisStep
    
    # Get run
    run = db.query(AnalysisRun).filter(AnalysisRun.id == run_id).first()
    if not run:
        raise ValueError(f"Run {run_id} not found")
    
    logger.info(f"Run status: {run.status}")
    
    if run.status == RunStatus.FAILED:
        logger.error(f"Run failed: {run.status}")
        return False
    
    # Check steps for tool execution evidence
    steps = db.query(AnalysisStep).filter(AnalysisStep.run_id == run_id).all()
    
    logger.info(f"Found {len(steps)} steps")
    
    tool_execution_found = False
    for step in steps:
        # Check if step input/output contains tool execution results
        if step.input_blob:
            input_str = json.dumps(step.input_blob) if isinstance(step.input_blob, dict) else str(step.input_blob)
            if 'API response' in input_str or 'Tool' in input_str or 'binance_api' in input_str.lower():
                logger.info(f"Step {step.step_name}: Tool execution detected in input")
                tool_execution_found = True
        
        if step.output_blob:
            output_str = json.dumps(step.output_blob) if isinstance(step.output_blob, dict) else str(step.output_blob)
            if 'Tool' in output_str or 'execution failed' in output_str.lower():
                logger.warning(f"Step {step.step_name}: Tool execution error detected")
    
    return tool_execution_found and run.status == RunStatus.SUCCEEDED


def main():
    """Main test function."""
    db = SessionLocal()
    try:
        # Get test user
        user = db.query(User).filter(User.email == 'test1@mail.ru').first()
        if not user:
            raise ValueError("User test1@mail.ru not found")
        
        logger.info("=" * 60)
        logger.info("PHASE 1.5 TOOL REFERENCES TEST")
        logger.info("=" * 60)
        
        # Find test pipeline
        pipeline = find_test_pipeline(db, user.id)
        logger.info(f"Found test pipeline: {pipeline.display_name} (id: {pipeline.id})")
        
        # Check if pipeline has tool_references
        config = pipeline.config
        has_tool_refs = False
        for step in config.get('steps', []):
            if 'tool_references' in step:
                has_tool_refs = True
                logger.info(f"Step '{step['step_name']}' has {len(step['tool_references'])} tool reference(s)")
                for tool_ref in step['tool_references']:
                    logger.info(f"  - Tool ID: {tool_ref['tool_id']}, Variable: {tool_ref['variable_name']}")
        
        if not has_tool_refs:
            logger.warning("Pipeline has no tool_references configured!")
            logger.info("Run setup_phase1_5_test.py to add tool references")
            return
        
        # Create test run - use default instrument from pipeline config
        config = pipeline.config
        test_instrument = config.get('default_instrument', 'BTC/USDT')
        test_timeframe = config.get('default_timeframe', 'H1')
        
        logger.info(f"Using instrument: {test_instrument}, timeframe: {test_timeframe}")
        
        run = create_test_run(db, pipeline.id, test_instrument, test_timeframe)
        
        # Execute pipeline
        logger.info("Executing pipeline...")
        pipeline_executor = AnalysisPipeline()
        executed_run = pipeline_executor.run(run, db)
        
        db.refresh(executed_run)
        
        logger.info("=" * 60)
        logger.info("EXECUTION COMPLETE")
        logger.info("=" * 60)
        logger.info(f"Run ID: {executed_run.id}")
        logger.info(f"Status: {executed_run.status}")
        logger.info(f"Cost: ${executed_run.cost_est_total:.3f}")
        
        # Verify tool execution
        logger.info("")
        logger.info("Verifying tool execution...")
        success = verify_tool_execution(db, executed_run.id)
        
        if success:
            logger.info("✅ TEST PASSED: Tool execution detected and run succeeded")
        else:
            logger.warning("⚠️  TEST INCONCLUSIVE: Check run details manually")
        
        logger.info("")
        logger.info(f"View run details: /runs/{executed_run.id}")
        
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

