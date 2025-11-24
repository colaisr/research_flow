#!/usr/bin/env python3
"""
Test script to run an analysis with tool references directly.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.analysis_type import AnalysisType
from app.models.analysis_run import AnalysisRun, RunStatus, TriggerType
from app.models.instrument import Instrument
from app.models.organization import Organization
from app.models.user import User
from app.services.analysis.pipeline import AnalysisPipeline
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

def main():
    db = SessionLocal()
    try:
        # Find analysis type with name 'e' (from the logs)
        analysis_type = db.query(AnalysisType).filter(
            AnalysisType.id == 50,
            AnalysisType.is_active == 1
        ).first()
        
        if not analysis_type:
            logger.error("Analysis type not found")
            return
        
        logger.info(f"Found analysis type: {analysis_type.name} (id: {analysis_type.id})")
        logger.info(f"Config steps: {len(analysis_type.config.get('steps', []))}")
        
        # Get or create instrument
        instrument = db.query(Instrument).filter(Instrument.symbol == 'BTC/USDT').first()
        if not instrument:
            instrument = Instrument(symbol='BTC/USDT', display_name='BTC/USDT')
            db.add(instrument)
            db.commit()
            db.refresh(instrument)
        
        # Get organization from analysis type
        org = analysis_type.organization
        if not org:
            # Try to get first organization
            org = db.query(Organization).first()
            if not org:
                logger.error("No organization found")
                return
        
        # Create run
        run = AnalysisRun(
            trigger_type=TriggerType.MANUAL,
            instrument_id=instrument.id,
            analysis_type_id=analysis_type.id,
            organization_id=org.id,
            timeframe='H1',
            status=RunStatus.QUEUED
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        
        logger.info(f"Created run: {run.id}")
        
        # Run pipeline
        pipeline = AnalysisPipeline()
        logger.info("Starting pipeline execution...")
        
        # Temporarily disable caching to avoid cache size errors
        import app.services.data.adapters as data_adapters
        original_cache_data = data_adapters.DataService._cache_data
        def no_cache_data(self, key, data, ttl):
            logger.info(f"Skipping cache (test mode): key={key}")
            pass
        data_adapters.DataService._cache_data = no_cache_data
        
        try:
            result_run = pipeline.run(run, db)
        except Exception as e:
            # Continue even if there's an error
            logger.error(f"Pipeline error: {e}", exc_info=True)
            db.refresh(run)
            result_run = run
        finally:
            # Restore original caching
            data_adapters.DataService._cache_data = original_cache_data
        logger.info(f"Pipeline completed. Run status: {result_run.status}")
        
        # Print results
        if result_run.steps:
            for step in result_run.steps:
                logger.info(f"Step {step.step_name}: completed")
                logger.info(f"  Input length: {len(step.input or '')}")
                logger.info(f"  Output length: {len(step.output or '')}")
                logger.info(f"  Output preview: {(step.output or '')[:200]}")
        
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
    finally:
        db.close()

if __name__ == "__main__":
    main()

