"""
Migration script for existing users to subscription system.

This script:
1. Creates trial subscriptions for all existing users
2. Sets token balance to 0 for all users
3. Syncs features from subscription plan to user_features table
4. Creates token_consumption records from existing analysis_steps

Run this after Phase 1.1, 1.2, and 1.3 are complete.
"""
import sys
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import SessionLocal
from sqlalchemy import text
from app.models.user import User
from app.models.organization import Organization
from app.services.organization import get_user_personal_organization, create_personal_organization
from app.services.subscription import sync_features_from_plan


def get_trial_plan_id(db):
    """Get the trial plan ID."""
    result = db.execute(
        text("SELECT id FROM subscription_plans WHERE name = 'trial' AND is_active = 1")
    )
    plan = result.fetchone()
    if not plan:
        raise Exception("Trial plan not found. Please run seed_subscription_data.py first.")
    return plan[0]


def create_trial_subscription(db, user_id, org_id, plan_id):
    """Create a trial subscription for a user."""
    # Check if subscription already exists
    result = db.execute(
        text("""
            SELECT id FROM user_subscriptions 
            WHERE user_id = :user_id AND organization_id = :org_id
        """),
        {"user_id": user_id, "org_id": org_id}
    )
    existing = result.fetchone()
    
    if existing:
        print(f"  Subscription already exists for user {user_id}, skipping...")
        return existing[0]
    
    # Get plan details
    plan_result = db.execute(
        text("SELECT monthly_tokens, trial_duration_days FROM subscription_plans WHERE id = :plan_id"),
        {"plan_id": plan_id}
    )
    plan = plan_result.fetchone()
    if not plan:
        raise Exception(f"Plan {plan_id} not found")
    
    monthly_tokens, trial_duration_days = plan
    
    # Calculate dates
    now = datetime.now(timezone.utc)
    trial_ends_at = now + timedelta(days=trial_duration_days) if trial_duration_days else None
    period_start = now.date()
    period_end = (now + timedelta(days=30)).date()  # Monthly period
    
    # Create subscription
    result = db.execute(
        text("""
            INSERT INTO user_subscriptions 
            (user_id, organization_id, plan_id, status, started_at, trial_ends_at,
             tokens_allocated, tokens_used_this_period, period_start_date, period_end_date)
            VALUES 
            (:user_id, :org_id, :plan_id, 'trial', :started_at, :trial_ends_at,
             :tokens_allocated, 0, :period_start, :period_end)
        """),
        {
            "user_id": user_id,
            "org_id": org_id,
            "plan_id": plan_id,
            "started_at": now,
            "trial_ends_at": trial_ends_at,
            "tokens_allocated": monthly_tokens,
            "period_start": period_start,
            "period_end": period_end,
        }
    )
    db.commit()
    
    subscription_id = result.lastrowid
    print(f"  ✅ Created trial subscription (ID: {subscription_id})")
    return subscription_id


def create_token_balance(db, user_id, org_id):
    """Create token balance record with 0 balance."""
    # Check if balance already exists
    result = db.execute(
        text("""
            SELECT id FROM token_balances 
            WHERE user_id = :user_id AND organization_id = :org_id
        """),
        {"user_id": user_id, "org_id": org_id}
    )
    existing = result.fetchone()
    
    if existing:
        print(f"  Token balance already exists for user {user_id}, skipping...")
        return
    
    # Create balance
    db.execute(
        text("""
            INSERT INTO token_balances (user_id, organization_id, balance)
            VALUES (:user_id, :org_id, 0)
        """),
        {"user_id": user_id, "org_id": org_id}
    )
    db.commit()
    print(f"  ✅ Created token balance (balance: 0)")


def sync_user_features_from_plan(db, user_id, org_id, plan_id):
    """Sync features from subscription plan to user_features table."""
    # Get subscription to use service function
    from app.services.subscription import get_subscription_by_id
    
    # Check if subscription exists (it should after create_trial_subscription)
    result = db.execute(
        text("""
            SELECT id FROM user_subscriptions 
            WHERE user_id = :user_id AND organization_id = :org_id
            ORDER BY started_at DESC LIMIT 1
        """),
        {"user_id": user_id, "org_id": org_id}
    )
    sub_row = result.fetchone()
    
    if sub_row:
        subscription_id = sub_row[0]
        subscription = get_subscription_by_id(db, subscription_id)
        if subscription:
            # Use the service function
            sync_features_from_plan(db, subscription)
            print(f"  ✅ Synced features from plan")
        else:
            print(f"  ⚠️  Subscription {subscription_id} not found, skipping feature sync")
    else:
        print(f"  ⚠️  No subscription found for user {user_id}, skipping feature sync")


