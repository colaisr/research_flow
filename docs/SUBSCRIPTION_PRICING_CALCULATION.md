# Subscription Pricing Calculation

## Input Parameters

**Your Costs (What You Pay to Providers):**
- **Basic Plan**: $10 USD/month
- **Pro Plan**: $20 USD/month

**Platform Fee**: 40% (default, per-model adjustable)

**Exchange Rate**: 90 RUB/USD (from config, manually updated)

---

## Model Pricing Reference

**Common Models (from OpenRouter):**
- **gpt-4o-mini**: $0.15/$0.60 per 1M tokens (input/output)
  - Per 1K: $0.00015 input, $0.00060 output
  - Average: $0.000375 per 1K tokens
- **gpt-4o**: $2.50/$10.00 per 1M tokens
  - Per 1K: $0.0025 input, $0.0010 output
  - Average: $0.00625 per 1K tokens
- **claude-3-haiku**: $0.25/$1.25 per 1M tokens
  - Per 1K: $0.00025 input, $0.00125 output
  - Average: $0.00075 per 1K tokens
- **claude-3.5-sonnet**: $3.00/$15.00 per 1M tokens
  - Per 1K: $0.003 input, $0.015 output
  - Average: $0.009 per 1K tokens

**Baseline Model**: gpt-4o-mini (most affordable, commonly used)
- Average cost: **$0.000375 per 1K tokens**

---

## Pricing Calculation

### Basic Plan

**Your Cost**: $10 USD/month

**User Price Calculation:**
```
User price = Your cost × (1 + platform fee)
User price = $10 × 1.40 = $14 USD/month
User price in RUB = $14 × 90 = ₽1,260/month
```

**Token Allocation Calculation:**
```
Tokens = Your cost / Average cost per 1K tokens
Tokens = $10 / $0.000375 = 26,666,667 tokens
Rounded: 26,000,000 tokens (26M tokens)
```

**Summary:**
- **User Price**: ₽1,260/month
- **Token Allocation**: 26,000,000 tokens/month (26M tokens)
- **Features**: LLM-only (no tools, no RAGs)

---

### Pro Plan

**Your Cost**: $20 USD/month

**User Price Calculation:**
```
User price = Your cost × (1 + platform fee)
User price = $20 × 1.40 = $28 USD/month
User price in RUB = $28 × 90 = ₽2,520/month
```

**Token Allocation Calculation:**
```
Tokens = Your cost / Average cost per 1K tokens
Tokens = $20 / $0.000375 = 53,333,333 tokens
Rounded: 53,000,000 tokens (53M tokens)
```

**Summary:**
- **User Price**: ₽2,520/month
- **Token Allocation**: 53,000,000 tokens/month (53M tokens)
- **Features**: All features (tools, RAGs, scheduling, etc.)

---

## Alternative Calculations (Using Different Models)

### If Users Primarily Use gpt-4o (More Expensive)

**Average cost**: $0.00625 per 1K tokens

**Basic Plan:**
- Tokens = $10 / $0.00625 = 1,600,000 tokens (1.6M tokens)
- User price: ₽1,260/month (same)

**Pro Plan:**
- Tokens = $20 / $0.00625 = 3,200,000 tokens (3.2M tokens)
- User price: ₽2,520/month (same)

### If Users Primarily Use claude-3-haiku (Mid-Range)

**Average cost**: $0.00075 per 1K tokens

**Basic Plan:**
- Tokens = $10 / $0.00075 = 13,333,333 tokens (13.3M tokens)
- User price: ₽1,260/month (same)

**Pro Plan:**
- Tokens = $20 / $0.00075 = 26,666,667 tokens (26.7M tokens)
- User price: ₽2,520/month (same)

---

## Recommended Token Allocations

**Option 1: Conservative (Based on gpt-4o-mini)**
- **Basic**: 26,000,000 tokens/month (26M tokens) - ₽1,260/month
- **Pro**: 53,000,000 tokens/month (53M tokens) - ₽2,520/month

**Option 2: Balanced (Mix of Models)**
- **Basic**: 20,000,000 tokens/month (20M tokens) - ₽1,260/month
- **Pro**: 40,000,000 tokens/month (40M tokens) - ₽2,520/month

