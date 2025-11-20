"""add_crypto_and_equity_analysis_types

Revision ID: f830a5a16a5f
Revises: ece176210c67
Create Date: 2025-11-14 00:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
import json


# revision identifiers, used by Alembic.
revision = 'f830a5a16a5f'
down_revision = 'ece176210c67'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add crypto and equity analysis types."""
    conn = op.get_bind()
    
    # Crypto analysis type config
    crypto_config = {
        "steps": [
            {
                "step_name": "wyckoff",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional crypto trader and analyst. Expert in Wyckoff Method applied to cryptocurrency markets. Analyze 24/7 market structure to identify accumulation, distribution, markup, and markdown phases. Consider exchange flows, whale movements, and high volatility characteristics of crypto markets.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} timeframe using Wyckoff Method.\n\nRecent price action (last 20 candles):\n{market_data_summary}\n\nDetermine:\n1. Current Wyckoff phase (Accumulation/Distribution/Markup/Markdown)\n2. Market context considering 24/7 trading and high volatility\n3. Likely scenario (continuation or reversal)\n4. Key levels to watch\n5. Signs of whale accumulation/distribution\n\nProvide analysis suitable for crypto trading decisions.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "smc",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional crypto trader. Expert in Smart Money Concepts (SMC) applied to cryptocurrency markets. Analyze market structure considering high volatility, exchange flows, and liquidity pools where retail stops are likely placed.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Smart Money Concepts.\n\nPrice structure (last 50 candles):\n{market_data_summary}\n\nIdentify:\n1. BOS (Break of Structure) and CHoCH points\n2. Order Blocks (OB) - supply/demand zones\n3. Fair Value Gaps (FVG) - imbalance zones\n4. Liquidity Pools - areas where retail stops are likely (above highs/below lows)\n5. Key levels for potential price returns\n6. Exchange-specific liquidity zones\n\nProvide structured analysis with specific price levels.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "vsa",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional crypto trader. Expert in Volume Spread Analysis (VSA) for cryptocurrency markets. Analyze volume patterns considering exchange flows, whale activity, and the high volatility nature of crypto. Look for signals like no demand, no supply, stopping volume, climactic action, and effort vs result.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Volume Spread Analysis.\n\nOHLCV data (last 30 candles):\n{market_data_summary}\n\nIdentify:\n1. Large participant activity (whale movements, exchange flows)\n2. No demand / no supply signals\n3. Stopping volume (absorption)\n4. Climactic action (exhaustion moves)\n5. Effort vs result (volume vs price movement)\n6. Areas where effort without result suggests reversal\n7. Unusual volume spikes indicating whale activity\n\nProvide VSA signals and their implications for crypto trading.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "delta",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional crypto trader. Expert in Delta analysis for cryptocurrency markets. Analyze buying vs selling pressure considering exchange order flow, whale activity, and the high-frequency nature of crypto markets.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Delta analysis principles.\n\nNote: Analyze buying/selling pressure from volume and price action. Consider exchange order flow patterns.\n\nPrice and volume data (last 30 candles):\n{market_data_summary}\n\nIdentify:\n1. Buying vs selling dominance\n2. Anomalous delta patterns (unusual buying/selling pressure)\n3. Absorption zones (volume without price movement)\n4. Divergences (price vs volume/strength)\n5. Where large players (whales) are holding or absorbing\n6. Exchange-specific order flow patterns\n\nProvide delta-based insights for crypto trading.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "ict",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional crypto trader. Expert in ICT (Inner Circle Trader) methodology applied to cryptocurrency markets. Analyze liquidity manipulation, PD Arrays, Fair Value Gaps, and optimal entry points after liquidity sweeps. Consider 24/7 trading and high volatility.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using ICT methodology.\n\nPrice action (last 50 candles):\n{market_data_summary}\n\nPrevious analysis context:\n- Wyckoff phase: {wyckoff_output}\n- SMC structure: {smc_output}\n\nIdentify:\n1. Liquidity manipulation (sweeps above highs/below lows where retail stops are)\n2. PD Arrays (Premium/Discount zones)\n3. Fair Value Gaps (FVG) for return zones\n4. Optimal entry points after liquidity collection\n5. False breakouts and return scenarios\n6. Exchange-specific liquidity zones\n\nProvide ICT-based entry strategy for crypto trading.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data", "previous_steps"]
            },
            {
                "step_name": "price_action",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional crypto trader. Expert in Price Action and Pattern Analysis for cryptocurrency markets. Analyze candlestick patterns, chart formations, and price movements considering high volatility and 24/7 trading. Focus on patterns like flags, triangles, head and shoulders, and crypto-specific formations.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Price Action and Pattern Analysis.\n\nPrice action (last 50 candles):\n{market_data_summary}\n\nIdentify:\n1. Chart patterns forming (flags, triangles, head and shoulders, double tops/bottoms, etc.)\n2. Candlestick patterns (doji, engulfing, pin bars, hammers, shooting stars)\n3. Support and resistance levels from price action\n4. Pattern completion signals and entry points\n5. Stop loss and target levels based on pattern structure\n6. Volatility-based pattern formations\n\nProvide specific price levels for entries, stops, and targets.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "merge",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional crypto trader and analyst. Synthesize Wyckoff + SMC + VSA/Delta + ICT + Price Action analysis into actionable crypto trading ideas. Focus on high-probability setups with clear entry, stop, and target levels. Write naturally, like a trader at the terminal.",
                "user_prompt_template": "Combine analysis results for {instrument} on {timeframe} into a Telegram-ready crypto trading post.\n\nAnalysis results:\n\n1️⃣ WYCKOFF:\n{wyckoff_output}\n\n2️⃣ SMC (Smart Money Concepts):\n{smc_output}\n\n3️⃣ VSA (Volume Spread Analysis):\n{vsa_output}\n\n4️⃣ DELTA:\n{delta_output}\n\n5️⃣ ICT:\n{ict_output}\n\n6️⃣ PRICE ACTION / PATTERNS:\n{price_action_output}\n\n---\n\nCreate a Telegram post following this format:\n\n💎 CRYPTO: {instrument}\n📈 SCENARIO: [Bullish / Bearish / Sideways]\n🎯 PROBABILITY: [XX%] — [key reason]\n⚡️ KEY LEVEL: [zone/level] — [why important]\n🚀 SETUP #1 (active now): [entry | stop | target]\n🧭 SETUP #2 (next 4-12h): [entry | stop | target]\n⚠️ RISK: [main market or fundamental factor]\n#{instrument} #{long} or #{short}\n\n💬 TRADER'S LOGIC\n\nWrite naturally with live analysis logic. Examples:\n\"BTC holding below 43.5k — heavy volume above, liquidity being collected below. I'd short from 43.4k with stop at 43.8k, target 42.5k. If we hold 42.3k and see a reaction, could flip long to 44k.\"\n\n\"Forming a flag pattern up, but no breakout yet. If we break above 44.2k, I'm going long, target 45.5k, stop 43.8k. While in range, only taking quick scalps.\"\n\nKey idea: setups that are actionable right now, without waiting hours.\n\nSETUP #1 (active now) — short opportunity, 2-6 hours movement.\nSETUP #2 (next 4-12h) — scenario that can develop within 12 hours.\n\nAlways specify stop and target, plus why entry is justified now.\n\nLanguage: natural English, no jargon. Terms in natural form (\"stops above 44k\", \"liquidity collection happening\").\n\nCreate the final post now using the analysis results above.",
                "temperature": 0.7,
                "max_tokens": 4000,
                "data_sources": ["previous_steps"]
            }
        ],
        "default_instrument": "BTC/USDT",
        "default_timeframe": "H1",
        "estimated_cost": 0.21,
        "estimated_duration_seconds": 140
    }
    
    # Equity analysis type config
    equity_config = {
        "steps": [
            {
                "step_name": "wyckoff",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional equity trader and analyst. Expert in Wyckoff Method applied to stock markets. Analyze market structure considering earnings cycles, sector rotation, and institutional accumulation/distribution. Consider US market hours and fundamental context.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} timeframe using Wyckoff Method.\n\nRecent price action (last 20 candles):\n{market_data_summary}\n\nDetermine:\n1. Current Wyckoff phase (Accumulation/Distribution/Markup/Markdown)\n2. Market context considering sector trends and institutional activity\n3. Likely scenario (continuation or reversal)\n4. Key levels to watch\n5. Signs of institutional accumulation/distribution\n\nProvide analysis suitable for equity trading decisions.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "smc",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional equity trader. Expert in Smart Money Concepts (SMC) applied to stock markets. Analyze market structure considering institutional order flow, sector rotation, and liquidity pools where retail stops are placed.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Smart Money Concepts.\n\nPrice structure (last 50 candles):\n{market_data_summary}\n\nIdentify:\n1. BOS (Break of Structure) and CHoCH points\n2. Order Blocks (OB) - supply/demand zones\n3. Fair Value Gaps (FVG) - imbalance zones\n4. Liquidity Pools - areas where retail stops are likely\n5. Key levels for potential price returns\n6. Institutional accumulation/distribution zones\n\nProvide structured analysis with specific price levels.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "vsa",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional equity trader. Expert in Volume Spread Analysis (VSA) for stock markets. Analyze volume patterns considering institutional activity, earnings cycles, and sector rotation. Look for signals like no demand, no supply, stopping volume, climactic action, and effort vs result.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Volume Spread Analysis.\n\nOHLCV data (last 30 candles):\n{market_data_summary}\n\nIdentify:\n1. Large participant activity (institutional buying/selling)\n2. No demand / no supply signals\n3. Stopping volume (absorption)\n4. Climactic action (exhaustion)\n5. Effort vs result (volume vs price movement)\n6. Areas where effort without result suggests reversal\n7. Unusual volume indicating institutional activity\n\nProvide VSA signals and their implications for equity trading.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "delta",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional equity trader. Expert in Delta analysis for stock markets. Analyze buying vs selling pressure considering institutional order flow, sector rotation, and market hours (pre-market, regular hours, after-hours).",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Delta analysis principles.\n\nNote: Analyze buying/selling pressure from volume and price action. Consider institutional order flow patterns.\n\nPrice and volume data (last 30 candles):\n{market_data_summary}\n\nIdentify:\n1. Buying vs selling dominance\n2. Anomalous delta patterns\n3. Absorption zones (volume without price movement)\n4. Divergences (price vs volume/strength)\n5. Where institutions are holding or absorbing\n6. Pre-market/after-hours activity patterns\n\nProvide delta-based insights for equity trading.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "ict",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional equity trader. Expert in ICT (Inner Circle Trader) methodology applied to stock markets. Analyze liquidity manipulation, PD Arrays, Fair Value Gaps, and optimal entry points. Consider market hours and institutional behavior.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using ICT methodology.\n\nPrice action (last 50 candles):\n{market_data_summary}\n\nPrevious analysis context:\n- Wyckoff phase: {wyckoff_output}\n- SMC structure: {smc_output}\n\nIdentify:\n1. Liquidity manipulation (sweeps above highs/below lows)\n2. PD Arrays (Premium/Discount zones)\n3. Fair Value Gaps (FVG) for return zones\n4. Optimal entry points after liquidity collection\n5. False breakouts and return scenarios\n6. Institutional liquidity zones\n\nProvide ICT-based entry strategy for equity trading.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data", "previous_steps"]
            },
            {
                "step_name": "price_action",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional equity trader. Expert in Price Action and Pattern Analysis for stock markets. Analyze candlestick patterns, chart formations, and price movements. Focus on patterns like flags, triangles, head and shoulders, and equity-specific formations. Consider earnings cycles and sector trends.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Price Action and Pattern Analysis.\n\nPrice action (last 50 candles):\n{market_data_summary}\n\nIdentify:\n1. Chart patterns forming (flags, triangles, head and shoulders, double tops/bottoms, etc.)\n2. Candlestick patterns (doji, engulfing, pin bars, hammers, shooting stars)\n3. Support and resistance levels from price action\n4. Pattern completion signals and entry points\n5. Stop loss and target levels based on pattern structure\n6. Patterns related to earnings or sector rotation\n\nProvide specific price levels for entries, stops, and targets.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "merge",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional equity trader and analyst. Synthesize Wyckoff + SMC + VSA/Delta + ICT + Price Action analysis into actionable equity trading ideas. Include fundamental context (earnings, sector trends, market conditions). Focus on high-probability setups with clear entry, stop, and target levels. Write naturally, like a trader at the terminal.",
                "user_prompt_template": "Combine analysis results for {instrument} on {timeframe} into a Telegram-ready equity trading post.\n\nAnalysis results:\n\n1️⃣ WYCKOFF:\n{wyckoff_output}\n\n2️⃣ SMC (Smart Money Concepts):\n{smc_output}\n\n3️⃣ VSA (Volume Spread Analysis):\n{vsa_output}\n\n4️⃣ DELTA:\n{delta_output}\n\n5️⃣ ICT:\n{ict_output}\n\n6️⃣ PRICE ACTION / PATTERNS:\n{price_action_output}\n\n---\n\nCreate a Telegram post following this format:\n\n💎 EQUITY: {instrument}\n📈 SCENARIO: [Bullish / Bearish / Sideways]\n🎯 PROBABILITY: [XX%] — [key reason]\n⚡️ KEY LEVEL: [zone/level] — [why important]\n📊 CONTEXT: [sector trend / earnings / market condition]\n🚀 SETUP #1 (intraday): [entry | stop | target]\n🧭 SETUP #2 (swing 1-3 days): [entry | stop | target]\n⚠️ RISK: [main market or fundamental factor]\n#{instrument} #{long} or #{short}\n\n💬 TRADER'S LOGIC\n\nWrite naturally with live analysis logic. Include fundamental context when relevant (earnings, sector rotation, market conditions). Examples:\n\"AAPL holding above 180 — institutional accumulation visible, sector rotation into tech. I'd go long from 180.5 with stop at 178, target 185. If we break 185, could extend to 190.\"\n\n\"Forming a consolidation pattern, waiting for earnings catalyst. If we break above 182, I'm going long, target 188, stop 179. While consolidating, only taking quick scalps.\"\n\nKey idea: setups that are actionable, with clear fundamental or technical justification.\n\nSETUP #1 (intraday) — opportunity for today's session.\nSETUP #2 (swing 1-3 days) — scenario that can develop over next few days.\n\nAlways specify stop and target, plus why entry is justified now (technical + fundamental context).\n\nLanguage: natural English, no jargon. Terms in natural form (\"institutional accumulation\", \"sector rotation\", \"earnings catalyst\").\n\nCreate the final post now using the analysis results above.",
                "temperature": 0.7,
                "max_tokens": 4000,
                "data_sources": ["previous_steps"]
            }
        ],
        "default_instrument": "AAPL",
        "default_timeframe": "H1",
        "estimated_cost": 0.21,
        "estimated_duration_seconds": 140
    }
    
    # Check if analysis types already exist (idempotent)
    result = conn.execute(text("SELECT name FROM analysis_types WHERE name IN ('crypto_analysis', 'equity_analysis')"))
    existing_names = {row[0] for row in result}
    
    # Insert crypto_analysis if it doesn't exist
    if 'crypto_analysis' not in existing_names:
        conn.execute(
            text("""
                INSERT INTO analysis_types (name, display_name, description, version, config, is_active, created_at, updated_at)
                VALUES (:name, :display_name, :description, :version, :config, :is_active, NOW(), NOW())
            """),
            {
                "name": "crypto_analysis",
                "display_name": "Crypto Analysis",
                "description": "Professional cryptocurrency analysis using Wyckoff + SMC + VSA/Delta + ICT + Price Action. Focus on high-probability crypto setups with clear entry, stop, and target levels. Optimized for 24/7 markets, volatility, and exchange flows.",
                "version": "1.0.0",
                "config": json.dumps(crypto_config),
                "is_active": 1
            }
        )
    
    # Insert equity_analysis if it doesn't exist
    if 'equity_analysis' not in existing_names:
        conn.execute(
            text("""
                INSERT INTO analysis_types (name, display_name, description, version, config, is_active, created_at, updated_at)
                VALUES (:name, :display_name, :description, :version, :config, :is_active, NOW(), NOW())
            """),
            {
                "name": "equity_analysis",
                "display_name": "Equity Analysis",
                "description": "Professional equity analysis using Wyckoff + SMC + VSA/Delta + ICT + Price Action. Focus on high-probability stock setups with fundamental context (earnings, sector trends, market conditions). Includes intraday and swing setups.",
                "version": "1.0.0",
                "config": json.dumps(equity_config),
                "is_active": 1
            }
        )


def downgrade() -> None:
    """Remove crypto and equity analysis types."""
    conn = op.get_bind()
    conn.execute(text("DELETE FROM analysis_types WHERE name IN ('crypto_analysis', 'equity_analysis')"))
