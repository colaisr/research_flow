"""
Base class and individual step analyzers for the Daystart analysis pipeline.
"""
from typing import Dict, Any, Optional
import re
import logging
from sqlalchemy.orm import Session
from app.services.llm.client import LLMClient
from app.services.data.normalized import MarketData
from app.services.tools import ToolExecutor

logger = logging.getLogger(__name__)


def format_user_prompt_template(
    template: str, 
    context: Dict[str, Any], 
    step_config: Optional[Dict[str, Any]] = None,
    db: Optional[Session] = None
) -> str:
    """Format user prompt template with context variables and tool references.
    
    Supports placeholders:
    - {instrument} - instrument symbol
    - {timeframe} - timeframe
    - {market_data_summary} - formatted market data summary
    - {wyckoff_output}, {smc_output}, {vsa_output}, {delta_output}, {ict_output}, {price_action_output} - previous step outputs
    - {tool_variable_name} - tool references (executes tool and injects result)
    
    Args:
        template: User prompt template string
        context: Context dictionary with market_data, instrument, timeframe, previous_steps
        step_config: Optional step configuration dict (may contain num_candles, tool_references)
        db: Optional database session for loading tools (required if tool_references are used)
    """
    market_data: MarketData = context.get("market_data")
    instrument = context.get("instrument", "")
    timeframe = context.get("timeframe", "")
    previous_steps = context.get("previous_steps", {})
    
    # Process tool references first (before standard variable replacement)
    # Check if step_config has tool_references (even if empty array)
    has_tool_references_config = step_config and "tool_references" in step_config
    tool_references_list = step_config.get("tool_references", []) if has_tool_references_config else []
    
    if has_tool_references_config and tool_references_list:
        if not db:
            logger.warning("tool_references found in step_config but db session not provided, skipping tool execution")
            # Replace tool references with error message
            for tool_ref in tool_references_list:
                variable_name = tool_ref.get("variable_name")
                if variable_name:
                    template = template.replace(f"{{{variable_name}}}", f"[Tool {variable_name} execution skipped: db session not provided]")
        else:
            template = _process_tool_references(template, step_config, context, db)
    elif has_tool_references_config and not tool_references_list:
        # tool_references exists but is empty - this shouldn't happen, but log it
        potential_tool_refs = re.findall(r'\{([a-z_]+)\}', template.lower())
        logger.warning(f"tool_references exists in step_config but is empty. Template contains potential tool references: {potential_tool_refs}")
    
    # Get number of candles from step_config if available, otherwise use defaults based on step type
    num_candles = None
    if step_config and "num_candles" in step_config and step_config["num_candles"] is not None:
        num_candles = step_config["num_candles"]
    else:
        # Default based on step type (backward compatibility)
        num_candles = 30  # default
        if "wyckoff" in template.lower():
            num_candles = 20
        elif "smc" in template.lower() or "ict" in template.lower():
            num_candles = 50
    
    # Build market data summary
    market_data_summary = ""
    if market_data:
        # Ensure candles are sorted by timestamp (oldest first) before taking last N
        sorted_candles = sorted(market_data.candles, key=lambda c: c.timestamp)
        candles_to_show = sorted_candles[-num_candles:] if len(sorted_candles) > num_candles else sorted_candles
        for candle in candles_to_show:
            market_data_summary += f"- {candle.timestamp.strftime('%Y-%m-%d %H:%M')}: O={candle.open:.2f} H={candle.high:.2f} L={candle.low:.2f} C={candle.close:.2f} V={candle.volume:.2f}\n"
    
    # Get previous step outputs
    # For merge step, use full outputs; for other steps, truncate for context
    is_merge_step = "объедини" in template.lower() or "merge" in template.lower() or "финальный пост" in template.lower()
    
    # Build format dict with standard variables
    format_dict = {
        "instrument": instrument,
        "timeframe": timeframe,
        "market_data_summary": market_data_summary,
    }
    
    # Add all previous step outputs dynamically (supports custom step names)
    # First add standard step outputs for backward compatibility
    standard_steps = ["wyckoff", "smc", "vsa", "delta", "ict", "price_action"]
    for step_name in standard_steps:
        step_output = previous_steps.get(step_name, {}).get("output", "Не доступно")
        if not is_merge_step and len(step_output) > 100:
            step_output = step_output[:100] + "..."
        format_dict[f"{step_name}_output"] = step_output
    
    # Add any other step outputs dynamically (for custom steps)
    for step_name, step_result in previous_steps.items():
        if step_name not in standard_steps:
            step_output = step_result.get("output", "Не доступно")
            # Don't truncate fetch_market_data output - it contains data that needs to be passed fully
            # Also don't truncate for merge steps
            if step_name != "fetch_market_data" and not is_merge_step and len(step_output) > 100:
                step_output = step_output[:100] + "..."
            format_dict[f"{step_name}_output"] = step_output
    
    # Replace hardcoded "last X candles" text in template with actual num_candles value
    # This handles cases where templates have hardcoded text like "last 20 candles"
    if num_candles:
        # Replace patterns like "last 20 candles", "last 50 candles", etc.
        template = re.sub(
            r'last\s+\d+\s+candles?',
            f'last {num_candles} candle{"s" if num_candles != 1 else ""}',
            template,
            flags=re.IGNORECASE
        )
        # Also handle Russian text patterns like "последние 20 свечей"
        template = re.sub(
            r'последние\s+\d+\s+свеч(?:ей|и|а)?',
            f'последние {num_candles} свеч{"ей" if num_candles > 4 else "и" if num_candles > 1 else "а"}',
            template,
            flags=re.IGNORECASE
        )
    
    # Before formatting, check if there are any tool references that weren't replaced
    # This can happen if tool_references weren't processed or tool execution failed
    # Extract all {variable} patterns from template
    remaining_tool_refs = re.findall(r'\{([^}]+)\}', template)
    if remaining_tool_refs:
        # Check if any of them look like tool references (not standard variables)
        standard_vars = ['instrument', 'timeframe', 'market_data_summary'] + [f'{step}_output' for step in standard_steps]
        for step_name in previous_steps.keys():
            if step_name not in standard_steps:
                standard_vars.append(f'{step_name}_output')
        
        # If step_config has tool_references, add them to available vars for better error message
        tool_var_names = []
        if step_config and "tool_references" in step_config:
            tool_var_names = [ref.get("variable_name") for ref in step_config.get("tool_references", []) if ref.get("variable_name")]
        
        for var in remaining_tool_refs:
            if var not in standard_vars and var not in tool_var_names:
                # This might be a tool reference that wasn't processed
                logger.warning(f"Found potential tool reference '{var}' in template that wasn't replaced. "
                             f"Tool references: {tool_var_names}, Standard vars: {standard_vars[:5]}...")
    
    # Format template with all variables
    # Note: Tool results already have braces escaped, so they won't interfere with format()
    try:
        formatted = template.format(**format_dict)
        # Unescape braces in tool results (they were escaped to prevent format() errors)
        # Replace {{ with { and }} with } but only in tool result sections
        # Simple approach: unescape all double braces (this is safe since we control tool results)
        formatted = formatted.replace('{{', '{').replace('}}', '}')
    except KeyError as e:
        # Provide helpful error message for invalid variables
        invalid_var = str(e).strip("'")
        available_vars = ['instrument', 'timeframe', 'market_data_summary']
        # Add standard step outputs
        available_vars.extend([f'{step}_output' for step in standard_steps])
        # Add any custom step outputs
        for step_name in previous_steps.keys():
            if step_name not in standard_steps:
                available_vars.append(f'{step_name}_output')
        
        # Add tool variable names if available
        if step_config and "tool_references" in step_config:
            tool_var_names = [ref.get("variable_name") for ref in step_config.get("tool_references", []) if ref.get("variable_name")]
            available_vars.extend(tool_var_names)
        
        error_msg = (
            f"Invalid variable '{invalid_var}' in prompt template. "
            f"Available variables: {', '.join(sorted(set(available_vars)))}. "
        )
        
        # Check if it's a tool reference that wasn't processed
        if step_config and "tool_references" in step_config:
            tool_refs = step_config.get("tool_references", [])
            tool_var_names = [ref.get("variable_name") for ref in tool_refs if ref.get("variable_name")]
            if invalid_var in tool_var_names:
                error_msg += (
                    f"\nNote: '{invalid_var}' is a tool reference but wasn't processed. "
                    f"This might indicate that tool execution failed or db session was not provided. Check logs for details."
                )
        else:
            # Check if variable name looks like a tool reference (contains 'api', 'db', 'rag', etc.)
            if any(keyword in invalid_var.lower() for keyword in ['api', 'db', 'rag', 'tool']):
                error_msg += (
                    f"\nNote: '{invalid_var}' looks like a tool reference. "
                    f"Make sure you've added the tool to 'tool_references' in step configuration "
                    f"by clicking the tool variable in the variable palette."
                )
        
        error_msg += (
            f"\nUse {{instrument}} for instrument symbol, {{timeframe}} for timeframe, "
            f"and {{step_name}}_output for any previous step output."
        )
        
        raise ValueError(error_msg)
    
    return formatted


