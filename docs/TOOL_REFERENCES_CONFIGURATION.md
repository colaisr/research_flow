# Расширенная конфигурация Tool References

## Обзор

Когда инструмент используется в промпте шага, система должна извлечь параметры для выполнения инструмента. Существует три метода извлечения параметров, каждый подходит для разных сценариев.

## План реализации

**Будущая реализация (AI-based):**
- ✅ AI extraction для всех типов инструментов
- ✅ Использование того же model, что в step
- ✅ Кэширование результатов extraction
- ✅ Guardrails и валидация через AI
- ✅ Прозрачность для пользователя (нет конфигурации)

**Текущая реализация (regex-based):**
- ⚠️ Используется regex для извлечения параметров
- ⚠️ Ограниченная поддержка сложных случаев
- ⚠️ Требует конфигурацию `extraction_method` и `extraction_config`

**Миграция:** См. раздел "Миграция" в `docs/AI_TOOL_EXTRACTION_ARCHITECTURE.md`

---

## AI-Based Extraction (План реализации)

### Как работает

Система использует **AI/LLM для извлечения параметров** из промпта. Для каждого tool reference выполняется AI pre-step, который:
1. Анализирует контекст вокруг tool reference
2. Извлекает параметры через LLM (используя тот же model, что в step)
3. Для Database tools: конвертирует вопрос в SQL
4. Валидирует параметры (guardrails)
5. Кэширует результат для оптимизации

**Детали:** См. `docs/AI_TOOL_EXTRACTION_ARCHITECTURE.md` для полного описания архитектуры.

**Пример использования:**

```
Промпт: "Получи данные о цене для BTC/USDT на таймфрейме H1 используя {binance_api}"

Извлечение:
- Находит {binance_api} в тексте
- Анализирует 200 символов до и после (context_window)
- Извлекает: instrument="BTC/USDT", timeframe="H1"
- Выполняет: binance_api.fetch_ohlcv("BTC/USDT", "H1")
```

**Конфигурация:**
```json
{
  "tool_references": [
    {
      "tool_id": 1,
      "variable_name": "binance_api",
      "extraction_method": "natural_language",
      "extraction_config": {
        "context_window": 200  // Символов до/после ссылки для анализа
      }
    }
  ]
}
```

**Когда использовать:**
- ✅ Когда параметры явно указаны в тексте промпта
- ✅ Для простых случаев (API tools с instrument/timeframe)
- ✅ Когда пользователь пишет естественным языком

**Ограничения:**
- ⚠️ Может неправильно извлечь параметры из сложных предложений
- ⚠️ Зависит от качества текста вокруг ссылки
- ⚠️ Не подходит для сложных SQL запросов или специфичных API endpoints

---

### 2. Explicit (Явный) ❌ **НЕ РЕАЛИЗОВАНО**

**Как работает:**
Параметры указываются явно в синтаксисе ссылки на инструмент.

**Пример использования:**

```
Промпт: "Получи данные используя {binance_api(instrument="BTC/USDT", timeframe="H1")}"

Извлечение:
- Парсит синтаксис {tool_name(param1="value1", param2="value2")}
- Извлекает: instrument="BTC/USDT", timeframe="H1"
- Выполняет: binance_api.fetch_ohlcv("BTC/USDT", "H1")
```

**Конфигурация:**
```json
{
  "tool_references": [
    {
      "tool_id": 1,
      "variable_name": "binance_api",
      "extraction_method": "explicit",
      "extraction_config": {}  // Не требуется, параметры в синтаксисе
    }
  ]
}
```

**Когда использовать:**
- ✅ Когда нужна точность и контроль над параметрами
- ✅ Для сложных API вызовов с множеством параметров
- ✅ Когда параметры не очевидны из контекста
- ✅ Для отладки и тестирования

**Примеры:**

```
// Простой случай
{binance_api(instrument="BTC/USDT", timeframe="H1")}

// Сложный API вызов
{crm_api(endpoint="/api/orders", method="POST", body={"customer_id": 123, "date": "2025-01-21"})}

// Database с параметрами
{orders_db(query="SELECT * FROM orders WHERE customer_id = {customer_id} AND date >= {start_date}")}
```

