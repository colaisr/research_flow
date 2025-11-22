#!/usr/bin/env python3
"""
Script to create the complete "Анализ акций" (Equity Analysis) system process.

This script:
1. Creates Yahoo Finance API tool for platform admin (if not exists)
2. Creates the "Анализ акций" process with fetch_market_data step
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


def create_yahoo_finance_tool(db: Session, admin_user: User, admin_org: Organization) -> UserTool:
    """Create Yahoo Finance API tool for platform admin."""
    
    # Check if tool already exists
    existing = db.query(UserTool).filter(
        UserTool.user_id == admin_user.id,
        UserTool.display_name == "Yahoo Finance API",
        UserTool.tool_type == ToolType.API.value
    ).first()
    
    if existing:
        print(f"✅ Yahoo Finance API tool already exists (ID: {existing.id})")
        return existing
    
    # Yahoo Finance API tool configuration
    config = {
        "connector_type": "predefined",
        "connector_name": "yfinance",
        "base_url": "https://query1.finance.yahoo.com",
        "auth_type": "none",  # Public API doesn't need auth
        "adapter_config": {
            "adapter_type": "yfinance"
        }
    }
    
    # Encrypt config (even if no credentials, for consistency)
    encrypted_config = encrypt_tool_config(config)
    
    # Create tool
    tool = UserTool(
        user_id=admin_user.id,
        organization_id=admin_org.id,
        tool_type=ToolType.API.value,
        display_name="Yahoo Finance API",
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
    
    print(f"✅ Created Yahoo Finance API tool (ID: {tool.id})")
    print(f"   Access entries created for {len(admin_orgs)} organization(s)")
    
    return tool


def get_equity_analysis_config(yahoo_finance_tool_id: int) -> dict:
    """Get equity analysis process configuration (Russian version) with tool references."""
    return {
        "steps": [
            {
                "step_name": "fetch_market_data",
                "order": 0,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — помощник для получения данных рынка. Твоя задача — получить данные через API и вернуть ТОЛЬКО данные в указанном формате, БЕЗ дополнительных комментариев, объяснений или форматирования.",
                "user_prompt_template": "Получи данные о цене для AAPL на таймфрейме H1 используя {yahoo_finance_api}. Верни ТОЛЬКО данные в формате (без дополнительного текста, без объяснений):\n\n- Timestamp: O=open H=high L=low C=close V=volume\n\nдля последних 50 свечей, отсортированных по времени (от старых к новым). Начинай сразу с первой строки данных.",
                "temperature": 0.3,
                "max_tokens": 2000,
                "tool_references": [
                    {
                        "tool_id": yahoo_finance_tool_id,
                        "variable_name": "yahoo_finance_api",
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
                "system_prompt": "Ты — профессиональный трейдер и аналитик акций. Эксперт по методу Wyckoff, применённому к фондовым рынкам. Анализируешь структуру рынка с учётом циклов отчётности, ротации секторов и институционального накопления/распределения. Учитываешь часы торговли на американских рынках и фундаментальный контекст.",
                "user_prompt_template": "Проанализируй AAPL на таймфрейме H1 методом Wyckoff.\n\nДанные по цене (последние 20 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Текущую фазу Wyckoff (Накопление/Распределение/Рост/Падение)\n2. Контекст рынка с учётом трендов сектора и институциональной активности\n3. Вероятный сценарий (продолжение или разворот)\n4. Ключевые уровни для наблюдения\n5. Признаки институционального накопления/распределения\n\nПиши естественно, без шаблонов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "smc",
                "order": 2,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер акций. Эксперт по Smart Money Concepts (SMC), применённому к фондовым рынкам. Анализируешь структуру рынка с учётом институционального потока ордеров, ротации секторов и зон ликвидности, где вероятны стопы розничных трейдеров.",
                "user_prompt_template": "Проанализируй AAPL на H1 методом Smart Money Concepts.\n\nСтруктура цены (последние 50 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. BOS (Break of Structure) и CHoCH точки\n2. Order Blocks (OB) — зоны спроса/предложения\n3. Fair Value Gaps (FVG) — зоны дисбаланса\n4. Зоны ликвидности — где вероятны стопы розничных трейдеров\n5. Ключевые уровни для потенциальных возвратов\n6. Зоны институционального накопления/распределения\n\nУкажи конкретные ценовые уровни. Пиши естественно, без англицизмов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "vsa",
                "order": 3,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер акций. Эксперт по Volume Spread Analysis (VSA) для фондовых рынков. Анализируешь паттерны объёма с учётом институциональной активности, циклов отчётности и ротации секторов. Ищешь сигналы: no demand, no supply, stopping volume, climactic action, effort vs result.",
                "user_prompt_template": "Проанализируй AAPL на H1 методом Volume Spread Analysis.\n\nДанные OHLCV (последние 30 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Активность крупных участников (институциональные покупки/продажи)\n2. Сигналы no demand / no supply\n3. Stopping volume (поглощение)\n4. Climactic action (истощение)\n5. Effort vs result (объём vs движение цены)\n6. Зоны, где усилие без результата говорит о развороте\n7. Необычный объём, указывающий на институциональную активность\n\nПиши естественно, без шаблонов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "delta",
                "order": 4,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер акций. Эксперт по Delta-анализу для фондовых рынков. Анализируешь давление покупок vs продаж с учётом институционального потока ордеров, ротации секторов и часов торговли (премаркет, основные часы, после закрытия).",
                "user_prompt_template": "Проанализируй AAPL на H1 принципами Delta-анализа.\n\nПримечание: Анализируй давление покупок/продаж из объёма и движения цены. Учитывай паттерны институционального потока ордеров.\n\nДанные по цене и объёму (последние 30 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Доминация покупок vs продаж\n2. Аномальные паттерны дельты\n3. Зоны абсорбции (объём без движения цены)\n4. Дивергенции (цена vs объём/сила)\n5. Где институции удерживают или поглощают\n6. Паттерны активности в премаркете/после закрытия\n\nПиши естественно, без англицизмов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "ict",
                "order": 5,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер акций. Эксперт по методологии ICT (Inner Circle Trader), применённой к фондовым рынкам. Анализируешь манипуляции ликвидностью, PD Arrays, Fair Value Gaps и оптимальные точки входа. Учитываешь часы торговли и поведение институций.",
                "user_prompt_template": "Проанализируй AAPL на H1 методологией ICT.\n\nДвижение цены (последние 50 свечей):\n{fetch_market_data_output}\n\nКонтекст предыдущего анализа:\n- Фаза Wyckoff: {wyckoff_output}\n- Структура SMC: {smc_output}\n\nОпредели:\n1. Манипуляции ликвидностью (сборы над хаями/под лоями)\n2. PD Arrays (зоны Premium/Discount)\n3. Fair Value Gaps (FVG) для зон возврата\n4. Оптимальные точки входа после сбора ликвидности\n5. Ложные пробои и сценарии возврата\n6. Зоны институциональной ликвидности\n\nПиши естественно, без шаблонов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "price_action",
                "order": 6,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер акций. Эксперт по Price Action и анализу паттернов для фондовых рынков. Анализируешь свечные паттерны, графические формации и движения цены. Фокусируешься на паттернах: флаги, треугольники, голова-плечи, специфичные для акций формации. Учитываешь циклы отчётности и тренды секторов.",
                "user_prompt_template": "Проанализируй AAPL на H1 методом Price Action и анализа паттернов.\n\nДвижение цены (последние 50 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Формирующиеся графические паттерны (флаги, треугольники, голова-плечи, двойные вершины/основания и т.д.)\n2. Свечные паттерны (доджи, поглощение, пин-бары, молоты, падающие звёзды)\n3. Уровни поддержки и сопротивления из движения цены\n4. Сигналы завершения паттерна и точки входа\n5. Уровни стоп-лосса и цели на основе структуры паттерна\n6. Паттерны, связанные с отчётностью или ротацией секторов\n\nУкажи конкретные ценовые уровни для входов, стопов и целей. Если формируется фигура — обязательно скажи (\"рисует флаг\", \"похоже на формирующуюся ГИП\").",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "merge",
                "order": 7,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер и аналитик акций. Работаешь на синтезе Wyckoff + SMC + VSA/Delta + ICT + Price Action. Включаешь фундаментальный контекст (отчётность, тренды секторов, условия рынка). Твоя цель — дать готовую идею, в которую можно войти прямо сейчас. Пишешь естественно, как человек у терминала: без шаблонов, без \"умных\" фраз, только суть, наблюдения и конкретика.",
                "user_prompt_template": "Объедини результаты анализа AAPL на таймфрейме H1 в единый пост для Telegram.\n\nРезультаты анализа по методам:\n\n1️⃣ WYCKOFF:\n{wyckoff_output}\n\n2️⃣ SMC (Smart Money Concepts):\n{smc_output}\n\n3️⃣ VSA (Volume Spread Analysis):\n{vsa_output}\n\n4️⃣ DELTA:\n{delta_output}\n\n5️⃣ ICT:\n{ict_output}\n\n6️⃣ PRICE ACTION / PATTERNS:\n{price_action_output}\n\n---\n\nТеперь создай финальный пост в формате Telegram, следуя ТОЧНО этому шаблону:\n\n💎 АКЦИИ: AAPL\n📈 СЦЕНАРИЙ: [Бычий / Медвежий / Боковой]\n🎯 ВЕРОЯТНОСТЬ: [примерно XX %] — [ключевая причина]\n⚡️ УРОВЕНЬ: [зона / уровень] — [почему ключевая]\n📊 КОНТЕКСТ: [тренд сектора / отчётность / условие рынка]\n🚀 СДЕЛКА #1 (внутри дня): [вход | стоп | тейк]\n🧭 СДЕЛКА #2 (свинг 1-3 дня): [вход | стоп | тейк]\n⚠️ РИСК: [главный рыночный или фундаментальный фактор]\n#AAPL #[лонг] или #[шорт]\n\n💬 РАССУЖДЕНИЕ ТРЕЙДЕРА\n\nПиши естественно, с логикой живого анализа. Включай фундаментальный контекст, когда это уместно (отчётность, ротация секторов, условия рынка). Примеры стиля:\n\"AAPL держится выше 180 — видно институциональное накопление, ротация в техсектор. Я бы зашёл в лонг от 180.5 со стопом 178, цель — 185. Если пробьём 185, может продолжиться до 190.\"\n\n\"Формируется паттерн консолидации, ждём катализатора отчётности. Если пробьём выше 182 — вхожу в лонг, тейк 188, стоп 179. Пока консолидация, лучше брать только короткие движения.\"\n\nКлючевая идея — сделки, которые выполнимы, с ясным техническим и фундаментальным обоснованием.\n\nСДЕЛКА #1 (внутри дня) — возможность на сегодняшнюю сессию.\nСДЕЛКА #2 (свинг 1-3 дня) — сценарий, который может развиться в ближайшие дни.\n\nОбязательно указывай стоп и тейк, а также аргумент, почему вход оправдан именно сейчас (технический + фундаментальный контекст).\n\nЯзык: без англицизмов, без единиц измерения, без упоминания тикеров. Термины Wyckoff/SMC — в естественной форме (\"институциональное накопление\", \"ротация секторов\", \"катализатор отчётности\").\n\nСоздай финальный пост сейчас, используя результаты анализа выше.",
                "temperature": 0.7,
                "max_tokens": 4000
            }
        ],
        "estimated_cost": 0.21,
        "estimated_duration_seconds": 140
    }


def create_equity_analysis_process(db: Session):
    print("\nStep 1: Creating Yahoo Finance API tool...")
    admin_user = get_platform_admin_user(db)
    admin_org = get_or_create_admin_organization(db, admin_user)
    yahoo_finance_tool = create_yahoo_finance_tool(db, admin_user, admin_org)

    print("\nStep 2: Creating equity analysis process...")
    # Check if process already exists
    existing_process = db.query(AnalysisType).filter(AnalysisType.name == 'equity_analysis').first()

    config = get_equity_analysis_config(yahoo_finance_tool.id)

    if existing_process:
        print(f"⚠️  Process 'equity_analysis' already exists (ID: {existing_process.id})")
        print("   Updating existing process...")
        existing_process.config = config
        existing_process.display_name = "Анализ акций"
        existing_process.description = "Профессиональный анализ акций с использованием Wyckoff + SMC + VSA/Delta + ICT + Price Action. Фокус на высоковероятные сетапы по акциям с фундаментальным контекстом (отчётность, тренды секторов, условия рынка). Включает внутридневные и свинг-сетапы."
        existing_process.is_system = True
        existing_process.user_id = admin_user.id
        existing_process.organization_id = admin_org.id
        existing_process.is_active = 1
        flag_modified(existing_process, 'config')
        db.commit()
        db.refresh(existing_process)
        process = existing_process
        print(f"✅ Updated process: {process.display_name} (ID: {process.id})")
    else:
        process = AnalysisType(
            name="equity_analysis",
            display_name="Анализ акций",
            description="Профессиональный анализ акций с использованием Wyckoff + SMC + VSA/Delta + ICT + Price Action. Фокус на высоковероятные сетапы по акциям с фундаментальным контекстом (отчётность, тренды секторов, условия рынка). Включает внутридневные и свинг-сетапы.",
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
    print("=" * 60)
    print("Creating 'Анализ акций' (Equity Analysis) system process")
    print("=" * 60)
    print()

    db: Session = SessionLocal()
    try:
        process = create_equity_analysis_process(db)
        print("\n" + "=" * 60)
        print("✅ Success! Equity analysis process created.")
        print("=" * 60)
        print(f"Process ID: {process.id}")
        print(f"Name: {process.name}")
        print(f"Display Name: {process.display_name}")
        print(f"System Process: {process.is_system}")
        print(f"Active: {process.is_active}")
        print(f"Steps: {len(process.config['steps'])}")

        print("\nStep structure:")
        for i, step in enumerate(process.config.get('steps', []), 1):
            step_name = step.get('step_name')
            step_type = step.get('step_type')
            has_tools = 'tool_references' in step and len(step.get('tool_references', [])) > 0
            tool_info = f" (uses {step.get('tool_references', [])[0].get('variable_name')} tool)" if has_tools else ""
            print(f"  {i}. {step_name} ({step_type}){tool_info}")

    except Exception as e:
        print("\n" + "=" * 60)
        print("❌ Error during script execution:")
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

