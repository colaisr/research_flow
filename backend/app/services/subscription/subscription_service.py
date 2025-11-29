"""
Subscription service for managing user subscriptions.
"""
import json
from datetime import datetime, timedelta, date, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.services.subscription.subscription_models import Subscription, SubscriptionStats
from app.services.feature import set_user_feature, FEATURES


def get_active_subscription(
    db: Session,
    user_id: int,
    organization_id: int
) -> Optional[Subscription]:
    """
    Get active subscription for user/organization.
    
    Returns the most recent active subscription (status: 'trial' or 'active').
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
    
    Returns:
        Subscription object or None if not found
    """
    result = db.execute(
        text("""
            SELECT 
                s.id, s.user_id, s.organization_id, s.plan_id,
                s.status, s.started_at, s.trial_ends_at,
                s.tokens_allocated, s.tokens_used_this_period,
                s.period_start_date, s.period_end_date,
                s.cancelled_at, s.cancelled_reason,
                p.name as plan_name, p.display_name as plan_display_name
            FROM user_subscriptions s
            INNER JOIN subscription_plans p ON s.plan_id = p.id
            WHERE s.user_id = :user_id 
              AND s.organization_id = :org_id
              AND s.status IN ('trial', 'active')
            ORDER BY s.started_at DESC
            LIMIT 1
        """),
        {"user_id": user_id, "org_id": organization_id}
    )
    
    row = result.fetchone()
    if not row:
        return None
    
    return Subscription.from_db_row(row)


def get_current_subscription(
    db: Session,
    user_id: int,
    organization_id: int
) -> Optional[Subscription]:
    """
    Get current subscription for user/organization (including expired).
    
    Returns the most recent subscription regardless of status.
    This is used for displaying subscription info even when expired.
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
    
    Returns:
        Subscription object or None if not found
    """
    result = db.execute(
        text("""
            SELECT 
                s.id, s.user_id, s.organization_id, s.plan_id,
                s.status, s.started_at, s.trial_ends_at,
                s.tokens_allocated, s.tokens_used_this_period,
                s.period_start_date, s.period_end_date,
                s.cancelled_at, s.cancelled_reason,
                p.name as plan_name, p.display_name as plan_display_name
            FROM user_subscriptions s
            INNER JOIN subscription_plans p ON s.plan_id = p.id
            WHERE s.user_id = :user_id 
              AND s.organization_id = :org_id
            ORDER BY s.started_at DESC
            LIMIT 1
        """),
        {"user_id": user_id, "org_id": organization_id}
    )
    
    row = result.fetchone()
    if not row:
        return None
    
    return Subscription.from_db_row(row)


def create_subscription(
    db: Session,
    user_id: int,
    organization_id: int,
    plan_id: int
) -> Subscription:
    """
    Create a new subscription.
    
    Args:
        db: Database session
        user_id: User ID
        organization_id: Organization ID
        plan_id: Plan ID
    
    Returns:
        Created Subscription object
    """
    # Get plan details
    plan_result = db.execute(
        text("""
            SELECT monthly_tokens, is_trial, trial_duration_days
            FROM subscription_plans
            WHERE id = :plan_id AND is_active = 1
        """),
        {"plan_id": plan_id}
    )
    plan = plan_result.fetchone()
    if not plan:
        raise ValueError(f"Plan {plan_id} not found or inactive")
    
    monthly_tokens, is_trial, trial_duration_days = plan
    
    # Calculate dates
    now = datetime.now(timezone.utc)
    trial_ends_at = None
    if is_trial and trial_duration_days:
        trial_ends_at = now + timedelta(days=trial_duration_days)
    
    period_start = now.date()
    period_end = (now + timedelta(days=30)).date()  # Monthly period
    
    # Determine status
    status = "trial" if is_trial else "active"
    
    # Create subscription
    result = db.execute(
        text("""
            INSERT INTO user_subscriptions
            (user_id, organization_id, plan_id, status, started_at, trial_ends_at,
             tokens_allocated, tokens_used_this_period, period_start_date, period_end_date)
            VALUES
            (:user_id, :org_id, :plan_id, :status, :started_at, :trial_ends_at,
             :tokens_allocated, 0, :period_start, :period_end)
        """),
        {
            "user_id": user_id,
            "org_id": organization_id,
            "plan_id": plan_id,
            "status": status,
            "started_at": now,
            "trial_ends_at": trial_ends_at,
            "tokens_allocated": monthly_tokens,
            "period_start": period_start,
            "period_end": period_end,
        }
    )
    
    subscription_id = result.lastrowid
    db.commit()
    
    # Get created subscription
    subscription = get_subscription_by_id(db, subscription_id)
    if not subscription:
        raise Exception("Failed to retrieve created subscription")
    
    # Sync features from plan
    sync_features_from_plan(db, subscription)
    
    return subscription


