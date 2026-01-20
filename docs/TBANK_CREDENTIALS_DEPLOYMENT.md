# T-Bank Payment Gateway Credentials Deployment

## How Credentials Are Stored

T-Bank payment gateway credentials are stored in the **database** (`app_settings` table), not in config files. This allows:
- ✅ Dynamic updates without code changes
- ✅ Secure storage (can be encrypted if needed)
- ✅ Easy management via admin UI or scripts
- ✅ No need to redeploy when credentials change

### Storage Location

**Database Table:** `app_settings`

**Settings Keys:**
- `tbank_terminal_key` - T-Bank Terminal ID
- `tbank_password` - T-Bank Password
- `tbank_test_mode` - Test mode flag (`true` or `false`)

### How They're Accessed

The `TBankPaymentService` reads credentials dynamically from the database:

```python
# backend/app/services/payment/tbank_service.py
def _get_setting(self, key: str) -> Optional[str]:
    setting = self.db.query(AppSettings).filter(AppSettings.key == key).first()
    return setting.value if setting else None
```

**Important:** Credentials are read from the database **every time** the service is initialized, so no restart is needed after updating credentials.

---

## Setting Credentials in Production

### Option 1: Using the Script (Recommended)

SSH to production server and run:

```bash
# SSH to production
ssh rf-prod  # or your production server alias

# Navigate to project directory
cd /srv/research-flow/backend

# Activate virtual environment
source .venv/bin/activate

# Run the script with production credentials
python scripts/set_tbank_credentials.py \
  1768852476070 \
  "oSq_pGw7Sd^VU^aB" \
  false

# Output should show:
# ✅ Updated tbank_terminal_key
# ✅ Updated tbank_password
# ✅ Updated tbank_test_mode = False
```

### Option 2: Direct SQL (Alternative)

If you prefer SQL:

```bash
# Connect to MySQL
mysql -u rf_prod -p rf_prod

# Set credentials
INSERT INTO app_settings (key, value, description, is_secret) 
VALUES 
  ('tbank_terminal_key', '1768852476070', 'T-Bank Terminal Key', true),
  ('tbank_password', 'oSq_pGw7Sd^VU^aB', 'T-Bank Password', true),
  ('tbank_test_mode', 'false', 'T-Bank Test Mode', false)
ON DUPLICATE KEY UPDATE 
  value = VALUES(value),
  updated_at = NOW();
```

### Option 3: Via Admin UI (Future)

If an admin UI for settings is implemented, credentials can be set there.

---

## Production Credentials

**Terminal Key:** `1768852476070`  
**Password:** `oSq_pGw7Sd^VU^aB`  
**Test Mode:** `false` (PRODUCTION)  
**API Endpoint:** `https://securepay.tinkoff.ru/v2`

---

## Verification

After setting credentials, verify they're correct:

```bash
cd /srv/research-flow/backend
source .venv/bin/activate

python3 -c "
from app.core.database import SessionLocal
from app.models.settings import AppSettings
from app.services.payment.tbank_service import TBankPaymentService

db = SessionLocal()
try:
    # Check settings
    terminal_key = db.query(AppSettings).filter(AppSettings.key == 'tbank_terminal_key').first()
    password = db.query(AppSettings).filter(AppSettings.key == 'tbank_password').first()
    test_mode = db.query(AppSettings).filter(AppSettings.key == 'tbank_test_mode').first()
    
    print('✅ T-Bank Credentials:')
    print(f'   Terminal Key: {terminal_key.value if terminal_key else \"NOT SET\"}')
    print(f'   Password: {\"*\" * len(password.value) if password else \"NOT SET\"}')
    print(f'   Test Mode: {test_mode.value if test_mode else \"NOT SET\"}')
    
    # Check service initialization
    service = TBankPaymentService(db=db)
    print(f'   API Endpoint: {service.base_url}')
    
    if not terminal_key.value.endswith('DEMO') and test_mode.value == 'false':
        print('   ✅ PRODUCTION mode configured correctly')
    else:
        print('   ⚠️  Check configuration - not in production mode')
finally:
    db.close()
"
```

---

## Security Considerations

### 1. Database Access

- ✅ Credentials are stored in `app_settings` table with `is_secret = true`
- ✅ Database should be secured (strong password, restricted access)
- ✅ `config_local.py` contains database credentials (never commit to git)

### 2. Network Security

- ✅ Webhook endpoint (`/api/payments/webhook`) verifies signatures
- ✅ Production server should be accessible from T-Bank's IPs for webhooks
- ✅ Use HTTPS for webhook URL (`https://researchflow.ru/api/payments/webhook`)

### 3. Credential Rotation

If credentials need to be rotated:

1. Update credentials in database using script
2. No restart needed (credentials read dynamically)
3. Old payments will still work (they're tied to payment_id, not current credentials)

---

## Deployment Checklist

Before deploying payment functionality to production:

- [ ] **Database migrations applied** - Ensure `app_settings` table exists
- [ ] **Credentials set** - Run `set_tbank_credentials.py` with production values
- [ ] **Verification** - Confirm credentials are correct using verification script
- [ ] **Webhook URL accessible** - Ensure `https://researchflow.ru/api/payments/webhook` is reachable from T-Bank
- [ ] **Test payment** - Make a small test payment to verify integration
- [ ] **Monitor logs** - Check backend logs for any payment-related errors

---

## Troubleshooting

### Credentials Not Working

**Check database:**
```sql
SELECT key, value, is_secret FROM app_settings 
WHERE key LIKE 'tbank%';
```

**Check service logs:**
```bash
sudo journalctl -u research-flow-backend -n 100 | grep -i tbank
```

### Webhooks Not Received

**Verify webhook URL:**
- Should be: `https://researchflow.ru/api/payments/webhook`
- Check firewall allows incoming connections
- Verify T-Bank can reach your server

**Check webhook endpoint:**
```bash
curl -X POST https://researchflow.ru/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Payment Status Not Updating

- Check webhook logs in backend
- Verify webhook signature verification is working
- Check database for payment status updates

---

## Related Files

- **Service:** `backend/app/services/payment/tbank_service.py`
- **API Endpoints:** `backend/app/api/payments.py`
- **Settings Model:** `backend/app/models/settings.py`
- **Setup Script:** `backend/scripts/set_tbank_credentials.py`
- **Deployment Guide:** `docs/PRODUCTION_DEPLOYMENT.md`
