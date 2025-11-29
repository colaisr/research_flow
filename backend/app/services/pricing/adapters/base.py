"""
Base adapter class for pricing sync adapters.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from sqlalchemy.orm import Session


class PricingSyncAdapter(ABC):
    """Abstract base class for pricing sync adapters."""
    
    @abstractmethod
    def fetch_pricing(self, api_key: str) -> List[Dict[str, Any]]:
        """
        Fetch pricing information from provider API.
        
        Args:
            api_key: Provider API key
        
        Returns:
            List of pricing dictionaries with keys:
            - model_name: str - Model identifier (e.g., "openai/gpt-4o-mini")
            - cost_per_1k_input_usd: float - Cost per 1K input tokens in USD
            - cost_per_1k_output_usd: float - Cost per 1K output tokens in USD
            - max_tokens: int (optional) - Maximum context length
            - description: str (optional) - Model description
        
        Raises:
            Exception: If API call fails
        """
        pass
    
    @abstractmethod
    def sync_to_database(
        self,
        db: Session,
        provider: str,
        platform_fee_percent: float = 40.0
    ) -> int:
        """
        Sync pricing from provider API to database.
        
        Args:
            db: Database session
            provider: Provider name (e.g., "openrouter")
            platform_fee_percent: Platform fee percentage (default: 40.0)
        
        Returns:
            Number of models synced
        
        Raises:
            Exception: If sync fails
        """
        pass
    
    def calculate_user_price(
        self,
        cost_per_1k_input_usd: float,
        cost_per_1k_output_usd: float,
        platform_fee_percent: float
    ) -> float:
        """
        Calculate user price per 1K tokens (average cost + platform fee).
        
        Args:
            cost_per_1k_input_usd: Cost per 1K input tokens
            cost_per_1k_output_usd: Cost per 1K output tokens
            platform_fee_percent: Platform fee percentage
        
        Returns:
            User price per 1K tokens in USD
        """
        avg_cost = (cost_per_1k_input_usd + cost_per_1k_output_usd) / 2
        return avg_cost * (1 + platform_fee_percent / 100)

