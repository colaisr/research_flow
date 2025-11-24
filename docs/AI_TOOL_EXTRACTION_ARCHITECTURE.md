# AI-Based Tool Parameter Extraction Architecture

## Обзор

Система использует **AI/LLM для извлечения параметров инструментов** из промптов. Это обеспечивает:
- ✅ Понимание контекста и естественного языка
- ✅ Конвертацию вопросов в SQL для Database tools
- ✅ Guardrails и валидацию параметров
- ✅ Единый подход для всех типов инструментов
- ✅ Прозрачность для пользователя (без конфигурации)

---

## Архитектура

### Flow выполнения шага с tool references

```
1. Пользователь создает промпт: "Найди заказы для клиента {customer_id} используя {orders_db}"

2. Система находит tool references: {orders_db}

3. Для каждого tool reference:
   a. Извлекает контекст вокруг tool reference (context_window символов)
   b. Выполняет AI pre-step для извлечения параметров:
      - Использует ТОТ ЖЕ model, что выбран в step
      - AI анализирует контекст и извлекает параметры
      - Для DB tools: конвертирует вопрос в SQL
      - Валидирует параметры (guardrails)
   c. Кэширует результат извлечения (если возможно)
   d. Выполняет tool с извлеченными параметрами
   e. Заменяет {tool_name} на результат выполнения

4. Выполняет основной LLM call с обновленным промптом
```

---

## Ключевые принципы

### 1. Использование того же model, что в step

**Причина:**
- Монолитность системы - один model для всего step
- В будущем может быть локальный LLM (недоступен внешний)
- Если использовать model из step - он всегда доступен
- Консистентность результатов

**Реализация:**
```python
# В step config есть model: "openai/gpt-4o"
# AI pre-step использует тот же model для извлечения параметров
extraction_model = step_config.get("model")  # "openai/gpt-4o"
```

### 2. Прозрачность для пользователя

**Нет конфигурации:**
- ❌ Нет `extraction_method` (natural_language/explicit/template)
- ❌ Нет `extraction_config` (query_template, context_window)
- ✅ Все работает автоматически через AI

**Пользователь просто:**
- Пишет промпт естественным языком
- Использует `{tool_name}` в промпте
- Система автоматически извлекает параметры через AI

### 3. Кэширование для оптимизации

**Стратегия кэширования:**
- Кэшировать результаты AI extraction по ключу:
  - `tool_id` + `context_text_hash` + `step_context_hash`
- TTL: 1 час (или настройка)
- Экономит LLM calls при повторных использованиях

**Пример:**
```
Промпт: "Найди заказы для клиента 123 используя {orders_db}"
→ AI извлекает: {"query": "SELECT * FROM orders WHERE customer_id = 123"}
→ Кэшируется по ключу: orders_db + context_hash + step_context_hash

Если тот же промпт используется снова → берется из кэша
```

---

## AI Pre-Step Implementation

### Промпт для AI extraction

**System Prompt:**
```
You are a tool parameter extraction assistant. Your task is to extract parameters needed to execute a tool based on the context around the tool reference in a prompt.

Rules:
1. Analyze the context text around the tool reference
2. Extract parameters needed for the tool type
3. For Database tools: Convert natural language questions to valid SQL queries
4. Validate parameters and provide guardrails (prevent SQL injection, validate formats)
5. Return JSON with extracted parameters

Tool types:
- API: Extract endpoint, method, params (instrument, timeframe, etc.)
- Database: Convert question to SQL query
- RAG: Extract search query/question
```

**User Prompt Template:**
```
Context around tool reference:
"{context_text}"

Tool information:
- Type: {tool_type}
- Name: {tool_display_name}
- Variable name: {variable_name}

Available step context:
{step_context_json}

Task:
Extract parameters needed to execute this tool. Return ONLY valid JSON, no explanations.

For API tools, extract parameters like:
{{"instrument": "BTC/USDT", "timeframe": "H1"}}

For Database tools, convert the question to SQL:
{{"query": "SELECT * FROM orders WHERE customer_id = 123"}}

For RAG tools, extract the search query:
{{"query": "transactions from Tom Jankins on 21/5/2025"}}
```