**Option 3: Round Numbers (User-Friendly)**
- **Basic**: 25,000,000 tokens/month (25M tokens) - ₽1,260/month
- **Pro**: 50,000,000 tokens/month (50M tokens) - ₽2,520/month

---

## Token Package Pricing (Additional Tokens)

**Current Packages (from plan):**
- Small: 10K tokens, ₽500
- Medium: 50K tokens, ₽2,000
- Large: 200K tokens, ₽7,500

**Price per 1K tokens:**
- Small: ₽500 / 10K = ₽50 per 1K tokens
- Medium: ₽2,000 / 50K = ₽40 per 1K tokens
- Large: ₽7,500 / 200K = ₽37.50 per 1K tokens

**Comparison to Subscription:**
- Subscription (Basic): ₽1,260 / 26M = ₽0.000048 per 1K tokens
- Subscription (Pro): ₽2,520 / 53M = ₽0.000048 per 1K tokens
- Token packages: ₽37.50 - ₽50 per 1K tokens

**Note**: Token packages are significantly more expensive per token than subscription allocations. This encourages users to subscribe rather than buy packages.

---

## Cost Breakdown Example

### Basic Plan User (₽1,260/month)

**Scenario**: User uses 10M tokens in a month (gpt-4o-mini)

**Your Cost:**
```
10M tokens × $0.000375 per 1K = $3.75 USD
```

**User Price:**
```
10M tokens × $0.000525 per 1K = $5.25 USD = ₽472.50
```

**Your Margin:**
```
$5.25 - $3.75 = $1.50 USD (40% margin)
```

**Remaining Tokens:**
```
26M allocated - 10M used = 16M tokens remaining
```

---

## Recommendations

### Token Allocations

**Recommended: Option 3 (Round Numbers)**
- **Basic**: 25,000,000 tokens/month (25M tokens)
- **Pro**: 50,000,000 tokens/month (50M tokens)

**Rationale:**
- Easy to understand (round numbers)
- Generous allocation (users won't run out quickly)
- Still profitable (based on gpt-4o-mini pricing)
- Allows users to experiment with more expensive models occasionally

### Pricing Summary

| Plan | Your Cost | User Price (USD) | User Price (RUB) | Tokens/Month |
|------|-----------|------------------|------------------|--------------|
| **Basic** | $10 | $14 | ₽1,260 | 25M tokens |
| **Pro** | $20 | $28 | ₽2,520 | 50M tokens |

---

## Questions to Consider

1. **Model Mix**: What models will users primarily use?
   - If mostly gpt-4o-mini: 25M/50M tokens is generous
   - If mostly gpt-4o: 25M/50M tokens is tight (only ~1.6M/3.2M tokens)
   - **Recommendation**: Set allocations based on gpt-4o-mini, allow occasional expensive model usage

2. **Token Package Pricing**: Should packages be cheaper?
   - Current: ₽37.50-₽50 per 1K tokens
   - Subscription: ₽0.000048 per 1K tokens
   - **Recommendation**: Keep packages expensive to encourage subscriptions

3. **Trial Tokens**: How many tokens for trial?
   - **Recommendation**: 5M tokens (enough for testing, not too generous)

4. **Overage Policy**: What happens when tokens run out?
   - **Recommendation**: Block requests, prompt to purchase tokens or upgrade plan

---

## Final Recommendations

**Subscription Plans:**
- **Trial**: 5,000,000 tokens (5M tokens), 14 days, ₽0 (free)
- **Basic**: 25,000,000 tokens/month (25M tokens), ₽1,260/month
- **Pro**: 50,000,000 tokens/month (50M tokens), ₽2,520/month

**Token Packages:**
- Small: 10,000 tokens, ₽500
- Medium: 50,000 tokens, ₽2,000
- Large: 200,000 tokens, ₽7,500

**Platform Fee**: 40% (default, adjustable per model)

**Exchange Rate**: 90 RUB/USD (manually updated in config)

---

**Document Status**: Pricing Calculation
**Last Updated**: 2024-01-XX
**Ready for Review**: Yes ✅

