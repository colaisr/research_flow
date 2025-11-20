## Research Flow — Master Plan

**Product Vision**: General-purpose research platform for creating custom analysis flows using any data sources, tools, and knowledge bases.

### 1) Purpose and Scope

- **Goal**: Build a general-purpose research platform that allows users to create custom analysis flows for any domain or topic. Users can build step-by-step research workflows that combine multiple data sources (APIs, databases, RAGs, etc.) to produce comprehensive analyses, reports, or insights. The platform provides transparency at each step, allowing users to verify intermediate results before proceeding.

- **Core Concept**: 
  - Users create **Analysis Flows** (pipelines) with multiple steps
  - Each step can use different **Tools** (user-configured data sources, APIs, databases, RAGs)
  - Steps can pass context to subsequent steps
  - Users can run analyses on-demand or schedule them for regular updates
  - All steps are transparent - users can see inputs/outputs at each stage

- **Key Features**:
  - **Pipeline Editor**: Visual, step-by-step flow builder (similar to current implementation)
  - **Tools System**: User-specific, configurable tools (like 8n8n)
    - Database connections (user configures: "Orders DB", "Customers Table")
    - API clients (user configures: "MOEX API", "Weather API" with their keys)
    - RAG knowledge bases (user creates multiple RAGs by topic)
  - **RAG Management**: Users can create multiple RAGs, upload documents, and use them as tools in analysis steps
  - **Scheduling**: Run analyses manually or on schedule (daily, hourly, custom intervals)
  - **Output Formats**: Flexible outputs (reports, summaries, formatted data, webhooks, etc.)

- **Use Cases**:
  - Financial analysis (current trading analysis as example/template)
  - Business intelligence (combining sales data, market data, internal reports)
  - Research reports (academic, market research, competitive analysis)
  - Compliance monitoring (checking protocols, regulations, standards)
  - Data analysis workflows (any multi-step analysis requiring different data sources)

- **Early Usage**: Focus on flexibility, tool configuration, and step transparency. Users should be able to build any research workflow, not just financial analysis.

- **AI Approach**: Heavy usage of LLM agents/tools; LLM provider switchable via OpenAI-compatible API using OpenRouter for simplicity and cost/uptime benefits (`https://openrouter.ai/`). LLM steps are one type of step - users can also use non-LLM steps (data transformations, calculations, API calls, etc.).

- **Language**: UI and default templates in Russian; users can create analyses in any language.

Constraints and preferences:
- Monorepo structure (backend and frontend in same repository).
- Configuration values live in code with a local, non-committed file for secrets (avoid .env in VCS).
- Single VM deployment without Docker; simple "pull → install deps → restart" flow.


### 2) Tech Stack

- Backend
  - Python 3.11+, FastAPI (async-first), Uvicorn
  - MySQL via SQLAlchemy (or SQLModel) + Alembic migrations (baseline from day one)
  - APScheduler for schedules
  - HTTP client: httpx (async)
  - OpenAI-compatible client pointed at OpenRouter base URL (for easy model switching)
  - Telegram: aiogram (async) or python-telegram-bot (sync)
  - Logging: structlog
  - Data adapters: CCXT (crypto), yfinance (equities), Tinkoff Invest API (MOEX - Russian stocks/bonds/ETFs)
  - Config module: `app/config_local.py` (gitignored) holding keys for OpenRouter and Telegram

- Frontend
  - Next.js (React) + TailwindCSS + shadcn/ui
  - Data fetching: React Query (TanStack Query) or SWR
  - Pages: Dashboard (trigger run), Run detail (intrasteps), Settings

- Deployment (single VM, no Docker)
  - Monorepo checked out to `/srv/research-flow/` (contains `backend/` and `frontend/` subdirectories)
  - Backend: Python venv, Uvicorn via systemd; connects to local or external MySQL
  - Frontend: Next.js production build, `npm run start` via systemd
  - Scripts: 
    - `research-flow-deploy` (standalone script in `/usr/local/bin/` - complete deployment)
    - `scripts/deploy.sh` (pulls repo, updates deps, migrations, builds frontend)
    - `scripts/restart_backend.sh`, `scripts/restart_frontend.sh`
  - Local MySQL defaults (dev): host `localhost`, port `3306`, db `research_flow_dev`, user `research_flow_user`
    - SQLAlchemy DSN: `mysql+pymysql://research_flow_user:YOUR_PASSWORD@localhost:3306/research_flow_dev?charset=utf8mb4`
    - Use script: `scripts/mysql_local_setup.sql` (edit password, then apply with a privileged MySQL user)
    - Note: This creates a NEW database on the same MySQL server (separate from infrazen_dev, which belongs to another project and should not be touched)

- References
  - OpenRouter: `https://openrouter.ai/`


### 3) High-Level Architecture

- Components
  - **Backend service**: APIs, pipeline orchestration, tool execution engine, scheduling, persistence
  - **Frontend app**: 
    - Analysis Flows page (create/edit/run analyses)
    - Tools page (manage user-specific tools: DBs, APIs, RAGs)
    - Runs page (view execution history and results)
    - Schedules page (manage scheduled analyses)
  - **Tool System**: User-configurable tools (database connections, API clients, RAGs)
  - **RAG System**: Document management and vector search for knowledge bases
  - **Output Handlers**: Flexible output formats (Telegram, email, webhooks, file exports, etc.)

- Data model (MySQL)
  - `users`: id, email, hashed_password, full_name, is_active, is_admin, created_at, updated_at
  - `analysis_types`: id, user_id (nullable, for user-created vs system), name, display_name, description, version, config (JSON with steps configuration), is_active, is_system, created_at, updated_at
  - `analysis_runs`: id, trigger_type (manual/scheduled), analysis_type_id, status (queued/running/succeeded/failed/model_failure), input_params (JSON), created_at, finished_at, cost_est_total
  - `analysis_steps`: id, run_id, step_name, step_type (llm/data_transform/api_call/rag_query/etc), input_blob, output_blob, tool_id (nullable, links to user_tools), llm_model (nullable), tokens (nullable), cost_est, created_at
  - `user_tools`: id, user_id, tool_type (database/api/rag/custom), name, display_name, config (JSON with connection details, credentials), is_active, created_at, updated_at
  - `rag_knowledge_bases`: id, user_id, name, description, vector_db_type, embedding_model, document_count, created_at, updated_at
  - `rag_documents`: id, rag_id, title, content, file_path (nullable), metadata (JSON), embedding_status, created_at, updated_at
  - `available_models`: id, name, display_name, provider, description, max_tokens, cost_per_1k_tokens, is_enabled, has_failures, created_at, updated_at
  - `schedules`: id, user_id, analysis_type_id, schedule_config (cron expression or interval), is_active, last_run_at, next_run_at, created_at, updated_at
