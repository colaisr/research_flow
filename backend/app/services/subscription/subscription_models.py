"""
Subscription model classes.
"""
from dataclasses import dataclass
from datetime import datetime, date
from typing import Optional


@dataclass
class Subscription:
    """Subscription data class."""
    id: int
    user_id: int
    organization_id: int
    plan_id: int
    plan_name: str
    plan_display_name: str
    status: str  # trial, active, expired, cancelled, suspended
    started_at: datetime
    trial_ends_at: Optional[datetime]
    tokens_allocated: int
    tokens_used_this_period: int
    period_start_date: date
    period_end_date: date
    cancelled_at: Optional[datetime]
    cancelled_reason: Optional[str]
    
    @classmethod
    def from_db_row(cls, row) -> "Subscription":
        """Create Subscription from database row."""
        return cls(
            id=row.id,
            user_id=row.user_id,
            organization_id=row.organization_id,
            plan_id=row.plan_id,
            plan_name=getattr(row, 'plan_name', None) or '',
            plan_display_name=getattr(row, 'plan_display_name', None) or '',
            status=row.status,
            started_at=row.started_at,
            trial_ends_at=row.trial_ends_at,
            tokens_allocated=row.tokens_allocated,
            tokens_used_this_period=row.tokens_used_this_period,
            period_start_date=row.period_start_date,
            period_end_date=row.period_end_date,
            cancelled_at=row.cancelled_at,
            cancelled_reason=row.cancelled_reason,
        )


@dataclass
class SubscriptionStats:
    """Subscription statistics."""
    subscription: Subscription
    tokens_remaining: int
    tokens_used_percent: float
    days_remaining_in_period: int
    is_trial: bool
    trial_days_remaining: Optional[int]

