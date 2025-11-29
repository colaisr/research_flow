"""
OpenRouter LLM client for making AI calls.
"""
from openai import OpenAI
from app.core.config import OPENROUTER_BASE_URL, DEFAULT_LLM_MODEL
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)


def get_openrouter_api_key(db: Optional[Session] = None) -> Optional[str]:
    """Get OpenRouter API key from Settings (AppSettings table).
    
    Args:
        db: Database session (required)
    
    Returns:
        API key string or None if not found
    """
    if not db:
        logger.error("Database session required to read OpenRouter API key from Settings")
        return None
    
    try:
        from app.models.settings import AppSettings
        setting = db.query(AppSettings).filter(
            AppSettings.key == "openrouter_api_key"
        ).first()
        if setting and setting.value:
            return setting.value
        return None
    except Exception as e:
        logger.error(f"Failed to read OpenRouter API key from Settings: {e}")
        return None


class LLMClient:
    """Client for making LLM calls via OpenRouter."""
    
    def __init__(self, api_key: Optional[str] = None, db: Optional[Session] = None):
        """Initialize OpenRouter client.
        
        Args:
            api_key: Optional API key. If not provided, will read from Settings (AppSettings table)
            db: Database session (required if api_key not provided)
        """
        # Get API key: use provided, or fetch from Settings
        if not api_key:
            api_key = get_openrouter_api_key(db)
        
        if not api_key:
            raise ValueError(
                "OpenRouter API key not configured. "
                "Please set it in Settings → OpenRouter Configuration"
            )
        
        self.api_key = api_key
        
        # Create OpenAI client without proxies to avoid version compatibility issues
        import httpx
        http_client = httpx.Client(
            timeout=60.0,
            follow_redirects=True,
        )
        
        self.client = OpenAI(
            api_key=api_key,
            base_url=OPENROUTER_BASE_URL,
            http_client=http_client,
        )
        self.default_model = DEFAULT_LLM_MODEL
    
    def call(
        self,
        system_prompt: str,
        user_prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Make an LLM call via OpenRouter.
        
        Args:
            system_prompt: System message/instructions
            user_prompt: User message/content
            model: Model to use (defaults to DEFAULT_LLM_MODEL)
            temperature: Sampling temperature (0-2)
            max_tokens: Maximum tokens to generate
            
        Returns:
            Dict with 'content', 'model', 'tokens_used', 'cost_est'
        """
        model = model or self.default_model
        
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            
            content = response.choices[0].message.content
            
            # Extract token usage details
            if response.usage:
                input_tokens = response.usage.prompt_tokens if hasattr(response.usage, 'prompt_tokens') else 0
                output_tokens = response.usage.completion_tokens if hasattr(response.usage, 'completion_tokens') else 0
                total_tokens = response.usage.total_tokens if hasattr(response.usage, 'total_tokens') else (input_tokens + output_tokens)
            else:
                input_tokens = 0
                output_tokens = 0
                total_tokens = 0
            
            # Estimate cost (rough approximation, varies by model)
            # OpenRouter pricing: https://openrouter.ai/models
            # Using conservative estimate of $0.01 per 1K tokens for most models
            cost_est = (total_tokens / 1000) * 0.01
            
            logger.info(
                f"llm_call_completed: model={model}, input_tokens={input_tokens}, output_tokens={output_tokens}, total_tokens={total_tokens}, cost_est={cost_est}"
            )
            
            return {
                "content": content,
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "tokens_used": total_tokens,  # Keep for backward compatibility
                "cost_est": cost_est,
            }
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            
            # Log detailed error information
            logger.error(
                f"llm_call_failed: model={repr(model)}, error_type={error_type}, error={error_msg}"
            )
            
            # Check if it's an authentication error (invalid API key)
            if "401" in error_msg or "unauthorized" in error_msg.lower() or "invalid" in error_msg.lower():
                raise ValueError(
                    f"OpenRouter API key is invalid or expired. "
                    f"Please update it in Settings → OpenRouter Configuration. Error: {error_msg}"
                )
            
            # Check if it's a model not found error
            if "404" in error_msg or "not found" in error_msg.lower() or "model" in error_msg.lower() and "invalid" in error_msg.lower():
                raise ValueError(
                    f"Model '{model}' not found or invalid. "
                    f"Please check the model name in your analysis configuration. "
                    f"Error: {error_msg}"
                )
            
            # Generic error with model name
            raise ValueError(
                f"LLM call failed for model '{model}': {error_msg} "
                f"(Error type: {error_type})"
            )


def fetch_available_models_from_openrouter(
    api_key: Optional[str] = None,
    db: Optional[Session] = None
) -> List[Dict[str, Any]]:
    """Fetch list of available models from OpenRouter API.
    
    Args:
        api_key: Optional API key. If not provided, will read from Settings
        db: Database session (required if api_key not provided)
    
    Returns:
        List of model dictionaries with model information from OpenRouter
    
    Raises:
        ValueError: If API key is not configured or API call fails
    """
    # Get API key
    if not api_key:
        api_key = get_openrouter_api_key(db)
    
    if not api_key:
        raise ValueError(
            "OpenRouter API key not configured. "
            "Please set it in Settings → OpenRouter Configuration"
        )
    
    try:
        # OpenRouter uses OpenAI-compatible API, so we can use the models endpoint
        import httpx
        http_client = httpx.Client(
            timeout=60.0,
            follow_redirects=True,
        )
        
        client = OpenAI(
            api_key=api_key,
            base_url=OPENROUTER_BASE_URL,
            http_client=http_client,
        )
        
        # Fetch models from OpenRouter
        models_response = client.models.list()
        
        models = []
        for model in models_response.data:
            # Extract provider from model ID (format: provider/model-name)
            provider = model.id.split('/')[0] if '/' in model.id else 'unknown'
            
            # Parse model info
            model_info = {
                "id": model.id,
                "name": model.id,  # Full model ID like "openai/gpt-4o"
                "display_name": model.id.split('/')[-1].replace('-', ' ').title() if '/' in model.id else model.id,
                "provider": provider,
                "description": getattr(model, 'description', None) or f"{provider.title()} model",
                "max_tokens": getattr(model, 'context_length', None),
                "cost_per_1k_tokens": None,  # Pricing info not in standard OpenAI response
            }
            models.append(model_info)
        
        logger.info(f"Fetched {len(models)} models from OpenRouter API")
        return models
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to fetch models from OpenRouter: {error_msg}")
        
        # Check if it's an authentication error
        if "401" in error_msg or "unauthorized" in error_msg.lower() or "invalid" in error_msg.lower():
            raise ValueError(
                f"OpenRouter API key is invalid or expired. "
                f"Please update it in Settings → OpenRouter Configuration. Error: {error_msg}"
            )
        
        raise ValueError(f"Failed to fetch models from OpenRouter: {error_msg}")