- `data_cache`: id, key, payload, fetched_at, ttl_seconds
  - `output_deliveries`: id, run_id, output_type (telegram/email/webhook/file), config (JSON), status, delivered_at, error_message

- Core services
  - **Pipeline Orchestrator**: Executes analysis flows step-by-step, manages context passing between steps
    - Step types: LLM calls, data transformations, API calls, RAG queries, database queries, calculations
    - Context management: Steps can reference outputs from previous steps
    - Error handling: Model failures, API failures, data validation errors
  - **Tool Execution Engine**: Executes user-configured tools
    - Database tools: Execute SQL queries on user-configured databases
    - API tools: Make HTTP requests with user-configured endpoints and authentication
    - RAG tools: Query user's knowledge bases with semantic search
    - Custom tools: Extensible system for user-defined tool types
  - **RAG Service**: Manages knowledge bases and document processing
    - Document ingestion: Upload, URL fetching, API integration
    - Embedding generation: Create vector embeddings for documents
    - Semantic search: Query knowledge bases with natural language
    - Multiple RAGs: Users can create separate knowledge bases by topic
  - **Scheduler**: APScheduler for running analyses on schedule
    - Supports cron expressions and interval-based scheduling
    - Tracks last run and next run times
  - **Output Handlers**: Deliver analysis results in various formats
    - Telegram: Direct messages (current implementation)
    - Email: Send reports via email
    - Webhooks: POST results to user-specified URLs
    - File exports: PDF, JSON, CSV formats

- API (FastAPI)
  - **Analyses**:
    - `GET /api/analyses` → list user's analysis flows (filtered by user_id)
    - `GET /api/analyses/{id}` → get analysis flow details
    - `POST /api/analyses` → create new analysis flow
    - `PUT /api/analyses/{id}` → update analysis flow
    - `DELETE /api/analyses/{id}` → delete analysis flow
    - `POST /api/analyses/{id}/duplicate` → duplicate analysis flow
  - **Runs**:
    - `POST /api/runs` → manual trigger (analysis_type_id, input_params) → `run_id`
    - `GET /api/runs/{id}` → run status + all step outputs
    - `GET /api/runs` → list runs (with filters: analysis_type, status, date range)
  - **Tools**:
    - `GET /api/tools` → list user's tools
    - `POST /api/tools` → create new tool (database/API/RAG)
    - `PUT /api/tools/{id}` → update tool configuration
    - `DELETE /api/tools/{id}` → delete tool
    - `POST /api/tools/{id}/test` → test tool connection/configuration
  - **RAGs**:
    - `GET /api/rags` → list user's RAG knowledge bases
    - `POST /api/rags` → create new RAG
    - `PUT /api/rags/{id}` → update RAG configuration
    - `DELETE /api/rags/{id}` → delete RAG
    - `POST /api/rags/{id}/documents` → upload/add documents to RAG
    - `GET /api/rags/{id}/documents` → list documents in RAG
    - `DELETE /api/rags/{id}/documents/{doc_id}` → delete document
    - `POST /api/rags/{id}/query` → test query RAG
  - **Schedules**:
    - `GET /api/schedules` → list user's scheduled analyses
    - `POST /api/schedules` → create schedule
    - `PUT /api/schedules/{id}` → update schedule
    - `DELETE /api/schedules/{id}` → delete schedule
  - **Outputs**:
    - `POST /api/runs/{id}/export` → export/deliver Summary via configured output handlers (Telegram/email/webhook/file)
    - `GET /api/runs/{id}/summary` → get Summary content
    - `GET /api/runs/{id}/export/{format}` → download Summary in specific format (PDF/JSON/CSV)
  - **System**:
    - `GET /api/models` → list available LLM models
    - `POST /api/models/sync` → sync models from OpenRouter
    - `GET /api/health` → health probe

- Frontend (Next.js)
  - **Analyses Page**: 
    - List view: All user's analysis flows (cards with name, description, last run, status)
    - Create/Edit: Pipeline editor with step-by-step configuration
    - Run: Trigger analysis with input parameters
  - **Tools Page**:
    - List view: All user's tools (databases, APIs, RAGs)
    - Create Tool: Wizard for configuring different tool types
    - Edit Tool: Update tool configuration (connection details, credentials)
    - Test Tool: Verify tool connection/configuration
  - **RAGs Page**:
    - List view: All user's knowledge bases
    - Create RAG: Set up new knowledge base (name, embedding model, topic)
    - Document Management: Upload/manage documents in RAG
    - Query Test: Test semantic search queries
  - **Runs Page**:
    - List view: All analysis runs (with filters)
    - Detail view: Step-by-step timeline with inputs/outputs
    - Export: Download results in various formats
    - Publish: Send results via configured output handlers
  - **Schedules Page**:
    - List view: All scheduled analyses
    - Create Schedule: Configure when to run analyses
    - Edit/Delete: Manage schedules
  - **Settings Page**:
    - LLM Models: Configure available models
    - Output Handlers: Configure Telegram, email, webhooks
    - User Preferences: Profile, notifications

### 3a) UX Specification & Product Architecture

**Navigation Structure:**
- **Home (`/`)**: Landing page with product overview, quick stats, recent activity, quick actions
- **Analyses (`/analyses`)**: Create and manage analysis flows
  - List view: Cards showing all user's analysis flows
  - Detail/Edit view: Pipeline editor with step-by-step configuration
  - Create: Build new analysis flow from scratch or template
- **Tools (`/tools`)**: Manage user-specific tools (databases, APIs, RAGs)
  - List view: All configured tools grouped by type
  - Create Tool: Wizard for setting up new tools
  - Edit Tool: Update tool configuration
- **RAGs (`/rags`)**: Manage knowledge bases and documents
  - List view: All RAG knowledge bases
  - Create RAG: Set up new knowledge base
  - Document Management: Upload, organize, and manage documents
- **Runs (`/runs`)**: View all analysis runs (history, status, results)
- **Schedules (`/schedules`)**: Manage scheduled analysis jobs
- **Settings (`/settings`)**: Configuration management (models, output handlers, preferences)

