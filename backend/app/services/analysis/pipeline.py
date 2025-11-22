"""
Analysis pipeline orchestrator.
Dynamically builds and executes analysis steps from configuration.
"""
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.analysis_run import AnalysisRun, RunStatus
from app.models.analysis_step import AnalysisStep
from app.services.data.adapters import DataService
from app.services.data.normalized import MarketData, OHLCVCandle
from app.services.llm.client import LLMClient
from app.services.tools import ToolExecutor
from app.services.analysis.steps import (
    BaseAnalyzer,
    WyckoffAnalyzer,
    SMCAnalyzer,
    VSAAnalyzer,
    DeltaAnalyzer,
    ICTAnalyzer,
    PriceActionAnalyzer,
    MergeAnalyzer,
)
import logging

logger = logging.getLogger(__name__)


# Mapping of step names to analyzer classes
STEP_ANALYZER_MAP = {
    "wyckoff": WyckoffAnalyzer,
    "smc": SMCAnalyzer,
    "vsa": VSAAnalyzer,
    "delta": DeltaAnalyzer,
    "ict": ICTAnalyzer,
    "price_action": PriceActionAnalyzer,
    "merge": MergeAnalyzer,
}


class GenericLLMAnalyzer(BaseAnalyzer):
    """Generic LLM analyzer for custom steps without specific analyzer classes."""
    
    def get_system_prompt(self) -> str:
        """Return default system prompt for generic steps."""
        return "You are an expert analyst. Analyze the provided data and provide insights."
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        """Build user prompt from template in step_config."""
        if step_config and "user_prompt_template" in step_config:
            from app.services.analysis.steps import format_user_prompt_template
            # Get db session from context if available (for tool execution)
            db = context.get("_db_session")
            return format_user_prompt_template(step_config["user_prompt_template"], context, step_config, db)
        return "Please analyze the provided data."