def get_subscription_by_id(db: Session, subscription_id: int) -> Optional[Subscription]:
    """Get subscription by ID."""
    result = db.execute(
        text("""
            SELECT 
                s.id, s.user_id, s.organization_id, s.plan_id,
                s.status, s.started_at, s.trial_ends_at,
                s.tokens_allocated, s.tokens_used_this_period,
                s.period_start_date, s.period_end_date,
                s.cancelled_at, s.cancelled_reason,
                p.name as plan_name, p.display_name as plan_display_name
            FROM user_subscriptions s
            INNER JOIN subscription_plans p ON s.plan_id = p.id
            WHERE s.id = :subscription_id
        """),
        {"subscription_id": subscription_id}
    )
    
    row = result.fetchone()
    if not row:
        return None
    
    return Subscription.from_db_row(row)


def update_subscription(
    db: Session,
    subscription_id: int,
    plan_id: int
) -> Subscription:
    """
    Update subscription to a different plan.
    
    Args:
        db: Database session
        subscription_id: Subscription ID
        plan_id: New plan ID
    
    Returns:
        Updated Subscription object
    """
    # Get current subscription
    subscription = get_subscription_by_id(db, subscription_id)
    if not subscription:
        raise ValueError(f"Subscription {subscription_id} not found")
    
    # Get new plan details
    plan_result = db.execute(
        text("""
            SELECT monthly_tokens, is_trial, trial_duration_days
            FROM subscription_plans
            WHERE id = :plan_id AND is_active = 1
        """),
        {"plan_id": plan_id}
    )
    plan = plan_result.fetchone()
    if not plan:
        raise ValueError(f"Plan {plan_id} not found or inactive")
    
    monthly_tokens, is_trial, trial_duration_days = plan
    
    # Prevent switching to trial if user is on a paid plan
    # Get current plan details to check if it's paid
    current_plan_result = db.execute(
        text("""
            SELECT is_trial, price_monthly
            FROM subscription_plans
            WHERE id = :current_plan_id
        """),
        {"current_plan_id": subscription.plan_id}
    )
    current_plan = current_plan_result.fetchone()
    
    if current_plan:
        current_is_trial = bool(current_plan.is_trial)
        current_has_price = current_plan.price_monthly and current_plan.price_monthly > 0
        
        # If user is on a paid plan (not trial and has price), prevent switching to trial
        if is_trial and not current_is_trial and (current_has_price or subscription.status == 'active'):
            raise ValueError("Cannot switch to trial plan from a paid plan")
    
    # Determine new status based on plan type
    # If changing from trial to non-trial, set status to 'active'
    # If changing to a trial plan, set status to 'trial'
    new_status = "trial" if is_trial else "active"
    
    # If changing to non-trial plan, clear trial_ends_at
    # If changing to trial plan and trial_ends_at is null, set it
    new_trial_ends_at = subscription.trial_ends_at
    if not is_trial:
        # Changing to non-trial plan - clear trial fields
        new_trial_ends_at = None
        # If currently in trial, change status to active
        if subscription.status == "trial":
            new_status = "active"
    else:
        # Changing to trial plan
        if subscription.status != "trial":
            # If not currently in trial, set trial end date
            if trial_duration_days:
                from datetime import datetime, timezone, timedelta
                now = datetime.now(timezone.utc)
                new_trial_ends_at = now + timedelta(days=trial_duration_days)
            new_status = "trial"
    
    # Update subscription
    # Keep current period dates, but update tokens allocated and status
    db.execute(
        text("""
            UPDATE user_subscriptions
            SET plan_id = :plan_id,
                tokens_allocated = :tokens_allocated,
                status = :status,
                trial_ends_at = :trial_ends_at,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :subscription_id
        """),
        {
            "subscription_id": subscription_id,
            "plan_id": plan_id,
            "tokens_allocated": monthly_tokens,
            "status": new_status,
            "trial_ends_at": new_trial_ends_at,
        }
    )
    
    db.commit()
    
    # Get updated subscription
    updated_subscription = get_subscription_by_id(db, subscription_id)
    if not updated_subscription:
        raise Exception("Failed to retrieve updated subscription")
    
    # Sync features from new plan
    sync_features_from_plan(db, updated_subscription)
    
    return updated_subscription