**Key UX Principles:**
- **Pipeline Transparency**: Users can see complete pipeline configuration before running:
  - Step sequence visualization (drag-and-drop reordering)
  - Step types: LLM, data transformation, API call, RAG query, database query, etc.
  - Tool selection per step (user's configured tools)
  - Context dependencies between steps
  - Estimated cost and duration
- **Tool Reusability**: Tools are configured once, used many times across different analyses
- **Flexibility**: Users can build any research workflow, not limited to specific domains
- **Step-by-Step Verification**: Users can verify each step's output before proceeding
- **User Ownership**: All analyses, tools, and RAGs are user-specific (with optional sharing in future)

**Analyses Page (`/analyses`):**
- **List View**: Card grid showing:
  - Analysis name and description
  - Number of steps
  - Estimated cost range
  - Last run timestamp and status
  - Actions: "Edit", "Run", "View History", "Duplicate", "Delete"
  
- **Detail/Edit View (`/analyses/{id}` or `/analyses/new`)**: 
  - Analysis metadata (name, description, tags/categories)
  - **Pipeline Editor**: Visual step-by-step builder
    - **Step Configuration**:
      - Step type selector (LLM, Data Transform, API Call, RAG Query, Database Query, etc.)
      - Step name and order (drag-and-drop reordering)
      - Tool selection (user's configured tools relevant to step type)
      - Step-specific configuration:
        - LLM steps: Model, system prompt, user prompt template, temperature, max tokens
        - API steps: Endpoint, method, headers, body template
        - RAG steps: RAG selection, query template, result format
        - Database steps: Query template, result processing
        - Transform steps: Transformation logic/script
      - Context inclusion: Select which previous step outputs to include
      - Variable system: `{step_name}_output`, `{input_param}`, `{tool_name}_result`
    - **Tool Integration**: 
      - Dropdown showing user's available tools for each step type
      - "Create New Tool" button opens tool creation wizard
      - Tool test button to verify tool configuration
    - **Validation**: 
      - Real-time validation of variable references
      - Warnings for broken context dependencies
      - Step order validation
  - **Input Parameters**: Define what inputs the analysis accepts (can be used in steps)
  - **Output Configuration**: Define output format and delivery method
  - Actions: "Save", "Run Analysis", "Schedule", "Duplicate"

**Tools Page (`/tools`):**
- **List View**: 
  - Tabs or filters by tool type: Databases, APIs, RAGs, Custom
  - Each tool card shows: Name, type, status (active/inactive), last used, actions
  - Search and filter functionality
  - "Create New Tool" button
  
- **Create/Edit Tool Wizard**:
  - **Step 1: Tool Type Selection**
    - Database (MySQL, PostgreSQL, MongoDB, etc.)
    - API (REST API, GraphQL, etc.)
    - RAG (link to existing RAG knowledge base)
    - Custom (user-defined tool type)
  - **Step 2: Configuration**
    - Database: Connection string, credentials, test connection
    - API: Base URL, authentication (API key, OAuth, etc.), headers
    - RAG: Select from user's RAGs
  - **Step 3: Naming & Description**
    - Tool name (e.g., "Orders Database", "MOEX API", "Company Protocols RAG")
    - Description and tags
  - **Step 4: Test & Save**
    - Test tool connection/configuration
    - Save tool for use in analyses

**RAGs Page (`/rags`):**
- **List View**: 
  - All user's knowledge bases
  - Each card shows: Name, topic, document count, last updated
  - Actions: "Manage Documents", "Query Test", "Edit", "Delete"
  
- **Create/Edit RAG**:
  - Basic info: Name, description, topic/category
  - Embedding model selection
  - Vector database configuration
  
- **Document Management**:
  - Upload documents (PDF, DOCX, TXT, Markdown)
  - URL import (fetch content from URLs)
  - API import (fetch from configured APIs)
  - Document list with preview
  - Search within documents
  - Delete documents
  - Bulk operations
  
- **Query Test**:
  - Test semantic search queries
  - See retrieved documents and relevance scores
  - Preview how RAG will be used in analysis steps

**Runs Page (`/runs`):**
- Dashboard view with filters (analysis type, status, date range)
- Runs table with columns: ID, Analysis Type, Status, Steps Completed, Cost, Created/Finished
- Status badges include:
  - `succeeded` (green) - All steps completed successfully
  - `failed` (red) - Pipeline failed completely
  - `model_failure` (orange) - Partial failure due to model errors (rate limits, not found, etc.)
    - Tooltip shows error details on hover
    - Model automatically marked with `has_failures=True` in database
- Detail view: Timeline with expandable steps, Summary preview, export/publish actions

**Settings Page (`/settings`):**
- Tabbed interface:
  - **LLM Models**: Available models with advanced filtering and syncing capabilities
    - Model syncing from OpenRouter API
    - Model failure tracking and visual indicators
    - Search and filter functionality
    - Enable/disable toggles
  - **Output Handlers**: Configure how Summary is delivered
    - **Telegram**: Bot token, active users, message formatting (split messages ≤4096 chars)
    - **Email**: SMTP configuration, email templates, attachment options
    - **Webhooks**: Configure webhook endpoints, authentication, retry logic
    - **File Exports**: Default export formats (PDF, JSON, CSV) and settings
  - **RAG Settings**: Default embedding models, vector database configuration
  - **OpenRouter Configuration**: API key for OpenRouter (required for LLM calls)
  - **User Preferences**: Profile, theme, timezone, notifications, language
  - **System** (admin): Feature flags, cost limits, system-wide settings

**Pipeline Editor (`/analyses/new` and `/analyses/{id}/edit`):**
- **Purpose**: Allow users to create and manage custom analysis flows with full control over step configuration, tool usage, and context dependencies
- **Access**: All authenticated users can create/edit their own analyses
- **Key Features**:
  - **Analysis Metadata**: Name, description, tags/categories, input parameters definition
  - **Step Management**: Add, remove, reorder steps via drag-and-drop
  - **Step Types**:
    - **LLM Step**: Uses LLM model with prompts (current implementation)
    - **Data Transform Step**: Transform data from previous steps (JSON manipulation, calculations)
    - **API Call Step**: Call external APIs using user-configured API tools
    - **RAG Query Step**: Query user's RAG knowledge bases with semantic search
    - **Database Query Step**: Execute queries on user-configured databases
    - **Custom Step**: User-defined step logic (extensible)
  - **Step Configuration**: Each step can be configured with:
    - Step type selection
    - Step name (unique identifier)
    - Tool selection (relevant tools for step type)
    - Step-specific configuration:
      - LLM: Model, system prompt, user prompt template, temperature, max tokens
      - API: Endpoint path, HTTP method, headers, body template
      - RAG: RAG selection, query template, result format
      - Database: Query template, result processing
      - Transform: Transformation script/logic
    - Context inclusion: Select which previous step outputs to include
    - Variable system: `{step_name}_output`, `{input_param}`, `{tool_name}_result`
  - **Tool Integration**: 
    - Dropdown showing user's available tools for each step type
    - "Create New Tool" button opens tool creation wizard
    - Tool test functionality
  - **Variable Palette**: Click-to-insert variable palette showing:
    - Input parameters: `{param_name}` (from analysis input definition)
    - Previous step outputs: `{step_name}_output` (dynamically generated)
    - Tool results: `{tool_name}_result` (when tool is used in step)
  - **Smart Validation**: 
    - Detects broken variable references when steps are reordered
    - Warns if steps reference outputs from steps that come after them
    - Validates tool availability and configuration
    - Shows warnings in real-time during drag-and-drop
  - **Output Configuration**: 
    - Define output format (text, JSON, structured data)
    - Configure output handlers (Telegram, email, webhook, file export)
  - **Save/Cancel**: Save creates/updates analysis; Cancel navigates back to analyses list

**Design Patterns:**
- Left sidebar navigation (or top nav bar for MVP)
- Dark-first theme
- Timeline + accordions for steps
- Status badges with colors (green=succeeded, blue=running, red=failed, yellow=queued, orange=model_failure)
- Expandable sections for prompts/outputs
- Copy-to-clipboard functionality
- Real-time updates while pipeline runs (polling every 2s)
- All UI text in Russian
- Instrument filtering hints ("Показаны только инструменты, подходящие для данного типа анализа")
- Custom Select component for model dropdowns (cross-platform compatibility, proper failure indicators)
- Tooltip components for error messages (Bootstrap-like styling with Tailwind CSS)
- Drag-and-drop step reordering with visual feedback
- Warning dialogs with Cancel buttons for validation errors


### 4) Analysis Types and Pipelines

The system supports multiple analysis types, each optimized for specific asset classes:

**Available Analysis Types:**
1. **Дневной анализ (Daystart Analysis)** - General-purpose analysis for any instrument
2. **Анализ товарных фьючерсов (Commodity Futures Analysis)** - MOEX commodity futures focused
3. **Анализ криптовалют (Crypto Analysis)** - Cryptocurrency markets (24/7, high volatility)
4. **Анализ акций (Equity Analysis)** - Stock markets with fundamental context

**Common Pipeline Structure:**
All analysis types use the same 6-7 step pipeline:
1. Wyckoff - Market phase identification
2. SMC - Structure and liquidity analysis
3. VSA - Volume spread analysis
4. Delta - Buying/selling pressure
5. ICT - Liquidity manipulation and entry zones
6. Price Action/Patterns - Chart patterns and candlestick formations (for commodity/crypto/equity)
7. Merge - Combine all analyses into final Telegram post

**Instrument Filtering:**
- Each analysis type automatically filters available instruments:
  - Commodity Futures → MOEX exchange only
  - Crypto Analysis → crypto type only
  - Equity Analysis → equity type, excluding MOEX
  - Daystart → all instruments

### 4e) User-Created Pipelines (Pipeline Editor)

**Overview:**
Users can create, edit, and manage their own custom analysis pipelines using the Pipeline Editor. This enables maximum flexibility - users can build any pipeline workflow, not just trading-related ones.

**Architecture:**
- **Database Schema**: 
  - `analysis_types` table includes `user_id` (nullable, FK to users) and `is_system` (boolean) columns
  - System pipelines (`is_system=true`, `user_id=NULL`) are predefined templates
  - User pipelines (`is_system=false`, `user_id=current_user.id`) are custom pipelines
- **Step Configuration Structure**:
  - Each step has: `step_name`, `order`, `step_type`, `system_prompt`, `user_prompt_template`, `model`, `temperature`, `max_tokens`, `tool_id`, `include_context`, `is_summary` (marks step that produces final summary)
  - Steps are stored as JSON array in `analysis_types.config.steps`
  - Steps sorted by `order` field during execution
- **Dynamic Execution**:
  - Pipeline builds step list dynamically from config (not hardcoded)
  - Steps mapped to executor classes based on step_type (LLM, API, RAG, Database, Transform)
  - Context inclusion: Steps can optionally include output from previous steps via `include_context` config
  - Summary: Step marked with `is_summary: true` produces the final output that can be exported via output handlers

**Key Features:**
1. **Step Flexibility**: All steps are generic LLM calls - no functional difference except prompts
2. **Context Management**: 
   - Steps can reference previous step outputs via `{step_name}_output` variables
   - Optional context inclusion via checkboxes (no template syntax required)
   - Smart detection: Automatically detects step references in prompts
   - Manual override: Users can manually select which steps to include
3. **Step Reordering**: 
   - Drag-and-drop UI for reordering steps
   - Real-time validation: Warns if reordering breaks variable references
   - Auto-updates context dependencies when steps are reordered
4. **Variable System**:
   - Standard variables: `{instrument}`, `{timeframe}`, `{market_data_summary}`
   - Dynamic variables: `{step_name}_output` for any previous step
   - Variable palette: Click-to-insert UI showing all available variables
   - Validation: Checks variable references on save/reorder
5. **Summary Step**:
   - Any step can be marked as the Summary step (produces final output)
   - Summary can be exported via multiple output handlers (Telegram, email, webhook, file)
   - If multiple steps are marked as summary, only the last one is used (with warning)
   - Summary format is configurable per analysis

**Access Control:**
- **System Pipelines**: Read-only for regular users (can duplicate, can't edit)
- **User Pipelines**: Full edit access (only by owner)
- **Admin**: Can edit any pipeline (system or user)
- **Duplicate**: Users can duplicate system pipelines to create their own copies

**Navigation Flow:**
- `/analyses` → "Create New Pipeline" button → `/pipelines/new` (fresh empty pipeline)
- `/analyses` → Click user pipeline → "Edit Pipeline" → `/pipelines/{id}/edit`
- `/analyses` → Click system pipeline → "Duplicate" → Creates user copy → `/pipelines/{id}/edit`
- `/settings` → "Analysis Types Configuration" → Edit system pipeline defaults (admin-only)

**Backend Implementation:**
- **API Endpoints**:
  - `GET /api/analyses` - List all pipelines (filtered by `user_id`, `is_system`)
  - `GET /api/analyses/my` - List user's own pipelines
  - `GET /api/analyses/system` - List system pipelines
  - `POST /api/analyses` - Create new user pipeline
  - `PUT /api/analyses/{id}` - Update pipeline (with access control)
  - `DELETE /api/analyses/{id}` - Delete pipeline (with access control)
  - `POST /api/analyses/{id}/duplicate` - Duplicate pipeline (creates user copy)
- **Pipeline Execution**:
  - `AnalysisPipeline` class builds steps dynamically from config
  - Steps sorted by `order` field before execution
  - Context built from previous step outputs based on `include_context` config
  - Summary step identified by `is_summary: true` flag (fallback to "merge" step name for backward compatibility)

**Migration:**
- Existing analysis types migrated to include:
  - `order` field for each step (1-indexed)
  - `is_summary: true` for summary steps (previously merge steps)
  - `include_context` for ICT steps (references Wyckoff + SMC)
  - `include_context` for merge steps (references all previous steps)
  - All existing analyses marked as `is_system: true`

**Use Cases:**
1. **Custom Trading Pipelines**: Users create specialized analysis workflows for their trading style
2. **Non-Trading Pipelines**: Users can build any LLM workflow (translation, content generation, etc.)
3. **Pipeline Templates**: System pipelines serve as templates that users can duplicate and customize
4. **Experimental Workflows**: Users can experiment with different step orders and configurations

**Future Enhancements:**
- Pipeline sharing between users
- Pipeline versioning/history
- Pipeline templates marketplace
- Advanced context formatting options
- Step validation and quality checks

### 4a) Example Analysis Flows (Templates)

The current trading analysis flows serve as **examples/templates** that demonstrate the platform's capabilities. Users can:
- Use them as-is for financial analysis
- Duplicate and modify them for their needs
- Create completely new flows for any domain

**Example: Financial Market Analysis** (Current Implementation)
- Demonstrates: Multi-step LLM analysis, data source integration, structured outputs
- Steps: Market data retrieval → LLM analysis steps → Final report generation
- Can be adapted for: Any market analysis, competitive intelligence, trend analysis

**Example: Business Intelligence Flow** (Future Template)
- Steps: Query sales database → Fetch market data API → LLM analysis → Generate report
- Demonstrates: Database tools, API tools, data transformation

**Example: Compliance Monitoring Flow** (Future Template)
- Steps: Query RAG with regulations → Check current data → LLM comparison → Generate compliance report
- Demonstrates: RAG tools, data validation, structured reporting

**Example: Research Report Flow** (Future Template)
- Steps: Query multiple data sources → RAG query for context → LLM synthesis → Format report
- Demonstrates: Multi-source integration, RAG usage, output formatting

Users can create any flow they need - the platform is domain-agnostic.

**LLM Usage:**
  - System prompt defines role, output rules, style.
- Each step uses structured prompt with any computed context (from previous steps, tools, RAGs).
  - Record model used, token counts, and estimated cost.
  - Default model is configurable; routed through OpenRouter for easy switching.


### 5) APIs (initial)

- `POST /runs`
  - Body: `{ instrument, timeframe, options }`
  - Result: `{ run_id }`
- `GET /runs/{id}`
  - Result: `{ status, steps: [{name, input, output, model, tokens}], final_post }`
- `POST /runs/{id}/publish`
  - Sends final post to configured Telegram channel; returns `{ status, message_id }`
- `GET /instruments`
  - Returns supported instruments and exchanges
- `GET /health`


### 6) Tools System

**Tool Types:**
- **Database Tools**: User-configured database connections
  - MySQL, PostgreSQL, MongoDB, etc.
  - Connection string, credentials stored securely (encrypted)
  - Test connection functionality
  - Example: User configures "Orders DB" → can use in analysis steps to query orders
- **API Tools**: User-configured API clients
  - REST APIs, GraphQL endpoints
  - Authentication: API keys, OAuth, Basic Auth
  - Base URL, headers, request templates
  - Example: User configures "MOEX API" with their API key → can use in steps to fetch market data
- **RAG Tools**: Link to user's RAG knowledge bases
  - Each RAG is a tool that can be used in analysis steps
  - Semantic search queries return relevant document context
  - Example: User creates "Company Protocols RAG" → can query it in steps for protocol information
- **Custom Tools**: Extensible system for user-defined tool types
  - Future: Plugin system for custom tool implementations

**Tool Configuration:**
- Tools are user-specific (stored in `user_tools` table)
- Configuration includes connection details, credentials (encrypted)
- Tools can be tested before use
- Tools are reusable across multiple analyses
- Tools can be enabled/disabled

**Legacy Data Adapters** (Current Implementation - to be migrated to Tools):
- CCXT (crypto): Will become user-configurable API tool
- yfinance (equities): Will become user-configurable API tool  
- Tinkoff Invest API (MOEX): Will become user-configurable API tool
- These will be available as example/template tools that users can duplicate and configure


### 7) Scheduling

- APScheduler in backend
  - Daily job (“daystart”) at configured time(s)
  - Future: additional interval jobs (hourly/1m/5m) per instrument
  - Jobs enqueue internal “run” creation the same way as manual triggers


### 8) Summary and Output Handlers

**Summary Concept:**
- Instead of a specific "Telegram post" step, analyses produce a **Summary** (final output)
- The Summary is the consolidated result of all analysis steps
- Summary can be exported/delivered via multiple output handlers
- Users configure which output handlers to use for each analysis

**Output Handlers:**
- **Telegram**: Direct messages to users (current implementation)
  - Bot token stored in user settings or `config_local.py`
- Split messages into ≤4096 characters
- Retry policy: exponential backoff on rate limits (429) and transient errors
- **Email**: Send analysis results via email
  - SMTP configuration per user
  - Email templates
  - Attachments support (PDF, JSON exports)
- **Webhooks**: POST results to user-specified URLs
  - Custom headers, authentication
  - Retry logic for failed deliveries
- **File Exports**: Download results in various formats
  - PDF reports
  - JSON data
  - CSV exports
  - Custom formats

**Summary Configuration:**
- Users mark which step produces the Summary (typically the last step or a dedicated summary step)
- Summary format is configurable (text, structured data, formatted report)
- Multiple output handlers can be configured per analysis
- Output handlers are configured in Settings and selected per analysis


### 9) Deployment (Single VM, no Docker)

- Directory layout
  - `/srv/research-flow/` (monorepo git repo)
    - `backend/` (Python venv at `backend/.venv/`)
    - `frontend/`
    - `scripts/` (deployment scripts)
  - `/srv/research-flow/scripts/deploy.sh` (pulls entire repo)
  - `/srv/research-flow/scripts/restart_backend.sh` (updates backend deps, migrations, restarts)
  - `/srv/research-flow/scripts/restart_frontend.sh` (updates frontend deps, builds, restarts)

- Systemd units
  - `research-flow-backend.service`: runs Uvicorn with 2 workers, working dir `/srv/research-flow/backend`
  - `research-flow-frontend.service`: runs `npm run start -- --port 3000` in `/srv/research-flow/frontend`

- Deploy scripts (manual run after push)
  - Step 1: `./scripts/deploy.sh` - Complete deployment preparation:
    - Pulls latest changes from `origin/main` (or current branch)
    - Updates backend dependencies (`requirements.txt`)
    - Runs database migrations (`alembic upgrade head`)
    - Updates frontend dependencies (`package.json`)
    - Builds frontend for production (`npm run build`)
  - Step 2: `./scripts/restart_backend.sh` - Restarts backend service (syncs deps/migrations if needed)
  - Step 3: `./scripts/restart_frontend.sh` - Restarts frontend service (rebuilds if needed)

- Environment
  - Backend binds to `0.0.0.0:8000`
  - Frontend binds to `0.0.0.0:3000`; API base URL is centralized in `frontend/lib/config.ts` and automatically matches the current hostname (e.g., `http://localhost:8000` when visiting `http://localhost:3000`). For local scripts (`start_all.sh`), prefer `http://localhost:3000` consistently.
  - Reverse proxy optional for MVP; can add Nginx/Caddy later for TLS/domains
  - MySQL connection configured in `app/config_local.py` (local dev DB and prod DB endpoints)

### 10a) Authentication and User Accounts

- Requirements
  - Email/password login; roles: `admin`, `trader` (viewer).
  - Session cookie (HttpOnly, secure in prod), server-side validation; no tokens stored in frontend.
  - Endpoints: `/auth/login`, `/auth/logout`, `/auth/me` (profile), `/auth/register` (admin only).
  - Passwords hashed with bcrypt; rate limiting on login.
  - Protected routes: publish to Telegram, Settings, scheduler changes (admin only).
  - Tables: `users` (id, email, hashed_password, role, created_at, last_login_at), optional `user_sessions`.

- Frontend
  - Login page; guard protected pages; show current user and role.
  - Error states and lockouts; logout action.

#### 10b) Local Auth Flow Notes & Troubleshooting (Dev)

- Standard session auth
  - Backend sets `researchflow_session` as an HttpOnly cookie with `SameSite=lax`, `Path=/` (set `secure=True` in production over HTTPS).
  - Frontend checks auth via `GET /api/auth/me` only on protected routes; public routes (`/`, `/login`) do not trigger the check.
- Single source of API base URL
  - `frontend/lib/config.ts` exports `API_BASE_URL` which derives from `window.location.hostname` when env is not set. This keeps cookies same‑site in dev (avoids `localhost` vs `127.0.0.1` mismatches).
  - Actionable rule: when using `scripts/start_all.sh`, open the app at `http://localhost:3000` (backend runs at `http://localhost:8000`). Avoid mixing with `127.0.0.1`.
- Navigation behavior
  - `Navigation` skips `useAuth()` on `/` and `/login` to avoid unnecessary requests on public pages.
- When configs change
  - Restart the frontend dev server to pick up changes to `API_BASE_URL` or auth hooks.
- Quick troubleshooting
  - If reload logs you out: ensure FE page host equals BE request host; verify `/api/auth/login` response includes `Set-Cookie`; confirm cookie appears under the matching host in DevTools; clear cookies for the other host and stick to one (`localhost` recommended with `start_all.sh`); restart the FE dev server.

### 10) Security and Observability

- Secrets only on server in `config_local.py` (never committed)
- Log aggregation: journald via `journalctl -u ...`
- Basic request/step logging with structlog; redact secrets
- Health endpoint for uptime checks




### 13) Risk Log and Mitigations

- Model variance / provider outages
  - Route via OpenRouter to switch models/providers quickly; keep step prompts deterministic.
  - **Model Failure Tracking**: Automatically mark models with failures (rate limits, not found errors) to prevent repeated use
  - Failed models visually indicated in all dropdowns; admin can disable them in Settings
  - Pipeline stops immediately on model errors to prevent wasted resources
- Cost control
  - Record tokens; add caps/alerts; prefer concise prompts; cache data.
- Data quality/latency
  - Cache OHLCV briefly; retry on provider errors; support switching providers.
- Telegram limits
  - Implement message splitting and backoff.
- Single-VM limits
  - Keep concurrency modest; consider moving to a process manager pool if needed.


### 11) Implementation Plan - Phased Development

This section outlines the detailed plan to implement the new general-purpose research platform concept in controlled, testable phases.

#### Phase 0: Foundation & User Management (Prerequisites)

**Goal**: Set up user management, roles, and admin capabilities before building the core research features.

**0.1) User Roles & Authentication Enhancement**
- [ ] **Roles System**:
  - Current: Basic admin/user distinction
  - New: `admin`, `user`, `org_admin` (organization admin), `org_user` (organization member)
  - Database: Add `role` enum field to `users` table
  - Migration: Update existing users, add role constraints
- [ ] **Registration Flow**:
  - Public registration endpoint (`POST /api/auth/register`)
  - Email verification (optional for MVP, can be added later)
  - Default role: `user` (can be changed by admin)
  - Admin can enable/disable public registration
- [ ] **Index Page (Pre-Login)**:
  - Landing page with product overview
  - "Sign Up" and "Sign In" buttons
  - Public information about platform capabilities
  - No authentication required
- [ ] **User Settings Page** (`/settings`):
  - Profile: Name, email, password change
  - Preferences: Theme, language, timezone, notifications
  - API Keys: OpenRouter API key (user-specific)
  - Feature Toggles: Which features user can access (for future pricing)
- [ ] **Admin Settings Page** (`/admin/settings`):
  - Platform Configuration:
    - Enable/disable public registration
    - Default user role for new registrations
    - Platform-wide feature flags
  - System Limits:
    - Max pipelines per user
    - Max runs per day/month
    - Max tokens per user
  - Global API Keys: Fallback OpenRouter key (if user doesn't have one)

**0.2) Organization & Multi-Tenancy**
- [ ] **Organizations Table**:
  - `organizations`: id, name, slug, owner_id, created_at, updated_at
  - `organization_members`: id, organization_id, user_id, role (org_admin/org_user), invited_by, joined_at
  - `organization_invitations`: id, organization_id, email, token, role, invited_by, expires_at, accepted_at
- [ ] **Organization Management**:
  - Users can create organizations
  - Organization admins can invite users (email invitations)
  - Invited users can accept invitations
  - Organization admins can manage members (remove, change roles)
  - Users can belong to multiple organizations
- [ ] **Resource Ownership**:
  - Analyses, Tools, RAGs can belong to:
    - User (personal)
    - Organization (shared within org)
  - Add `organization_id` (nullable) to relevant tables
  - Access control: Users can access org resources if they're members

**0.3) Feature Enablement System**
- [ ] **User Features Table**:
  - `user_features`: id, user_id, feature_name, enabled, expires_at (nullable)
  - Features: `local_llm`, `openrouter`, `rag`, `api_tools`, `database_tools`, `scheduling`, `webhooks`
- [ ] **Feature Checks**:
  - Middleware/helpers to check if user has feature enabled
  - UI: Show/hide features based on user's enabled features
  - API: Return 403 if user tries to use disabled feature
- [ ] **Admin Feature Management**:
  - Admin can enable/disable features per user
  - Admin can set feature expiration dates
  - Admin can enable features for entire organization

**0.4) Admin Dashboard - User Management**
- [ ] **Users List Page** (`/admin/users`):
  - Table with columns: Name, Email, Role, Organization, Status, Created, Actions
  - Filters: Role, Organization, Status (active/inactive)
  - Search by name/email
  - Actions: Edit, Disable/Enable, Delete, View Details
