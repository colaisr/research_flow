# Subscription & Token System - Test Scenarios

This document lists all test scenarios for the subscription and token system. Each scenario describes a specific user state and what the user should see.

## How to Use This Document

1. Pick a scenario from the list below
2. Use the provided SQL scripts or Python commands to set up the user state
3. Log in as that user and verify what they see matches the expected behavior
4. Mark the scenario as tested when complete

---

## Scenario 1: New User - Trial Subscription (Active, Full Tokens)

**User State:**
- Just registered
- Trial subscription active
- Full token allocation (300,000 tokens)
- No token balance
- Trial period: 14 days remaining

**Expected Behavior:**
- User sees trial subscription info
- Full token allocation available
- Can use all Pro features
- No warnings about tokens
- Can upgrade to paid plans

**Setup Script:**
```python
# User: cola.isr@gmail.com (ID: 19)
# Should already be in this state after registration
```

---

## Scenario 2: Trial User - Low Tokens (< 10%)

**User State:**
- Trial subscription active
- Tokens used: 270,000 / 300,000 (90% used, 30,000 remaining)
- Token balance: 0
- Trial period: 10 days remaining

**Expected Behavior:**
- Warning banner on consumption page: "У вас осталось менее 10% токенов"
- Shows remaining tokens
- Link to purchase more tokens
- Link to upgrade plan

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET tokens_used_this_period = 270000 
WHERE user_id = 19;
```

---

## Scenario 3: Trial User - Exhausted Tokens (0 Available)

**User State:**
- Trial subscription active
- Tokens used: 300,000 / 300,000 (100% used, 0 remaining)
- Token balance: 0
- Trial period: 5 days remaining

**Expected Behavior:**
- Red warning banner: "У вас закончились токены"
- Message: "Токены в подписке восстановятся [date] или вы можете приобрести дополнительный пакет токенов"
- Buttons: "Купить токены" and "Изменить план"
- Requests should be blocked (backend should reject)

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET tokens_used_this_period = 300000 
WHERE user_id = 19;
```

---

## Scenario 4: Trial User - Exhausted Tokens + Token Balance

**User State:**
- Trial subscription active
- Tokens used: 300,000 / 300,000 (subscription exhausted)
- Token balance: 50,000 (from purchased package)
- Trial period: 5 days remaining

**Expected Behavior:**
- Shows total available tokens: 50,000 (from balance)
- Can continue using tokens from balance
- Consumption page shows balance tokens being used
- "Списано" column shows "balance" for new consumption

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET tokens_used_this_period = 300000 
WHERE user_id = 19;

UPDATE token_balances 
SET balance = 50000 
WHERE user_id = 19;
```

---

## Scenario 5: Trial User - All Tokens Exhausted (Subscription + Balance)

**User State:**
- Trial subscription active
- Tokens used: 300,000 / 300,000 (subscription exhausted)
- Token balance: 0
- Trial period: 5 days remaining

**Expected Behavior:**
- Red warning banner: "У вас закончились токены"
- All requests should be blocked
- Clear call-to-action to purchase tokens or upgrade

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET tokens_used_this_period = 300000 
WHERE user_id = 19;

UPDATE token_balances 
SET balance = 0 
WHERE user_id = 19;
```

---

## Scenario 6: Trial User - Trial Period Expired

**User State:**
- Trial subscription expired
- Status: 'expired'
- Tokens used: 150,000 / 300,000
- Token balance: 0
- Trial ended: past date

**Expected Behavior:**
- Red warning banner: "Ваш пробный период истек"
- Message: "Выберите новый план или купите токены для продолжения работы"
- Buttons: "Выбрать новый план" and "Купить токены"
- All requests should be blocked

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET status = 'expired',
    trial_ends_at = DATE_SUB(NOW(), INTERVAL 1 DAY),
    tokens_used_this_period = 150000
WHERE user_id = 19;
```

---

## Scenario 7: Basic Plan User - Active Subscription

**User State:**
- Basic subscription active
- Monthly tokens: 750,000
- Tokens used: 100,000 / 750,000
- Token balance: 0
- Period: 20 days remaining
- Features: Only `openrouter` enabled

**Expected Behavior:**
- Shows Basic plan info
- 650,000 tokens remaining
- Can use LLM analysis only
- Cannot use RAG, tools, scheduling (features disabled)
- Can upgrade to Pro plan

**Setup Script:**
```sql
-- Change to Basic plan
UPDATE user_subscriptions 
SET plan_id = (SELECT id FROM subscription_plans WHERE name = 'basic' LIMIT 1),
    status = 'active',
    tokens_allocated = 750000,
    tokens_used_this_period = 100000,
    period_start_date = CURDATE(),
    period_end_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY),
    trial_ends_at = NULL
WHERE user_id = 19;

