#!/usr/bin/env python3
"""
Script to create the complete "Дневной анализ" (Daily Analysis) system process.

This script:
1. Creates Binance API tool for platform admin (if not exists)
2. Creates the "Дневной анализ" process with fetch_market_data step
3. Configures all steps to use {fetch_market_data_output}

Run this after cleaning all processes and tools.
"""

import sys
import os
import json
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.models.organization import Organization
from app.models.analysis_type import AnalysisType
from app.models.user_tool import UserTool, ToolType
from app.models.organization_tool_access import OrganizationToolAccess
from app.services.tools.encryption import encrypt_tool_config
from app.services.organization import get_user_personal_organization, create_personal_organization
from sqlalchemy.orm.attributes import flag_modified


def get_platform_admin_user(db: Session) -> User:
    """Get platform admin user."""
    admin_user = db.query(User).filter(User.role == 'admin').first()
    if not admin_user:
        raise Exception("Platform admin user not found. Please create an admin user first.")
    return admin_user


def get_or_create_admin_organization(db: Session, admin_user: User) -> Organization:
    """Get or create platform admin's personal organization."""
    org = get_user_personal_organization(db, admin_user.id)
    if not org:
        print(f"Creating personal organization for admin user {admin_user.email}...")
        org = create_personal_organization(
            db, 
            admin_user.id, 
            admin_user.full_name or "Platform Admin",
            admin_user.email
        )
        print(f"✅ Created organization: {org.name} (ID: {org.id})")
    else:
        print(f"✅ Using existing organization: {org.name} (ID: {org.id})")
    return org


def create_binance_tool(db: Session, admin_user: User, admin_org: Organization) -> UserTool:
    """Create Binance API tool for platform admin."""
    
    # Check if tool already exists
    existing = db.query(UserTool).filter(
        UserTool.user_id == admin_user.id,
        UserTool.display_name == "Binance API",
        UserTool.tool_type == ToolType.API.value
    ).first()
    
    if existing:
        print(f"✅ Binance API tool already exists (ID: {existing.id})")
        return existing
    
    # Binance API tool configuration
    config = {
        "connector_type": "predefined",
        "connector_name": "binance",
        "base_url": "https://api.binance.com",
        "auth_type": "none",  # Public API doesn't need auth for market data
        "adapter_config": {
            "adapter_type": "ccxt",
            "exchange_name": "binance"
        }
    }
    
    # Encrypt config
    encrypted_config = encrypt_tool_config(config)
    
    # Create tool
    tool = UserTool(
        user_id=admin_user.id,
        organization_id=admin_org.id,
        tool_type=ToolType.API.value,
        display_name="Binance API",
        config=encrypted_config,
        is_active=True,
        is_shared=True
    )
    
    db.add(tool)
    db.flush()  # Get ID
    
    # Create organization_tool_access entries for all admin's orgs
    admin_orgs = db.query(Organization).filter(Organization.owner_id == admin_user.id).all()
    for org in admin_orgs:
        access = OrganizationToolAccess(
            organization_id=org.id,
            tool_id=tool.id,
            is_enabled=True
        )
        db.add(access)
    
    db.commit()
    db.refresh(tool)
    
    print(f"✅ Created Binance API tool (ID: {tool.id})")
    print(f"   Access entries created for {len(admin_orgs)} organization(s)")
    
    return tool