**Преимущества:**
- ✅ Точность - параметры указаны явно
- ✅ Гибкость - можно передать любые параметры
- ✅ Понятность - видно, что именно передается

**Недостатки:**
- ❌ Менее удобно для пользователей (нужно знать синтаксис)
- ❌ Усложняет промпт (больше технических деталей)

---

### 3. Template (Шаблон) ❌ **НЕ БУДЕТ РЕАЛИЗОВАНО**

**Как работает:**
Используется предопределенный шаблон запроса с переменными, которые заменяются значениями из step_context или промпта.

**Пример использования:**

**Database Tool:**
```
Промпт: "Проверь заказы используя {orders_db} для клиента {customer_id}"

Конфигурация:
{
  "tool_references": [
    {
      "tool_id": 5,
      "variable_name": "orders_db",
      "extraction_method": "template",
      "extraction_config": {
        "query_template": "SELECT * FROM orders WHERE customer_id = {customer_id} AND date >= {start_date}"
      }
    }
  ]
}

Извлечение:
- Находит {orders_db} в промпте
- Использует query_template из extraction_config
- Заменяет {customer_id} на значение из step_context или промпта
- Заменяет {start_date} на значение из step_context
- Выполняет: orders_db.execute("SELECT * FROM orders WHERE customer_id = 123 AND date >= '2025-01-01'")
```

**API Tool:**
```
Промпт: "Получи заказы через {crm_api} для клиента {customer_id}"

Конфигурация:
{
  "tool_references": [
    {
      "tool_id": 3,
      "variable_name": "crm_api",
      "extraction_method": "template",
      "extraction_config": {
        "endpoint_template": "/api/orders?customer_id={customer_id}&date={date}",
        "method": "GET"
      }
    }
  ]
}

Извлечение:
- Находит {crm_api} в промпте
- Использует endpoint_template
- Заменяет {customer_id} и {date} на значения из step_context
- Выполняет: GET /api/orders?customer_id=123&date=2025-01-21
```

**Когда использовать:**
- ✅ Когда нужна структурированность и повторяемость
- ✅ Для сложных SQL запросов с множеством условий
- ✅ Когда структура запроса известна заранее
- ✅ Для API endpoints с фиксированной структурой

**Преимущества:**
- ✅ Структурированность - шаблон определен заранее
- ✅ Безопасность - можно валидировать шаблон
- ✅ Повторяемость - один шаблон для разных значений

**Недостатки:**
- ❌ Менее гибко - нужно заранее определить шаблон
- ❌ Требует настройки для каждого инструмента

---

## Сравнение методов

| Метод | Точность | Удобство | Гибкость | Сложность настройки |
|-------|----------|----------|----------|---------------------|
| **Natural Language** | Средняя | Высокая | Средняя | Низкая (автоматически) |
| **Explicit** | Высокая | Средняя | Высокая | Низкая (в синтаксисе) |
| **Template** | Высокая | Средняя | Средняя | Высокая (нужна настройка) |

---

## Примеры использования по типам инструментов

### API Tools

**Natural Language (текущая реализация):**
```
Промпт: "Получи данные для BTC/USDT на H1 используя {binance_api}"
→ Извлекает: instrument="BTC/USDT", timeframe="H1"
```

**Explicit (будущая реализация):**
```
Промпт: "Получи данные используя {binance_api(instrument="BTC/USDT", timeframe="H1")}"
→ Парсит параметры из синтаксиса
```

**Template (будущая реализация):**
```
Промпт: "Получи данные используя {binance_api} для {instrument}"
Конфигурация: {
  "endpoint_template": "/api/v3/klines?symbol={instrument}&interval={timeframe}"
}
→ Заменяет переменные в шаблоне
```

### Database Tools

**Natural Language:**
```
Промпт: "Проверь заказы: SELECT * FROM orders WHERE customer_id = 123"
→ Извлекает SQL запрос из текста
```

**Explicit:**
```
Промпт: "Проверь заказы: {orders_db(query="SELECT * FROM orders WHERE customer_id = 123")}"
→ Парсит SQL из синтаксиса
```

**Template (частично реализовано):**
```
Промпт: "Проверь заказы для клиента {customer_id} используя {orders_db}"
Конфигурация: {
  "query_template": "SELECT * FROM orders WHERE customer_id = {customer_id} AND date >= {start_date}"
}
→ Заменяет переменные в SQL шаблоне
```