def migrate_consumption_from_steps(db, user_id, org_id):
    """Create token_consumption records from existing analysis_steps."""
    # Get all analysis_steps for runs in this organization
    # We need to join with analysis_runs to get organization_id
    result = db.execute(
        text("""
            SELECT 
                s.id as step_id,
                s.run_id,
                s.input_tokens,
                s.output_tokens,
                s.provider,
                s.cost_per_1k_input,
                s.cost_per_1k_output,
                s.tokens_used,
                s.cost_est,
                s.created_at
            FROM analysis_steps s
            INNER JOIN analysis_runs r ON s.run_id = r.id
            WHERE r.organization_id = :org_id
            AND s.input_tokens IS NOT NULL
            AND s.provider IS NOT NULL
        """),
        {"org_id": org_id}
    )
    steps = result.fetchall()
    
    if not steps:
        print(f"  No analysis steps found for migration")
        return
    
    # Get exchange rate (default to 90 RUB/USD)
    exchange_rate = 90.0  # TODO: Get from config
    
    migrated_count = 0
    for step in steps:
        step_id, run_id, input_tokens, output_tokens, provider, cost_input, cost_output, tokens_used, cost_est, created_at = step
        
        # Use existing values or defaults
        input_tokens = input_tokens or tokens_used or 0
        output_tokens = output_tokens or 0
        total_tokens = input_tokens + output_tokens
        
        # Use existing cost values or calculate from cost_est
        if cost_input and cost_output:
            cost_per_1k_input = float(cost_input)
            cost_per_1k_output = float(cost_output)
        elif cost_est and total_tokens > 0:
            # Approximate: assume equal input/output cost
            cost_per_1k = (float(cost_est) * 1000) / total_tokens
            cost_per_1k_input = cost_per_1k
            cost_per_1k_output = cost_per_1k
        else:
            # Default to gpt-4o-mini pricing
            cost_per_1k_input = 0.00015
            cost_per_1k_output = 0.00060
        
        # Calculate price (average cost + 40% fee)
        avg_cost = (cost_per_1k_input + cost_per_1k_output) / 2
        price_per_1k_usd = avg_cost * 1.40
        
        # Calculate costs in USD
        cost_usd = (input_tokens / 1000) * cost_per_1k_input + (output_tokens / 1000) * cost_per_1k_output
        price_usd = (total_tokens / 1000) * price_per_1k_usd
        
        # Convert to RUB
        cost_rub = round(cost_usd * exchange_rate, 2)
        price_rub = round(price_usd * exchange_rate, 2)
        
        # Get model name from step (if available)
        model_result = db.execute(
            text("SELECT llm_model FROM analysis_steps WHERE id = :step_id"),
            {"step_id": step_id}
        )
        model_row = model_result.fetchone()
        model_name = model_row[0] if model_row and model_row[0] else "unknown"
        
        # Check if consumption record already exists
        check_result = db.execute(
            text("SELECT id FROM token_consumption WHERE step_id = :step_id"),
            {"step_id": step_id}
        )
        if check_result.fetchone():
            continue  # Already migrated
        
        # Create consumption record
        db.execute(
            text("""
                INSERT INTO token_consumption
                (user_id, organization_id, run_id, step_id, model_name, provider,
                 input_tokens, output_tokens, total_tokens,
                 cost_per_1k_input_usd, cost_per_1k_output_usd, price_per_1k_usd,
                 exchange_rate_usd_to_rub, cost_rub, price_rub,
                 source_type, tokens_charged, consumed_at)
                VALUES
                (:user_id, :org_id, :run_id, :step_id, :model_name, :provider,
                 :input_tokens, :output_tokens, :total_tokens,
                 :cost_input, :cost_output, :price_per_1k,
                 :exchange_rate, :cost_rub, :price_rub,
                 'subscription', :tokens_charged, :consumed_at)
            """),
            {
                "user_id": user_id,
                "org_id": org_id,
                "run_id": run_id,
                "step_id": step_id,
                "model_name": model_name,
                "provider": provider or "openrouter",
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
                "cost_input": cost_per_1k_input,
                "cost_output": cost_per_1k_output,
                "price_per_1k": price_per_1k_usd,
                "exchange_rate": exchange_rate,
                "cost_rub": cost_rub,
                "price_rub": price_rub,
                "tokens_charged": total_tokens,
                "consumed_at": created_at or datetime.now(timezone.utc),
            }
        )
        migrated_count += 1
    
    db.commit()
    if migrated_count > 0:
        print(f"  ✅ Migrated {migrated_count} consumption records from analysis_steps")


def migrate_user(db, user_id, plan_id):
    """Migrate a single user to subscription system."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        print(f"User {user_id} not found, skipping...")
        return
    
    print(f"\nMigrating user {user_id} ({user.email})...")
    
    # Get or create personal organization
    org = get_user_personal_organization(db, user_id)
    if not org:
        print(f"  Creating personal organization...")
        org = create_personal_organization(
            db,
            user_id,
            user.full_name or user.email,
            user.email
        )
        print(f"  ✅ Created organization: {org.name} (ID: {org.id})")
    
    # Create trial subscription
    create_trial_subscription(db, user_id, org.id, plan_id)
    
    # Create token balance
    create_token_balance(db, user_id, org.id)
    
    # Sync features from plan (after subscription is created)
    sync_user_features_from_plan(db, user_id, org.id, plan_id)
    
    # Migrate consumption from steps
    migrate_consumption_from_steps(db, user_id, org.id)
    
    print(f"  ✅ User {user_id} migration complete")


def main():
    """Main function to migrate all existing users."""
    print("=" * 60)
    print("Migrating Existing Users to Subscription System")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        # Get trial plan ID
        plan_id = get_trial_plan_id(db)
        print(f"\nUsing trial plan ID: {plan_id}")
        
        # Get all users
        users = db.query(User).filter(User.is_active == True).all()
        print(f"\nFound {len(users)} active users to migrate")
        
        if not users:
            print("No users found to migrate.")
            return
        
        # Migrate each user
        for user in users:
            try:
                migrate_user(db, user.id, plan_id)
            except Exception as e:
                print(f"  ❌ Error migrating user {user.id}: {e}")
                db.rollback()
                continue
        
        print("\n" + "=" * 60)
        print("✅ Migration complete!")
        print("=" * 60)
        print(f"Migrated {len(users)} users")
        
    except Exception as e:
        db.rollback()
        print("\n" + "=" * 60)
        print(f"❌ Error during migration: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