- [ ] **User Details Page** (`/admin/users/{id}`):
  - User Profile: Name, email, role, organization memberships
  - **Statistics**:
    - Tokens used (total, this month)
    - Pipelines created (total, active)
    - Runs executed (total, this month, succeeded/failed)
    - Tools created (total, active)
    - RAGs created (total, documents)
  - **Feature Management**: Enable/disable features, set expiration
  - **Activity Log**: Recent runs, pipeline creations, etc.
- [ ] **Bulk Operations**:
  - Enable/disable features for multiple users
  - Assign users to organizations
  - Export user statistics

**Testing Checklist for Phase 0**:
- [ ] Can register new user
- [ ] Can login/logout
- [ ] Index page shows without login
- [ ] User settings page works
- [ ] Admin can access admin settings
- [ ] Can create organization
- [ ] Can invite user to organization
- [ ] Invited user can accept invitation
- [ ] Feature enablement works (can't access disabled features)
- [ ] Admin can view user statistics

---

#### Phase 1: Tools System (Foundation for Data Sources)

**Goal**: Replace hardcoded data adapters with user-configurable tools system.

**1.1) Database Schema**
- [ ] **User Tools Table**:
  - `user_tools`: id, user_id, organization_id (nullable), tool_type, name, display_name, config (JSON), is_active, created_at, updated_at
  - Tool types: `database`, `api`, `rag` (RAG will be separate table, but linked as tool)
