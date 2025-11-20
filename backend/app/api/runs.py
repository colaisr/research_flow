"""
Analysis runs endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
import logging
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from app.core.database import get_db
from app.models.analysis_run import AnalysisRun, RunStatus, TriggerType
from app.models.instrument import Instrument
from app.models.settings import AppSettings
from app.services.data.adapters import DataService
from app.services.analysis.pipeline import AnalysisPipeline
from app.services.telegram.publisher import publish_to_telegram
from app.models.telegram_post import TelegramPost, PostStatus

logger = logging.getLogger(__name__)

router = APIRouter()


class CreateRunRequest(BaseModel):
    """Request model for creating a run."""
    instrument: str
    timeframe: str  # M1, M5, M15, H1, D1, etc.
    analysis_type_id: Optional[int] = None  # Optional for backward compatibility
    custom_config: Optional[dict] = None  # Optional custom configuration override


class RunStepResponse(BaseModel):
    """Response model for a run step."""
    step_name: str
    input_blob: Optional[dict] = None
    output_blob: Optional[str] = None
    llm_model: Optional[str] = None
    tokens_used: int = 0
    cost_est: float = 0.0
    created_at: datetime


class RunResponse(BaseModel):
    """Response model for a run."""
    id: int
    trigger_type: str
    instrument: str
    timeframe: str
    status: str
    created_at: datetime
    finished_at: Optional[datetime] = None
    cost_est_total: float = 0.0
    steps: list[RunStepResponse] = []
    analysis_type_id: Optional[int] = None
    analysis_type_config: Optional[dict] = None  # Include config to find publishable steps


@router.post("", response_model=RunResponse)
async def create_run(
    request: CreateRunRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Create a new analysis run.
    
    For now, this just fetches market data and creates a run record.
    The actual analysis pipeline will be implemented later.
    """
    # Validate instrument exists (for now, just check format)
    # TODO: Check against instruments table
    
    # Fetch market data to validate instrument/timeframe
    data_service = DataService(db=db)
    try:
        market_data = data_service.fetch_market_data(
            instrument=request.instrument,
            timeframe=request.timeframe,
            use_cache=True
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch market data: {str(e)}")
    
    # Validate OpenRouter API key is configured
    openrouter_setting = db.query(AppSettings).filter(
        AppSettings.key == "openrouter_api_key"
    ).first()
    if not openrouter_setting or not openrouter_setting.value:
        raise HTTPException(
            status_code=400,
            detail="OpenRouter API key is not configured. Please set it in Settings → OpenRouter Configuration before running analyses."
        )
    
    # Create or get instrument record
    instrument = db.query(Instrument).filter(Instrument.symbol == request.instrument).first()
    if not instrument:
        # Determine type and exchange
        inst_type = "crypto" if "/" in request.instrument.upper() else "equity"
        
        # Use exchange from market_data if available, otherwise try to determine from symbol
        exchange = market_data.exchange
        if not exchange or exchange == "unknown":
            # Import exchange detection function
            from app.api.instruments import _get_exchange_for_symbol
            exchange = _get_exchange_for_symbol(request.instrument) or "unknown"
        
        instrument = Instrument(
            symbol=request.instrument,
            type=inst_type,
            exchange=exchange,
            is_enabled=False  # New instruments are disabled by default (admin must enable in Settings)
        )
        db.add(instrument)
        db.commit()
        db.refresh(instrument)
    
    # Create run record
    run = AnalysisRun(
        trigger_type=TriggerType.MANUAL,
        instrument_id=instrument.id,
        analysis_type_id=request.analysis_type_id,
        timeframe=request.timeframe,
        status=RunStatus.QUEUED
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    
    # Start pipeline execution in background
    def run_pipeline():
        # Create new DB session for background task
        from app.core.database import SessionLocal
        bg_db = SessionLocal()
        bg_run = None
        try:
            bg_run = bg_db.query(AnalysisRun).filter(AnalysisRun.id == run.id).first()
            if not bg_run:
                logger.error(f"Run {run.id} not found in database")
                return
            
            # Initialize pipeline (this will read API key from Settings)
            pipeline = AnalysisPipeline()
            
            # Pass custom_config if provided
            custom_config = request.custom_config if request.custom_config is not None else None
            
            # Run the pipeline
            pipeline.run(bg_run, bg_db, custom_config=custom_config)
            
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_traceback = traceback.format_exc()
            logger.error(f"Pipeline execution failed for run {run.id}: {error_msg}\n{error_traceback}")
            
            # Update run status to FAILED
            if bg_run:
                try:
                    bg_run.status = RunStatus.FAILED
                    bg_run.finished_at = datetime.now(timezone.utc)
                    # Save error message in a step
                    from app.models.analysis_step import AnalysisStep
                    error_step = AnalysisStep(
                        run_id=bg_run.id,
                        step_name="pipeline_error",
                        input_blob={"error": error_msg, "traceback": error_traceback},
                        output_blob=f"Pipeline failed: {error_msg}",
                    )
                    bg_db.add(error_step)
                    bg_db.commit()
                except Exception as db_error:
                    logger.error(f"Failed to update run status to FAILED: {db_error}")
        finally:
            bg_db.close()
    
    background_tasks.add_task(run_pipeline)
    
    return RunResponse(
        id=run.id,
        trigger_type=run.trigger_type.value,
        instrument=request.instrument,
        timeframe=request.timeframe,
        status=run.status.value,
        created_at=run.created_at,
        finished_at=run.finished_at,
        cost_est_total=run.cost_est_total,
        steps=[],
        analysis_type_id=run.analysis_type_id,
        analysis_type_config=None  # Config not needed for initial response
    )


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: int, db: Session = Depends(get_db)):
    """Get analysis run details."""
    run = db.query(AnalysisRun).filter(AnalysisRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Get steps
    steps = []
    for step in run.steps:
        steps.append(RunStepResponse(
            step_name=step.step_name,
            input_blob=step.input_blob,
            output_blob=step.output_blob,
            llm_model=step.llm_model,
            tokens_used=step.tokens_used,
            cost_est=step.cost_est,
            created_at=step.created_at
        ))
    
    return RunResponse(
        id=run.id,
        trigger_type=run.trigger_type.value,
        instrument=run.instrument.symbol,
        timeframe=run.timeframe,
        status=run.status.value,
        created_at=run.created_at,
        finished_at=run.finished_at,
        cost_est_total=run.cost_est_total,
        steps=steps,
        analysis_type_id=run.analysis_type_id,
        analysis_type_config=run.analysis_type.config if run.analysis_type else None
    )


@router.get("", response_model=List[RunResponse])
async def list_runs(
    analysis_type_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List analysis runs, optionally filtered by analysis type."""
    query = db.query(AnalysisRun)
    
    if analysis_type_id:
        query = query.filter(AnalysisRun.analysis_type_id == analysis_type_id)
    
    runs = query.order_by(AnalysisRun.created_at.desc()).limit(limit).all()
    
    result = []
    for run in runs:
        result.append(RunResponse(
            id=run.id,
            trigger_type=run.trigger_type.value,
            instrument=run.instrument.symbol,
            timeframe=run.timeframe,
            status=run.status.value,
            created_at=run.created_at,
            finished_at=run.finished_at,
            cost_est_total=run.cost_est_total,
            steps=[],  # Don't include steps in list view
            analysis_type_id=run.analysis_type_id,
            analysis_type_config=None  # Don't include config in list view
        ))
    
    return result


@router.post("/{run_id}/publish")
async def publish_run(
    run_id: int, 
    step_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Publish run's final Telegram post to channel.
    
    Args:
        run_id: Analysis run ID
        step_name: Optional step name to publish (if not provided, finds publishable step)
    """
    run = db.query(AnalysisRun).filter(AnalysisRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Find publishable step
    publishable_step = None
    
    if step_name:
        # User specified a step name
        for step in run.steps:
            if step.step_name == step_name:
                publishable_step = step
                break
        if not publishable_step:
            raise HTTPException(
                status_code=404,
                detail=f"Step '{step_name}' not found in run {run_id}"
            )
    else:
        # Find step with publish_to_telegram flag
        # First, check config for steps with publish_to_telegram: true
        config = None
        if run.analysis_type:
            config = run.analysis_type.config
        
        publishable_step_names = []
        if config and "steps" in config:
            for step_config in config["steps"]:
                if step_config.get("publish_to_telegram") == True:
                    publishable_step_names.append(step_config.get("step_name"))
        
        # Find the last publishable step (most recent)
        if publishable_step_names:
            # Find steps in reverse order (most recent first)
            for step in reversed(run.steps):
                if step.step_name in publishable_step_names:
                    publishable_step = step
                    break
        
        # Fallback to 'merge' step for backward compatibility
        if not publishable_step:
            for step in run.steps:
                if step.step_name == 'merge':
                    publishable_step = step
                    break
        
        # If still not found, use the last step
        if not publishable_step and run.steps:
            publishable_step = run.steps[-1]
    
    if not publishable_step or not publishable_step.output_blob:
        raise HTTPException(
            status_code=400, 
            detail="Run does not have a publishable step with output. Make sure the step completed successfully."
        )
    
    # Check if already published
    existing_post = db.query(TelegramPost).filter(
        TelegramPost.run_id == run_id,
        TelegramPost.status == PostStatus.SENT
    ).first()
    
    if existing_post:
        return {
            "success": True,
            "message": "Already published",
            "message_ids": [existing_post.message_id] if existing_post.message_id else [],
            "telegram_post_id": existing_post.id
        }
    
    # Publish to Telegram
    result = await publish_to_telegram(publishable_step.output_blob, db=db)
    
    # Save post record
    from datetime import datetime, timezone
    telegram_post = TelegramPost(
        run_id=run.id,
        message_text=publishable_step.output_blob,
        status=PostStatus.SENT if result['success'] else PostStatus.FAILED,
        message_id=str(result.get('message_ids', [])[0]) if result.get('message_ids') else None,
        sent_at=datetime.now(timezone.utc) if result['success'] else None,
    )
    
    db.add(telegram_post)
    db.commit()
    db.refresh(telegram_post)
    
    # Return detailed result including partial failures
    if result['success']:
        response = {
            "success": True,
            "message": f"Published {result.get('chunks_sent', 0)} message(s) to {result.get('users_notified', 0)} user(s)",
            "message_ids": result.get('message_ids', []),
            "users_notified": result.get('users_notified', 0),
            "users_failed": result.get('users_failed', 0),
            "failed_users": result.get('failed_users'),
            "telegram_post_id": telegram_post.id
        }
        # Add warning if some users failed
        if result.get('users_failed', 0) > 0:
            response["warning"] = f"Failed to send to {result['users_failed']} user(s). Check failed_users for details."
        return response
    else:
        return {
            "success": False,
            "error": result.get('error', 'Unknown error'),
            "failed_users": result.get('failed_users'),
            "telegram_post_id": telegram_post.id
        }


