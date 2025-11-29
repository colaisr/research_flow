"""
Pricing model classes.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional


@dataclass
class ModelPricing:
    """Model pricing information from database."""
    id: int
    model_name: str
    provider: str
    cost_per_1k_input_usd: Decimal
    cost_per_1k_output_usd: Decimal
    platform_fee_percent: Decimal
    price_per_1k_usd: Decimal
    is_active: bool
    is_visible: bool
    
    @classmethod
    def from_db_row(cls, row) -> "ModelPricing":
        """Create ModelPricing from database row."""
        return cls(
            id=row.id,
            model_name=row.model_name,
            provider=row.provider,
            cost_per_1k_input_usd=Decimal(str(row.cost_per_1k_input_usd)),
            cost_per_1k_output_usd=Decimal(str(row.cost_per_1k_output_usd)),
            platform_fee_percent=Decimal(str(row.platform_fee_percent)),
            price_per_1k_usd=Decimal(str(row.price_per_1k_usd)),
            is_active=bool(row.is_active),
            is_visible=bool(row.is_visible),
        )


@dataclass
class PricingCalculation:
    """Result of pricing calculation."""
    # Our costs (what we pay to providers)
    our_input_cost_usd: Decimal
    our_output_cost_usd: Decimal
    our_total_cost_usd: Decimal
    
    # User prices (what users pay)
    user_price_usd: Decimal
    user_price_rub: Decimal
    
    # Our costs in rubles
    our_cost_rub: Decimal
    
    # Token counts
    input_tokens: int
    output_tokens: int
    total_tokens: int
    
    # Pricing details
    cost_per_1k_input_usd: Decimal
    cost_per_1k_output_usd: Decimal
    price_per_1k_usd: Decimal
    platform_fee_percent: Decimal
    exchange_rate: Decimal