- [ ] **Tool Configuration Schema**:
  - Database tools: `{connection_string, host, port, database, username, password_encrypted, ssl_mode}`
  - API tools: `{base_url, auth_type, api_key, headers, timeout}`
  - RAG tools: `{rag_id}` (references rag_knowledge_bases)
- [ ] **Migration**:
  - Create `user_tools` table
  - Migrate existing data adapters to example tools (system tools)
  - Create example tools for users to duplicate

**1.2) Backend - Tool Management API**
- [ ] **Tool CRUD Endpoints**:
  - `GET /api/tools` - List user's tools (filtered by user_id, organization_id)
  - `POST /api/tools` - Create new tool
  - `GET /api/tools/{id}` - Get tool details
  - `PUT /api/tools/{id}` - Update tool
  - `DELETE /api/tools/{id}` - Delete tool
  - `POST /api/tools/{id}/test` - Test tool connection
- [ ] **Tool Execution Engine**:
  - `ToolExecutor` class with methods per tool type
  - Database executor: Execute SQL queries safely
  - API executor: Make HTTP requests with auth
  - RAG executor: Query knowledge base (Phase 2)
  - Error handling and validation

**1.3) Frontend - Tools Management UI**
- [ ] **Tools List Page** (`/tools`):
  - List all user's tools (personal + organization)
  - Filter by type (Database, API, RAG)
  - Search functionality
  - Actions: Create, Edit, Delete, Test, Duplicate
