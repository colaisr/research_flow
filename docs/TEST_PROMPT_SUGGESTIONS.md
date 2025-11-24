# Test Prompts for AI Extraction Validation

## Purpose
These prompts are designed to test that AI-based parameter extraction is working correctly, not regex-based pattern matching. They use natural language, synonyms, and contextual descriptions instead of direct parameter names.

## Test Prompt 1: Natural Language with Synonyms

**Prompt:**
```
Используя {binance_api}, получи почасовые котировки для криптовалютной пары биткоин к тезеру за последние 50 свечей. Данные должны быть отсортированы от старых к новым, начиная с самой ранней записи.
```

**Expected Parameters:**
- `instrument`: "BTC/USDT" (from "биткоин к тезеру")
- `timeframe`: "H1" (from "почасовые")
- `limit`: 50 (from "последние 50 свечей")

**Why this tests AI:**
- Uses "биткоин к тезеру" instead of "BTC/USDT"
- Uses "почасовые" instead of "H1"
- Uses "криптовалютная пара" as context
- Requires understanding that "тезер" = "USDT"

## Test Prompt 2: Descriptive Context

**Prompt:**
```
Через {binance_api} запроси исторические данные для торговой пары, где первая валюта - это самая популярная криптовалюта, а вторая - стейблкоин, привязанный к доллару. Нужны данные с интервалом один час за последние пятьдесят периодов.
```

**Expected Parameters:**
- `instrument`: "BTC/USDT" (from "самая популярная криптовалюта" = Bitcoin, "стейблкоин привязанный к доллару" = USDT)
- `timeframe`: "H1" (from "интервал один час")
- `limit`: 50 (from "пятьдесят периодов")

**Why this tests AI:**
- No direct mention of "BTC/USDT" or "H1"
- Requires knowledge that Bitcoin is the most popular crypto
- Requires understanding that USDT is a dollar-pegged stablecoin
- Uses "интервал один час" instead of "H1"

## Test Prompt 3: Indirect References

**Prompt:**
```
{binance_api} - мне нужна информация о цене первой криптовалюты по капитализации, торгуемой против стейблкоина. Данные за каждый час, всего 50 записей, начиная с самых старых.
```

**Expected Parameters:**
- `instrument`: "BTC/USDT" (from "первая криптовалюты по капитализации" = Bitcoin)
- `timeframe`: "H1" (from "за каждый час")
- `limit`: 50 (from "50 записей")

**Why this tests AI:**
- Uses "первая криптовалюты по капитализации" instead of "Bitcoin"
- Requires market knowledge
- Uses "за каждый час" instead of "H1"

## Test Prompt 4: Mixed Language and Context

**Prompt:**
```
Получи через {binance_api} данные для BTC/USDT на таймфрейме H1, но только если это возможно. Нужно ровно пятьдесят последних свечей, отсортированных от самых ранних к самым поздним.
```

**Expected Parameters:**
- `instrument`: "BTC/USDT" (explicitly mentioned)
- `timeframe`: "H1" (explicitly mentioned)
- `limit`: 50 (from "ровно пятьдесят")

**Why this tests AI:**
- Mixes explicit parameters with natural language
- Uses "ровно пятьдесят" instead of "50"
- Contains conditional language ("но только если это возможно") that should be ignored
- Tests that AI can extract explicit params while ignoring irrelevant text

## Recommended Test Prompt

For initial testing, use **Test Prompt 2** as it:
1. Uses no direct parameter names
2. Requires contextual understanding
3. Uses synonyms and descriptions
4. Cannot be processed by simple regex