def _process_tool_references(
    template: str,
    step_config: Dict[str, Any],
    context: Dict[str, Any],
    db: Session
) -> str:
    """Process tool references in prompt template.
    
    Executes tools referenced in step_config.tool_references and injects results into template.
    
    Args:
        template: Prompt template string
        step_config: Step configuration with tool_references array
        context: Step context (instrument, timeframe, previous_steps, etc.)
        db: Database session for loading tools
        
    Returns:
        Template with tool references replaced by tool execution results
    """
    from app.models.user_tool import UserTool
    
    tool_references = step_config.get("tool_references", [])
    logger.info(f"[Step Tool Execution] Processing {len(tool_references)} tool reference(s) in step")
    
    # Get pipeline name from context for consumption tracking
    source_name = context.get("_source_name")
    user_id = context.get("_user_id")
    organization_id = context.get("_organization_id")
    tool_executor = ToolExecutor(
        db=db, 
        source_name=source_name,
        user_id=user_id,
        organization_id=organization_id
    )
    
    # Build step context for tool execution
    step_context = {
        "instrument": context.get("instrument", ""),
        "timeframe": context.get("timeframe", ""),
    }
    # Add previous step outputs to context
    for step_name, step_result in context.get("previous_steps", {}).items():
        step_context[f"{step_name}_output"] = step_result.get("output", "")
    
    # Get model from step_config for AI extraction (use same model as step)
    step_model = step_config.get("model")
    
    # Get LLM client for AI extraction (will be created in ToolExecutor if needed)
    llm_client = None
    if step_model:
        from app.services.llm.client import LLMClient
        llm_client = LLMClient(db=db)
    else:
        logger.warning(f"No model found in step_config, AI extraction will use default model")
    
    # Execute each tool reference sequentially
    for tool_ref in tool_references:
        tool_id = tool_ref.get("tool_id")
        variable_name = tool_ref.get("variable_name")
        
        # extraction_method and extraction_config are no longer used (AI-based extraction)
        # Keep for backward compatibility but ignore
        
        if not tool_id or not variable_name:
            logger.warning(f"Invalid tool reference config: {tool_ref}")
            continue
        
        # Load tool from database
        tool = db.query(UserTool).filter(UserTool.id == tool_id).first()
        if not tool:
            logger.warning(f"Tool with id {tool_id} not found")
            template = template.replace(f"{{{variable_name}}}", f"[Tool {tool_id} not found]")
            continue
        
        # Check if tool is active
        if not tool.is_active:
            logger.warning(f"Tool {tool.display_name} (id: {tool_id}) is not active")
            template = template.replace(f"{{{variable_name}}}", f"[Tool {tool.display_name} is not active]")
            continue
        
        # Execute tool with context (AI-based extraction)
        try:
            logger.info(f"[Step Tool Execution] Executing tool '{tool.display_name}' (id: {tool_id}, type: {tool.tool_type}), variable: {variable_name}")
            if f'{{{variable_name}}}' not in template:
                logger.error(f"[Step Tool Execution] Tool reference {{{variable_name}}} not found in template")
            tool_result = tool_executor.execute_tool_with_context(
                tool=tool,
                prompt_text=template,
                tool_variable_name=variable_name,
                step_context=step_context,
                model=step_model,  # Use same model as step
                llm_client=llm_client
            )
            
            # Log result size for RAG tools
            if tool.tool_type == "rag":
                result_preview = tool_result[:200] + "..." if len(tool_result) > 200 else tool_result
                logger.info(f"[Step Tool Execution] RAG tool '{tool.display_name}' returned result ({len(tool_result)} chars): {result_preview}")
            
            # Replace tool reference with result
            # Escape braces in tool_result to prevent format() errors
            # We'll unescape them after format() is called
            escaped_result = tool_result.replace('{', '{{').replace('}', '}}')
            template = template.replace(f"{{{variable_name}}}", escaped_result)
            logger.info(f"[Step Tool Execution] Successfully executed tool {tool.display_name} (id: {tool_id}), variable: {variable_name}")
            
        except Exception as e:
            logger.error(f"[Step Tool Execution] Tool execution failed for {tool.display_name} (id: {tool_id}): {e}", exc_info=True)
            template = template.replace(f"{{{variable_name}}}", f"[Tool {tool.display_name} execution failed: {str(e)}]")
    
    return template


