"""
Pricing sync adapters for different providers.

Adapters fetch pricing information from provider APIs and sync to database.
"""
from app.services.pricing.adapters.base import PricingSyncAdapter
from app.services.pricing.adapters.openrouter import OpenRouterPricingAdapter
from app.services.pricing.adapters.gemini import GeminiPricingAdapter

__all__ = [
    "PricingSyncAdapter",
    "OpenRouterPricingAdapter",
    "GeminiPricingAdapter",
    "get_adapter",
]


def get_adapter(provider: str) -> PricingSyncAdapter:
    """
    Factory function to get adapter by provider name.
    
    Args:
        provider: Provider name (e.g., "openrouter", "gemini")
    
    Returns:
        PricingSyncAdapter instance
    
    Raises:
        ValueError: If provider not supported
    """
    adapters = {
        "openrouter": OpenRouterPricingAdapter,
        "gemini": GeminiPricingAdapter,
    }
    
    adapter_class = adapters.get(provider.lower())
    if not adapter_class:
        raise ValueError(f"Unsupported provider: {provider}. Supported: {list(adapters.keys())}")
    
    return adapter_class()