class AnalysisPipeline:
    """Orchestrates the complete analysis pipeline."""
    
    def __init__(self):
        self.data_service = None  # Will be initialized in run() with db session to get Tinkoff token
        self.llm_client = None  # Will be initialized in run() with db session
    
    def _build_steps_from_config(self, config: Dict[str, Any]) -> List[Tuple[str, BaseAnalyzer, Dict[str, Any]]]:
        """Build step list dynamically from config.
        
        Args:
            config: Pipeline configuration dict with "steps" array
            
        Returns:
            List of tuples: (step_name, analyzer_instance, step_config)
        """
        if not config or "steps" not in config:
            raise ValueError("Config must contain 'steps' array")
        
        steps_config = config["steps"]
        
        # Sort steps by order field (if present), otherwise use array order
        def get_order(step: Dict[str, Any]) -> int:
            return step.get("order", 999)  # Steps without order go to end
        
        sorted_steps = sorted(steps_config, key=get_order)
        
        # Build step list with analyzer instances
        steps = []
        for step_config in sorted_steps:
            step_name = step_config.get("step_name")
            if not step_name:
                logger.warning(f"Step config missing step_name, skipping: {step_config}")
                continue
            
            # Get analyzer class from map, or use generic analyzer
            analyzer_class = STEP_ANALYZER_MAP.get(step_name, GenericLLMAnalyzer)
            analyzer_instance = analyzer_class()
            
            steps.append((step_name, analyzer_instance, step_config))
        
        return steps
    
    def _build_context_for_step(
        self,
        context: Dict[str, Any],
        step_config: Dict[str, Any],
        all_steps: List[Tuple[str, BaseAnalyzer, Dict[str, Any]]]
    ) -> Dict[str, Any]:
        """Build enhanced context with included previous step outputs.
        
        Args:
            context: Base context with instrument, timeframe, market_data, previous_steps
            step_config: Current step configuration (may contain include_context)
            all_steps: All steps in pipeline (for validation)
            
        Returns:
            Enhanced context dict with included context injected
        """
        enhanced_context = context.copy()
        
        # Check if step has include_context configuration
        include_context_config = step_config.get("include_context")
        if not include_context_config:
            return enhanced_context
        
        # Get list of steps to include
        included_step_names = include_context_config.get("steps", [])
        if not included_step_names:
            return enhanced_context
        
        # Build context section from previous step outputs
        context_sections = []
        previous_steps = context.get("previous_steps", {})
        
        for step_name in included_step_names:
            if step_name in previous_steps:
                step_output = previous_steps[step_name].get("output", "")
                format_type = include_context_config.get("format", "full")
                
                if format_type == "summary" and len(step_output) > 200:
                    step_output = step_output[:200] + "..."
                
                context_sections.append(f"{step_name.upper()}:\n{step_output}")
            else:
                logger.warning(f"Step {step_name} not found in previous_steps for context inclusion")
        
        if context_sections:
            context_text = "\n\n".join(context_sections)
            placement = include_context_config.get("placement", "before")
            
            # Store context text in enhanced_context for use in prompt formatting
            enhanced_context["_included_context"] = {
                "text": context_text,
                "placement": placement
            }
        
        return enhanced_context
    
    @staticmethod
    def detect_step_references(prompt: str, available_steps: List[str]) -> List[str]:
        """Detect which steps are mentioned in the prompt.
        
        This is a simple detection algorithm that looks for step names in the prompt.
        More sophisticated detection can be added later.
        
        Args:
            prompt: User prompt template string
            available_steps: List of available step names
            
        Returns:
            List of detected step names
        """
        detected = []
        prompt_lower = prompt.lower()
        
        # Common step name variations
        step_variations = {
            "wyckoff": ["wyckoff", "wyckoff method", "wyckoff phase"],
            "smc": ["smc", "smart money", "smart money concepts"],
            "vsa": ["vsa", "volume spread", "volume spread analysis"],
            "delta": ["delta", "delta analysis"],
            "ict": ["ict", "inner circle trader"],
            "price_action": ["price action", "priceaction", "patterns"],
            "merge": ["merge", "объедини", "финальный"],
        }
        
        for step_name in available_steps:
            # Check direct step name
            if step_name.lower() in prompt_lower:
                detected.append(step_name)
                continue
            
            # Check variations
            variations = step_variations.get(step_name, [])
            for variation in variations:
                if variation in prompt_lower:
                    detected.append(step_name)
                    break
        
        return detected
    
    def _convert_tool_result_to_market_data(
        self,
        tool_result: Dict[str, Any],
        instrument: str,
        timeframe: str
    ) -> MarketData:
        """Convert tool executor result to MarketData format.
        
        Args:
            tool_result: Result from ToolExecutor.execute_tool()
            instrument: Instrument symbol
            timeframe: Timeframe string
            
        Returns:
            MarketData object
        """
        from datetime import datetime, timezone
        
        # Extract data from tool result
        data = tool_result.get('data', {})
        candles_data = data.get('candles', [])
        
        # Convert candles to OHLCVCandle objects
        candles = []
        for candle in candles_data:
            # Handle different candle formats
            if isinstance(candle, dict):
                timestamp_str = candle.get('timestamp', '')
                if isinstance(timestamp_str, str):
                    # Parse ISO format timestamp
                    timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                else:
                    timestamp = timestamp_str
                
                candles.append(OHLCVCandle(
                    timestamp=timestamp,
                    open=float(candle.get('open', 0)),
                    high=float(candle.get('high', 0)),
                    low=float(candle.get('low', 0)),
                    close=float(candle.get('close', 0)),
                    volume=float(candle.get('volume', 0))
                ))
        
        # Get exchange from data if available
        exchange = data.get('exchange')
        
        # Get fetched_at timestamp
        fetched_at_str = data.get('fetched_at', '')
        if fetched_at_str:
            if isinstance(fetched_at_str, str):
                fetched_at = datetime.fromisoformat(fetched_at_str.replace('Z', '+00:00'))
            else:
                fetched_at = fetched_at_str
        else:
            fetched_at = datetime.now(timezone.utc)
        
        return MarketData(
            instrument=instrument,
            timeframe=timeframe,
            exchange=exchange,
            candles=candles,
            fetched_at=fetched_at
        )
    
    def run(
        self,
        run: AnalysisRun,
        db: Session,
        custom_config: Optional[Dict[str, Any]] = None,
    ) -> AnalysisRun:
        """Execute the complete analysis pipeline.
        
        Args:
            run: AnalysisRun database record
            db: Database session
            
        Returns:
            Updated AnalysisRun with all steps completed
        """
        try:
            # Initialize LLM client with db session to read API key from Settings
            if not self.llm_client:
                self.llm_client = LLMClient(db=db)
            
            # Initialize DataService with db session to read Tinkoff token from Settings
            if not self.data_service:
                from app.services.data.adapters import DataService
                self.data_service = DataService(db=db)
            
            # Update status to running
            run.status = RunStatus.RUNNING
            db.commit()
            
            # Fetch market data - skip if instrument is 'N/A' (pipelines that don't need market data)
            market_data = None
            if run.instrument.symbol != 'N/A' and run.timeframe != 'N/A':
                logger.info(f"fetching_market_data: run_id={run.id}, instrument={run.instrument.symbol}, tool_id={run.tool_id}")
                
                if run.tool_id:
                    # Use ToolExecutor to fetch data from user-configured tool
                    from app.models.user_tool import UserTool
                    tool = db.query(UserTool).filter(UserTool.id == run.tool_id).first()
                    if not tool:
                        raise ValueError(f"Tool {run.tool_id} not found")
                    
                    if not tool.is_active:
                        raise ValueError(f"Tool '{tool.display_name}' is not active")
                    
                    # Check if tool is available in current organization
                    from app.models.organization_tool_access import OrganizationToolAccess
                    access = db.query(OrganizationToolAccess).filter(
                        OrganizationToolAccess.organization_id == run.organization_id,
                        OrganizationToolAccess.tool_id == tool.id
                    ).first()
                    
                    if access and not access.is_enabled:
                        raise ValueError(f"Tool '{tool.display_name}' is not enabled for this organization")
                    
                    # Execute tool to fetch market data
                    executor = ToolExecutor(db=db)
                    tool_params = {
                        'instrument': run.instrument.symbol,
                        'timeframe': run.timeframe,
                        'limit': 500
                    }
                    tool_result = executor.execute_tool(tool, tool_params)
                    
                    # Convert tool result to MarketData format
                    market_data = self._convert_tool_result_to_market_data(tool_result, run.instrument.symbol, run.timeframe)
                else:
                    # Fallback to DataService (backward compatibility)
                    market_data = self.data_service.fetch_market_data(
                        instrument=run.instrument.symbol,
                        timeframe=run.timeframe,
                        use_cache=True
                    )
            else:
                logger.info(f"skipping_market_data: run_id={run.id}, instrument={run.instrument.symbol} (pipeline doesn't need market data)")
            
            # Get configuration: use custom_config if provided, otherwise use analysis_type.config
            config = custom_config
            if not config and run.analysis_type:
                config = run.analysis_type.config
            
            if not config:
                raise ValueError("No configuration available for analysis run")
            
            # Prepare context for all steps
            context = {
                "instrument": run.instrument.symbol,
                "timeframe": run.timeframe,
                "market_data": market_data,
                "previous_steps": {},
            }
            
            total_cost = 0.0
            model_failures = []  # Track model-related failures
            
            # Build steps dynamically from config
            steps = self._build_steps_from_config(config)
            logger.info(f"built_steps_from_config: run_id={run.id}, step_count={len(steps)}")
            
            # Run each analysis step
            for step_name, analyzer, step_config in steps:
                logger.info(f"running_step: run_id={run.id}, step={step_name}")
                
                try:
                    # Build context section if include_context is configured
                    enhanced_context = self._build_context_for_step(context, step_config, steps)
                    
                    # Add db session to context for tool execution in format_user_prompt_template
                    enhanced_context["_db_session"] = db
                    
                    # Run the step (sync call) with step configuration
                    step_result = analyzer.analyze(
                        context=enhanced_context,
                        llm_client=self.llm_client,
                        step_config=step_config,
                    )
                    
                    # Save step to database
                    step_record = AnalysisStep(
                        run_id=run.id,
                        step_name=step_name,
                        input_blob=step_result.get("input"),
                        output_blob=step_result.get("output"),
                        llm_model=step_result.get("model"),
                        tokens_used=step_result.get("tokens_used", 0),
                        cost_est=step_result.get("cost_est", 0.0),
                    )
                    db.add(step_record)
                    db.commit()
                    db.refresh(step_record)
                    
                    # Update context with step result for next steps
                    context["previous_steps"][step_name] = step_result
                    total_cost += step_result.get("cost_est", 0.0)
                    
                    logger.info(
                        f"step_completed: run_id={run.id}, step={step_name}, "
                        f"tokens={step_result.get('tokens_used', 0)}, cost={step_result.get('cost_est', 0.0)}"
                    )
                except Exception as e:
                    error_msg = str(e)
                    error_type = type(e).__name__
                    logger.error(f"step_failed: run_id={run.id}, step={step_name}, error={error_msg}")
                    
                    # Check if this is a model-related error
                    is_model_error = (
                        "429" in error_msg or  # Rate limit
                        "404" in error_msg or  # Model not found
                        "model" in error_msg.lower() and ("not found" in error_msg.lower() or "invalid" in error_msg.lower()) or
                        "rate" in error_msg.lower() and "limit" in error_msg.lower() or
                        "RateLimitError" in error_type
                    )
                    
                    if is_model_error:
                        model_name = step_config.get("model") if step_config else "unknown"
                        model_failures.append({
                            "step": step_name,
                            "model": model_name,
                            "error": error_msg,
                            "error_type": error_type
                        })
                        
                        # Mark model as having failures in database
                        from app.models.settings import AvailableModel
                        failed_model = db.query(AvailableModel).filter(
                            AvailableModel.name == model_name
                        ).first()
                        if failed_model:
                            failed_model.has_failures = True
                            logger.info(f"marked_model_as_failing: model={model_name}, run_id={run.id}")
                        
                        # Save error step
                        error_step = AnalysisStep(
                            run_id=run.id,
                            step_name=step_name,
                            input_blob={"error": error_msg, "error_type": error_type, "is_model_error": True},
                            output_blob=f"Error: {error_msg}",
                        )
                        db.add(error_step)
                        
                        # Store failure details in a special step for easy retrieval
                        failure_step = AnalysisStep(
                            run_id=run.id,
                            step_name="model_failures",
                            input_blob={"failures": model_failures},
                            output_blob=f"Model failures detected: {len(model_failures)} step(s) failed due to model errors",
                        )
                        db.add(failure_step)
                        
                        # Stop execution immediately on model error
                        run.status = RunStatus.MODEL_FAILURE
                        run.finished_at = datetime.now(timezone.utc)
                        run.cost_est_total = total_cost
                        db.commit()
                        
                        logger.error(f"pipeline_stopped_due_to_model_error: run_id={run.id}, step={step_name}, model={model_name}")
                        return run
                    
                    # For non-model errors, save error step and continue
                    error_step = AnalysisStep(
                        run_id=run.id,
                        step_name=step_name,
                        input_blob={"error": error_msg, "error_type": error_type, "is_model_error": False},
                        output_blob=f"Error: {error_msg}",
                    )
                    db.add(error_step)
                    db.commit()
                    # Continue with next step for non-model errors
                    continue
            
            # All steps completed successfully
            run.status = RunStatus.SUCCEEDED
            run.finished_at = datetime.now(timezone.utc)
            run.cost_est_total = total_cost
            db.commit()
            
            logger.info(f"pipeline_completed: run_id={run.id}, total_cost={total_cost}")
            return run
            
        except Exception as e:
            logger.error(f"pipeline_failed: run_id={run.id}, error={str(e)}")
            run.status = RunStatus.FAILED
            run.finished_at = datetime.now(timezone.utc)
            db.commit()
            raise

