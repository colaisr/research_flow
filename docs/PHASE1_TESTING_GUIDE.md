# Phase 1: Tools System - Testing Guide

## What's Available Now

### Backend API Endpoints

**Tool Management:**
- `GET /api/tools` - List tools available in current organization
- `POST /api/tools` - Create new tool
- `GET /api/tools/{tool_id}` - Get tool details
- `PUT /api/tools/{tool_id}` - Update tool
- `DELETE /api/tools/{tool_id}` - Delete tool (with usage check)
- `POST /api/tools/{tool_id}/test` - Test tool connection

**Organization Tool Access:**
- `GET /api/organizations/{org_id}/tools` - List all user's tools with access status
- `PUT /api/organizations/{org_id}/tools/{tool_id}/access` - Enable/disable tool for organization

### Frontend Pages

- `/tools` - Tools list page with filters and search
- `/tools/new` - Tool creation wizard (4 steps)
- `/tools/{id}/edit` - Tool edit page

### Database Models

- `user_tools` table - Stores user-owned tools
- `organization_tool_access` table - Controls tool access per organization

### Migration Scripts

- Alembic migration: `728180b1919f_add_user_tools_and_organization_tool_access_tables.py`
- Adapter migration: `scripts/migrate_adapters_to_tools.py`

---

## Testing Steps

### 1. Run Database Migration

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

This will create the `user_tools` and `organization_tool_access` tables.

### 2. Migrate Existing Adapters to Tools

```bash
cd backend
source .venv/bin/activate
python scripts/migrate_adapters_to_tools.py
```

This will create tools for all existing users based on current adapters:
- CCXT → "Binance API" tool
- yfinance → "Yahoo Finance API" tool
- Tinkoff → "Tinkoff Invest API" tool (if token configured)

### 3. Test Backend API

**List Tools:**
```bash
curl -X GET http://localhost:8000/api/tools \
  -H "Cookie: researchflow_session=YOUR_SESSION_TOKEN" \
  | jq
```

**Create Tool (Example - Binance API):**
```bash
curl -X POST http://localhost:8000/api/tools \
  -H "Content-Type: application/json" \
  -H "Cookie: researchflow_session=YOUR_SESSION_TOKEN" \
  -d '{
    "tool_type": "api",
    "name": "binance_api",
    "display_name": "Binance API",
    "config": {
      "connector_type": "predefined",
      "connector_name": "binance",
      "adapter_config": {
        "adapter_type": "ccxt",
        "exchange_name": "binance"
      }
    },
    "is_shared": true
  }' | jq
```

**Test Tool:**
```bash
curl -X POST http://localhost:8000/api/tools/1/test \
  -H "Cookie: researchflow_session=YOUR_SESSION_TOKEN" \
  | jq
```

### 4. Test Frontend

1. **Access Tools Page:**
   - Navigate to `http://localhost:3000/tools`
   - Should see tools list (empty if no tools, or migrated tools if migration ran)

2. **Create New Tool:**
   - Click "Создать инструмент"
   - Step 1: Select tool type (API/Database)
   - Step 2: Choose creation method (Predefined/Custom)
   - Step 3: Configure tool
   - Step 4: Name and save

3. **Test Tool:**
   - Click "Тест" button on any tool
   - Should see test result

4. **Edit Tool:**
   - Click "Редактировать" on any tool
   - Modify name, display name, or config
   - Click "Сохранить"

5. **Organization Tool Access:**
   - Go to organization settings (if implemented)
   - Should see tools list with enable/disable toggles

---

## Expected Behavior

### Tool Creation
- Tool is created with `user_id` = current user
- Tool is created with `organization_id` = current organization (home org)
- If `is_shared=true`, `organization_tool_access` entries are auto-created for all orgs where user is owner
- Tool appears in tools list for current organization

### Tool Visibility
- Tools are only visible in organizations where user is owner
- Tools can be disabled per organization via `organization_tool_access`
- Switching organizations changes visible tools

### Tool Execution
- Predefined connectors use adapter pattern (CCXT, yfinance, Tinkoff)
- Generic APIs use HTTP requests
- Database tools execute read-only queries
- RAG tools return "Not implemented" (Phase 2)

---

## Known Limitations

1. **Credential Encryption**: Not yet implemented (TODO: Use cryptography library)
2. **Tool Deletion**: Checks for usage but may need refinement
3. **RAG Tools**: Not implemented (Phase 2)
4. **Pipeline Integration**: Tools not yet integrated into pipeline execution (next step)
5. **Organization Settings UI**: Tool access control UI not yet added to org settings page

---

## Next Steps After Testing

1. Fix any bugs found during testing
2. Implement credential encryption
3. Integrate tools into pipeline execution
4. Add tool access control to organization settings page
5. Update existing analyses to use tools instead of adapters