def get_daily_analysis_config(binance_tool_id: int) -> dict:
    """Get daily analysis process configuration with fetch_market_data step."""
    return {
        "steps": [
            {
                "step_name": "fetch_market_data",
                "order": 0,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — помощник для получения данных рынка. Твоя задача — получить данные через API и вернуть ТОЛЬКО данные в указанном формате, БЕЗ дополнительных комментариев, объяснений или форматирования.",
                "user_prompt_template": "Получи данные о цене для BTC/USDT на таймфрейме H1 используя {binance_api}. Верни ТОЛЬКО данные в формате (без дополнительного текста, без объяснений):\n\n- Timestamp: O=open H=high L=low C=close V=volume\n\nдля последних 50 свечей, отсортированных по времени (от старых к новым). Начинай сразу с первой строки данных.",
                "temperature": 0.3,
                "max_tokens": 2000,
                "tool_references": [
                    {
                        "tool_id": binance_tool_id,
                        "variable_name": "binance_api",
                        "extraction_method": "natural_language",
                        "extraction_config": {
                            "context_window": 200
                        }
                    }
                ]
            },
            {
                "step_name": "wyckoff",
                "order": 1,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по методу Wyckoff. Анализируешь структуру рынка для выявления фаз накопления, распределения, роста и падения. Предоставляешь ясные, практичные выводы о контексте рынка и вероятных сценариях.",
                "user_prompt_template": "Проанализируй BTC/USDT на таймфрейме H1 методом Wyckoff.\n\nДанные по цене (последние 20 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Текущую фазу Wyckoff (Накопление/Распределение/Рост/Падение)\n2. Контекст рынка и позицию в цикле\n3. Вероятный сценарий (продолжение или разворот)\n4. Ключевые уровни для наблюдения\n\nПредоставь анализ в структурированном формате, подходящем для торговых решений.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "smc",
                "order": 2,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по Smart Money Concepts (SMC). Анализируешь структуру рынка для выявления BOS (Break of Structure), CHoCH (Change of Character), Order Blocks, Fair Value Gaps (FVG) и зон ликвидности. Определяешь ключевые уровни и события ликвидности.",
                "user_prompt_template": "Проанализируй BTC/USDT на таймфрейме H1 методом Smart Money Concepts.\n\nСтруктура цены (последние 50 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. BOS (Break of Structure) и CHoCH точки\n2. Order Blocks (OB) — зоны спроса/предложения\n3. Fair Value Gaps (FVG) — зоны дисбаланса\n4. Зоны ликвидности — где вероятны стопы\n5. Ключевые уровни для потенциальных возвратов\n\nПредоставь структурированный анализ с конкретными ценовыми уровнями.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "vsa",
                "order": 3,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по Volume Spread Analysis (VSA). Анализируешь объём, спред и ценовое действие для выявления активности крупных участников. Ищешь сигналы типа no demand, no supply, stopping volume, климатическое действие и effort vs result.",
                "user_prompt_template": "Проанализируй BTC/USDT на таймфрейме H1 методом Volume Spread Analysis.\n\nOHLCV данные (последние 30 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Активность крупных участников (анализ объёма)\n2. Сигналы no demand / no supply\n3. Stopping volume (поглощение)\n4. Климатическое действие (истощение)\n5. Effort vs result (объём vs движение цены)\n6. Зоны, где effort без result указывает на разворот\n\nПредоставь VSA сигналы и их значение.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "delta",
                "order": 4,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по анализу Delta. Анализируешь давление покупок vs продаж для выявления доминирования, аномального delta, поглощения, дивергенций и мест, где крупные игроки удерживают позиции или поглощают агрессию.",
                "user_prompt_template": "Проанализируй BTC/USDT на таймфрейме H1 используя принципы анализа Delta.\n\nПримечание: Полный delta требует данных order flow. Анализируй давление покупок/продаж из объёма и ценового действия.\n\nДанные по цене и объёму (последние 30 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Доминирование покупок vs продаж\n2. Паттерны аномального delta\n3. Зоны поглощения (объём без движения цены)\n4. Дивергенции (цена vs объём/сила)\n5. Места, где крупные игроки удерживают или поглощают\n\nПредоставь выводы на основе Delta.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "ict",
                "order": 5,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — эксперт по методологии ICT (Inner Circle Trader). Анализируешь манипуляции ликвидностью, PD Arrays (Premium/Discount), Fair Value Gaps и оптимальные точки входа после сборов ликвидности.",
                "user_prompt_template": "Проанализируй BTC/USDT на таймфрейме H1 используя методологию ICT.\n\nЦеновое действие (последние 50 свечей):\n{fetch_market_data_output}\n\nКонтекст предыдущего анализа:\n- Фаза Wyckoff: {wyckoff_output}\n- Структура SMC: {smc_output}\n\nОпредели:\n1. Манипуляции ликвидностью (сборы выше максимумов/ниже минимумов)\n2. PD Arrays (зоны Premium/Discount)\n3. Fair Value Gaps (FVG) для зон возврата\n4. Оптимальные точки входа после сбора ликвидности\n5. Ложные пробои и сценарии возврата\n\nПредоставь стратегию входа на основе ICT.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "merge",
                "order": 6,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный торговый аналитик. Объединяешь результаты нескольких методов анализа в связный, практичный пост для Telegram. Следуешь точному формату и стилю, указанному в пользовательском промпте. Пишешь на русском языке, как указано.",
                "user_prompt_template": "Объедини результаты анализа BTC/USDT на таймфрейме H1 в единый пост для Telegram.\n\nРезультаты анализа по методам:\n\n1️⃣ WYCKOFF:\n{wyckoff_output}\n\n2️⃣ SMC (Smart Money Concepts):\n{smc_output}\n\n3️⃣ VSA (Volume Spread Analysis):\n{vsa_output}\n\n4️⃣ DELTA:\n{delta_output}\n\n5️⃣ ICT:\n{ict_output}\n\n---\n\nТеперь создай финальный пост в формате Telegram, следуя ТОЧНО шаблону из оригинального промпта (структурно, списками, без таблиц, с заголовком, внутридневным планом и тремя сценариями).",
                "temperature": 0.7,
                "max_tokens": 4000
            }
        ],
        "estimated_cost": 0.18,
        "estimated_duration_seconds": 120
    }


