"""
Admin subscription management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal

from app.core.database import get_db
from app.core.auth import get_current_admin_user_dependency
from app.models.user import User
from app.services.subscription import (
    get_active_subscription,
    get_subscription_by_id,
    update_subscription,
    renew_subscription,
    reset_subscription_period,
    extend_trial,
    get_subscription_stats,
)
from app.services.balance import add_tokens, set_token_balance, get_token_balance

router = APIRouter()


class SubscriptionPlanResponse(BaseModel):
    id: int
    name: str
    display_name: str
    description: Optional[str]
    monthly_tokens: int
    price_monthly: Optional[Decimal]
    price_currency: str
    is_trial: bool
    trial_duration_days: Optional[int]
    included_features: List[str]
    is_active: bool
    is_visible: bool

    class Config:
        from_attributes = True


# Request/Response Models
class UpdateSubscriptionRequest(BaseModel):
    plan_id: Optional[int] = None
    add_tokens: Optional[int] = None  # Add tokens to balance
    set_tokens_used: Optional[int] = None  # Set tokens_used_this_period directly
    set_token_balance: Optional[int] = None  # Set token balance directly
    reset_period: Optional[bool] = None  # Reset period (renew subscription)
    extend_trial_days: Optional[int] = None  # Extend trial by N days


class UserSubscriptionResponse(BaseModel):
    id: int
    user_id: int
    organization_id: int
    plan_id: int
    plan_name: str
    plan_display_name: str
    status: str
    started_at: datetime
    trial_ends_at: Optional[datetime]
    tokens_allocated: int
    tokens_used_this_period: int
    tokens_remaining: int
    tokens_used_percent: float
    period_start_date: date
    period_end_date: date
    days_remaining_in_period: int
    is_trial: bool
    trial_days_remaining: Optional[int]
    cancelled_at: Optional[datetime]
    cancelled_reason: Optional[str]
    token_balance: int  # Current token balance


@router.get("/users/{user_id}/subscription", response_model=UserSubscriptionResponse)
async def get_user_subscription(
    user_id: int,
    organization_id: Optional[int] = Query(None, description="Organization ID (defaults to user's personal org)"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Get user's subscription (admin only)."""
    # Get organization
    if not organization_id:
        from app.services.organization import get_user_personal_organization
        org = get_user_personal_organization(db, user_id)
        if not org:
            raise HTTPException(status_code=404, detail="User organization not found")
        organization_id = org.id
    
    # Get subscription
    subscription = get_active_subscription(db, user_id, organization_id)
    
    if not subscription:
        raise HTTPException(
            status_code=404,
            detail="No active subscription found for this user/organization"
        )
    
    # Get statistics
    stats = get_subscription_stats(db, subscription)
    
    # Get token balance
    balance = get_token_balance(db, user_id, organization_id)
    
    return UserSubscriptionResponse(
        id=subscription.id,
        user_id=subscription.user_id,
        organization_id=subscription.organization_id,
        plan_id=subscription.plan_id,
        plan_name=subscription.plan_name,
        plan_display_name=subscription.plan_display_name,
        status=subscription.status,
        started_at=subscription.started_at,
        trial_ends_at=subscription.trial_ends_at,
        tokens_allocated=subscription.tokens_allocated,
        tokens_used_this_period=subscription.tokens_used_this_period,
        tokens_remaining=stats.tokens_remaining,
        tokens_used_percent=stats.tokens_used_percent,
        period_start_date=subscription.period_start_date,
        period_end_date=subscription.period_end_date,
        days_remaining_in_period=stats.days_remaining_in_period,
        is_trial=stats.is_trial,
        trial_days_remaining=stats.trial_days_remaining,
        cancelled_at=subscription.cancelled_at,
        cancelled_reason=subscription.cancelled_reason,
        token_balance=balance.balance,
    )