-- Sync features (only openrouter)
DELETE FROM user_features WHERE user_id = 19;
INSERT INTO user_features (user_id, feature_name, enabled) VALUES
(19, 'openrouter', 1);
```

---

## Scenario 8: Basic Plan User - Low Tokens

**User State:**
- Basic subscription active
- Tokens used: 700,000 / 750,000 (93% used, 50,000 remaining)
- Token balance: 0
- Period: 15 days remaining

**Expected Behavior:**
- Yellow warning banner: "У вас осталось менее 10% токенов"
- Shows 50,000 tokens remaining
- Can purchase token packages
- Can upgrade to Pro plan

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET tokens_used_this_period = 700000 
WHERE user_id = 19;
```

---

## Scenario 9: Pro Plan User - Active Subscription

**User State:**
- Pro subscription active
- Monthly tokens: 1,500,000
- Tokens used: 200,000 / 1,500,000
- Token balance: 0
- Period: 25 days remaining
- Features: All features enabled

**Expected Behavior:**
- Shows Pro plan info
- 1,300,000 tokens remaining
- All features available (RAG, tools, scheduling, webhooks)
- Can downgrade to Basic plan

**Setup Script:**
```sql
-- Change to Pro plan
UPDATE user_subscriptions 
SET plan_id = (SELECT id FROM subscription_plans WHERE name = 'pro' LIMIT 1),
    status = 'active',
    tokens_allocated = 1500000,
    tokens_used_this_period = 200000,
    period_start_date = CURDATE(),
    period_end_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY),
    trial_ends_at = NULL
WHERE user_id = 19;

-- Sync features (all enabled)
DELETE FROM user_features WHERE user_id = 19;
INSERT INTO user_features (user_id, feature_name, enabled) VALUES
(19, 'openrouter', 1),
(19, 'rag', 1),
(19, 'api_tools', 1),
(19, 'database_tools', 1),
(19, 'scheduling', 1),
(19, 'webhooks', 1);
```

---

## Scenario 10: Pro Plan User - With Token Balance

**User State:**
- Pro subscription active
- Tokens used: 1,400,000 / 1,500,000 (subscription)
- Token balance: 500,000 (from purchased package)
- Period: 10 days remaining

**Expected Behavior:**
- Shows subscription tokens: 100,000 remaining
- Shows token balance: 500,000
- Shows total available: 600,000
- Consumption page shows both sources
- "Списано" column shows "subscription" or "balance"

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET tokens_used_this_period = 1400000 
WHERE user_id = 19;

UPDATE token_balances 
SET balance = 500000 
WHERE user_id = 19;
```

---

## Scenario 11: Paid Plan User - Subscription Expired

**User State:**
- Pro subscription expired
- Status: 'expired'
- Tokens used: 1,200,000 / 1,500,000
- Token balance: 100,000
- Period ended: past date

**Expected Behavior:**
- Red warning banner: "Ваша подписка истекла"
- Message: "Выберите новый план или купите токены для продолжения работы"
- Can still use token balance (100,000)
- Requests should use balance first, then block when balance exhausted

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET status = 'expired',
    period_end_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY),
    tokens_used_this_period = 1200000
WHERE user_id = 19;

UPDATE token_balances 
SET balance = 100000 
WHERE user_id = 19;
```

---

## Scenario 12: User Upgrading from Basic to Pro

**User State:**
- Currently on Basic plan
- 500,000 tokens remaining
- User clicks "Выбрать план" on Pro plan

**Expected Behavior:**
- Shows payment placeholder for ₽1,900
- Payment system TBD message
- Contact sales info
- Cancel button returns to plans
- Plan does NOT change until payment confirmed

**Setup Script:**
```sql
-- Ensure user is on Basic plan
UPDATE user_subscriptions 
SET plan_id = (SELECT id FROM subscription_plans WHERE name = 'basic' LIMIT 1),
    status = 'active',
    tokens_allocated = 750000,
    tokens_used_this_period = 250000
WHERE user_id = 19;
```

---

## Scenario 13: User Downgrading from Pro to Basic

**User State:**
- Currently on Pro plan
- 800,000 tokens remaining
- User clicks "Выбрать план" on Basic plan

**Expected Behavior:**
- Confirmation dialog: "Вы уверены, что хотите перейти с плана 'Профессиональный' на план 'Базовый'?"
- Warning about reduced features and tokens
- If confirmed: Plan changes immediately (no payment)
- Features updated to Basic (only openrouter)
- Tokens reset to Basic allocation (750,000)

**Setup Script:**
```sql
-- Ensure user is on Pro plan
UPDATE user_subscriptions 
SET plan_id = (SELECT id FROM subscription_plans WHERE name = 'pro' LIMIT 1),
    status = 'active',
    tokens_allocated = 1500000,
    tokens_used_this_period = 700000
WHERE user_id = 19;
```

---

## Scenario 14: User Purchasing Token Package

**User State:**
- Any active subscription
- User goes to billing page
- User clicks "Купить" on a token package

**Expected Behavior:**
- Shows payment placeholder with package price
- Payment system TBD message
- Contact sales info
- Cancel button returns to billing
- Token balance does NOT increase until payment confirmed

