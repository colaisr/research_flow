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
from app.core.auth import get_current_user_dependency, get_current_organization_dependency
from app.models.analysis_run import AnalysisRun, RunStatus, TriggerType
from app.models.instrument import Instrument
from app.models.organization import Organization
from app.models.settings import AppSettings
from app.models.user import User
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
    tool_id: Optional[int] = None  # Optional - if set, use this tool for data fetch; otherwise use DataService
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Create a new analysis run.
    
    For now, this just fetches market data and creates a run record.
    The actual analysis pipeline will be implemented later.
    """
    # Check if this pipeline needs market data (skip if instrument/timeframe are 'N/A')
    needs_market_data = request.instrument != 'N/A' and request.timeframe != 'N/A'
    market_data = None
    
    if needs_market_data:
        # Validate tool if tool_id is provided
        if request.tool_id:
            from app.models.user_tool import UserTool
            from app.models.organization_tool_access import OrganizationToolAccess
            from app.services.tools import ToolExecutor
            
            tool = db.query(UserTool).filter(UserTool.id == request.tool_id).first()
            if not tool:
                raise HTTPException(status_code=404, detail=f"Tool {request.tool_id} not found")
            
            # Check ownership
            if tool.user_id != current_user.id:
                raise HTTPException(status_code=403, detail="You do not own this tool")
            
            # Check if tool is active
            if not tool.is_active:
                raise HTTPException(status_code=400, detail=f"Tool '{tool.display_name}' is not active")
            
            # Check if tool is enabled for current organization
            if tool.is_shared:
                access = db.query(OrganizationToolAccess).filter(
                    OrganizationToolAccess.organization_id == current_organization.id,
                    OrganizationToolAccess.tool_id == tool.id
                ).first()
                
                if access and not access.is_enabled:
                    raise HTTPException(status_code=403, detail=f"Tool '{tool.display_name}' is not enabled for this organization")
            
            # Validate tool by testing it and get market_data for instrument creation
            executor = ToolExecutor(db=db)
            try:
                tool_params = {
                    'instrument': request.instrument,
                    'timeframe': request.timeframe,
                    'limit': 10  # Just test with a small limit
                }
                tool_result = executor.execute_tool(tool, tool_params)
                # Convert to MarketData for instrument creation
                from app.services.analysis.pipeline import AnalysisPipeline
                pipeline = AnalysisPipeline()
                market_data = pipeline._convert_tool_result_to_market_data(tool_result, request.instrument, request.timeframe)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Tool validation failed: {str(e)}")
        else:
            # Fetch market data using DataService (backward compatibility)
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
    
    # Create or get instrument record (use dummy 'N/A' instrument for pipelines that don't need market data)
    if needs_market_data:
        instrument = db.query(Instrument).filter(Instrument.symbol == request.instrument).first()
        if not instrument:
            # Determine type and exchange
            inst_type = "crypto" if "/" in request.instrument.upper() else "equity"
            
            # Use exchange from market_data if available, otherwise try to determine from symbol
            exchange = market_data.exchange if market_data else None
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
    else:
        # Use dummy 'N/A' instrument for pipelines that don't need market data
        instrument = db.query(Instrument).filter(Instrument.symbol == 'N/A').first()
        if not instrument:
            instrument = Instrument(
                symbol='N/A',
                type='other',
                exchange='N/A',
                is_enabled=True
            )
            db.add(instrument)
            db.commit()
            db.refresh(instrument)
    
    # Create run record
    run = AnalysisRun(
        trigger_type=TriggerType.MANUAL,
        instrument_id=instrument.id,
        analysis_type_id=request.analysis_type_id,
        organization_id=current_organization.id,  # Set to current organization
        tool_id=request.tool_id,  # Set tool_id if provided
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
        from app.services.analysis.pipeline import AnalysisPipeline
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
                    # Rollback any pending transaction first
                    bg_db.rollback()
                    # Refresh the run object to get latest state
                    bg_db.refresh(bg_run)
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
                    try:
                        bg_db.rollback()
                    except:
                        pass
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
async def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Get analysis run details (only from current organization)."""
    run = db.query(AnalysisRun).filter(
        AnalysisRun.id == run_id,
        AnalysisRun.organization_id == current_organization.id
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    # Get steps
    steps = []
    for step in run.steps:
        # Parse input_blob if it's a string (for backward compatibility)
        input_blob = step.input_blob
        if isinstance(input_blob, str):
            try:
                import json
                input_blob = json.loads(input_blob)
            except (json.JSONDecodeError, TypeError):
                # If it's not valid JSON, wrap it in a dict
                input_blob = {"raw": input_blob}
        
        steps.append(RunStepResponse(
            step_name=step.step_name,
            input_blob=input_blob,
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
    db: Session = Depends(get_db),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """List analysis runs in current organization, optionally filtered by analysis type."""
    query = db.query(AnalysisRun).filter(AnalysisRun.organization_id == current_organization.id)
    
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
    db: Session = Depends(get_db),
    current_organization: Organization = Depends(get_current_organization_dependency)
):
    """Publish run's final Telegram post to channel.
    
    Args:
        run_id: Analysis run ID
        step_name: Optional step name to publish (if not provided, finds publishable step)
    """
    run = db.query(AnalysisRun).filter(
        AnalysisRun.id == run_id,
        AnalysisRun.organization_id == current_organization.id
    ).first()
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


