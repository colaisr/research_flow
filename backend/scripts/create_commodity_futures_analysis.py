#!/usr/bin/env python3
"""
Script to create the complete "Анализ товарных фьючерсов" (Commodity Futures Analysis) system process.

This script:
1. Creates Tinkoff Invest API tool for platform admin (if not exists)
2. Creates the "Анализ товарных фьючерсов" process with fetch_market_data step
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

# Tinkoff API token (from migration)
TINKOFF_API_TOKEN = "t.kNu8LX8-p9SIAbeOyH8TdqQOhrgtp4_7Nt0aOPOAQJ6t4UKr5faObQdv64Zi8ph99WIiiCDmdAaIX0s9F6e1AA"


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


def create_tinkoff_tool(db: Session, admin_user: User, admin_org: Organization) -> UserTool:
    """Create Tinkoff Invest API tool for platform admin."""
    
    # Check if tool already exists
    existing = db.query(UserTool).filter(
        UserTool.user_id == admin_user.id,
        UserTool.display_name == "Tinkoff Invest API",
        UserTool.tool_type == ToolType.API.value
    ).first()
    
    if existing:
        print(f"✅ Tinkoff Invest API tool already exists (ID: {existing.id})")
        return existing
    
    # Tinkoff Invest API tool configuration
    config = {
        "connector_type": "predefined",
        "connector_name": "tinkoff",
        "base_url": "https://invest-public-api.tinkoff.ru",
        "auth_type": "bearer",
        "adapter_config": {
            "adapter_type": "tinkoff"
        },
        "api_token": TINKOFF_API_TOKEN  # Store token in config (will be encrypted)
    }
    
    # Encrypt config (including api_token)
    encrypted_config = encrypt_tool_config(config)
    
    # Create tool
    tool = UserTool(
        user_id=admin_user.id,
        organization_id=admin_org.id,
        tool_type=ToolType.API.value,
        display_name="Tinkoff Invest API",
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
    
    print(f"✅ Created Tinkoff Invest API tool (ID: {tool.id})")
    print(f"   Access entries created for {len(admin_orgs)} organization(s)")
    
    return tool


def get_commodity_futures_config(tinkoff_tool_id: int) -> dict:
    """Get commodity futures analysis process configuration (Russian version) with tool references."""
    return {
        "steps": [
            {
                "step_name": "fetch_market_data",
                "order": 0,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — помощник для получения данных рынка. Твоя задача — получить данные через API и вернуть ТОЛЬКО данные в указанном формате, БЕЗ дополнительных комментариев, объяснений или форматирования.",
                "user_prompt_template": "Получи данные о цене для NG1! на таймфрейме H1 используя {tinkoff_invest_api}. Верни ТОЛЬКО данные в формате (без дополнительного текста, без объяснений):\n\n- Timestamp: O=open H=high L=low C=close V=volume\n\nдля последних 50 свечей, отсортированных по времени (от старых к новым). Начинай сразу с первой строки данных.",
                "temperature": 0.3,
                "max_tokens": 2000,
                "tool_references": [
                    {
                        "tool_id": tinkoff_tool_id,
                        "variable_name": "tinkoff_invest_api",
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
                "system_prompt": "Ты — профессиональный трейдер и аналитик товарных фьючерсов. Эксперт по методу Wyckoff. Анализируешь фазы накопления, распределения, роста и падения. Пишешь естественно, как человек у терминала: без шаблонов, только суть и конкретика.",
                "user_prompt_template": "Проанализируй NG1! на таймфрейме H1 методом Wyckoff.\n\nДанные по цене (последние 20 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Текущую фазу Wyckoff (Накопление/Распределение/Рост/Падение)\n2. Контекст рынка и позицию в цикле\n3. Вероятный сценарий (продолжение или разворот)\n4. Ключевые уровни для наблюдения\n\nПиши естественно, без шаблонов. Если видишь расхождения с базовым активом (спот) — коротко объясни причину.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "smc",
                "order": 2,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по Smart Money Concepts (SMC). Анализируешь структуру рынка, BOS, CHoCH, Order Blocks, FVG, зоны ликвидности. Пишешь естественно, как человек у терминала.",
                "user_prompt_template": "Проанализируй NG1! на H1 методом Smart Money Concepts.\n\nСтруктура цены (последние 50 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. BOS (Break of Structure) и CHoCH точки\n2. Order Blocks (OB) — зоны спроса/предложения\n3. Fair Value Gaps (FVG) — зоны дисбаланса\n4. Зоны ликвидности — где вероятны стопы\n5. Ключевые уровни для потенциальных возвратов\n\nУкажи конкретные ценовые уровни. Пиши естественно, без англицизмов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "vsa",
                "order": 3,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по Volume Spread Analysis (VSA). Анализируешь объём, спред и движение цены для выявления активности крупных участников. Ищешь сигналы: no demand, no supply, stopping volume, climactic action, effort vs result.",
                "user_prompt_template": "Проанализируй NG1! на H1 методом Volume Spread Analysis.\n\nДанные OHLCV (последние 30 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Активность крупных участников (анализ объёма)\n2. Сигналы no demand / no supply\n3. Stopping volume (поглощение)\n4. Climactic action (истощение)\n5. Effort vs result (объём vs движение цены)\n6. Зоны, где усилие без результата говорит о развороте\n\nПиши естественно, без шаблонов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "delta",
                "order": 4,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по Delta-анализу. Анализируешь давление покупок vs продаж для выявления доминации, аномальной дельты, абсорбции, дивергенций, где крупные игроки удерживают позиции или поглощают агрессию.",
                "user_prompt_template": "Проанализируй NG1! на H1 принципами Delta-анализа.\n\nПримечание: Полная дельта требует данных order flow. Анализируй давление покупок/продаж из объёма и движения цены.\n\nДанные по цене и объёму (последние 30 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Доминация покупок vs продаж\n2. Аномальные паттерны дельты\n3. Зоны абсорбции (объём без движения цены)\n4. Дивергенции (цена vs объём/сила)\n5. Где крупные игроки удерживают или поглощают\n\nПиши естественно, без англицизмов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "ict",
                "order": 5,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по методологии ICT (Inner Circle Trader). Анализируешь манипуляции ликвидностью, PD Arrays (Premium/Discount), Fair Value Gaps, оптимальные точки входа после сборов ликвидности.",
                "user_prompt_template": "Проанализируй NG1! на H1 методологией ICT.\n\nДвижение цены (последние 50 свечей):\n{fetch_market_data_output}\n\nКонтекст предыдущего анализа:\n- Фаза Wyckoff: {wyckoff_output}\n- Структура SMC: {smc_output}\n\nОпредели:\n1. Манипуляции ликвидностью (сборы над хаями/под лоями)\n2. PD Arrays (зоны Premium/Discount)\n3. Fair Value Gaps (FVG) для зон возврата\n4. Оптимальные точки входа после сбора ликвидности\n5. Ложные пробои и сценарии возврата\n\nПиши естественно, без шаблонов.",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "price_action",
                "order": 6,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер товарных фьючерсов. Эксперт по Price Action и анализу паттернов. Анализируешь свечные паттерны, графические формации и движения цены для выявления торговых возможностей. Фокусируешься на паттернах: флаги, треугольники, голова-плечи, свечные формации. Даёшь конкретные уровни входа, стопа и цели на основе завершения паттерна.",
                "user_prompt_template": "Проанализируй NG1! на H1 методом Price Action и анализа паттернов.\n\nДвижение цены (последние 50 свечей):\n{fetch_market_data_output}\n\nОпредели:\n1. Формирующиеся графические паттерны (флаги, треугольники, голова-плечи, двойные вершины/основания и т.д.)\n2. Свечные паттерны (доджи, поглощение, пин-бары, молоты, падающие звёзды)\n3. Уровни поддержки и сопротивления из движения цены\n4. Сигналы завершения паттерна и точки входа\n5. Уровни стоп-лосса и цели на основе структуры паттерна\n\nУкажи конкретные ценовые уровни для входов, стопов и целей. Если формируется фигура — обязательно скажи (\"рисует флаг\", \"похоже на формирующуюся ГИП\").",
                "temperature": 0.7,
                "max_tokens": 2000
            },
            {
                "step_name": "merge",
                "order": 7,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты — профессиональный трейдер и аналитик товарных фьючерсов. Работаешь на синтезе Wyckoff + SMC + VSA/Delta + ICT + Price Action + Pattern Analysis. Твоя цель — дать готовую идею, в которую можно войти прямо сейчас, и краткосрочную стратегию на ближайшие сутки. Пишешь естественно, как человек у терминала: без шаблонов, без \"умных\" фраз, только суть, наблюдения и конкретика. Всегда используй актуальные котировки. Все уровни и расчёты — в ценах МОЕХ. Если есть расхождения между базой (спот) и нашим активом — коротко объясни (\"арбитражная дельта\", \"курс рубля\", \"задержка\").",
                "user_prompt_template": "Объедини результаты анализа NG1! на таймфрейме H1 в единый пост для Telegram.\n\nРезультаты анализа по методам:\n\n1️⃣ WYCKOFF:\n{wyckoff_output}\n\n2️⃣ SMC (Smart Money Concepts):\n{smc_output}\n\n3️⃣ VSA (Volume Spread Analysis):\n{vsa_output}\n\n4️⃣ DELTA:\n{delta_output}\n\n5️⃣ ICT:\n{ict_output}\n\n6️⃣ PRICE ACTION / PATTERNS:\n{price_action_output}\n\n---\n\nТеперь создай финальный пост в формате Telegram, следуя ТОЧНО этому шаблону:\n\n💎 СИТУАЦИЯ: NG1!\n📈 СЦЕНАРИЙ: [Бычий / Медвежий / Боковой]\n🎯 ВЕРОЯТНОСТЬ: [примерно XX %] — [ключевая причина]\n⚡️ УРОВЕНЬ: [зона / уровень] — [почему ключевая]\n🚀 СДЕЛКА #1 (прямо сейчас): [вход | стоп | тейк]\n🧭 СДЕЛКА #2 (сегодня-завтра): [вход | стоп | тейк]\n⚠️ РИСК: [главный рыночный или фундаментальный фактор]\n#NG1! #[лонг] или #[шорт]\n\n💬 РАССУЖДЕНИЕ ТРЕЙДЕРА\n\nПиши естественно, с логикой живого анализа. Примеры стиля:\n\"Газ держится под уровнем 4.45 — сверху плотный объём, снизу собирают ликвидность. Сейчас я бы зашёл в шорт от 4.44 со стопом 4.48, цель — 4.36. Если к вечеру удержат зону 4.35 и появится реакция — можно развернуться в лонг до 4.50.\"\n\n\"Рисуется флаг вверх, но пока нет пробоя. Если закрепятся выше 4.52 — вхожу в лонг, тейк 4.68, стоп 4.47. Пока держимся в диапазоне, лучше брать только короткие движения.\"\n\nКлючевая идея — сделка, которая \"живая\" и выполнима прямо сейчас, без ожидания часами.\n\nСДЕЛКА #1 (прямо сейчас) — короткая возможность, рассчитанная на движение ближайшие 2–6 часов, без долгого ожидания.\nСДЕЛКА #2 (сегодня–завтра) — сценарий, который может развиться в течение суток, с возможностью переноса через ночь.\n\nОбязательно указывай стоп и тейк, а также аргумент, почему вход оправдан именно сейчас.\n\nЯзык: без англицизмов, без единиц измерения, без упоминания тикеров. Термины Wyckoff/SMC — в естественной форме (\"над 4.50 висят стопы покупателей\", \"идёт сбор ликвидности\").\n\nСоздай финальный пост сейчас, используя результаты анализа выше.",
                "temperature": 0.7,
                "max_tokens": 4000
            }
        ],
        "estimated_cost": 0.21,
        "estimated_duration_seconds": 140
    }


def create_commodity_futures_process(db: Session):
    print("\nStep 1: Creating Tinkoff Invest API tool...")
    admin_user = get_platform_admin_user(db)
    admin_org = get_or_create_admin_organization(db, admin_user)
    tinkoff_tool = create_tinkoff_tool(db, admin_user, admin_org)

    print("\nStep 2: Creating commodity futures analysis process...")
    # Check if process already exists
    existing_process = db.query(AnalysisType).filter(AnalysisType.name == 'commodity_futures').first()

    config = get_commodity_futures_config(tinkoff_tool.id)

    if existing_process:
        print(f"⚠️  Process 'commodity_futures' already exists (ID: {existing_process.id})")
        print("   Updating existing process...")
        existing_process.config = config
        existing_process.display_name = "Анализ товарных фьючерсов"
        existing_process.description = "Профессиональный анализ товарных фьючерсов МОЕХ с синтезом Wyckoff + SMC + VSA/Delta + ICT + Price Action. Фокус на живые точки входа прямо сейчас и краткосрочную стратегию на ближайшие сутки. Формат: две конкретные сделки с уровнями входа, стопа и тейка."
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
            name="commodity_futures",
            display_name="Анализ товарных фьючерсов",
            description="Профессиональный анализ товарных фьючерсов МОЕХ с синтезом Wyckoff + SMC + VSA/Delta + ICT + Price Action. Фокус на живые точки входа прямо сейчас и краткосрочную стратегию на ближайшие сутки. Формат: две конкретные сделки с уровнями входа, стопа и тейка.",
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
    print("Creating 'Анализ товарных фьючерсов' (Commodity Futures Analysis) system process")
    print("=" * 60)
    print()

    db: Session = SessionLocal()
    try:
        process = create_commodity_futures_process(db)
        print("\n" + "=" * 60)
        print("✅ Success! Commodity futures analysis process created.")
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