def renew_subscription(
    db: Session,
    subscription_id: int
) -> Subscription:
    """
    Renew subscription for a new monthly period.
    
    Resets tokens_used_this_period to 0 and updates period dates.
    For automatic renewals, starts new period after current period ends.
    
    Args:
        db: Database session
        subscription_id: Subscription ID
    
    Returns:
        Renewed Subscription object
    """
    subscription = get_subscription_by_id(db, subscription_id)
    if not subscription:
        raise ValueError(f"Subscription {subscription_id} not found")
    
    # Calculate new period
    new_period_start = subscription.period_end_date + timedelta(days=1)
    new_period_end = new_period_start + timedelta(days=30)
    
    # Check if trial expired
    new_status = subscription.status
    if subscription.status == "trial" and subscription.trial_ends_at:
        if datetime.now(timezone.utc) > subscription.trial_ends_at:
            new_status = "expired"
    
    # Update subscription
    db.execute(
        text("""
            UPDATE user_subscriptions
            SET tokens_used_this_period = 0,
                period_start_date = :period_start,
                period_end_date = :period_end,
                status = :status,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :subscription_id
        """),
        {
            "subscription_id": subscription_id,
            "period_start": new_period_start,
            "period_end": new_period_end,
            "status": new_status,
        }
    )
    
    db.commit()
    
    # Get renewed subscription
    renewed_subscription = get_subscription_by_id(db, subscription_id)
    if not renewed_subscription:
        raise Exception("Failed to retrieve renewed subscription")
    
    return renewed_subscription


def reset_subscription_period(
    db: Session,
    subscription_id: int
) -> Subscription:
    """
    Reset subscription period manually (admin action).
    
    Starts new period from today, resets tokens_used_this_period to 0.
    This is different from renew_subscription which starts after current period ends.
    
    Args:
        db: Database session
        subscription_id: Subscription ID
    
    Returns:
        Updated Subscription object
    """
    subscription = get_subscription_by_id(db, subscription_id)
    if not subscription:
        raise ValueError(f"Subscription {subscription_id} not found")
    
    # Calculate new period starting from today (UTC)
    now = datetime.now(timezone.utc)
    new_period_start = now.date()
    new_period_end = (now + timedelta(days=30)).date()
    
    # Handle trial subscriptions - reset trial_ends_at if it's a trial
    new_trial_ends_at = subscription.trial_ends_at  # Keep existing for non-trials
    new_status = subscription.status
    
    # Get plan details to ensure tokens_allocated matches the plan
    plan_result = db.execute(
        text("""
            SELECT monthly_tokens, trial_duration_days
            FROM subscription_plans
            WHERE id = :plan_id
        """),
        {"plan_id": subscription.plan_id}
    )
    plan = plan_result.fetchone()
    plan_monthly_tokens = subscription.tokens_allocated  # Default to current if plan not found
    plan_trial_duration = None
    
    if plan:
        plan_monthly_tokens = plan[0] if plan[0] is not None else subscription.tokens_allocated
        plan_trial_duration = plan[1]
    
    if subscription.status == "trial":
        # Reset trial end date to today + trial_duration_days
        if plan_trial_duration:
            new_trial_ends_at = now + timedelta(days=plan_trial_duration)
        else:
            # If no trial duration in plan, set to 14 days default
            new_trial_ends_at = now + timedelta(days=14)
        
        # Check if trial was already expired
        if subscription.trial_ends_at:
            trial_ends = subscription.trial_ends_at
            if trial_ends.tzinfo is None:
                trial_ends = trial_ends.replace(tzinfo=timezone.utc)
            if now > trial_ends:
                # Trial was expired, but we're resetting it, so keep as trial
                new_status = "trial"
    else:
        # For non-trial subscriptions, ensure trial_ends_at is null
        new_trial_ends_at = None
    
    # Update subscription - reset tokens_used_this_period to 0 and ensure tokens_allocated matches plan
    db.execute(
        text("""
            UPDATE user_subscriptions
            SET tokens_used_this_period = 0,
                tokens_allocated = :tokens_allocated,
                period_start_date = :period_start,
                period_end_date = :period_end,
                trial_ends_at = :trial_ends_at,
                status = :status,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :subscription_id
        """),
        {
            "subscription_id": subscription_id,
            "tokens_allocated": plan_monthly_tokens,
            "period_start": new_period_start,
            "period_end": new_period_end,
            "trial_ends_at": new_trial_ends_at,
            "status": new_status,
        }
    )
    
    db.commit()
    
    # Get updated subscription
    updated_subscription = get_subscription_by_id(db, subscription_id)
    if not updated_subscription:
        raise Exception("Failed to retrieve updated subscription")
    
    return updated_subscription


