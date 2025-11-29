"""
Subscription renewal job for managing subscription renewals and trial expirations.

This job runs daily to:
- Renew subscriptions that have reached their period end date
- Expire trials that have passed their trial end date
- Reset token usage for renewed subscriptions
"""
import logging
from datetime import datetime, date, timezone
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import SessionLocal
from app.services.subscription import renew_subscription, get_active_subscription

logger = logging.getLogger(__name__)


def renew_expired_subscriptions():
    """
    Find and renew subscriptions that have reached their period end date.
    
    This function should be called daily via scheduler.
    """
    db = SessionLocal()
    try:
        today = date.today()
        now = datetime.now(timezone.utc)
        
        # Find subscriptions that need renewal (period_end_date has passed and status is active)
        result = db.execute(
            text("""
                SELECT id, user_id, organization_id, plan_id, status, period_end_date, trial_ends_at
                FROM user_subscriptions
                WHERE status IN ('active', 'trial')
                  AND period_end_date < :today
            """),
            {"today": today}
        )
        
        subscriptions_to_renew = result.fetchall()
        renewed_count = 0
        expired_count = 0
        
        for row in subscriptions_to_renew:
            subscription_id, user_id, org_id, plan_id, status, period_end, trial_ends_at = row
            
            try:
                # Check if trial has expired
                if status == "trial" and trial_ends_at:
                    if trial_ends_at < now:
                        # Trial expired - change status to expired
                        db.execute(
                            text("""
                                UPDATE user_subscriptions
                                SET status = 'expired',
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = :subscription_id
                            """),
                            {"subscription_id": subscription_id}
                        )
                        db.commit()
                        expired_count += 1
                        logger.info(f"Trial subscription {subscription_id} expired")
                        continue
                
                # Renew subscription
                subscription = renew_subscription(db, subscription_id)
                renewed_count += 1
                logger.info(
                    f"Renewed subscription {subscription_id} for user {user_id}, "
                    f"org {org_id}, new period: {subscription.period_start_date} to {subscription.period_end_date}"
                )
                
            except Exception as e:
                logger.error(f"Error renewing subscription {subscription_id}: {e}", exc_info=True)
                db.rollback()
                continue
        
        # Also check for trials that have expired (trial_ends_at passed but period hasn't ended yet)
        result = db.execute(
            text("""
                SELECT id, user_id, organization_id, trial_ends_at
                FROM user_subscriptions
                WHERE status = 'trial'
                  AND trial_ends_at IS NOT NULL
                  AND trial_ends_at < :now
                  AND period_end_date >= :today
            """),
            {"now": now, "today": today}
        )
        
        expired_trials = result.fetchall()
        for row in expired_trials:
            subscription_id, user_id, org_id, trial_ends_at = row
            try:
                db.execute(
                    text("""
                        UPDATE user_subscriptions
                        SET status = 'expired',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = :subscription_id
                    """),
                    {"subscription_id": subscription_id}
                )
                db.commit()
                expired_count += 1
                logger.info(f"Trial subscription {subscription_id} expired (trial_ends_at passed)")
            except Exception as e:
                logger.error(f"Error expiring trial subscription {subscription_id}: {e}", exc_info=True)
                db.rollback()
        
        logger.info(
            f"Subscription renewal job completed: {renewed_count} renewed, {expired_count} expired"
        )
        
        return {
            "renewed": renewed_count,
            "expired": expired_count,
            "total_processed": renewed_count + expired_count
        }
        
    except Exception as e:
        logger.error(f"Error in subscription renewal job: {e}", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


def add_renewal_job():
    """Add subscription renewal job to scheduler (runs daily at 00:00 UTC)."""
    from app.services.scheduler.scheduler_service import get_scheduler
    from apscheduler.triggers.cron import CronTrigger
    
    scheduler = get_scheduler()
    
    # Remove existing job if any
    try:
        scheduler.remove_job("subscription_renewal")
    except:
        pass
    
    # Add daily job at midnight UTC
    scheduler.add_job(
        renew_expired_subscriptions,
        trigger=CronTrigger(hour=0, minute=0),  # Daily at 00:00 UTC
        id="subscription_renewal",
        replace_existing=True,
        max_instances=1
    )
    
    logger.info("Added subscription renewal job (daily at 00:00 UTC)")


def start_renewal_job():
    """Start the subscription renewal job (call this when scheduler starts)."""
    from app.services.scheduler.scheduler_service import get_scheduler
    
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
    
    add_renewal_job()

