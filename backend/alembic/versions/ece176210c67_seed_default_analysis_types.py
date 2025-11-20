"""seed_default_analysis_types

Revision ID: ece176210c67
Revises: 731537f92026
Create Date: 2025-11-14 00:08:34.074221

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
import json


# revision identifiers, used by Alembic.
revision = 'ece176210c67'
down_revision = '731537f92026'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Seed default analysis types: daystart and commodity_futures."""
    conn = op.get_bind()
    
    # Daystart analysis type config
    daystart_config = {
        "steps": [
            {
                "step_name": "wyckoff",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are an expert in Wyckoff Method analysis. Analyze market structure to identify accumulation, distribution, markup, and markdown phases. Provide clear, actionable insights about market context and likely scenarios.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} timeframe using Wyckoff Method.\n\nRecent price action (last 20 candles):\n{market_data_summary}\n\nDetermine:\n1. Current Wyckoff phase (Accumulation/Distribution/Markup/Markdown)\n2. Market context and cycle position\n3. Likely scenario (continuation or reversal)\n4. Key levels to watch\n\nProvide analysis in structured format suitable for trading decisions.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "smc",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are an expert in Smart Money Concepts (SMC). Analyze market structure to identify BOS (Break of Structure), CHoCH (Change of Character), Order Blocks, Fair Value Gaps (FVG), and Liquidity Pools. Identify key levels and liquidity events.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Smart Money Concepts.\n\nPrice structure (last 50 candles):\n{market_data_summary}\n\nIdentify:\n1. BOS (Break of Structure) and CHoCH points\n2. Order Blocks (OB) - supply/demand zones\n3. Fair Value Gaps (FVG) - imbalance zones\n4. Liquidity Pools - areas where stops are likely\n5. Key levels for potential price returns\n\nProvide structured analysis with specific price levels.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "vsa",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are an expert in Volume Spread Analysis (VSA). Analyze volume, spread, and price action to identify large participant activity. Look for signals like no demand, no supply, stopping volume, climactic action, and effort vs result.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Volume Spread Analysis.\n\nOHLCV data (last 30 candles):\n{market_data_summary}\n\nIdentify:\n1. Large participant activity (volume analysis)\n2. No demand / no supply signals\n3. Stopping volume (absorption)\n4. Climactic action (exhaustion)\n5. Effort vs result (volume vs price movement)\n6. Areas where effort without result suggests reversal\n\nProvide VSA signals and their implications.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "delta",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are an expert in Delta analysis. Analyze buying vs selling pressure to identify dominance, anomalous delta, absorption, divergence, and where large players are holding positions or absorbing aggression.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using Delta analysis principles.\n\nNote: Full delta requires order flow data. Analyze buying/selling pressure from volume and price action.\n\nPrice and volume data (last 30 candles):\n{market_data_summary}\n\nIdentify:\n1. Buying vs selling dominance\n2. Anomalous delta patterns\n3. Absorption zones (volume without price movement)\n4. Divergences (price vs volume/strength)\n5. Where large players are holding or absorbing\n\nProvide delta-based insights.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "ict",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are an expert in ICT (Inner Circle Trader) methodology. Analyze liquidity manipulation, PD Arrays (Premium/Discount), Fair Value Gaps, and optimal entry points after liquidity sweeps.",
                "user_prompt_template": "Analyze {instrument} on {timeframe} using ICT methodology.\n\nPrice action (last 50 candles):\n{market_data_summary}\n\nPrevious analysis context:\n- Wyckoff phase: {wyckoff_output}\n- SMC structure: {smc_output}\n\nIdentify:\n1. Liquidity manipulation (sweeps above highs/below lows)\n2. PD Arrays (Premium/Discount zones)\n3. Fair Value Gaps (FVG) for return zones\n4. Optimal entry points after liquidity collection\n5. False breakouts and return scenarios\n\nProvide ICT-based entry strategy.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data", "previous_steps"]
            },
            {
                "step_name": "merge",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "You are a professional trading analyst. Combine multiple analysis methods into a cohesive, actionable Telegram post. Follow the exact format and style specified in the user prompt. Write in Russian as specified.",
                "user_prompt_template": "Объедини результаты анализа {instrument} на таймфрейме {timeframe} в единый пост для Telegram.\n\nРезультаты анализа по методам:\n\n1️⃣ WYCKOFF:\n{wyckoff_output}\n\n2️⃣ SMC (Smart Money Concepts):\n{smc_output}\n\n3️⃣ VSA (Volume Spread Analysis):\n{vsa_output}\n\n4️⃣ DELTA:\n{delta_output}\n\n5️⃣ ICT:\n{ict_output}\n\n---\n\nТеперь создай финальный пост в формате Telegram, следуя ТОЧНО шаблону из оригинального промпта (структурно, списками, без таблиц, с заголовком, внутридневным планом и тремя сценариями).",
                "temperature": 0.7,
                "max_tokens": 4000,
                "data_sources": ["previous_steps"]
            }
        ],
        "default_instrument": "BTC/USDT",
        "default_timeframe": "H1",
        "estimated_cost": 0.18,
        "estimated_duration_seconds": 120
    }
    
    # Commodity Futures analysis type config
    commodity_futures_config = {
        "steps": [
            {
                "step_name": "wyckoff",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер и аналитик товарных фьючерсов. Эксперт по методу Wyckoff. Анализируешь фазы накопления, распределения, роста и падения. Пишешь естественно, как человек у терминала: без шаблонов, только суть и конкретика.",
                "user_prompt_template": "Проанализируй {instrument} на таймфрейме {timeframe} методом Wyckoff.\n\nДанные по цене (последние 20 свечей):\n{market_data_summary}\n\nОпредели:\n1. Текущую фазу Wyckoff (Накопление/Распределение/Рост/Падение)\n2. Контекст рынка и позицию в цикле\n3. Вероятный сценарий (продолжение или разворот)\n4. Ключевые уровни для наблюдения\n\nПиши естественно, без шаблонов. Если видишь расхождения с базовым активом (спот) — коротко объясни причину.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "smc",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по Smart Money Concepts (SMC). Анализируешь структуру рынка, BOS, CHoCH, Order Blocks, FVG, зоны ликвидности. Пишешь естественно, как человек у терминала.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} методом Smart Money Concepts.\n\nСтруктура цены (последние 50 свечей):\n{market_data_summary}\n\nОпредели:\n1. BOS (Break of Structure) и CHoCH точки\n2. Order Blocks (OB) — зоны спроса/предложения\n3. Fair Value Gaps (FVG) — зоны дисбаланса\n4. Зоны ликвидности — где вероятны стопы\n5. Ключевые уровни для потенциальных возвратов\n\nУкажи конкретные ценовые уровни. Пиши естественно, без англицизмов.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "vsa",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по Volume Spread Analysis (VSA). Анализируешь объём, спред и движение цены для выявления активности крупных участников. Ищешь сигналы: no demand, no supply, stopping volume, climactic action, effort vs result.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} методом Volume Spread Analysis.\n\nДанные OHLCV (последние 30 свечей):\n{market_data_summary}\n\nОпредели:\n1. Активность крупных участников (анализ объёма)\n2. Сигналы no demand / no supply\n3. Stopping volume (поглощение)\n4. Climactic action (истощение)\n5. Effort vs result (объём vs движение цены)\n6. Зоны, где усилие без результата говорит о развороте\n\nПиши естественно, без шаблонов.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "delta",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по Delta-анализу. Анализируешь давление покупок vs продаж для выявления доминации, аномальной дельты, абсорбции, дивергенций, где крупные игроки удерживают позиции или поглощают агрессию.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} принципами Delta-анализа.\n\nПримечание: Полная дельта требует данных order flow. Анализируй давление покупок/продаж из объёма и движения цены.\n\nДанные по цене и объёму (последние 30 свечей):\n{market_data_summary}\n\nОпредели:\n1. Доминация покупок vs продаж\n2. Аномальные паттерны дельты\n3. Зоны абсорбции (объём без движения цены)\n4. Дивергенции (цена vs объём/сила)\n5. Где крупные игроки удерживают или поглощают\n\nПиши естественно, без англицизмов.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "ict",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по методологии ICT (Inner Circle Trader). Анализируешь манипуляции ликвидностью, PD Arrays (Premium/Discount), Fair Value Gaps, оптимальные точки входа после сборов ликвидности.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} методологией ICT.\n\nДвижение цены (последние 50 свечей):\n{market_data_summary}\n\nКонтекст предыдущего анализа:\n- Фаза Wyckoff: {wyckoff_output}\n- Структура SMC: {smc_output}\n\nОпредели:\n1. Манипуляции ликвидностью (сборы над хаями/под лоями)\n2. PD Arrays (зоны Premium/Discount)\n3. Fair Value Gaps (FVG) для зон возврата\n4. Оптимальные точки входа после сбора ликвидности\n5. Ложные пробои и сценарии возврата\n\nПиши естественно, без шаблонов.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data", "previous_steps"]
            },
            {
                "step_name": "price_action",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по Price Action и анализу паттернов. Анализируешь свечные паттерны, графические формации и движения цены для выявления торговых возможностей. Фокусируешься на паттернах: флаги, треугольники, голова-плечи, свечные формации. Даёшь конкретные уровни входа, стопа и цели на основе завершения паттерна.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} методом Price Action и анализа паттернов.\n\nДвижение цены (последние 50 свечей):\n{market_data_summary}\n\nОпредели:\n1. Формирующиеся графические паттерны (флаги, треугольники, голова-плечи, двойные вершины/основания и т.д.)\n2. Свечные паттерны (доджи, поглощение, пин-бары, молоты, падающие звёзды)\n3. Уровни поддержки и сопротивления из движения цены\n4. Сигналы завершения паттерна и точки входа\n5. Уровни стоп-лосса и цели на основе структуры паттерна\n\nУкажи конкретные ценовые уровни для входов, стопов и целей. Если формируется фигура — обязательно скажи (\"рисует флаг\", \"похоже на формирующуюся ГИП\").",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "merge",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер и аналитик товарных фьючерсов. Работаешь на синтезе Wyckoff + SMC + VSA/Delta + ICT + Price Action + Pattern Analysis. Твоя цель — дать готовую идею, в которую можно войти прямо сейчас, и краткосрочную стратегию на ближайшие сутки. Пишешь естественно, как человек у терминала: без шаблонов, без \"умных\" фраз, только суть, наблюдения и конкретика. Всегда используй актуальные котировки. Все уровни и расчёты — в ценах МОЕХ. Если есть расхождения между базой (спот) и нашим активом — коротко объясни (\"арбитражная дельта\", \"курс рубля\", \"задержка\").",
                "user_prompt_template": "Объедини результаты анализа {instrument} на таймфрейме {timeframe} в единый пост для Telegram.\n\nРезультаты анализа по методам:\n\n1️⃣ WYCKOFF:\n{wyckoff_output}\n\n2️⃣ SMC (Smart Money Concepts):\n{smc_output}\n\n3️⃣ VSA (Volume Spread Analysis):\n{vsa_output}\n\n4️⃣ DELTA:\n{delta_output}\n\n5️⃣ ICT:\n{ict_output}\n\n6️⃣ PRICE ACTION / PATTERNS:\n{price_action_output}\n\n---\n\nТеперь создай финальный пост в формате Telegram, следуя ТОЧНО этому шаблону:\n\n💎 СИТУАЦИЯ: [АКТИВ]\n📈 СЦЕНАРИЙ: [Бычий / Медвежий / Боковой]\n🎯 ВЕРОЯТНОСТЬ: [примерно XX %] — [ключевая причина]\n⚡️ УРОВЕНЬ: [зона / уровень] — [почему ключевая]\n🚀 СДЕЛКА #1 (прямо сейчас): [вход | стоп | тейк]\n🧭 СДЕЛКА #2 (сегодня-завтра): [вход | стоп | тейк]\n⚠️ РИСК: [главный рыночный или фундаментальный фактор]\n#[АКТИВ] #[лонг] или #[шорт]\n\n💬 РАССУЖДЕНИЕ ТРЕЙДЕРА\n\nПиши естественно, с логикой живого анализа. Примеры стиля:\n\"Газ держится под уровнем 4.45 — сверху плотный объём, снизу собирают ликвидность. Сейчас я бы зашёл в шорт от 4.44 со стопом 4.48, цель — 4.36. Если к вечеру удержат зону 4.35 и появится реакция — можно развернуться в лонг до 4.50.\"\n\n\"Рисуется флаг вверх, но пока нет пробоя. Если закрепятся выше 4.52 — вхожу в лонг, тейк 4.68, стоп 4.47. Пока держимся в диапазоне, лучше брать только короткие движения.\"\n\nКлючевая идея — сделка, которая \"живая\" и выполнима прямо сейчас, без ожидания часами.\n\nСДЕЛКА #1 (прямо сейчас) — короткая возможность, рассчитанная на движение ближайшие 2–6 часов, без долгого ожидания.\nСДЕЛКА #2 (сегодня–завтра) — сценарий, который может развиться в течение суток, с возможностью переноса через ночь.\n\nОбязательно указывай стоп и тейк, а также аргумент, почему вход оправдан именно сейчас.\n\nЯзык: без англицизмов, без единиц измерения, без упоминания тикеров. Термины Wyckoff/SMC — в естественной форме (\"над 4.50 висят стопы покупателей\", \"идёт сбор ликвидности\").\n\nСоздай финальный пост сейчас, используя результаты анализа выше.",
                "temperature": 0.7,
                "max_tokens": 4000,
                "data_sources": ["previous_steps"]
            }
        ],
        "default_instrument": "NG1!",
        "default_timeframe": "H1",
        "estimated_cost": 0.21,
        "estimated_duration_seconds": 140
    }
    
    # Check if analysis types already exist (idempotent)
    result = conn.execute(text("SELECT name FROM analysis_types WHERE name IN ('daystart', 'commodity_futures')"))
    existing_names = {row[0] for row in result}
    
    # Insert daystart if it doesn't exist
    if 'daystart' not in existing_names:
        conn.execute(
            text("""
                INSERT INTO analysis_types (name, display_name, description, version, config, is_active, created_at, updated_at)
                VALUES (:name, :display_name, :description, :version, :config, :is_active, NOW(), NOW())
            """),
            {
                "name": "daystart",
                "display_name": "Daystart Analysis",
                "description": "Full market analysis using 5 methodologies: Wyckoff, SMC, VSA, Delta, and ICT. Produces comprehensive Telegram-ready trading post.",
                "version": "1.0.0",
                "config": json.dumps(daystart_config),
                "is_active": 1
            }
        )
    
    # Insert commodity_futures if it doesn't exist
    if 'commodity_futures' not in existing_names:
        conn.execute(
            text("""
                INSERT INTO analysis_types (name, display_name, description, version, config, is_active, created_at, updated_at)
                VALUES (:name, :display_name, :description, :version, :config, :is_active, NOW(), NOW())
            """),
            {
                "name": "commodity_futures",
                "display_name": "Commodity Futures Analysis",
                "description": "Профессиональный анализ товарных фьючерсов МОЕХ с синтезом Wyckoff + SMC + VSA/Delta + ICT + Price Action. Фокус на живые точки входа прямо сейчас и краткосрочную стратегию на ближайшие сутки. Формат: две конкретные сделки с уровнями входа, стопа и тейка.",
                "version": "1.0.0",
                "config": json.dumps(commodity_futures_config),
                "is_active": 1
            }
        )


def downgrade() -> None:
    """Remove seeded analysis types."""
    conn = op.get_bind()
    conn.execute(text("DELETE FROM analysis_types WHERE name IN ('daystart', 'commodity_futures')"))