def extend_trial(
    db: Session,
    subscription_id: int,
    days: int
) -> Subscription:
    """
    Extend trial period by specified number of days.
    
    Args:
        db: Database session
        subscription_id: Subscription ID
        days: Number of days to extend
    
    Returns:
        Updated Subscription object
    """
    subscription = get_subscription_by_id(db, subscription_id)
    if not subscription:
        raise ValueError(f"Subscription {subscription_id} not found")
    
    if subscription.status != "trial":
        raise ValueError("Can only extend trial subscriptions")
    
    # Calculate new trial end date
    current_trial_end = subscription.trial_ends_at or datetime.now(timezone.utc)
    new_trial_end = current_trial_end + timedelta(days=days)
    
    # Update subscription
    db.execute(
        text("""
            UPDATE user_subscriptions
            SET trial_ends_at = :trial_ends_at,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :subscription_id
        """),
        {
            "subscription_id": subscription_id,
            "trial_ends_at": new_trial_end,
        }
    )
    
    db.commit()
    
    # Get updated subscription
    updated_subscription = get_subscription_by_id(db, subscription_id)
    if not updated_subscription:
        raise Exception("Failed to retrieve updated subscription")
    
    return updated_subscription


def sync_features_from_plan(
    db: Session,
    subscription: Subscription
) -> None:
    """
    Sync features from subscription plan to user_features table.
    
    Args:
        db: Database session
        subscription: Subscription object
    """
    # Get plan features
    result = db.execute(
        text("SELECT included_features FROM subscription_plans WHERE id = :plan_id"),
        {"plan_id": subscription.plan_id}
    )
    plan = result.fetchone()
    if not plan:
        raise ValueError(f"Plan {subscription.plan_id} not found")
    
    features_json = plan[0]
    if isinstance(features_json, str):
        features = json.loads(features_json)
    else:
        features = features_json
    
    # Enable features from plan
    for feature_name in features:
        if feature_name in FEATURES:
            set_user_feature(db, subscription.user_id, feature_name, True, None)
    
    # Disable features NOT in plan
    for feature_name in FEATURES.keys():
        if feature_name not in features:
            set_user_feature(db, subscription.user_id, feature_name, False, None)


def get_subscription_stats(
    db: Session,
    subscription: Subscription
) -> SubscriptionStats:
    """
    Get statistics for a subscription.
    
    Args:
        db: Database session
        subscription: Subscription object
    
    Returns:
        SubscriptionStats object
    """
    # Calculate tokens remaining
    tokens_remaining = subscription.tokens_allocated - subscription.tokens_used_this_period
    
    # Calculate usage percentage
    tokens_used_percent = 0.0
    if subscription.tokens_allocated > 0:
        tokens_used_percent = (subscription.tokens_used_this_period / subscription.tokens_allocated) * 100
    
    # Calculate days remaining in period (use UTC to match reset logic)
    now = datetime.now(timezone.utc)
    today_utc = now.date()
    days_remaining = (subscription.period_end_date - today_utc).days
    if days_remaining < 0:
        days_remaining = 0
    
    # Check if trial
    is_trial = subscription.status == "trial"
    
    # Calculate trial days remaining
    trial_days_remaining = None
    if is_trial and subscription.trial_ends_at:
        now = datetime.now(timezone.utc)
        # Ensure trial_ends_at is timezone-aware for comparison
        trial_ends = subscription.trial_ends_at
        if trial_ends.tzinfo is None:
            # If naive, assume UTC
            trial_ends = trial_ends.replace(tzinfo=timezone.utc)
        if trial_ends > now:
            # Calculate days remaining using date difference for accuracy
            trial_ends_date = trial_ends.date() if hasattr(trial_ends, 'date') else trial_ends
            now_date = now.date()
            trial_days_remaining = (trial_ends_date - now_date).days
        else:
            trial_days_remaining = 0
    
    return SubscriptionStats(
        subscription=subscription,
        tokens_remaining=tokens_remaining,
        tokens_used_percent=tokens_used_percent,
        days_remaining_in_period=days_remaining,
        is_trial=is_trial,
        trial_days_remaining=trial_days_remaining,
    )