### Примеры AI extraction

**Пример 1: API Tool**
```
Промпт: "Получи данные для BTC/USDT на таймфрейме H1 используя {binance_api}"

AI Input:
- Context: "Получи данные для BTC/USDT на таймфрейме H1 используя"
- Tool type: API
- Tool name: Binance API

AI Output:
{
  "instrument": "BTC/USDT",
  "timeframe": "H1"
}
```

**Пример 2: Database Tool (простой)**
```
Промпт: "Проверь заказы для клиента 123 используя {orders_db}"

AI Input:
- Context: "Проверь заказы для клиента 123 используя"
- Tool type: Database
- Tool name: Orders Database

AI Output:
{
  "query": "SELECT * FROM orders WHERE customer_id = 123"
}
```

**Пример 3: Database Tool (сложный - естественный язык)**
```
Промпт: "Найди всех клиентов, которые купили больше 10 товаров за последний месяц, используя {orders_db}"

AI Input:
- Context: "Найди всех клиентов, которые купили больше 10 товаров за последний месяц, используя"
- Tool type: Database
- Tool name: Orders Database

AI Output:
{
  "query": "SELECT customer_id, COUNT(*) as order_count FROM orders WHERE date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) GROUP BY customer_id HAVING COUNT(*) > 10"
}
```

**Пример 4: RAG Tool**
```
Промпт: "Найди информацию о транзакциях 21/5/2025 от Tom Jankins используя {rag_bank_reports}"

AI Input:
- Context: "Найди информацию о транзакциях 21/5/2025 от Tom Jankins используя"
- Tool type: RAG
- Tool name: Bank Reports RAG

AI Output:
{
  "query": "transactions from Tom Jankins on 21/5/2025"
}
```

---

## Guardrails и валидация

### SQL Injection Protection

**AI должен:**
- ✅ Валидировать SQL запросы
- ✅ Использовать параметризованные запросы где возможно
- ✅ Проверять на опасные операции (DROP, DELETE без WHERE, etc.)
- ✅ Экранировать специальные символы

**Пример:**
```
Пользователь: "Удали все заказы используя {orders_db}"

AI должен:
- ❌ НЕ генерировать: "DELETE FROM orders"
- ✅ Вернуть ошибку или безопасный запрос: "SELECT * FROM orders WHERE 1=0" (защита)
```

### API Parameter Validation

**AI должен:**
- ✅ Валидировать форматы (instrument должен быть валидным символом)
- ✅ Проверять диапазоны (timeframe должен быть валидным)
- ✅ Предоставлять fallback значения если параметры не найдены

**Пример:**
```
Промпт: "Получи данные используя {binance_api}" (без instrument/timeframe)

AI должен:
- ✅ Попытаться извлечь из step_context
- ✅ Если не найдено → вернуть ошибку или использовать defaults
```

---

## Кэширование

### Стратегия кэширования

**Ключ кэша:**
```python
cache_key = f"tool_extraction:{tool_id}:{hash(context_text)}:{hash(step_context)}"
```

**Где:**
- `tool_id` - ID инструмента
- `context_text` - текст вокруг tool reference (200 символов)
- `step_context` - контекст шага (instrument, timeframe, previous steps)

**TTL:**
- По умолчанию: 1 час
- Можно настроить в конфигурации

**Реализация:**
```python
# Проверяем кэш
cache_key = generate_cache_key(tool_id, context_text, step_context)
cached_result = cache.get(cache_key)

if cached_result:
    return cached_result

# Выполняем AI extraction
result = ai_extract_parameters(context_text, tool, step_context, model)

# Кэшируем результат
cache.set(cache_key, result, ttl=3600)  # 1 час

return result
```

### Когда НЕ кэшировать

- ❌ Если step_context содержит динамические данные (например, текущая дата)
- ❌ Если tool reference используется в разных контекстах
- ✅ Можно кэшировать если контекст статичен

---

## Производительность и оптимизация

### Текущие характеристики

**Без кэширования:**
- Время: ~500-1000ms на tool reference
- Стоимость: 1 LLM call на tool reference