### RAG Tools

**Natural Language:**
```
Промпт: "Найди информацию о транзакциях 21/5/2025 используя {rag_bank_reports}"
→ Извлекает вопрос из текста вокруг {rag_bank_reports}
```

**Explicit:**
```
Промпт: "Найди информацию используя {rag_bank_reports(query="транзакции 21/5/2025 от Tom Jankins")}"
→ Парсит query из синтаксиса
```

**Template:**
```
Промпт: "Найди информацию о {topic} используя {rag_bank_reports}"
Конфигурация: {
  "query_template": "транзакции за {date} от {customer_name}"
}
→ Заменяет переменные в query шаблоне
```

---

## UI для расширенной конфигурации

### Текущая реализация (упрощенная)

**Что есть:**
- Variable Palette показывает все инструменты
- Клик по инструменту автоматически добавляет его в `tool_references`
- Используется `natural_language` по умолчанию
- `context_window=200` по умолчанию

**Что отсутствует:**
- Выбор extraction method
- Настройка extraction_config через UI
- Просмотр текущей конфигурации tool references

### Предлагаемый UI

**В Step Configuration Panel:**

```
┌─────────────────────────────────────────────────┐
│ Используемые инструменты                        │
├─────────────────────────────────────────────────┤
│                                                   │
│ [✓] Binance API                                  │
│     Переменная: {binance_api}                    │
│     Метод извлечения: [Natural Language ▼]      │
│     Контекстное окно: [200] символов            │
│                                                   │
│ [✓] Orders Database                              │
│     Переменная: {orders_db}                      │
│     Метод извлечения: [Template ▼]              │
│     SQL шаблон:                                   │
│     ┌─────────────────────────────────────────┐ │
│     │ SELECT * FROM orders                    │ │
│     │ WHERE customer_id = {customer_id}       │ │
│     │ AND date >= {start_date}                │ │
│     └─────────────────────────────────────────┘ │
│                                                   │
│ [+ Добавить инструмент]                          │
└─────────────────────────────────────────────────┘
```

**Выбор extraction method:**

1. **Natural Language** (по умолчанию):
   - Настройка: `context_window` (200 символов)
   - Подходит для: простых случаев, когда параметры в тексте

2. **Explicit**:
   - Настройка: не требуется
   - Подсказка: "Используйте синтаксис {tool_name(param="value")} в промпте"
   - Подходит для: точного контроля параметров

3. **Template**:
   - Настройка: `query_template` или `endpoint_template`
   - Подсказка: "Используйте переменные {variable_name} в шаблоне"
   - Подходит для: структурированных запросов

---

## Когда использовать каждый метод

### Natural Language - используйте когда:
- ✅ Параметры очевидны из контекста промпта
- ✅ Пользователь пишет естественным языком
- ✅ Простые случаи (API с instrument/timeframe)
- ✅ Нужна простота использования

**Пример:**
```
"Получи данные для BTC/USDT на H1 используя {binance_api}"
```

### Explicit - используйте когда:
- ✅ Нужна точность и контроль
- ✅ Сложные API вызовы с множеством параметров
- ✅ Параметры не очевидны из контекста
- ✅ Отладка и тестирование

**Пример:**
```
"Получи данные используя {binance_api(instrument="BTC/USDT", timeframe="H1", limit=100)}"
```

### Template - используйте когда:
- ✅ Структура запроса известна заранее
- ✅ Сложные SQL запросы с условиями
- ✅ Повторяющиеся паттерны запросов
- ✅ Нужна валидация структуры запроса

**Пример:**
```
Промпт: "Проверь заказы для {customer_id} используя {orders_db}"
Template: "SELECT * FROM orders WHERE customer_id = {customer_id} AND status = 'active'"
```

---

## Реализация в коде

### Backend

**Текущая поддержка:**
- `extraction_method` читается из `tool_references` (по умолчанию `natural_language`)
- `extraction_config` поддерживает `context_window` и `query_template`
- `_extract_database_params` уже использует `query_template` если указан