- [ ] **Create/Edit Tool Wizard**:
  - Step 1: Select tool type
  - Step 2: Configure tool (type-specific form)
  - Step 3: Test connection
  - Step 4: Name and save
- [ ] **Tool Integration in Pipeline Editor**:
  - Step configuration shows tool selector dropdown
  - Filter tools by step type (e.g., API steps show only API tools)
  - "Create New Tool" button opens tool wizard

**1.4) Migration from Data Adapters**
- [ ] **Create Example Tools**:
  - Convert CCXT adapter → "Binance API" example tool
  - Convert yfinance adapter → "Yahoo Finance API" example tool
  - Convert Tinkoff adapter → "Tinkoff Invest API" example tool
- [ ] **Update Pipeline Execution**:
  - Modify step execution to use tools instead of hardcoded adapters
  - Update existing analyses to use example tools
  - Maintain backward compatibility during transition

**Testing Checklist for Phase 1**:
- [ ] Can create database tool
- [ ] Can create API tool
- [ ] Tool test connection works
- [ ] Can use tool in analysis step
- [ ] Tool execution works in pipeline
- [ ] Example tools available for users

---

#### Phase 2: RAG System (Knowledge Bases)

**Goal**: Enable users to create and manage knowledge bases for use in analysis steps.

**2.1) Database Schema**
- [ ] **RAG Knowledge Bases Table**:
  - `rag_knowledge_bases`: id, user_id, organization_id (nullable), name, description, vector_db_type, embedding_model, document_count, created_at, updated_at