@router.put("/users/{user_id}/subscription", response_model=UserSubscriptionResponse)
async def update_user_subscription(
    user_id: int,
    request: UpdateSubscriptionRequest,
    organization_id: Optional[int] = Query(None, description="Organization ID (defaults to user's personal org)"),
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """Update user's subscription (admin only).
    
    Can:
    - Change plan (plan_id)
    - Add tokens to balance (add_tokens)
    - Reset period (reset_period=True)
    - Extend trial (extend_trial_days)
    """
    # Get organization
    if not organization_id:
        from app.services.organization import get_user_personal_organization
        org = get_user_personal_organization(db, user_id)
        if not org:
            raise HTTPException(status_code=404, detail="User organization not found")
        organization_id = org.id
    
    # Get subscription
    subscription = get_active_subscription(db, user_id, organization_id)
    
    if not subscription:
        raise HTTPException(
            status_code=404,
            detail="No active subscription found for this user/organization"
        )
    
    # Apply updates
    updated_subscription = subscription
    
    # Change plan
    if request.plan_id is not None and request.plan_id != subscription.plan_id:
        updated_subscription = update_subscription(db, subscription.id, request.plan_id)
    
    # Set tokens_used_this_period directly
    if request.set_tokens_used is not None:
        if request.set_tokens_used < 0:
            raise HTTPException(status_code=400, detail="tokens_used_this_period cannot be negative")
        db.execute(
            text("""
                UPDATE user_subscriptions
                SET tokens_used_this_period = :tokens_used,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :subscription_id
            """),
            {
                "subscription_id": updated_subscription.id,
                "tokens_used": request.set_tokens_used,
            }
        )
        db.commit()
        # Refresh subscription object
        updated_subscription = get_subscription_by_id(db, updated_subscription.id)
        if not updated_subscription:
            raise HTTPException(status_code=404, detail="Subscription not found after update")
    
    # Set token balance directly
    if request.set_token_balance is not None:
        set_token_balance(
            db=db,
            user_id=user_id,
            organization_id=organization_id,
            amount=request.set_token_balance,
            reason=f"Admin set balance directly (via subscription update)"
        )
    
    # Add tokens to balance
    if request.add_tokens is not None and request.add_tokens > 0:
        add_tokens(
            db=db,
            user_id=user_id,
            organization_id=organization_id,
            amount=request.add_tokens,
            reason=f"Admin added tokens (via subscription update)"
        )
    
    # Reset period (manual reset - starts from today)
    if request.reset_period:
        try:
            updated_subscription = reset_subscription_period(db, updated_subscription.id)
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Failed to reset subscription period: {str(e)}"
            )
    
    # Extend trial
    if request.extend_trial_days is not None and request.extend_trial_days > 0:
        if updated_subscription.status != "trial":
            raise HTTPException(
                status_code=400,
                detail="Can only extend trial for trial subscriptions"
            )
        updated_subscription = extend_trial(db, updated_subscription.id, request.extend_trial_days)
    
    # Get updated statistics
    stats = get_subscription_stats(db, updated_subscription)
    
    # Get updated token balance
    balance = get_token_balance(db, user_id, organization_id)
    
    return UserSubscriptionResponse(
        id=updated_subscription.id,
        user_id=updated_subscription.user_id,
        organization_id=updated_subscription.organization_id,
        plan_id=updated_subscription.plan_id,
        plan_name=updated_subscription.plan_name,
        plan_display_name=updated_subscription.plan_display_name,
        status=updated_subscription.status,
        started_at=updated_subscription.started_at,
        trial_ends_at=updated_subscription.trial_ends_at,
        tokens_allocated=updated_subscription.tokens_allocated,
        tokens_used_this_period=updated_subscription.tokens_used_this_period,
        tokens_remaining=stats.tokens_remaining,
        tokens_used_percent=stats.tokens_used_percent,
        period_start_date=updated_subscription.period_start_date,
        period_end_date=updated_subscription.period_end_date,
        days_remaining_in_period=stats.days_remaining_in_period,
        is_trial=stats.is_trial,
        trial_days_remaining=stats.trial_days_remaining,
        cancelled_at=updated_subscription.cancelled_at,
        cancelled_reason=updated_subscription.cancelled_reason,
        token_balance=balance.balance,
    )


@router.get("/subscription-plans", response_model=List[SubscriptionPlanResponse])
async def list_subscription_plans(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user_dependency),
):
    """List all subscription plans (admin only)."""
    from sqlalchemy import text
    import json
    
    result = db.execute(
        text("""
            SELECT 
                id, name, display_name, description, monthly_tokens,
                price_monthly, price_currency, is_trial, trial_duration_days,
                included_features, is_active, is_visible
            FROM subscription_plans
            ORDER BY is_trial DESC, monthly_tokens ASC
        """)
    )
    
    plans = []
    for row in result:
        plans.append(SubscriptionPlanResponse(
            id=row.id,
            name=row.name,
            display_name=row.display_name,
            description=row.description,
            monthly_tokens=row.monthly_tokens,
            price_monthly=row.price_monthly,
            price_currency=row.price_currency or "RUB",
            is_trial=bool(row.is_trial),
            trial_duration_days=row.trial_duration_days,
            included_features=json.loads(row.included_features) if isinstance(row.included_features, str) else row.included_features,
            is_active=bool(row.is_active),
            is_visible=bool(row.is_visible),
        ))
    
    return plans

