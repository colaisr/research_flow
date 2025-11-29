"""
Consumption model classes for token usage tracking.
"""
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime
from typing import Optional


@dataclass
class ConsumptionStats:
    """Consumption statistics for a user/organization."""
    total_tokens: int
    total_cost_rub: Decimal
    total_price_rub: Decimal
    consumption_count: int
    period_start: datetime
    period_end: datetime
    
    # Breakdown by model
    by_model: dict[str, dict]  # model_name -> {tokens, cost, price, count}
    
    # Breakdown by provider
    by_provider: dict[str, dict]  # provider -> {tokens, cost, price, count}


@dataclass
class ConsumptionHistoryItem:
    """Single consumption record for history listing."""
    id: int
    consumed_at: datetime
    model_name: str
    provider: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost_rub: Decimal
    price_rub: Decimal
    source_type: str
    run_id: Optional[int]
    step_id: Optional[int]
    source_name: Optional[str] = None


@dataclass
class ChartDataPoint:
    """Data point for consumption charts."""
    date: str  # Date in YYYY-MM-DD format
    tokens: int
    cost_rub: Decimal
    price_rub: Decimal