**С кэшированием:**
- Время: ~1-5ms (из кэша)
- Стоимость: 0 LLM calls (из кэша)

### Оптимизации

1. **Кэширование** (основная оптимизация)
   - Кэшировать результаты AI extraction
   - TTL: 1 час

2. **Batch extraction** (будущее улучшение)
   - Если в промпте несколько tool references → извлекать все за один LLM call
   - Экономит время и стоимость

3. **Streaming responses** (будущее улучшение)
   - Если AI extraction долгий → показывать прогресс пользователю

---

## Примеры использования

### Пример 1: Простой API call

**Промпт:**
```
"Получи данные для BTC/USDT на H1 используя {binance_api}"
```

**AI Extraction:**
```json
{
  "instrument": "BTC/USDT",
  "timeframe": "H1"
}
```

**Tool Execution:**
```python
binance_api.fetch_ohlcv("BTC/USDT", "H1")
```

**Результат в промпте:**
```
"Получи данные для BTC/USDT на H1 используя [market data results...]"
```

---

### Пример 2: Database с естественным языком

**Промпт:**
```
"Найди всех клиентов, которые сделали больше 5 заказов за последний месяц, используя {orders_db}. Проанализируй их поведение."
```

**AI Extraction:**
```json
{
  "query": "SELECT customer_id, COUNT(*) as order_count FROM orders WHERE date >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) GROUP BY customer_id HAVING COUNT(*) > 5"
}
```

**Tool Execution:**
```python
orders_db.execute(query)
# Returns: [{"customer_id": 123, "order_count": 7}, ...]
```

**Результат в промпте:**
```
"Найди всех клиентов, которые сделали больше 5 заказов за последний месяц, используя [DB results: customer_id=123, order_count=7, ...]. Проанализируй их поведение."
```

---

### Пример 3: RAG с контекстом

**Промпт:**
```
"Используя {rag_bank_reports}, найди информацию о транзакциях от Tom Jankins на сумму больше 1000 долларов за май 2025."
```

**AI Extraction:**
```json
{
  "query": "transactions from Tom Jankins amount greater than 1000 dollars May 2025"
}
```

**Tool Execution:**
```python
rag_bank_reports.search(query)
# Returns: [relevant document excerpts...]
```

**Результат в промпте:**
```
"Используя [RAG results: ...], найди информацию о транзакциях от Tom Jankins на сумму больше 1000 долларов за май 2025."
```

---

## Миграция с текущего подхода

### Что изменится

**Удаляется:**
- ❌ `extraction_method` из `tool_references` config
- ❌ `extraction_config` из `tool_references` config
- ❌ Regex-based extraction в `ToolExecutor`
- ❌ Конфигурация `context_window` (будет фиксированная, например 200 символов)

**Добавляется:**
- ✅ AI extraction в `ToolExecutor.execute_tool_with_context()`
- ✅ Кэширование результатов extraction
- ✅ Использование model из step config

**Остается:**
- ✅ `tool_references` array в step config (но упрощенный)
- ✅ `variable_name` для tool reference
- ✅ `tool_id` для tool reference

### Новый формат tool_references

**Старый формат (с конфигурацией):**
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

**Новый формат (упрощенный):**
```json
{
  "tool_references": [
    {
      "tool_id": 1,
      "variable_name": "binance_api"
    }
  ]
}
```

Все остальное работает автоматически через AI.

---

## Резюме

**Архитектура:**
- ✅ AI-based extraction для всех tool references
- ✅ Использование того же model, что в step
- ✅ Прозрачность для пользователя (нет конфигурации)
- ✅ Кэширование для оптимизации
- ✅ Guardrails и валидация через AI

**Преимущества:**
- ✅ Понимание контекста и естественного языка
- ✅ Конвертация вопросов в SQL для DB tools
- ✅ Единый подход для всех типов инструментов
- ✅ Монолитность системы (один model для всего step)

**Компромиссы:**
- ⚠️ Дополнительная стоимость (LLM call на tool reference)
- ⚠️ Дополнительное время (~500-1000ms)
- ✅ Но оптимизируется через кэширование


