"""
Subscription management API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal

from app.core.database import get_db
from app.core.auth import get_current_user_dependency, get_current_user_optional, get_current_organization_dependency
from app.models.user import User
from app.models.organization import Organization
from app.services.subscription import (
    get_active_subscription,
    get_current_subscription as get_current_subscription_service,
    get_subscription_stats,
)
from app.services.balance import get_available_tokens, get_token_balance

router = APIRouter()


# Response Models
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

    class Config:
        from_attributes = True


class SubscriptionResponse(BaseModel):
    id: int
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
    available_tokens: int  # subscription + balance
    token_balance: int  # purchased token packages balance


class SubscriptionHistoryItem(BaseModel):
    id: int
    plan_name: str
    plan_display_name: str
    status: str
    started_at: datetime
    trial_ends_at: Optional[datetime]
    period_start_date: date
    period_end_date: date
    cancelled_at: Optional[datetime]
    cancelled_reason: Optional[str]


class SubscriptionHistoryResponse(BaseModel):
    subscriptions: List[SubscriptionHistoryItem]
    total: int


@router.get("/current", response_model=SubscriptionResponse)
async def get_current_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """Get current subscription for the user/organization (including expired)."""
    subscription = get_current_subscription_service(
        db, current_user.id, current_organization.id
    )
    
    if not subscription:
        raise HTTPException(
            status_code=404,
            detail="No subscription found"
        )
    
    # Get statistics
    stats = get_subscription_stats(db, subscription)
    
    # Get available tokens (subscription + balance)
    available_tokens = get_available_tokens(
        db, current_user.id, current_organization.id
    )
    
    # Get token balance (purchased packages)
    balance = get_token_balance(db, current_user.id, current_organization.id)
    
    return SubscriptionResponse(
        id=subscription.id,
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
        available_tokens=available_tokens,
        token_balance=balance.balance,
    )


@router.get("/history", response_model=SubscriptionHistoryResponse)
async def get_subscription_history(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """Get subscription history for the user/organization."""
    from sqlalchemy import text
    
    # Get total count
    count_result = db.execute(
        text("""
            SELECT COUNT(*) as total
            FROM user_subscriptions
            WHERE user_id = :user_id AND organization_id = :org_id
        """),
        {"user_id": current_user.id, "org_id": current_organization.id}
    )
    total = count_result.fetchone()[0]
    
    # Get subscriptions
    result = db.execute(
        text("""
            SELECT 
                s.id, s.status, s.started_at, s.trial_ends_at,
                s.period_start_date, s.period_end_date,
                s.cancelled_at, s.cancelled_reason,
                p.name as plan_name, p.display_name as plan_display_name
            FROM user_subscriptions s
            INNER JOIN subscription_plans p ON s.plan_id = p.id
            WHERE s.user_id = :user_id AND s.organization_id = :org_id
            ORDER BY s.started_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {
            "user_id": current_user.id,
            "org_id": current_organization.id,
            "limit": limit,
            "offset": offset,
        }
    )
    
    subscriptions = []
    for row in result:
        subscriptions.append(SubscriptionHistoryItem(
            id=row.id,
            plan_name=row.plan_name,
            plan_display_name=row.plan_display_name,
            status=row.status,
            started_at=row.started_at,
            trial_ends_at=row.trial_ends_at,
            period_start_date=row.period_start_date,
            period_end_date=row.period_end_date,
            cancelled_at=row.cancelled_at,
            cancelled_reason=row.cancelled_reason,
        ))
    
    return SubscriptionHistoryResponse(
        subscriptions=subscriptions,
        total=total,
    )


@router.get("/plans", response_model=List[SubscriptionPlanResponse])
async def list_subscription_plans(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """List all visible subscription plans (public endpoint, no auth required for landing page)."""
    from sqlalchemy import text
    import json
    
    result = db.execute(
        text("""
            SELECT 
                id, name, display_name, description, monthly_tokens,
                price_monthly, price_currency, is_trial, trial_duration_days,
                included_features, is_visible
            FROM subscription_plans
            WHERE is_visible = 1
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
        ))
    
    return plans


class ChangePlanRequest(BaseModel):
    plan_id: int


class ChangePlanResponse(BaseModel):
    success: bool
    message: str
    subscription: SubscriptionResponse


@router.post("/change-plan", response_model=ChangePlanResponse)
async def change_subscription_plan(
    request: ChangePlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dependency),
    current_organization: Organization = Depends(get_current_organization_dependency),
):
    """Change user's subscription plan (upgrade/downgrade)."""
    from app.services.subscription import update_subscription
    
    # Get current subscription
    subscription = get_active_subscription(
        db, current_user.id, current_organization.id
    )
    
    if not subscription:
        raise HTTPException(
            status_code=404,
            detail="No active subscription found"
        )
    
    # Verify plan exists and is visible
    from sqlalchemy import text
    plan_result = db.execute(
        text("""
            SELECT id, name, display_name, price_monthly, is_visible, is_trial
            FROM subscription_plans
            WHERE id = :plan_id
        """),
        {"plan_id": request.plan_id}
    )
    plan = plan_result.fetchone()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found")
    
    if not plan.is_visible:
        raise HTTPException(status_code=400, detail="Subscription plan is not available")
    
    # Prevent switching to trial if user is on a paid plan
    current_plan_result = db.execute(
        text("""
            SELECT sp.is_trial, sp.price_monthly, us.status
            FROM user_subscriptions us
            INNER JOIN subscription_plans sp ON us.plan_id = sp.id
            WHERE us.id = :subscription_id
        """),
        {"subscription_id": subscription.id}
    )
    current_plan = current_plan_result.fetchone()
    
    if current_plan:
        current_is_trial = bool(current_plan.is_trial)
        current_has_price = current_plan.price_monthly and current_plan.price_monthly > 0
        current_status = current_plan.status
        
        # If user is on a paid plan (not trial and has price), prevent switching to trial
        if plan.is_trial and not current_is_trial and (current_has_price or current_status == 'active'):
            raise HTTPException(
                status_code=400,
                detail="Cannot switch to trial plan from a paid plan"
            )
    
    # Update subscription
    updated_subscription = update_subscription(
        db=db,
        subscription_id=subscription.id,
        plan_id=request.plan_id
    )
    
    # Get updated statistics
    stats = get_subscription_stats(db, updated_subscription)
    
    # Get available tokens
    available_tokens = get_available_tokens(
        db, current_user.id, current_organization.id
    )
    
    # Get token balance
    balance = get_token_balance(db, current_user.id, current_organization.id)
    
    subscription_response = SubscriptionResponse(
        id=updated_subscription.id,
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
        available_tokens=available_tokens,
        token_balance=balance.balance,
    )
    
    return ChangePlanResponse(
        success=True,
        message=f"Subscription plan changed to {plan.display_name}",
        subscription=subscription_response,
    )

