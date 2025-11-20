"""update_daystart_to_russian

Revision ID: e57447c4294b
Revises: da8ff47549c8
Create Date: 2025-11-14 00:25:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
import json


# revision identifiers, used by Alembic.
revision = 'e57447c4294b'
down_revision = 'da8ff47549c8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update daystart analysis type to use Russian prompts."""
    conn = op.get_bind()
    
    # Updated Daystart analysis type config (Russian)
    daystart_config = {
        "steps": [
            {
                "step_name": "wyckoff",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по методу Wyckoff. Анализируешь структуру рынка для выявления фаз накопления, распределения, роста и падения. Предоставляешь ясные, практичные выводы о контексте рынка и вероятных сценариях.",
                "user_prompt_template": "Проанализируй {instrument} на таймфрейме {timeframe} методом Wyckoff.\n\nДанные по цене (последние 20 свечей):\n{market_data_summary}\n\nОпредели:\n1. Текущую фазу Wyckoff (Накопление/Распределение/Рост/Падение)\n2. Контекст рынка и позицию в цикле\n3. Вероятный сценарий (продолжение или разворот)\n4. Ключевые уровни для наблюдения\n\nПредоставь анализ в структурированном формате, подходящем для торговых решений.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "smc",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по Smart Money Concepts (SMC). Анализируешь структуру рынка для выявления BOS (Break of Structure), CHoCH (Change of Character), Order Blocks, Fair Value Gaps (FVG) и зон ликвидности. Определяешь ключевые уровни и события ликвидности.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} методом Smart Money Concepts.\n\nСтруктура цены (последние 50 свечей):\n{market_data_summary}\n\nОпредели:\n1. BOS (Break of Structure) и CHoCH точки\n2. Order Blocks (OB) — зоны спроса/предложения\n3. Fair Value Gaps (FVG) — зоны дисбаланса\n4. Зоны ликвидности — где вероятны стопы\n5. Ключевые уровни для потенциальных возвратов\n\nПредоставь структурированный анализ с конкретными ценовыми уровнями.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "vsa",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по Volume Spread Analysis (VSA). Анализируешь объём, спред и движение цены для выявления активности крупных участников. Ищешь сигналы: no demand, no supply, stopping volume, climactic action, effort vs result.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} методом Volume Spread Analysis.\n\nДанные OHLCV (последние 30 свечей):\n{market_data_summary}\n\nОпредели:\n1. Активность крупных участников (анализ объёма)\n2. Сигналы no demand / no supply\n3. Stopping volume (поглощение)\n4. Climactic action (истощение)\n5. Effort vs result (объём vs движение цены)\n6. Зоны, где усилие без результата говорит о развороте\n\nПредоставь сигналы VSA и их значение.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "delta",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по Delta-анализу. Анализируешь давление покупок vs продаж для выявления доминации, аномальной дельты, абсорбции, дивергенций, где крупные игроки удерживают позиции или поглощают агрессию.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} принципами Delta-анализа.\n\nПримечание: Полная дельта требует данных order flow. Анализируй давление покупок/продаж из объёма и движения цены.\n\nДанные по цене и объёму (последние 30 свечей):\n{market_data_summary}\n\nОпредели:\n1. Доминация покупок vs продаж\n2. Аномальные паттерны дельты\n3. Зоны абсорбции (объём без движения цены)\n4. Дивергенции (цена vs объём/сила)\n5. Где крупные игроки удерживают или поглощают\n\nПредоставь выводы на основе дельты.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data"]
            },
            {
                "step_name": "ict",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по методологии ICT (Inner Circle Trader). Анализируешь манипуляции ликвидностью, PD Arrays (Premium/Discount), Fair Value Gaps и оптимальные точки входа после сборов ликвидности.",
                "user_prompt_template": "Проанализируй {instrument} на {timeframe} методологией ICT.\n\nДвижение цены (последние 50 свечей):\n{market_data_summary}\n\nКонтекст предыдущего анализа:\n- Фаза Wyckoff: {wyckoff_output}\n- Структура SMC: {smc_output}\n\nОпредели:\n1. Манипуляции ликвидностью (сборы над хаями/под лоями)\n2. PD Arrays (зоны Premium/Discount)\n3. Fair Value Gaps (FVG) для зон возврата\n4. Оптимальные точки входа после сбора ликвидности\n5. Ложные пробои и сценарии возврата\n\nПредоставь стратегию входа на основе ICT.",
                "temperature": 0.7,
                "max_tokens": 2000,
                "data_sources": ["market_data", "previous_steps"]
            },
            {
                "step_name": "merge",
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный торговый аналитик. Объединяешь несколько методов анализа в единый, практичный пост для Telegram. Следуй точному формату и стилю, указанному в пользовательском промпте. Пиши на русском языке.",
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
    
    # Update daystart config
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET config = :config, updated_at = NOW()
            WHERE name = 'daystart'
        """),
        {"config": json.dumps(daystart_config)}
    )


def downgrade() -> None:
    """Revert to English prompts (not implemented - would need original configs)."""
    # Note: Downgrade would require storing original English configs
    # For now, we'll leave this as a no-op
    pass
