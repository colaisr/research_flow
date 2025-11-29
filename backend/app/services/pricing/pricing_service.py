"""
Pricing service for calculating costs and user prices.

This service handles:
- Retrieving model pricing from database
- Calculating our costs (what we pay to providers)
- Calculating user prices (with platform fee)
- Converting between USD and RUB
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from sqlalchemy.orm import Session
from app.core.config import EXCHANGE_RATE_USD_TO_RUB
from app.services.pricing.pricing_models import ModelPricing, PricingCalculation


def get_exchange_rate() -> Decimal:
    """
    Get exchange rate from config.
    
    Returns:
        Exchange rate (USD to RUB) as Decimal
    """
    return Decimal(str(EXCHANGE_RATE_USD_TO_RUB))


def get_model_pricing(db: Session, model_name: str, provider: str) -> Optional[ModelPricing]:
    """
    Get model pricing from database.
    
    Args:
        db: Database session
        model_name: Model name (e.g., "openai/gpt-4o-mini")
        provider: Provider name (e.g., "openrouter")
    
    Returns:
        ModelPricing object or None if not found
    """
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT id, model_name, provider, cost_per_1k_input_usd, cost_per_1k_output_usd,
                   platform_fee_percent, price_per_1k_usd, is_active, is_visible
            FROM model_pricing
            WHERE model_name = :model_name AND provider = :provider AND is_active = 1
        """),
        {"model_name": model_name, "provider": provider}
    )
    row = result.fetchone()
    
    if not row:
        return None
    
    return ModelPricing.from_db_row(row)


def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    pricing: ModelPricing
) -> tuple[Decimal, Decimal, Decimal]:
    """
    Calculate our cost (what we pay to providers).
    
    Args:
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        pricing: ModelPricing object
    
    Returns:
        Tuple of (input_cost_usd, output_cost_usd, total_cost_usd)
    """
    # Calculate input cost
    input_cost_usd = (Decimal(input_tokens) / Decimal(1000)) * pricing.cost_per_1k_input_usd
    
    # Calculate output cost
    output_cost_usd = (Decimal(output_tokens) / Decimal(1000)) * pricing.cost_per_1k_output_usd
    
    # Total cost
    total_cost_usd = input_cost_usd + output_cost_usd
    
    return input_cost_usd, output_cost_usd, total_cost_usd


def calculate_user_price(
    total_tokens: int,
    pricing: ModelPricing
) -> Decimal:
    """
    Calculate user price (with platform fee).
    
    Uses the price_per_1k_usd from database (already includes platform fee).
    
    Args:
        total_tokens: Total tokens (input + output)
        pricing: ModelPricing object
    
    Returns:
        User price in USD
    """
    user_price_usd = (Decimal(total_tokens) / Decimal(1000)) * pricing.price_per_1k_usd
    return user_price_usd


def convert_to_rubles(usd_amount: Decimal, exchange_rate: Optional[Decimal] = None) -> Decimal:
    """
    Convert USD amount to rubles.
    
    Args:
        usd_amount: Amount in USD
        exchange_rate: Exchange rate (USD to RUB). If None, uses config value.
    
    Returns:
        Amount in rubles (rounded to 2 decimal places)
    """
    if exchange_rate is None:
        exchange_rate = get_exchange_rate()
    
    rub_amount = usd_amount * exchange_rate
    # Round to 2 decimal places
    return rub_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calculate_pricing(
    db: Session,
    model_name: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    exchange_rate: Optional[Decimal] = None
) -> Optional[PricingCalculation]:
    """
    Complete pricing calculation for a token usage.
    
    This is the main function that combines all pricing calculations.
    
    Args:
        db: Database session
        model_name: Model name (e.g., "openai/gpt-4o-mini")
        provider: Provider name (e.g., "openrouter")
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        exchange_rate: Optional exchange rate override
    
    Returns:
        PricingCalculation object or None if pricing not found
    """
    # Get model pricing
    pricing = get_model_pricing(db, model_name, provider)
    if not pricing:
        return None
    
    # Get exchange rate
    if exchange_rate is None:
        exchange_rate = get_exchange_rate()
    
    # Calculate our costs
    our_input_cost_usd, our_output_cost_usd, our_total_cost_usd = calculate_cost(
        input_tokens, output_tokens, pricing
    )
    
    # Calculate user price
    total_tokens = input_tokens + output_tokens
    user_price_usd = calculate_user_price(total_tokens, pricing)
    
    # Convert to rubles
    user_price_rub = convert_to_rubles(user_price_usd, exchange_rate)
    our_cost_rub = convert_to_rubles(our_total_cost_usd, exchange_rate)
    
    return PricingCalculation(
        our_input_cost_usd=our_input_cost_usd,
        our_output_cost_usd=our_output_cost_usd,
        our_total_cost_usd=our_total_cost_usd,
        user_price_usd=user_price_usd,
        user_price_rub=user_price_rub,
        our_cost_rub=our_cost_rub,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        cost_per_1k_input_usd=pricing.cost_per_1k_input_usd,
        cost_per_1k_output_usd=pricing.cost_per_1k_output_usd,
        price_per_1k_usd=pricing.price_per_1k_usd,
        platform_fee_percent=pricing.platform_fee_percent,
        exchange_rate=exchange_rate,
    )

