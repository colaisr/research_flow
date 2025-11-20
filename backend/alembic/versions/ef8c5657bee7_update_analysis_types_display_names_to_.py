"""update_analysis_types_display_names_to_russian

Revision ID: ef8c5657bee7
Revises: e57447c4294b
Create Date: 2025-11-14 00:20:29.871387

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = 'ef8c5657bee7'
down_revision = 'e57447c4294b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update display names and descriptions to Russian."""
    conn = op.get_bind()
    
    # Update daystart
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET display_name = :display_name, 
                description = :description,
                updated_at = NOW()
            WHERE name = 'daystart'
        """),
        {
            "display_name": "Дневной анализ",
            "description": "Полный анализ рынка с использованием 5 методологий: Wyckoff, SMC, VSA, Delta и ICT. Создаёт комплексный пост для Telegram, готовый к публикации."
        }
    )
    
    # Update commodity_futures
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET display_name = :display_name, 
                description = :description,
                updated_at = NOW()
            WHERE name = 'commodity_futures'
        """),
        {
            "display_name": "Анализ товарных фьючерсов",
            "description": "Профессиональный анализ товарных фьючерсов МОЕХ с синтезом Wyckoff + SMC + VSA/Delta + ICT + Price Action. Фокус на живые точки входа прямо сейчас и краткосрочную стратегию на ближайшие сутки. Формат: две конкретные сделки с уровнями входа, стопа и тейка."
        }
    )
    
    # Update crypto_analysis
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET display_name = :display_name, 
                description = :description,
                updated_at = NOW()
            WHERE name = 'crypto_analysis'
        """),
        {
            "display_name": "Анализ криптовалют",
            "description": "Профессиональный анализ криптовалют с использованием Wyckoff + SMC + VSA/Delta + ICT + Price Action. Фокус на высоковероятные крипто-сетапы с ясными уровнями входа, стопа и цели. Оптимизировано для рынков 24/7, волатильности и потоков бирж."
        }
    )
    
    # Update equity_analysis
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET display_name = :display_name, 
                description = :description,
                updated_at = NOW()
            WHERE name = 'equity_analysis'
        """),
        {
            "display_name": "Анализ акций",
            "description": "Профессиональный анализ акций с использованием Wyckoff + SMC + VSA/Delta + ICT + Price Action. Фокус на высоковероятные сетапы по акциям с фундаментальным контекстом (отчётность, тренды секторов, условия рынка). Включает внутридневные и свинг-сетапы."
        }
    )


def downgrade() -> None:
    """Revert to English display names and descriptions."""
    conn = op.get_bind()
    
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET display_name = 'Daystart Analysis', 
                description = 'Full market analysis using 5 methodologies: Wyckoff, SMC, VSA, Delta, and ICT. Produces comprehensive Telegram-ready trading post.',
                updated_at = NOW()
            WHERE name = 'daystart'
        """)
    )
    
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET display_name = 'Commodity Futures Analysis', 
                description = 'Professional analysis of MOEX commodity futures with synthesis of Wyckoff + SMC + VSA/Delta + ICT + Price Action. Focus on live entry points right now and short-term strategy for the next 24 hours. Format: two specific trades with entry, stop, and target levels.',
                updated_at = NOW()
            WHERE name = 'commodity_futures'
        """)
    )
    
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET display_name = 'Crypto Analysis', 
                description = 'Professional cryptocurrency analysis using Wyckoff + SMC + VSA/Delta + ICT + Price Action. Focus on high-probability crypto setups with clear entry, stop, and target levels. Optimized for 24/7 markets, volatility, and exchange flows.',
                updated_at = NOW()
            WHERE name = 'crypto_analysis'
        """)
    )
    
    conn.execute(
        text("""
            UPDATE analysis_types 
            SET display_name = 'Equity Analysis', 
                description = 'Professional equity analysis using Wyckoff + SMC + VSA/Delta + ICT + Price Action. Focus on high-probability stock setups with fundamental context (earnings, sector trends, market conditions). Includes intraday and swing setups.',
                updated_at = NOW()
            WHERE name = 'equity_analysis'
        """)
    )
