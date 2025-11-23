#!/usr/bin/env python3
"""
Script to create the complete "Подбор городов для туристического пакета" (Tour Operator Cities Selection) system process.

This script:
1. Creates the "Подбор городов для туристического пакета" process
2. This is a 5-step process demonstrating all variable and prompt capabilities
3. No tools needed - uses LLM only for analysis and recommendations

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


def get_tour_operator_config() -> dict:
    """Get tour operator cities selection process configuration (Russian version)."""
    return {
        "steps": [
            {
                "step_name": "generate_cities",
                "order": 1,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты помощник, который создает структурированные списки городов для туристических целей.",
                "user_prompt_template": "Создай список из 8 популярных туристических городов мира. Для каждого города укажи:\n1. Название города\n2. Страну\n3. Примерное население\n4. Основной туристический сезон\n\nФорматируй ответ как нумерованный список с четкой структурой.",
                "temperature": 0.7,
                "max_tokens": 600
            },
            {
                "step_name": "analyze_weather",
                "order": 2,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты эксперт по климатологии и туризму, специализирующийся на анализе погодных условий для путешествий.",
                "user_prompt_template": "Ниже представлен список городов из предыдущего шага:\n\n{generate_cities_output}\n\nДля каждого города из этого списка проанализируй:\n1. Климатические условия в текущий сезон\n2. Среднюю температуру и осадки\n3. Рекомендации по времени посещения (лучший месяц)\n4. Погодные риски для туристов\n\nФорматируй ответ так же, как исходный список (нумерованный список), сохраняя соответствие с городами.",
                "temperature": 0.6,
                "max_tokens": 1200
            },
            {
                "step_name": "evaluate_attractions",
                "order": 3,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты эксперт по туризму и достопримечательностям, специализирующийся на оценке туристической привлекательности городов.",
                "user_prompt_template": "На основе списка городов и их климатических характеристик, оцени туристические достопримечательности.\n\nСписок городов:\n{generate_cities_output}\n\nКлиматический анализ:\n{analyze_weather_output}\n\nДля каждого города определи:\n1. Топ-3 главные достопримечательности\n2. Уникальные особенности города (что делает его особенным)\n3. Рекомендуемая длительность визита (дни)\n4. Целевая аудитория (семьи, молодежь, пожилые, все)\n\nФорматируй ответ как структурированный список, сохраняя соответствие с городами из исходного списка.",
                "temperature": 0.7,
                "max_tokens": 1500
            },
            {
                "step_name": "calculate_costs",
                "order": 4,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты финансовый аналитик туристической индустрии, специализирующийся на оценке стоимости путешествий.",
                "user_prompt_template": "На основе всей собранной информации о городах, рассчитай примерную стоимость туристического пакета.\n\nИсходная информация о городах:\n{generate_cities_output}\n\nКлиматические данные:\n{analyze_weather_output}\n\nИнформация о достопримечательностях:\n{evaluate_attractions_output}\n\nДля каждого города рассчитай:\n1. Примерная стоимость проживания (средняя цена отеля 3-4 звезды за ночь)\n2. Стоимость питания (средний чек в ресторане)\n3. Стоимость транспорта (местный транспорт + такси)\n4. Общая стоимость визита на рекомендуемое количество дней\n5. Стоимость туристического пакета (проживание + питание + транспорт)\n\nФорматируй ответ как таблицу или структурированный список с четкими цифрами.",
                "temperature": 0.5,
                "max_tokens": 1800
            },
            {
                "step_name": "final_recommendation",
                "order": 5,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты профессиональный туристический консультант, создающий комплексные рекомендации для туроператоров.",
                "user_prompt_template": "На основе полного анализа городов, создай финальную рекомендацию для туроператора.\n\nИсходный список городов:\n{generate_cities_output}\n\nКлиматический анализ:\n{analyze_weather_output}\n\nОценка достопримечательностей:\n{evaluate_attractions_output}\n\nФинансовый анализ:\n{calculate_costs_output}\n\nСоздай комплексную рекомендацию, которая включает:\n\n1. **ТОП-3 города для туристического пакета**\n   - Обоснование выбора каждого города\n   - Уникальное предложение для каждого\n\n2. **Рекомендуемая комбинация городов**\n   - Какой маршрут будет наиболее привлекательным\n   - Логистика перемещения между городами\n\n3. **Целевая аудитория и сезонность**\n   - Для кого подходит каждый город\n   - Лучшее время для посещения\n\n4. **Финансовое предложение**\n   - Примерная стоимость пакета\n   - Рекомендации по ценообразованию\n\n5. **Маркетинговые рекомендации**\n   - Как позиционировать каждый город\n   - Уникальные продающие точки\n\nФорматируй отчет профессионально, используй заголовки, списки и четкую структуру. Отчет должен быть готов для использования туроператором.",
                "temperature": 0.7,
                "max_tokens": 2500
            }
        ],
        "estimated_cost": 0.05,
        "estimated_duration_seconds": 300
    }


def create_tour_operator_process(db: Session):
    print("\nStep 1: Creating tour operator cities selection process...")
    admin_user = get_platform_admin_user(db)
    admin_org = get_or_create_admin_organization(db, admin_user)

    # Check if process already exists
    existing_process = db.query(AnalysisType).filter(AnalysisType.name == 'tour_operator_cities_selection').first()

    config = get_tour_operator_config()

    if existing_process:
        print(f"⚠️  Process 'tour_operator_cities_selection' already exists (ID: {existing_process.id})")
        print("   Updating existing process...")
        existing_process.config = config
        existing_process.display_name = "Подбор городов для туристического пакета"
        existing_process.description = "Комплексный анализ городов для туроператора: генерация списка, климатический анализ, оценка достопримечательностей, расчет стоимости и финальные рекомендации. Демонстрирует использование переменных из предыдущих шагов."
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
            name="tour_operator_cities_selection",
            display_name="Подбор городов для туристического пакета",
            description="Комплексный анализ городов для туроператора: генерация списка, климатический анализ, оценка достопримечательностей, расчет стоимости и финальные рекомендации. Демонстрирует использование переменных из предыдущих шагов.",
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
    print("Creating 'Подбор городов для туристического пакета' (Tour Operator Cities Selection) system process")
    print("=" * 60)
    print()

    db: Session = SessionLocal()
    try:
        process = create_tour_operator_process(db)
        print("\n" + "=" * 60)
        print("✅ Success! Tour operator cities selection process created.")
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
            print(f"  {i}. {step_name} ({step_type})")

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

