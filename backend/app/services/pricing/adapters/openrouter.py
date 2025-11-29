"""
OpenRouter pricing sync adapter.

Fetches model pricing from OpenRouter API and syncs to database.
"""
import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
from openai import OpenAI
from app.core.config import OPENROUTER_BASE_URL
from app.services.pricing.adapters.base import PricingSyncAdapter

logger = logging.getLogger(__name__)


class OpenRouterPricingAdapter(PricingSyncAdapter):
    """Adapter for syncing pricing from OpenRouter API."""
    
    def fetch_pricing(self, api_key: str) -> List[Dict[str, Any]]:
        """
        Fetch pricing from OpenRouter API.
        
        OpenRouter provides pricing via their models endpoint.
        Uses direct HTTP call to get full model information including pricing.
        """
        import httpx
        import json
        
        try:
            # OpenRouter models endpoint with pricing
            url = f"{OPENROUTER_BASE_URL}/models"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            
            http_client = httpx.Client(
                timeout=60.0,
                follow_redirects=True,
            )
            
            response = http_client.get(url, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            models = data.get("data", [])
            
            pricing_data = []
            for model in models:
                model_id = model.get("id")
                if not model_id:
                    continue
                
                # Extract pricing (OpenRouter format may vary)
                # OpenRouter returns pricing PER TOKEN as strings like "0.00000125"
                # This means $0.00000125 per token
                # To convert to per-1K-tokens: multiply by 1,000 (1000 tokens)
                # Format: {"prompt": "0.00000125", "completion": "0.00001"} (per token)
                # Example: GPT-5 returns "0.00000125" per token = $0.00125 per 1K tokens (actual charge)
                pricing = model.get("pricing", {})
                if isinstance(pricing, dict):
                    # Get per-token prices (OpenRouter returns as strings)
                    prompt_per_token = float(pricing.get("prompt", pricing.get("input", 0)))
                    completion_per_token = float(pricing.get("completion", pricing.get("output", 0)))
                    
                    # Skip models with negative or invalid pricing
                    if prompt_per_token < 0 or completion_per_token < 0:
                        logger.debug(f"Skipping {model_id}: negative pricing (input={prompt_per_token}, output={completion_per_token})")
                        continue
                    
                    # Convert to per-1K-tokens
                    # OpenRouter format: "0.00000125" = $0.00000125 per token
                    # For 1K tokens: $0.00000125 * 1000 = $0.00125 per 1K tokens
                    # This matches what OpenRouter actually charges (verified against actual charges)
                    cost_input = prompt_per_token * 1_000
                    cost_output = completion_per_token * 1_000
                    
                    # Ensure values fit in decimal(10,6) - max 9999.999999
                    if cost_input > 9999.999999 or cost_output > 9999.999999:
                        logger.warning(f"Skipping {model_id}: price too large for database (input={cost_input}, output={cost_output})")
                        continue
                else:
                    # Try alternative formats or skip
                    cost_input = 0
                    cost_output = 0
                
                # Skip if no pricing available
                if cost_input == 0 and cost_output == 0:
                    continue
                
                pricing_data.append({
                    "model_name": model_id,
                    "cost_per_1k_input_usd": cost_input,
                    "cost_per_1k_output_usd": cost_output,
                    "max_tokens": model.get("context_length"),
                    "description": model.get("description") or f"Model {model_id}",
                })
            
            logger.info(f"Fetched {len(pricing_data)} models with pricing from OpenRouter")
            return pricing_data
            
        except Exception as e:
            logger.error(f"Failed to fetch pricing from OpenRouter: {e}")
            raise
    
    def sync_to_database(
        self,
        db: Session,
        provider: str,
        platform_fee_percent: float = 40.0,
        api_key: str = None
    ) -> int:
        """
        Sync pricing from OpenRouter API to database.
        
        Args:
            db: Database session
            provider: Provider name (should be "openrouter")
            platform_fee_percent: Platform fee percentage
            api_key: OpenRouter API key (if None, will try to get from provider_credentials)
        
        Returns:
            Number of models synced
        """
        # Get API key if not provided
        if not api_key:
            from sqlalchemy import text
            result = db.execute(
                text("SELECT api_key_encrypted FROM provider_credentials WHERE provider = :provider"),
                {"provider": provider}
            )
            row = result.fetchone()
            if not row or not row[0]:
                raise ValueError(f"API key not found for provider: {provider}")
            api_key = row[0]  # TODO: Decrypt if encrypted
        
        # Fetch pricing from API
        pricing_data = self.fetch_pricing(api_key)
        
        if not pricing_data:
            logger.warning("No pricing data fetched from OpenRouter")
            return 0
        
        # Sync to database
        synced_count = 0
        for model_data in pricing_data:
            model_name = model_data["model_name"]
            cost_input = model_data["cost_per_1k_input_usd"]
            cost_output = model_data["cost_per_1k_output_usd"]
            
            # Calculate user price
            price_per_1k = self.calculate_user_price(
                cost_input,
                cost_output,
                platform_fee_percent
            )
            
            # Check if model pricing already exists
            result = db.execute(
                text("""
                    SELECT id FROM model_pricing 
                    WHERE model_name = :model_name AND provider = :provider
                """),
                {"model_name": model_name, "provider": provider}
            )
            existing = result.fetchone()
            
            if existing:
                # Update existing pricing
                db.execute(
                    text("""
                        UPDATE model_pricing
                        SET cost_per_1k_input_usd = :cost_input,
                            cost_per_1k_output_usd = :cost_output,
                            price_per_1k_usd = :price_per_1k,
                            platform_fee_percent = :fee_percent,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = :id
                    """),
                    {
                        "id": existing[0],
                        "cost_input": cost_input,
                        "cost_output": cost_output,
                        "price_per_1k": price_per_1k,
                        "fee_percent": platform_fee_percent,
                    }
                )
            else:
                # Insert new pricing
                db.execute(
                    text("""
                        INSERT INTO model_pricing
                        (model_name, provider, cost_per_1k_input_usd, cost_per_1k_output_usd,
                         platform_fee_percent, price_per_1k_usd, is_active, is_visible)
                        VALUES
                        (:model_name, :provider, :cost_input, :cost_output,
                         :fee_percent, :price_per_1k, 1, 1)
                    """),
                    {
                        "model_name": model_name,
                        "provider": provider,
                        "cost_input": cost_input,
                        "cost_output": cost_output,
                        "fee_percent": platform_fee_percent,
                        "price_per_1k": price_per_1k,
                    }
                )
            synced_count += 1
        
        db.commit()
        logger.info(f"Synced {synced_count} models from OpenRouter to database")
        return synced_count