- [ ] **RAG Documents Table**:
  - `rag_documents`: id, rag_id, title, content, file_path (nullable), metadata (JSON), embedding_status, created_at, updated_at
- [ ] **Vector Storage**:
  - Choose vector DB: ChromaDB (local) or Qdrant (can be remote)
  - Store embeddings per document
  - Index for semantic search

**2.2) Backend - RAG Management API**
- [ ] **RAG CRUD Endpoints**:
  - `GET /api/rags` - List user's RAGs
  - `POST /api/rags` - Create new RAG
  - `GET /api/rags/{id}` - Get RAG details
  - `PUT /api/rags/{id}` - Update RAG config
  - `DELETE /api/rags/{id}` - Delete RAG
- [ ] **Document Management Endpoints**:
  - `POST /api/rags/{id}/documents` - Upload/add documents
  - `GET /api/rags/{id}/documents` - List documents
  - `DELETE /api/rags/{id}/documents/{doc_id}` - Delete document
  - `POST /api/rags/{id}/documents/bulk` - Bulk upload
- [ ] **RAG Query Endpoint**:
  - `POST /api/rags/{id}/query` - Query RAG with semantic search
  - Returns: Relevant document chunks with relevance scores

**2.3) Document Processing**
- [ ] **File Upload Handler**:
  - Accept: PDF, DOCX, TXT, Markdown
  - Extract text from files
  - Chunk documents for optimal embedding
- [ ] **Embedding Generation**:
  - Use configured embedding model (OpenAI, local model)
  - Generate embeddings for document chunks
  - Store in vector database
- [ ] **URL Import**:
  - Fetch content from URLs
  - Extract text from HTML
  - Process as documents

**2.4) Frontend - RAG Management UI**
- [ ] **RAGs List Page** (`/rags`):
  - List all user's RAGs
  - Show: Name, document count, last updated
  - Actions: Create, Manage Documents, Query Test, Delete
- [ ] **Create/Edit RAG Page**:
  - Basic info: Name, description, topic
  - Embedding model selection
  - Vector DB configuration
- [ ] **Document Management Page** (`/rags/{id}/documents`):
  - Upload documents (drag-and-drop)
  - URL import
  - Document list with preview
  - Search within documents
  - Delete documents
- [ ] **Query Test Interface**:
  - Test semantic search queries
  - See retrieved documents and scores
  - Preview how RAG will be used in steps

**2.5) RAG Integration in Pipeline**
- [ ] **RAG Query Step Type**:
  - Add `rag_query` step type
  - Configuration: RAG selection, query template, result format
  - Execute: Query RAG, return relevant context
  - Use context in subsequent LLM steps

