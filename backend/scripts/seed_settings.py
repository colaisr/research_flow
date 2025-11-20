"""
Seed initial models and data sources.
"""
import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import SessionLocal
from app.models.settings import AvailableModel, AvailableDataSource

# Popular OpenRouter models
MODELS = [
    {
        "name": "openai/gpt-4o-mini",
        "display_name": "GPT-4o Mini",
        "provider": "openai",
        "description": "Fast and affordable model, great for most analysis tasks. Good balance of speed and quality.",
        "max_tokens": 16384,
        "cost_per_1k_tokens": "$0.15/$0.60",
        "is_enabled": True,
    },
    {
        "name": "openai/gpt-4o",
        "display_name": "GPT-4o",
        "provider": "openai",
        "description": "Most capable OpenAI model. Best quality but more expensive. Use for complex analysis.",
        "max_tokens": 128000,
        "cost_per_1k_tokens": "$2.50/$10.00",
        "is_enabled": True,
    },
    {
        "name": "anthropic/claude-3.5-sonnet",
        "display_name": "Claude 3.5 Sonnet",
        "provider": "anthropic",
        "description": "Anthropic's best model. Excellent reasoning and analysis capabilities.",
        "max_tokens": 200000,
        "cost_per_1k_tokens": "$3.00/$15.00",
        "is_enabled": True,
    },
    {
        "name": "anthropic/claude-3-haiku",
        "display_name": "Claude 3 Haiku",
        "provider": "anthropic",
        "description": "Fast and cost-effective Claude model. Good for simpler analysis tasks.",
        "max_tokens": 200000,
        "cost_per_1k_tokens": "$0.25/$1.25",
        "is_enabled": True,
    },
    {
        "name": "google/gemini-pro-1.5",
        "display_name": "Gemini Pro 1.5",
        "provider": "google",
        "description": "Google's advanced model with large context window. Good for comprehensive analysis.",
        "max_tokens": 1000000,
        "cost_per_1k_tokens": "$1.25/$5.00",
        "is_enabled": False,  # Disabled by default
    },
]

DATA_SOURCES = [
    {
        "name": "ccxt",
        "display_name": "CCXT (Crypto Exchanges)",
        "description": "Unified API for cryptocurrency exchanges. Supports 100+ exchanges including Binance, Coinbase, Kraken, etc.",
        "supports_crypto": True,
        "supports_stocks": False,
        "supports_forex": False,
        "is_enabled": True,
    },
    {
        "name": "yfinance",
        "display_name": "Yahoo Finance",
        "description": "Yahoo Finance API for stocks, ETFs, indices, and forex. Free and reliable data source.",
        "supports_crypto": False,
        "supports_stocks": True,
        "supports_forex": True,
        "is_enabled": True,
    },
    {
        "name": "tinkoff",
        "display_name": "Tinkoff Invest API",
        "description": "Tinkoff Invest API for MOEX (Moscow Exchange) instruments. Supports Russian stocks, bonds, ETFs, and futures. Requires API token configured in Settings.",
        "supports_crypto": False,
        "supports_stocks": True,
        "supports_forex": False,
        "is_enabled": True,
    },
    {
        "name": "alpha_vantage",
        "display_name": "Alpha Vantage",
        "description": "Premium financial data API. Requires API key. Supports stocks, forex, crypto, and technical indicators.",
        "supports_crypto": True,
        "supports_stocks": True,
        "supports_forex": True,
        "is_enabled": False,  # Disabled by default (requires API key)
    },
]


def seed_settings():
    """Seed initial models and data sources."""
    db = SessionLocal()
    try:
        # Seed models
        for model_data in MODELS:
            existing = db.query(AvailableModel).filter(AvailableModel.name == model_data["name"]).first()
            if existing:
                print(f"Model {model_data['name']} already exists, skipping...")
                continue
            
            model = AvailableModel(**model_data)
            db.add(model)
        
        # Seed data sources
        for ds_data in DATA_SOURCES:
            existing = db.query(AvailableDataSource).filter(AvailableDataSource.name == ds_data["name"]).first()
            if existing:
                print(f"Data source {ds_data['name']} already exists, skipping...")
                continue
            
            data_source = AvailableDataSource(**ds_data)
            db.add(data_source)
        
        db.commit()
        print("✅ Settings seeded successfully!")
        print(f"   - {len(MODELS)} models added")
        print(f"   - {len(DATA_SOURCES)} data sources added")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding settings: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_settings()