**Что нужно добавить:**
- Парсинг explicit синтаксиса: `{tool_name(param1="value1")}`
- Поддержка `endpoint_template` для API tools
- Поддержка `query_template` для RAG tools
- Валидация шаблонов

### Frontend

**Что нужно добавить:**
- UI для выбора extraction method (dropdown)
- UI для настройки extraction_config:
  - Input для `context_window` (number)
  - Textarea для `query_template` (для Database/RAG)
  - Input для `endpoint_template` (для API)
- Просмотр текущих tool_references в step config
- Валидация шаблонов (проверка переменных)

---

## Примеры конфигураций

### Пример 1: API Tool с Natural Language

```json
{
  "tool_references": [
    {
      "tool_id": 1,
      "variable_name": "binance_api",
      "extraction_method": "natural_language",
      "extraction_config": {
        "context_window": 200
      }
    }
  ]
}
```

**Промпт:**
```
"Получи данные для BTC/USDT на H1 используя {binance_api}"
```

**Результат:**
- Извлекает: `instrument="BTC/USDT"`, `timeframe="H1"`
- Выполняет: `binance_api.fetch_ohlcv("BTC/USDT", "H1")`

---

### Пример 2: Database Tool с Template

```json
{
  "tool_references": [
    {
      "tool_id": 5,
      "variable_name": "orders_db",
      "extraction_method": "template",
      "extraction_config": {
        "query_template": "SELECT * FROM orders WHERE customer_id = {customer_id} AND date >= {start_date} ORDER BY date DESC LIMIT 100"
      }
    }
  ]
}
```

**Промпт:**
```
"Проверь заказы для клиента {customer_id} используя {orders_db}"
```

**Step Context:**
```json
{
  "customer_id": 123,
  "start_date": "2025-01-01"
}
```

**Результат:**
- Заменяет переменные: `{customer_id}` → `123`, `{start_date}` → `"2025-01-01"`
- Выполняет: `SELECT * FROM orders WHERE customer_id = 123 AND date >= '2025-01-01' ORDER BY date DESC LIMIT 100`

---

### Пример 3: API Tool с Explicit (будущая реализация)

```json
{
  "tool_references": [
    {
      "tool_id": 3,
      "variable_name": "crm_api",
      "extraction_method": "explicit",
      "extraction_config": {}
    }
  ]
}
```

**Промпт:**
```
"Получи заказы используя {crm_api(endpoint="/api/orders", method="POST", body={"customer_id": 123, "date": "2025-01-21"})}"
```

**Результат:**
- Парсит параметры из синтаксиса
- Выполняет: `POST /api/orders` с body `{"customer_id": 123, "date": "2025-01-21"}`

---

### Пример 4: RAG Tool с Template (будущая реализация)

```json
{
  "tool_references": [
    {
      "tool_id": 7,
      "variable_name": "rag_bank_reports",
      "extraction_method": "template",
      "extraction_config": {
        "query_template": "транзакции за {date} от клиента {customer_name}, сумма больше {min_amount}"
      }
    }
  ]
}
```

**Промпт:**
```
"Найди информацию используя {rag_bank_reports} для {customer_name}"
```

**Step Context:**
```json
{
  "customer_name": "Tom Jankins",
  "date": "21/5/2025",
  "min_amount": 1000
}
```

**Результат:**
- Заменяет переменные в query template
- Выполняет RAG query: "транзакции за 21/5/2025 от клиента Tom Jankins, сумма больше 1000"

---

## Резюме

**Расширенная конфигурация tool references** позволяет пользователям выбирать, как система будет извлекать параметры для выполнения инструментов:

1. **Natural Language** - автоматическое извлечение (удобно, но менее точно)
2. **Explicit** - явное указание параметров в синтаксисе (точно, но требует знания синтаксиса)
3. **Template** - использование шаблонов с переменными (структурировано, но требует настройки)

**Текущий статус:**
- ✅ Natural Language полностью реализован
- ✅ Template частично реализован (для Database tools)
- ❌ Explicit не реализован
- ❌ UI для выбора метода не реализован

**Когда это будет полезно:**
- Для сложных случаев, когда natural language не справляется
- Для структурированных запросов (SQL, API endpoints)
- Для точного контроля над параметрами инструментов
- Для повторяющихся паттернов использования инструментов

