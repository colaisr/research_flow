"""
Google Gemini pricing sync adapter (placeholder for future implementation).
"""
import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.services.pricing.adapters.base import PricingSyncAdapter

logger = logging.getLogger(__name__)


class GeminiPricingAdapter(PricingSyncAdapter):
    """Adapter for syncing pricing from Google Gemini API (placeholder)."""
    
    def fetch_pricing(self, api_key: str) -> List[Dict[str, Any]]:
        """
        Fetch pricing from Gemini API.
        
        TODO: Implement when Gemini API pricing endpoint is available.
        """
        logger.warning("Gemini pricing adapter not yet implemented")
        return []
    
    def sync_to_database(
        self,
        db: Session,
        provider: str,
        platform_fee_percent: float = 40.0
    ) -> int:
        """
        Sync pricing from Gemini API to database.
        
        TODO: Implement when Gemini API pricing endpoint is available.
        """
        logger.warning("Gemini pricing adapter not yet implemented")
        return 0

