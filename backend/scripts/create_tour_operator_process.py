#!/usr/bin/env python3
"""
Script to create a system analysis type: "Tour Operator - Cities Selection"
This is a 5-step process demonstrating all variable and prompt capabilities.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.analysis_type import AnalysisType
from datetime import datetime

def create_tour_operator_process(db: Session):
    """Create the Tour Operator Cities Selection system process."""
    
    # Check if it already exists
    existing = db.query(AnalysisType).filter(
        AnalysisType.name == "tour_operator_cities_selection",
        AnalysisType.is_system == True
    ).first()
    
    if existing:
        print(f"Process 'tour_operator_cities_selection' already exists (ID: {existing.id})")
        return existing
    
    # Calculate estimated cost (5 steps, ~0.01 per step)
    estimated_cost = 0.05
    estimated_duration = 300  # 5 minutes for 5 steps
    
    config = {
        "steps": [
            {
                "step_name": "generate_cities",
                "order": 1,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты помощник, который создает структурированные списки городов для туристических целей.",
                "user_prompt_template": "Создай список из 8 популярных туристических городов мира. Для каждого города укажи:\n1. Название города\n2. Страну\n3. Примерное население\n4. Основной туристический сезон\n\nФорматируй ответ как нумерованный список с четкой структурой.",
                "temperature": 0.7,
                "max_tokens": 600,
                "data_sources": []
            },
            {
                "step_name": "analyze_weather",
                "order": 2,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты эксперт по климатологии и туризму, специализирующийся на анализе погодных условий для путешествий.",
                "user_prompt_template": "Ниже представлен список городов из предыдущего шага:\n\n{generate_cities_output}\n\nДля каждого города из этого списка проанализируй:\n1. Климатические условия в текущий сезон\n2. Среднюю температуру и осадки\n3. Рекомендации по времени посещения (лучший месяц)\n4. Погодные риски для туристов\n\nФорматируй ответ так же, как исходный список (нумерованный список), сохраняя соответствие с городами.",
                "temperature": 0.6,
                "max_tokens": 1200,
                "data_sources": []
            },
            {
                "step_name": "evaluate_attractions",
                "order": 3,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты эксперт по туризму и достопримечательностям, специализирующийся на оценке туристической привлекательности городов.",
                "user_prompt_template": "На основе списка городов и их климатических характеристик, оцени туристические достопримечательности.\n\nСписок городов:\n{generate_cities_output}\n\nКлиматический анализ:\n{analyze_weather_output}\n\nДля каждого города определи:\n1. Топ-3 главные достопримечательности\n2. Уникальные особенности города (что делает его особенным)\n3. Рекомендуемая длительность визита (дни)\n4. Целевая аудитория (семьи, молодежь, пожилые, все)\n\nФорматируй ответ как структурированный список, сохраняя соответствие с городами из исходного списка.",
                "temperature": 0.7,
                "max_tokens": 1500,
                "data_sources": []
            },
            {
                "step_name": "calculate_costs",
                "order": 4,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты финансовый аналитик туристической индустрии, специализирующийся на оценке стоимости путешествий.",
                "user_prompt_template": "На основе всей собранной информации о городах, рассчитай примерную стоимость туристического пакета.\n\nИсходная информация о городах:\n{generate_cities_output}\n\nКлиматические данные:\n{analyze_weather_output}\n\nИнформация о достопримечательностях:\n{evaluate_attractions_output}\n\nДля каждого города рассчитай:\n1. Примерная стоимость проживания (средняя цена отеля 3-4 звезды за ночь)\n2. Стоимость питания (средний чек в ресторане)\n3. Стоимость транспорта (местный транспорт + такси)\n4. Общая стоимость визита на рекомендуемое количество дней\n5. Стоимость туристического пакета (проживание + питание + транспорт)\n\nФорматируй ответ как таблицу или структурированный список с четкими цифрами.",
                "temperature": 0.5,
                "max_tokens": 1800,
                "data_sources": []
            },
            {
                "step_name": "final_recommendation",
                "order": 5,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "Ты профессиональный туристический консультант, создающий комплексные рекомендации для туроператоров.",
                "user_prompt_template": "На основе полного анализа городов, создай финальную рекомендацию для туроператора.\n\nИсходный список городов:\n{generate_cities_output}\n\nКлиматический анализ:\n{analyze_weather_output}\n\nОценка достопримечательностей:\n{evaluate_attractions_output}\n\nФинансовый анализ:\n{calculate_costs_output}\n\nСоздай комплексную рекомендацию, которая включает:\n\n1. **ТОП-3 города для туристического пакета**\n   - Обоснование выбора каждого города\n   - Уникальное предложение для каждого\n\n2. **Рекомендуемая комбинация городов**\n   - Какой маршрут будет наиболее привлекательным\n   - Логистика перемещения между городами\n\n3. **Целевая аудитория и сезонность**\n   - Для кого подходит каждый город\n   - Лучшее время для посещения\n\n4. **Финансовое предложение**\n   - Примерная стоимость пакета\n   - Рекомендации по ценообразованию\n\n5. **Маркетинговые рекомендации**\n   - Как позиционировать каждый город\n   - Уникальные продающие точки\n\nФорматируй отчет профессионально, используй заголовки, списки и четкую структуру. Отчет должен быть готов для использования туроператором.",
                "temperature": 0.7,
                "max_tokens": 2500,
                "data_sources": []
            }
        ],
        "estimated_cost": estimated_cost,
        "estimated_duration_seconds": estimated_duration
    }
    
    analysis_type = AnalysisType(
        name="tour_operator_cities_selection",
        display_name="Подбор городов для туристического пакета",
        description="Комплексный анализ городов для туроператора: генерация списка, климатический анализ, оценка достопримечательностей, расчет стоимости и финальные рекомендации. Демонстрирует использование переменных из предыдущих шагов.",
        version="1.0.0",
        config=config,
        is_active=1,
        user_id=None,  # System process
        is_system=True,  # System process
        organization_id=None  # Available to all organizations
    )
    
    db.add(analysis_type)
    db.commit()
    db.refresh(analysis_type)
    
    print(f"✅ Created system process: '{analysis_type.display_name}' (ID: {analysis_type.id})")
    print(f"   Steps: {len(config['steps'])}")
    print(f"   Estimated cost: ${estimated_cost:.3f}")
    print(f"   Estimated duration: {estimated_duration}s")
    
    return analysis_type


if __name__ == "__main__":
    db = SessionLocal()
    try:
        create_tour_operator_process(db)
    finally:
        db.close()