**Setup Script:**
```sql
-- Any active subscription state
UPDATE user_subscriptions 
SET status = 'active'
WHERE user_id = 19;
```

---

## Scenario 15: User on Paid Plan Trying to Switch to Trial

**User State:**
- Currently on Basic or Pro plan (paid)
- User tries to select Trial plan

**Expected Behavior:**
- Trial plan button is disabled
- Yellow warning: "Недоступно: нельзя перейти на пробный период с платного плана"
- Backend should reject if somehow attempted

**Setup Script:**
```sql
-- Ensure user is on paid plan
UPDATE user_subscriptions 
SET plan_id = (SELECT id FROM subscription_plans WHERE name = 'basic' LIMIT 1),
    status = 'active'
WHERE user_id = 19;
```

---

## Scenario 16: Consumption Page - Source Name Display

**User State:**
- Any active subscription
- Has consumption records from:
  - Pipeline steps (should show analysis type name)
  - RAG embeddings (should show "RAG Name (embeddings)")
  - RAG chat (should show "RAG Name (chat)")
  - RAG from pipeline (should show "Pipeline Name > RAG Name (chat)")

**Expected Behavior:**
- Consumption table shows "Источник" column
- Each row shows appropriate source name
- Source names are clear and descriptive

**Setup Script:**
```sql
-- User should have existing consumption records
-- Check consumption page to verify source_name column displays correctly
```

---

## Scenario 17: Admin Impersonating User

**User State:**
- Admin user impersonates regular user
- Regular user has active subscription

**Expected Behavior:**
- Admin sees "Стоимость" column on consumption page
- Admin can see cost information
- Admin can manage user's subscription from admin panel

**Setup Script:**
```sql
-- Admin should use impersonation feature in admin panel
-- Check that cost column is visible when impersonating
```

---

## Scenario 18: Subscription Renewal (Monthly Reset)

**User State:**
- Active subscription
- Period end date: today
- Tokens used: 500,000 / 750,000

**Expected Behavior:**
- Renewal job should run (scheduled task)
- New period starts
- Tokens reset to full allocation
- `tokens_used_this_period` reset to 0
- Period dates updated

**Setup Script:**
```sql
-- Set period end to today to trigger renewal
UPDATE user_subscriptions 
SET period_end_date = CURDATE(),
    tokens_used_this_period = 500000
WHERE user_id = 19;

-- Then wait for renewal job or trigger manually
```

---

## Scenario 19: Token Charging Priority

**User State:**
- Active subscription
- Subscription tokens: 10,000 remaining
- Token balance: 50,000

**Expected Behavior:**
- First 10,000 tokens charged from subscription
- Next tokens charged from balance
- Consumption records show correct `source_type`
- "Списано" column shows correct source

**Setup Script:**
```sql
UPDATE user_subscriptions 
SET tokens_used_this_period = 740000  -- 10,000 remaining from 750,000
WHERE user_id = 19;

UPDATE token_balances 
SET balance = 50000 
WHERE user_id = 19;
```

---

## Scenario 20: Registration with Plan Selection

**User State:**
- New user registration
- User clicks plan on landing page
- Redirects to `/register?plan={plan_id}`

**Expected Behavior:**
- Registration page loads with plan in URL
- User completes registration
- User gets trial subscription (regardless of selected plan)
- After email verification, user can upgrade to selected plan

**Setup Script:**
```sql
-- Delete test user first, then register new one
-- Check that trial is created regardless of plan parameter
```

---

## Testing Checklist

- [ ] Scenario 1: New User - Trial Subscription
- [ ] Scenario 2: Trial User - Low Tokens
- [ ] Scenario 3: Trial User - Exhausted Tokens
- [ ] Scenario 4: Trial User - Exhausted + Balance
- [ ] Scenario 5: Trial User - All Tokens Exhausted
- [ ] Scenario 6: Trial User - Trial Expired
- [ ] Scenario 7: Basic Plan User - Active
- [ ] Scenario 8: Basic Plan User - Low Tokens
- [ ] Scenario 9: Pro Plan User - Active
- [ ] Scenario 10: Pro Plan User - With Balance
- [ ] Scenario 11: Paid Plan - Expired
- [ ] Scenario 12: Upgrading Plan
- [ ] Scenario 13: Downgrading Plan
- [ ] Scenario 14: Purchasing Token Package
- [ ] Scenario 15: Paid Plan to Trial (Blocked)
- [ ] Scenario 16: Consumption Source Names
- [ ] Scenario 17: Admin Impersonation
- [ ] Scenario 18: Subscription Renewal
- [ ] Scenario 19: Token Charging Priority
- [ ] Scenario 20: Registration with Plan Selection

---

## Notes

- All SQL scripts assume user_id = 19 (cola.isr@gmail.com)
- Adjust user_id in scripts if testing with different user
- Some scenarios require backend job execution (renewal)
- Payment scenarios show placeholder until gateway integrated
- Token charging logic should prioritize subscription → balance → block

