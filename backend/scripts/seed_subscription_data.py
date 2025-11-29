"""
Seed initial subscription and token data.

This script seeds:
- Subscription plans (Trial, Basic, Pro)
- Token packages (Small, Medium, Large)
- Provider credentials (OpenRouter, Gemini placeholder)
- Model pricing (from OpenRouter API or defaults)

Run this after Phase 1.1 migrations are complete.
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import SessionLocal
from sqlalchemy import text
from app.models.settings import AppSettings


def seed_subscription_plans(db):
    """Seed subscription plans."""
    plans = [
        {
            "name": "trial",
            "display_name": "Пробный период",
            "description": "14 дней бесплатного доступа со всеми функциями Pro",
            "monthly_tokens": 300_000,  # 300K tokens (based on GPT-5 pricing, 1:1 economic model)
            "included_features": json.dumps([
                "openrouter",
                "rag",
                "api_tools",
                "database_tools",
                "scheduling",
                "webhooks"
            ]),
            "price_monthly": None,
            "price_currency": "RUB",
            "is_trial": True,
            "trial_duration_days": 14,
            "is_active": True,
            "is_visible": True,
        },
        {
            "name": "basic",
            "display_name": "Базовый",
            "description": "Только LLM анализ без инструментов и RAG",
            "monthly_tokens": 750_000,  # 750K tokens (based on GPT-5 pricing, 1:1 economic model)
            "included_features": json.dumps([
                "openrouter"
            ]),
            "price_monthly": 990.00,
            "price_currency": "RUB",
            "is_trial": False,
            "trial_duration_days": None,
            "is_active": True,
            "is_visible": True,
        },
        {
            "name": "pro",
            "display_name": "Профессиональный",
            "description": "Все функции: инструменты, RAG, планирование и многое другое",
            "monthly_tokens": 1_500_000,  # 1.5M tokens (based on GPT-5 pricing, 1:1 economic model)
            "included_features": json.dumps([
                "openrouter",
                "rag",
                "api_tools",
                "database_tools",
                "scheduling",
                "webhooks"
            ]),
            "price_monthly": 1900.00,
            "price_currency": "RUB",
            "is_trial": False,
            "trial_duration_days": None,
            "is_active": True,
            "is_visible": True,
        },
    ]
    
    for plan in plans:
        # Check if plan already exists
        result = db.execute(
            text("SELECT id FROM subscription_plans WHERE name = :name"),
            {"name": plan["name"]}
        )
        existing = result.fetchone()
        
        if existing:
            # Update existing plan with new token allocations
            db.execute(
                text("""
                    UPDATE subscription_plans
                    SET display_name = :display_name,
                        description = :description,
                        monthly_tokens = :monthly_tokens,
                        included_features = :included_features,
                        price_monthly = :price_monthly,
                        price_currency = :price_currency,
                        is_trial = :is_trial,
                        trial_duration_days = :trial_duration_days,
                        is_active = :is_active,
                        is_visible = :is_visible,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE name = :name
                """),
                plan
            )
            print(f"✅ Updated subscription plan: {plan['display_name']} (tokens: {plan['monthly_tokens']:,})")
        else:
            # Insert new plan
            db.execute(
                text("""
                    INSERT INTO subscription_plans 
                    (name, display_name, description, monthly_tokens, included_features, 
                     price_monthly, price_currency, is_trial, trial_duration_days, 
                     is_active, is_visible)
                    VALUES 
                    (:name, :display_name, :description, :monthly_tokens, :included_features,
                     :price_monthly, :price_currency, :is_trial, :trial_duration_days,
                     :is_active, :is_visible)
                """),
                plan
            )
            print(f"✅ Created subscription plan: {plan['display_name']} (tokens: {plan['monthly_tokens']:,})")
    
    db.commit()


def seed_token_packages(db):
    """Seed token packages.
    
    Packages calculated based on 1:1 economic model (50% cost, 50% profit):
    - Platform cost: ₽0.5062 per 1K tokens (GPT-5 average pricing)
    - User pays ₽X → 50% for costs → can afford (₽X/2) / 0.5062 * 1000 tokens
    """
    packages = [
        {
            "name": "small",
            "display_name": "Малый пакет",
            "description": "500,000 токенов для периодического использования",
            "token_amount": 500_000,  # 500K tokens (based on 1:1 economic model)
            "price_rub": 500.00,
            "is_active": True,
            "is_visible": True,
        },
        {
            "name": "medium",
            "display_name": "Средний пакет",
            "description": "2,000,000 токенов для регулярного использования",
            "token_amount": 2_000_000,  # 2M tokens (based on 1:1 economic model)
            "price_rub": 2000.00,
            "is_active": True,
            "is_visible": True,
        },
        {
            "name": "large",
            "display_name": "Большой пакет",
            "description": "7,500,000 токенов для интенсивного использования",
            "token_amount": 7_500_000,  # 7.5M tokens (based on 1:1 economic model)
            "price_rub": 7500.00,
            "is_active": True,
            "is_visible": True,
        },
    ]
    
    for package in packages:
        # Check if package already exists
        result = db.execute(
            text("SELECT id FROM token_packages WHERE name = :name"),
            {"name": package["name"]}
        )
        existing = result.fetchone()
        
        if existing:
            # Update existing package with new token allocations
            db.execute(
                text("""
                    UPDATE token_packages
                    SET display_name = :display_name,
                        description = :description,
                        token_amount = :token_amount,
                        price_rub = :price_rub,
                        is_active = :is_active,
                        is_visible = :is_visible,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE name = :name
                """),
                package
            )
            print(f"✅ Updated token package: {package['display_name']} (tokens: {package['token_amount']:,})")
        else:
            # Insert new package
            db.execute(
                text("""
                    INSERT INTO token_packages 
                    (name, display_name, description, token_amount, price_rub, is_active, is_visible)
                    VALUES 
                    (:name, :display_name, :description, :token_amount, :price_rub, :is_active, :is_visible)
                """),
                package
            )
            print(f"✅ Created token package: {package['display_name']} (tokens: {package['token_amount']:,})")
    
    db.commit()


def seed_provider_credentials(db):
    """Seed provider credentials from AppSettings."""
    # Get OpenRouter API key from AppSettings
    openrouter_setting = db.query(AppSettings).filter(
        AppSettings.key == "openrouter_api_key"
    ).first()
    
    openrouter_api_key = openrouter_setting.value if openrouter_setting else None
    
    providers = [
        {
            "provider": "openrouter",
            "display_name": "OpenRouter",
            "api_key_encrypted": openrouter_api_key,  # TODO: Encrypt this
            "base_url": "https://openrouter.ai/api/v1",
            "is_active": True if openrouter_api_key else False,
        },
        {
            "provider": "gemini",
            "display_name": "Google Gemini",
            "api_key_encrypted": None,  # Placeholder, to be configured
            "base_url": "https://generativelanguage.googleapis.com/v1",
            "is_active": False,  # Disabled until configured
        },
    ]
    
    for provider in providers:
        # Check if provider already exists
        result = db.execute(
            text("SELECT id FROM provider_credentials WHERE provider = :provider"),
            {"provider": provider["provider"]}
        )
        existing = result.fetchone()
        
        if existing:
            print(f"Provider '{provider['provider']}' already exists, skipping...")
            continue
        
        # Insert provider
        db.execute(
            text("""
                INSERT INTO provider_credentials 
                (provider, display_name, api_key_encrypted, base_url, is_active)
                VALUES 
                (:provider, :display_name, :api_key_encrypted, :base_url, :is_active)
            """),
            provider
        )
        print(f"✅ Created provider: {provider['display_name']}")
    
    db.commit()


def seed_model_pricing(db):
    """Seed model pricing from OpenRouter API or use defaults."""
    # Default pricing for common models (based on OpenRouter pricing)
    # Format: (model_name, provider, cost_per_1k_input_usd, cost_per_1k_output_usd, platform_fee_percent, price_per_1k_usd)
    default_models = [
        ("openai/gpt-4o-mini", "openrouter", 0.00015, 0.00060, 40.00, 0.000525),
        ("openai/gpt-4o", "openrouter", 0.00250, 0.01000, 40.00, 0.00875),
        ("anthropic/claude-3-haiku", "openrouter", 0.00025, 0.00125, 40.00, 0.00105),
        ("anthropic/claude-3.5-sonnet", "openrouter", 0.00300, 0.01500, 40.00, 0.01260),
    ]
    
    for model_name, provider, cost_input, cost_output, fee_percent, price_per_1k in default_models:
        # Calculate price_per_1k_usd: average cost * (1 + fee_percent/100)
        avg_cost = (cost_input + cost_output) / 2
        calculated_price = avg_cost * (1 + fee_percent / 100)
        
        # Use provided price_per_1k if it's different from calculated
        price_per_1k_usd = price_per_1k if price_per_1k else calculated_price
        
        # Check if model pricing already exists
        result = db.execute(
            text("""
                SELECT id FROM model_pricing 
                WHERE model_name = :model_name AND provider = :provider
            """),
            {"model_name": model_name, "provider": provider}
        )
        existing = result.fetchone()
        
        if existing:
            print(f"Model pricing for '{model_name}' ({provider}) already exists, skipping...")
            continue
        
        # Insert model pricing
        db.execute(
            text("""
                INSERT INTO model_pricing 
                (model_name, provider, cost_per_1k_input_usd, cost_per_1k_output_usd,
                 platform_fee_percent, price_per_1k_usd, is_active, is_visible)
                VALUES 
                (:model_name, :provider, :cost_input, :cost_output,
                 :fee_percent, :price_per_1k_usd, 1, 1)
            """),
            {
                "model_name": model_name,
                "provider": provider,
                "cost_input": cost_input,
                "cost_output": cost_output,
                "fee_percent": fee_percent,
                "price_per_1k_usd": price_per_1k_usd,
            }
        )
        print(f"✅ Created model pricing: {model_name} ({provider})")
    
    db.commit()


def main():
    """Main function to seed all subscription data."""
    print("=" * 60)
    print("Seeding Subscription and Token Data")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        print("\n1. Seeding subscription plans...")
        seed_subscription_plans(db)
        
        print("\n2. Seeding token packages...")
        seed_token_packages(db)
        
        print("\n3. Seeding provider credentials...")
        seed_provider_credentials(db)
        
        print("\n4. Seeding model pricing...")
        seed_model_pricing(db)
        
        print("\n" + "=" * 60)
        print("✅ All subscription data seeded successfully!")
        print("=" * 60)
        
    except Exception as e:
        db.rollback()
        print("\n" + "=" * 60)
        print(f"❌ Error seeding data: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