def create_daily_analysis_process(db: Session, binance_tool: UserTool) -> AnalysisType:
    """Create daily analysis process with fetch_market_data step."""
    
    # Get platform admin user
    admin_user = get_platform_admin_user(db)
    admin_org = get_or_create_admin_organization(db, admin_user)
    
    # Check if process already exists
    existing = db.query(AnalysisType).filter(AnalysisType.name == 'daystart').first()
    if existing:
        print(f"⚠️  Process 'daystart' already exists (ID: {existing.id})")
        print("   Updating existing process...")
        existing.config = get_daily_analysis_config(binance_tool.id)
        existing.display_name = "Дневной анализ"
        existing.description = "Полный анализ рынка с использованием 5 методологий: Wyckoff, SMC, VSA, Delta и ICT. Создаёт комплексный пост для Telegram, готовый к публикации."
        existing.is_system = True
        existing.user_id = admin_user.id
        existing.organization_id = admin_org.id
        existing.is_active = 1
        flag_modified(existing, 'config')
        db.commit()
        db.refresh(existing)
        print(f"✅ Updated process: {existing.display_name} (ID: {existing.id})")
        return existing
    
    # Create new process
    config = get_daily_analysis_config(binance_tool.id)
    process = AnalysisType(
        name="daystart",
        display_name="Дневной анализ",
        description="Полный анализ рынка с использованием 5 методологий: Wyckoff, SMC, VSA, Delta и ICT. Создаёт комплексный пост для Telegram, готовый к публикации.",
        version="1.0.0",
        config=config,
        is_system=True,
        user_id=admin_user.id,
        organization_id=admin_org.id,
        is_active=1
    )
    
    db.add(process)
    db.commit()
    db.refresh(process)
    
    print(f"✅ Created process: {process.display_name} (ID: {process.id})")
    print(f"   Steps: {len(config['steps'])}")
    print(f"   Owner: {admin_user.email}")
    print(f"   Organization: {admin_org.name}")
    
    return process


def main():
    """Main function."""
    print("=" * 60)
    print("Creating 'Дневной анализ' (Daily Analysis) system process")
    print("=" * 60)
    print()
    
    db: Session = SessionLocal()
    try:
        # Get platform admin
        admin_user = get_platform_admin_user(db)
        print(f"✅ Found platform admin: {admin_user.email} (ID: {admin_user.id})")
        
        # Get or create admin organization
        admin_org = get_or_create_admin_organization(db, admin_user)
        print()
        
        # Create Binance API tool
        print("Step 1: Creating Binance API tool...")
        binance_tool = create_binance_tool(db, admin_user, admin_org)
        print()
        
        # Create daily analysis process
        print("Step 2: Creating daily analysis process...")
        process = create_daily_analysis_process(db, binance_tool)
        print()
        
        print("=" * 60)
        print("✅ Success! Daily analysis process created.")
        print("=" * 60)
        print(f"Process ID: {process.id}")
        print(f"Name: {process.name}")
        print(f"Display Name: {process.display_name}")
        print(f"System Process: {process.is_system}")
        print(f"Active: {process.is_active}")
        print(f"Steps: {len(process.config.get('steps', []))}")
        print()
        print("Step structure:")
        for i, step in enumerate(process.config.get('steps', []), 1):
            step_name = step.get('step_name')
            step_type = step.get('step_type')
            has_tools = 'tool_references' in step and len(step.get('tool_references', [])) > 0
            tool_info = f" (uses Binance API tool)" if has_tools else ""
            print(f"  {i}. {step_name} ({step_type}){tool_info}")
        
    except Exception as e:
        print()
        print("=" * 60)
        print("❌ Error:")
        print("=" * 60)
        print(str(e))
        import traceback
        traceback.print_exc()
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