class BaseAnalyzer:
    """Base class for analysis steps."""
    
    def get_system_prompt(self) -> str:
        """Get the system prompt for this step."""
        raise NotImplementedError
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        """Build the user prompt from context.
        
        Args:
            context: Context dictionary with market_data, instrument, timeframe, previous_steps
            step_config: Optional step configuration dict (may contain num_candles)
        """
        raise NotImplementedError
    
    def analyze(
        self,
        context: Dict[str, Any],
        llm_client: LLMClient,
        step_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Run the analysis step.
        
        Args:
            context: Context dictionary with instrument, timeframe, market_data, previous_steps
            llm_client: LLM client instance
            step_config: Optional step configuration dict with model, temperature, 
                        system_prompt, user_prompt_template
        
        Returns:
            Dict with 'input', 'output', 'model', 'tokens_used', 'cost_est'
        """
        # Use step_config if provided, otherwise fall back to hardcoded methods
        if step_config:
            # Use system_prompt from config if provided, otherwise use default
            if "system_prompt" in step_config and step_config["system_prompt"]:
                system_prompt = step_config["system_prompt"]
            else:
                system_prompt = self.get_system_prompt()
            
            # Use user_prompt_template from config if provided, otherwise use default
            if "user_prompt_template" in step_config and step_config["user_prompt_template"]:
                # Get db session from context if available (for tool execution)
                db = context.get("_db_session")
                user_prompt = format_user_prompt_template(step_config["user_prompt_template"], context, step_config, db)
            else:
                user_prompt = self.build_user_prompt(context, step_config)
            
            # Inject included context if present
            included_context = context.get("_included_context")
            if included_context:
                context_text = included_context.get("text", "")
                placement = included_context.get("placement", "before")
                
                if placement == "before":
                    user_prompt = f"{context_text}\n\n{user_prompt}"
                else:  # after
                    user_prompt = f"{user_prompt}\n\n{context_text}"
            
            model = step_config.get("model")
            temperature = step_config.get("temperature", 0.7)
            # max_tokens removed - model will use its default maximum (no truncation)
        else:
            # Fall back to hardcoded prompts (backward compatibility)
            system_prompt = self.get_system_prompt()
            user_prompt = self.build_user_prompt(context, None)
            
            # Inject included context if present (for backward compatibility)
            included_context = context.get("_included_context")
            if included_context:
                context_text = included_context.get("text", "")
                placement = included_context.get("placement", "before")
                
                if placement == "before":
                    user_prompt = f"{context_text}\n\n{user_prompt}"
                else:  # after
                    user_prompt = f"{user_prompt}\n\n{context_text}"
            
            model = None
            temperature = 0.7
            # max_tokens removed - model will use its default maximum (no truncation)
        
        # Check token availability BEFORE making LLM call
        # We need to estimate tokens needed (rough estimate: 1 token ≈ 4 characters)
        db = context.get("_db_session")
        user_id = context.get("_user_id")
        organization_id = context.get("_organization_id")
        
        if db and user_id and organization_id:
            # Estimate tokens needed (rough: prompt length / 4, plus some buffer for response)
            estimated_input_tokens = len(system_prompt + user_prompt) // 4
            # Conservative estimate for output tokens (model uses full capacity, typically 16K-32K)
            # We estimate 8000 as middle ground to ensure sufficient balance
            estimated_output_tokens = 8000
            estimated_total = estimated_input_tokens + estimated_output_tokens
            
            from app.services.balance import get_token_balance
            from app.services.subscription import get_active_subscription
            
            # Get available tokens
            subscription = get_active_subscription(db, user_id, organization_id)
            subscription_tokens_available = 0
            if subscription:
                subscription_tokens_available = subscription.tokens_allocated - subscription.tokens_used_this_period
            
            balance = get_token_balance(db, user_id, organization_id)
            balance_tokens_available = balance.balance
            
            total_available = subscription_tokens_available + balance_tokens_available
            
            # Block if insufficient tokens (with some buffer for estimation error)
            if total_available < estimated_total:
                raise ValueError(
                    f"Недостаточно токенов. Доступно: {total_available}"
                )
        
        # Make LLM call with configuration
        # Note: max_tokens parameter removed - model will use its default maximum (no truncation)
        result = llm_client.call(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            temperature=temperature,
        )
        
        # Extract token information
        input_tokens = result.get("input_tokens", 0)
        output_tokens = result.get("output_tokens", 0)
        total_tokens = result.get("tokens_used", input_tokens + output_tokens)
        
        # Extract provider from model name (e.g., "openai/gpt-4o" -> "openrouter")
        provider = "openrouter"  # Default provider
        if model and "/" in model:
            # Model format is "provider/model-name", but we use openrouter as provider
            provider = "openrouter"
        
        # Charge tokens and record consumption if db session and user info are available
        # Note: run_id can be None for test steps (not saved to database)
        db = context.get("_db_session")
        run_id = context.get("_run_id")
        user_id = context.get("_user_id")
        organization_id = context.get("_organization_id")
        step_id = context.get("_step_id")  # Will be set after step is saved
        
        if db and user_id and organization_id and total_tokens > 0:
            try:
                from app.services.balance import charge_tokens
                from app.services.consumption import record_consumption
                from app.services.pricing import calculate_pricing, get_exchange_rate
                
                # Calculate pricing for logging/validation
                pricing_calc = calculate_pricing(
                    db, model or "unknown", provider, input_tokens, output_tokens
                )
                exchange_rate = get_exchange_rate()
                
                if pricing_calc:
                    logger.info(
                        f"[PRICING] Step execution pricing calculation:\n"
                        f"  Model: {model} ({provider})\n"
                        f"  Input tokens: {input_tokens}, Output tokens: {output_tokens}, Total: {total_tokens}\n"
                        f"  Cost per 1k input: ${pricing_calc.cost_per_1k_input_usd:.6f} USD\n"
                        f"  Cost per 1k output: ${pricing_calc.cost_per_1k_output_usd:.6f} USD\n"
                        f"  Price per 1k: ${pricing_calc.price_per_1k_usd:.6f} USD\n"
                        f"  Exchange rate: {exchange_rate} RUB/USD\n"
                        f"  Our cost: ${pricing_calc.our_total_cost_usd:.6f} USD = ₽{pricing_calc.our_cost_rub:.2f} RUB\n"
                        f"  User price: ${pricing_calc.user_price_usd:.6f} USD = ₽{pricing_calc.user_price_rub:.2f} RUB"
                    )
                
                # Charge tokens (priority: subscription first, then balance)
                charge_result = charge_tokens(
                    db=db,
                    user_id=user_id,
                    organization_id=organization_id,
                    amount=total_tokens,
                    source_type="subscription"
                )
                
                logger.info(
                    f"[TOKEN_CHARGE] Charged {charge_result.tokens_charged} tokens from {charge_result.source}\n"
                    f"  Remaining subscription tokens: {charge_result.remaining_subscription_tokens}\n"
                    f"  Remaining balance: {charge_result.remaining_balance}"
                )
                
                if not charge_result.success:
                    # Insufficient tokens - raise error
                    total_available = charge_result.remaining_subscription_tokens + charge_result.remaining_balance
                    raise ValueError(
                        f"Недостаточно токенов. Доступно: {total_available}"
                    )
                
                # Get pipeline name from context (for test steps) or from run_id (for saved runs)
                source_name = context.get("_source_name")
                if not source_name and run_id:
                    from sqlalchemy import text
                    result = db.execute(
                        text("""
                            SELECT at.display_name
                            FROM analysis_runs ar
                            JOIN analysis_types at ON ar.analysis_type_id = at.id
                            WHERE ar.id = :run_id
                        """),
                        {"run_id": run_id}
                    )
                    row = result.fetchone()
                    if row:
                        source_name = row[0]
                
                # Record consumption (will be updated with step_id after step is saved)
                consumption_id = record_consumption(
                    db=db,
                    user_id=user_id,
                    organization_id=organization_id,
                    model_name=model or "unknown",
                    provider=provider,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    run_id=run_id,
                    step_id=None,  # Will be updated after step is saved
                    source_type=charge_result.source,
                    source_name=source_name
                )
                
                logger.info(
                    f"[CONSUMPTION] Recorded consumption ID: {consumption_id}\n"
                    f"  Tokens: {total_tokens} (input: {input_tokens}, output: {output_tokens})\n"
                    f"  Source: {charge_result.source}\n"
                    f"  Run ID: {run_id}, Step ID: {step_id}"
                )
                
                # Store consumption_id in context for later step_id update
                context["_consumption_id"] = consumption_id
                
            except Exception as e:
                logger.error(f"Failed to charge tokens or record consumption: {e}")
                # Re-raise if it's an insufficient tokens error (check both English and Russian)
                error_str = str(e)
                if "Insufficient tokens" in error_str or "Недостаточно токенов" in error_str:
                    raise
                # Log but continue for other errors (don't block analysis)
                logger.warning(f"Token charging failed but continuing: {e}")
        
        return {
            "input": {
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
            },
            "output": result["content"],
            "model": result["model"],
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "tokens_used": total_tokens,  # Keep for backward compatibility
            "cost_est": result["cost_est"],
        }


class WyckoffAnalyzer(BaseAnalyzer):
    """Wyckoff analysis step."""
    
    def get_system_prompt(self) -> str:
        return """You are an expert in Wyckoff Method analysis. Analyze market structure 
        to identify accumulation, distribution, markup, and markdown phases. Provide clear, 
        actionable insights about market context and likely scenarios."""
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        market_data: MarketData = context["market_data"]
        instrument = context["instrument"]
        timeframe = context["timeframe"]
        
        # Get number of candles from step_config if available, otherwise default to 20
        num_candles = step_config.get("num_candles", 20) if step_config else 20
        
        # Build prompt with market data summary
        # Ensure candles are sorted by timestamp (oldest first) before taking last N
        sorted_candles = sorted(market_data.candles, key=lambda c: c.timestamp)
        prompt = f"""Analyze {instrument} on {timeframe} timeframe using Wyckoff Method.

Recent price action (last {num_candles} candle{"s" if num_candles != 1 else ""}):
"""
        for candle in sorted_candles[-num_candles:]:
            prompt += f"- {candle.timestamp.strftime('%Y-%m-%d %H:%M')}: O={candle.open:.2f} H={candle.high:.2f} L={candle.low:.2f} C={candle.close:.2f} V={candle.volume:.2f}\n"
        
        prompt += """
Determine:
1. Current Wyckoff phase (Accumulation/Distribution/Markup/Markdown)
2. Market context and cycle position
3. Likely scenario (continuation or reversal)
4. Key levels to watch

Provide analysis in structured format suitable for trading decisions."""
        
        return prompt


class SMCAnalyzer(BaseAnalyzer):
    """Smart Money Concepts analysis step."""
    
    def get_system_prompt(self) -> str:
        return """You are an expert in Smart Money Concepts (SMC). Analyze market structure 
        to identify BOS (Break of Structure), CHoCH (Change of Character), Order Blocks, 
        Fair Value Gaps (FVG), and Liquidity Pools. Identify key levels and liquidity events."""
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        market_data: MarketData = context["market_data"]
        instrument = context["instrument"]
        timeframe = context["timeframe"]
        
        # Get number of candles from step_config if available, otherwise default to 50
        num_candles = step_config.get("num_candles", 50) if step_config else 50
        
        # Ensure candles are sorted by timestamp (oldest first) before taking last N
        sorted_candles = sorted(market_data.candles, key=lambda c: c.timestamp)
        prompt = f"""Analyze {instrument} on {timeframe} using Smart Money Concepts.

Price structure (last {num_candles} candle{"s" if num_candles != 1 else ""}):
"""
        for candle in sorted_candles[-num_candles:]:
            prompt += f"- {candle.timestamp.strftime('%Y-%m-%d %H:%M')}: O={candle.open:.2f} H={candle.high:.2f} L={candle.low:.2f} C={candle.close:.2f}\n"
        
        prompt += """
Identify:
1. BOS (Break of Structure) and CHoCH points
2. Order Blocks (OB) - supply/demand zones
3. Fair Value Gaps (FVG) - imbalance zones
4. Liquidity Pools - areas where stops are likely
5. Key levels for potential price returns

Provide structured analysis with specific price levels."""
        
        return prompt


class VSAAnalyzer(BaseAnalyzer):
    """Volume Spread Analysis step."""
    
    def get_system_prompt(self) -> str:
        return """You are an expert in Volume Spread Analysis (VSA). Analyze volume, spread, 
        and price action to identify large participant activity. Look for signals like no demand, 
        no supply, stopping volume, climactic action, and effort vs result."""
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        market_data: MarketData = context["market_data"]
        instrument = context["instrument"]
        timeframe = context["timeframe"]
        
        # Get number of candles from step_config if available, otherwise default to 30
        num_candles = step_config.get("num_candles", 30) if step_config else 30
        
        # Ensure candles are sorted by timestamp (oldest first) before taking last N
        sorted_candles = sorted(market_data.candles, key=lambda c: c.timestamp)
        prompt = f"""Analyze {instrument} on {timeframe} using Volume Spread Analysis.

OHLCV data (last {num_candles} candle{"s" if num_candles != 1 else ""}):
"""
        for candle in sorted_candles[-num_candles:]:
            spread = candle.high - candle.low
            prompt += f"- {candle.timestamp.strftime('%Y-%m-%d %H:%M')}: Spread={spread:.2f} Volume={candle.volume:.2f} Close={candle.close:.2f}\n"
        
        prompt += """
Identify:
1. Large participant activity (volume analysis)
2. No demand / no supply signals
3. Stopping volume (absorption)
4. Climactic action (exhaustion)
5. Effort vs result (volume vs price movement)
6. Areas where effort without result suggests reversal

Provide VSA signals and their implications."""
        
        return prompt


class DeltaAnalyzer(BaseAnalyzer):
    """Delta analysis step."""
    
    def get_system_prompt(self) -> str:
        return """You are an expert in Delta analysis. Analyze buying vs selling pressure 
        to identify dominance, anomalous delta, absorption, divergence, and where large 
        players are holding positions or absorbing aggression."""
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        market_data: MarketData = context["market_data"]
        instrument = context["instrument"]
        timeframe = context["timeframe"]
        
        # Note: Real delta requires order flow data, but we'll analyze what we can from volume/price
        # Get number of candles from step_config if available, otherwise default to 30
        num_candles = step_config.get("num_candles", 30) if step_config else 30
        
        prompt = f"""Analyze {instrument} on {timeframe} using Delta analysis principles.

Note: Full delta requires order flow data. Analyze buying/selling pressure from volume and price action.

Price and volume data (last {num_candles} candle{"s" if num_candles != 1 else ""}):
"""
        # Ensure candles are sorted by timestamp (oldest first) before taking last N
        sorted_candles = sorted(market_data.candles, key=lambda c: c.timestamp)
        for candle in sorted_candles[-num_candles:]:
            body = abs(candle.close - candle.open)
            is_bullish = candle.close > candle.open
            prompt += f"- {candle.timestamp.strftime('%Y-%m-%d %H:%M')}: {'Bullish' if is_bullish else 'Bearish'} Body={body:.2f} Volume={candle.volume:.2f}\n"
        
        prompt += """
Identify:
1. Buying vs selling dominance
2. Anomalous delta patterns
3. Absorption zones (volume without price movement)
4. Divergences (price vs volume/strength)
5. Where large players are holding or absorbing

Provide delta-based insights."""
        
        return prompt


class ICTAnalyzer(BaseAnalyzer):
    """ICT (Inner Circle Trader) analysis step."""
    
    def get_system_prompt(self) -> str:
        return """You are an expert in ICT (Inner Circle Trader) methodology. Analyze 
        liquidity manipulation, PD Arrays (Premium/Discount), Fair Value Gaps, and optimal 
        entry points after liquidity sweeps."""
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        market_data: MarketData = context["market_data"]
        instrument = context["instrument"]
        timeframe = context["timeframe"]
        wyckoff_result = context["previous_steps"].get("wyckoff", {})
        smc_result = context["previous_steps"].get("smc", {})
        
        # Get number of candles from step_config if available, otherwise default to 50
        num_candles = step_config.get("num_candles", 50) if step_config else 50
        
        # Ensure candles are sorted by timestamp (oldest first) before taking last N
        sorted_candles = sorted(market_data.candles, key=lambda c: c.timestamp)
        prompt = f"""Analyze {instrument} on {timeframe} using ICT methodology.

Price action (last {num_candles} candle{"s" if num_candles != 1 else ""}):
"""
        for candle in sorted_candles[-num_candles:]:
            prompt += f"- {candle.timestamp.strftime('%Y-%m-%d %H:%M')}: H={candle.high:.2f} L={candle.low:.2f} C={candle.close:.2f}\n"
        
        prompt += f"""
Previous analysis context:
- Wyckoff phase: {wyckoff_result.get('output', 'N/A')[:100]}...
- SMC structure: {smc_result.get('output', 'N/A')[:100]}...

Identify:
1. Liquidity manipulation (sweeps above highs/below lows)
2. PD Arrays (Premium/Discount zones)
3. Fair Value Gaps (FVG) for return zones
4. Optimal entry points after liquidity collection
5. False breakouts and return scenarios

Provide ICT-based entry strategy."""
        
        return prompt


class PriceActionAnalyzer(BaseAnalyzer):
    """Price Action and Pattern Analysis step."""
    
    def get_system_prompt(self) -> str:
        return """You are an expert in Price Action and Pattern Analysis. Analyze candlestick patterns, 
        chart formations, and price movements to identify trading opportunities. Focus on patterns like 
        flags, triangles, head and shoulders, and candlestick formations. Provide specific entry, stop, 
        and target levels based on pattern completion."""
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        market_data: MarketData = context["market_data"]
        instrument = context["instrument"]
        timeframe = context["timeframe"]
        
        # Get number of candles from step_config if available, otherwise default to 50
        num_candles = step_config.get("num_candles", 50) if step_config else 50
        
        # Ensure candles are sorted by timestamp (oldest first) before taking last N
        sorted_candles = sorted(market_data.candles, key=lambda c: c.timestamp)
        prompt = f"""Analyze {instrument} on {timeframe} using Price Action and Pattern Analysis.

Price action (last {num_candles} candle{"s" if num_candles != 1 else ""}):
"""
        for candle in sorted_candles[-num_candles:]:
            body = abs(candle.close - candle.open)
            is_bullish = candle.close > candle.open
            upper_wick = candle.high - max(candle.open, candle.close)
            lower_wick = min(candle.open, candle.close) - candle.low
            prompt += f"- {candle.timestamp.strftime('%Y-%m-%d %H:%M')}: {'🟢' if is_bullish else '🔴'} Body={body:.2f} UpperWick={upper_wick:.2f} LowerWick={lower_wick:.2f} Close={candle.close:.2f}\n"
        
        prompt += """
Identify:
1. Chart patterns forming (flags, triangles, head and shoulders, double tops/bottoms, etc.)
2. Candlestick patterns (doji, engulfing, pin bars, hammers, shooting stars)
3. Support and resistance levels from price action
4. Pattern completion signals and entry points
5. Stop loss and target levels based on pattern structure

Provide specific price levels for entries, stops, and targets."""

        return prompt


class MergeAnalyzer(BaseAnalyzer):
    """Merge step - combines all analyses into final Telegram post."""
    
    def get_system_prompt(self) -> str:
        return """You are a professional trading analyst. Combine multiple analysis methods 
        into a cohesive, actionable Telegram post. Follow the exact format and style specified 
        in the user prompt. Write in Russian as specified."""
    
    def build_user_prompt(self, context: Dict[str, Any], step_config: Optional[Dict[str, Any]] = None) -> str:
        instrument = context["instrument"]
        timeframe = context["timeframe"]
        previous_steps = context["previous_steps"]
        # Merge step doesn't use candles, so step_config is not needed here
        
        # Build prompt with all previous step outputs
        prompt = f"""Объедини результаты анализа {instrument} на таймфрейме {timeframe} в единый пост для Telegram.

Результаты анализа по методам:

1️⃣ WYCKOFF:
{previous_steps.get('wyckoff', {}).get('output', 'Не доступно')}

2️⃣ SMC (Smart Money Concepts):
{previous_steps.get('smc', {}).get('output', 'Не доступно')}

3️⃣ VSA (Volume Spread Analysis):
{previous_steps.get('vsa', {}).get('output', 'Не доступно')}

4️⃣ DELTA:
{previous_steps.get('delta', {}).get('output', 'Не доступно')}

5️⃣ ICT:
{previous_steps.get('ict', {}).get('output', 'Не доступно')}

---

Теперь создай финальный пост в формате Telegram, следуя ТОЧНО этому шаблону:

💬 ПРОМТ ДЛЯ АНАЛИЗА РЫНКА (в формате поста для TELEGRAM)

Сделай анализ рынка в форме готового сообщения для Телеграм-канала —
структурно, списками, без таблиц и без воды.
Текст должен быть как полноценный пост с логикой профессионального разбора и планом действий.

⸻

🔹 Требования к оформлению:
 • Обязательно должен быть заголовок, отражающий суть анализа.
 • Далее — блоки с анализом по каждому методу.
 • Всё в едином стиле телеграм-поста: коротко, точно, информативно.
 • В конце — внутридневной торговый план и таймфрейм для закрепления входа.

⸻

🔹 Проанализируй рынок по 5 подходам:
 • Wyckoff
 • Smart Money Concepts (SMC)
 • ICT
 • VSA
 • Delta-анализ

⸻

🔹 Пошагово:
1️⃣ Wyckoff — фаза рынка, контекст, вероятный сценарий.
2️⃣ SMC — BOS, CHoCH, OB, FVG, Liquidity Pools, ключевые уровни/возвраты.
3️⃣ VSA — активность крупных участников; no demand/supply; stopping volume; climactic action; effort vs result.
4️⃣ Delta — доминация, аномалии, абсорбция, дивергенции, удержание.
5️⃣ ICT — манипуляции ликвидностью, зоны возврата (FVG, PD Arrays), точки входа.

⸻

🔹 Объединение:
 • Wyckoff — контекст цикла.
 • SMC — структура и зоны ликвидности.
 • VSA+Delta — подтверждение силы/слабости.
 • ICT — точка входа после манипуляции и возврата в дисбаланс.

Логика: Контекст → Структура → Подтверждение силы → Манипуляция → Вход → Удержание.

⸻

🔹 Манипуляционный план (Smart Money / ICT):
 • Где вероятен сбор ликвидности (над хаями/под лоями).
 • Где ложный пробой и возврат в диапазон.
 • Какая зона возврата (FVG/OB) — ключ для входа.
 • Где цели и стопы маркетмейкера.
 • Что подтвердит сценарий (BOS или реакция по дельте).

⸻

🔹 Внутридневной торговый план («если-то»):
 • Если закрепление выше ключевой зоны → приоритет лонг; вход после теста + подтверждения по дельте.
 • Если ниже зоны ликвидности → приоритет шорт; вход после возврата в дисбаланс.
 • Если консолидация без силы → ожидание; работа от границ диапазона.

📍 Укажи: приоритет направления, зону входа, зону стопа, ближайшие цели, таймфрейм закрепления (M15/H1).

⸻

🔹 Итог: три сценария
 • 🟢 Бычий — при закреплении выше ключевой зоны.
 • 🔴 Медвежий — при закреплении ниже.
 • ⚪ Нейтральный — при консолидации.

⸻

📌 Формат вывода:
 • Всё в виде готового поста для Telegram.
 • Есть заголовок.
 • Всё списками, без таблиц, без воды.

Создай финальный пост сейчас, используя результаты анализа выше."""
        
        return prompt