**Testing Checklist for Phase 2**:
- [ ] Can create RAG knowledge base
- [ ] Can upload documents (PDF, DOCX, TXT)
- [ ] Can import from URL
- [ ] Documents are processed and embedded
- [ ] Can query RAG with semantic search
- [ ] Can use RAG in analysis step
- [ ] RAG context flows to LLM steps correctly

---

#### Phase 3: Enhanced Step Types & Pipeline Editor

**Goal**: Expand step types beyond LLM, improve pipeline editor UX.

**3.1) New Step Types**
- [ ] **Data Transform Step**:
  - Transform data from previous steps
  - JSON manipulation, calculations, filtering
  - Configuration: Transformation script/logic
- [ ] **API Call Step**:
  - Call external APIs using API tools
  - Configuration: Tool selection, endpoint, method, headers, body template
  - Error handling and retries
- [ ] **Database Query Step**:
  - Execute queries on database tools
  - Configuration: Tool selection, query template, result processing
  - Safety: Read-only queries (or configurable)
- [ ] **RAG Query Step** (from Phase 2):
  - Query RAG knowledge bases
  - Use retrieved context in subsequent steps

**3.2) Pipeline Editor Enhancements**
- [ ] **Step Type Selector**:
  - Dropdown to select step type when adding step
  - Type-specific configuration forms
- [ ] **Tool Integration**:
  - Tool selector per step (filtered by step type)
  - "Create New Tool" button in step config
  - Tool test button
- [ ] **Variable System Enhancement**:
  - Add `{tool_name}_result` variables
  - Variable palette shows all available variables
  - Validation for variable references
- [ ] **Summary Step Configuration**:
  - Mark step as Summary (produces final output)
  - Configure output format (text, JSON, structured)
  - Configure output handlers (Telegram, email, webhook, file)

**3.3) Input Parameters System**
- [ ] **Analysis Input Definition**:
  - Define what inputs analysis accepts
  - Input types: text, number, select, date, etc.
  - Default values, validation rules
- [ ] **Input Usage in Steps**:
  - Steps can reference input parameters via `{input_param_name}`
  - Inputs passed when running analysis
  - UI: Form to provide inputs before running

**Testing Checklist for Phase 3**:
- [ ] Can create analysis with multiple step types
- [ ] Can configure each step type correctly
- [ ] Can use tools in steps
- [ ] Variables work correctly (step outputs, tool results, inputs)
- [ ] Can mark Summary step
- [ ] Can define input parameters
- [ ] Pipeline executes correctly with all step types

---

#### Phase 4: Output Handlers & Summary System

**Goal**: Replace Telegram-specific publishing with flexible Summary export system.

**4.1) Summary Concept Implementation**
- [ ] **Summary Step Marking**:
  - Add `is_summary` flag to step config
  - Pipeline execution identifies Summary step
  - Store Summary output separately
- [ ] **Summary Storage**:
  - Add `summary` field to `analysis_runs` table
  - Store Summary output and format
  - Link Summary to output deliveries

**4.2) Output Handlers System**
- [ ] **Output Handlers Table**:
  - `output_handlers`: id, user_id, handler_type, name, config (JSON), is_active
  - Handler types: `telegram`, `email`, `webhook`, `file`
- [ ] **Handler Configuration**:
  - Telegram: Bot token, user list, message formatting
  - Email: SMTP config, recipients, templates
  - Webhook: URL, auth, headers, retry logic
  - File: Format (PDF/JSON/CSV), storage location
- [ ] **Output Delivery**:
  - `output_deliveries`: id, run_id, handler_id, status, delivered_at, error_message
  - Track delivery status per handler
  - Retry logic for failed deliveries

**4.3) Backend - Output Handler API**
- [ ] **Handler Management**:
  - `GET /api/output-handlers` - List user's handlers
  - `POST /api/output-handlers` - Create handler
  - `PUT /api/output-handlers/{id}` - Update handler
  - `DELETE /api/output-handlers/{id}` - Delete handler
- [ ] **Summary Export**:
  - `POST /api/runs/{id}/export` - Export Summary via handlers
  - `GET /api/runs/{id}/summary` - Get Summary content
  - `GET /api/runs/{id}/export/{format}` - Download in format

**4.4) Frontend - Output Handler UI**
- [ ] **Output Handlers Page** (`/settings/output-handlers`):
  - List all handlers
  - Create/edit handlers
  - Test handlers
- [ ] **Run Detail Page Updates**:
  - Show Summary preview (instead of Telegram post)
  - "Export Summary" button
  - Select handlers for export
  - Export history

**4.5) Migration from Telegram**
- [ ] **Migrate Existing Telegram Config**:
  - Convert Telegram config to output handler
  - Update existing analyses to use Summary + Telegram handler
  - Maintain backward compatibility

**Testing Checklist for Phase 4**:
- [ ] Can create output handlers (Telegram, email, webhook, file)
- [ ] Can mark Summary step in analysis
- [ ] Summary is generated correctly
- [ ] Can export Summary via multiple handlers
- [ ] Delivery tracking works
- [ ] Retry logic works for failed deliveries

---

#### Phase 5: Scheduling & Advanced Features

**Goal**: Add scheduling, advanced pipeline features, and polish.

**5.1) Scheduling System**
- [ ] **Schedules Table**:
  - `schedules`: id, user_id, analysis_type_id, schedule_config (cron/interval), is_active, last_run_at, next_run_at
- [ ] **Scheduler Integration**:
  - APScheduler for cron/interval jobs
  - Schedule management API
  - UI for creating/managing schedules
- [ ] **Schedule Execution**:
  - Run analyses automatically
  - Handle failures and retries
  - Log schedule execution

**5.2) Advanced Pipeline Features**
- [ ] **Conditional Steps**:
  - Steps can have conditions (if/else logic)
  - Skip steps based on previous step outputs
- [ ] **Parallel Execution**:
  - Run multiple steps in parallel
  - Merge results
- [ ] **Error Handling**:
  - Better error messages
  - Retry logic per step
  - Failure notifications

**5.3) Analytics & Statistics**
- [ ] **User Dashboard**:
  - Personal statistics (runs, pipelines, tools, RAGs)
  - Usage charts
  - Cost tracking
- [ ] **Admin Analytics**:
  - Platform-wide statistics
  - User activity
  - Feature usage
  - Cost analysis

**Testing Checklist for Phase 5**:
- [ ] Can create schedules
- [ ] Schedules execute automatically
- [ ] Conditional steps work
- [ ] Analytics display correctly
- [ ] Cost tracking accurate

---

### 12) Notes

- OpenRouter provides a unified OpenAI-compatible interface to many models which simplifies switching and increases availability: `https://openrouter.ai/`.
- This document is the living source of truth for the Research Flow platform architecture and vision.
- **Development Approach**: Each phase should be fully tested before moving to the next. Use feature flags to enable/disable new features during development.


