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
    - `POST /api/runs/{id}/publish` → publish run results (Telegram/email/webhook)
    - `GET /api/runs/{id}/export` → export run results (PDF/JSON/CSV)
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
- Dashboard view with filters (analysis type, status, instrument, date range)
- Runs table with columns: ID, Analysis Type, Instrument, Timeframe, Status, Steps Completed, Cost, Created/Finished
- Status badges include:
  - `succeeded` (green) - All steps completed successfully
  - `failed` (red) - Pipeline failed completely
  - `model_failure` (orange) - Partial failure due to model errors (rate limits, not found, etc.)
    - Tooltip shows error details on hover
    - Model automatically marked with `has_failures=True` in database
- Detail view: Timeline with expandable steps, final Telegram post preview, publish button

**Settings Page (`/settings`):**
- Tabbed interface:
  - **LLM Models**: Available models with advanced filtering and syncing capabilities
    - Model syncing from OpenRouter API
    - Model failure tracking and visual indicators
    - Search and filter functionality
    - Enable/disable toggles
  - **Output Handlers**: Configure how analysis results are delivered
    - **Telegram**: Bot token, active users, message formatting
    - **Email**: SMTP configuration, email templates
    - **Webhooks**: Configure webhook endpoints for different analysis types
    - **File Exports**: Default export formats and settings
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
  - Each step has: `step_name`, `order`, `system_prompt`, `user_prompt_template`, `model`, `temperature`, `max_tokens`, `num_candles`, `include_context`, `publish_to_telegram`
  - Steps are stored as JSON array in `analysis_types.config.steps`
  - Steps sorted by `order` field during execution
- **Dynamic Execution**:
  - Pipeline builds step list dynamically from config (not hardcoded)
  - Steps mapped to analyzer classes: standard steps (Wyckoff, SMC, etc.) use specific analyzers; custom steps use `GenericLLMAnalyzer`
  - Context inclusion: Steps can optionally include output from previous steps via `include_context` config
  - Publishing: Any step can be publishable (marked with `publish_to_telegram: true`)

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
5. **Publishing Flexibility**:
   - Any step can be marked as publishable to Telegram
   - No special "Merge" step type - users create their own final steps
   - If multiple steps are publishable, only the last one is published (with warning)

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
  - Publishing finds steps with `publish_to_telegram: true` (fallback to "merge" for backward compatibility)

**Migration:**
- Existing analysis types migrated to include:
  - `order` field for each step (1-indexed)
  - `publish_to_telegram: true` for merge steps
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


### 8) Output Handlers

**Output Types:**
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

**Output Configuration:**
- Users configure output handlers in Settings
- Each analysis can specify which output handlers to use
- Multiple outputs can be configured per analysis


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


### 11) Milestones with Acceptance Criteria

1) Foundation (1–2 days) ✅ **COMPLETED**
   - Backend skeleton (FastAPI app with `/health`)
   - MySQL wiring (SQLAlchemy models) and Alembic initialized with baseline migration
   - Frontend skeleton (Next.js app + Tailwind + simple page)
   - Local config examples prepared
   - Local MySQL database created (`research_flow_dev`)
   - Alembic migrations applied (all tables created)
   - Start/stop automation scripts (`start_all.sh`, `stop_all.sh`)
   - Acceptance:
     - `GET /health` returns 200. ✅
     - Alembic baseline applies successfully to local MySQL. ✅
     - Frontend renders and fetches `/health`. ✅
     - Both servers start/stop via scripts. ✅

2) Data adapters (1–2 days)
   - CCXT and yfinance adapters returning normalized OHLCV for given instrument/timeframe
   - Basic feature builder (structure hints, volume stats)
   - Acceptance:
     - Manual run logs show fetched candles for at least 1 crypto and 1 equity symbol.

2a) Authentication (0.5–1 day)
   - Backend auth endpoints with session cookie; bcrypt password hashing
   - User table migration; seed first admin user (manual or script)
   - Frontend login page; protect Settings/Publish
   - Acceptance:
     - Can login/logout; `/auth/me` returns current user.
     - Admin-only Settings and publish routes enforced.

3) Daystart pipeline (3–5 days)
   - Implement steps: Wyckoff, SMC, VSA, Delta, ICT, Merge
   - Persist prompt inputs/outputs per step, model, tokens, cost
   - Acceptance:
     - `POST /runs` creates a run and completes with stored intrasteps.
     - `GET /runs/{id}` shows all intrastep outputs and final Telegram-ready post.

4) UI for runs (1–2 days)
   - Dashboard: trigger Daystart, view latest runs
   - Run detail page: intrasteps, final post preview, publish button
   - Acceptance:
     - Triggering from UI creates a run; page polls status until complete.

5) Telegram integration (0.5–1 day)
   - Publish final message to channel with splitting and retries
   - Acceptance:
     - Clicking “Publish to Telegram” sends the post; message_id stored.

6) Scheduling (0.5–1 day)
   - APScheduler daily job; toggle via config
   - Acceptance:
     - At scheduled time, run is created and completed automatically.

7) Deployment to single VM (0.5–1 day)
   - Systemd units and deploy scripts created and tested
   - Acceptance:
     - `deploy_backend.sh` and `deploy_frontend.sh` run end-to-end and services restart cleanly.

8) Backtesting (Phase 2, 2–4 days)
   - Historical data fetch and batch runs through the same pipeline
   - UI to inspect backtest outputs and compare with live
   - Acceptance:
     - Backtest job runs N historical sessions and stores outputs like live runs.


### 12) Validation Checklist (per milestone)

- Foundation
  - [x] Backend health passes
  - [x] MySQL reachable; Alembic baseline applied
  - [x] Frontend renders and calls backend

- Data adapters
  - [x] Crypto OHLCV fetched ✅
  - [x] Equity OHLCV fetched ✅
  - [x] US Futures OHLCV fetched via yfinance (supports Bloomberg-style tickers NG1, B1!, etc.) ✅
  - [x] MOEX Stocks OHLCV fetched via Tinkoff API ✅
  - [x] MOEX Futures instruments fetched from MOEX ISS API (FUT board) ✅
  - [x] FIGI mapping and caching implemented ✅
  - [x] Instrument routing based on exchange field ✅
  - [x] Exchange detection (NYMEX/CME/NASDAQ/NYSE/MOEX) ✅
  - [x] Bloomberg-to-Yahoo Finance ticker mapping ✅
  - [x] Normalization verified ✅
  - [x] Caching implemented ✅
  - [x] Minimal UI working ✅
  - [x] Instrument management UI (enable/disable, search) ✅

- Authentication
  - [ ] Login/logout works with session cookie
  - [ ] Admin-only pages and actions enforced

- Daystart pipeline
  - [x] All 6 method steps produce outputs ✅
  - [x] Merge step produces Telegram-ready post ✅
  - [x] Costs/tokens recorded ✅
  - [x] Pipeline orchestrator working ✅
  - [x] Steps visible in UI ✅

- UI for runs
  - [ ] Manual trigger from UI works
  - [ ] Run details show prompts/outputs
  - [ ] Final preview matches style template

- Telegram
  - [x] Direct messaging to users works ✅
  - [x] Long messages split correctly ✅
  - [x] Bot handler for /start command ✅
  - [x] Automatic user registration ✅
  - [x] Error handling for partial failures ✅

- Scheduling
  - [ ] Daily job fired on schedule
  - [ ] Run completes without manual action

- Deployment
  - [x] deploy scripts created ✅
  - [x] systemd service files created ✅
  - [x] deployment documentation written ✅
  - [ ] deploy scripts tested in production
  - [ ] systemd services tested and verified

- Backtesting (Phase 2)
  - [ ] Historical batch runs complete
  - [ ] Outputs stored and viewable


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


### 14) Progress Tracker (MVP)

- [x] Foundation ✅ (Completed: Backend/Frontend skeletons, MySQL models, Alembic setup, health endpoints)
- [x] Data Adapters + Minimal UI ✅ (Completed: CCXT/yfinance adapters, normalized data, caching, dashboard, run detail page)
- [x] Daystart Pipeline + UI Integration ✅ (Completed: All 6 analysis steps, OpenRouter integration, pipeline orchestrator, step display)
- [x] Polish UI ✅ (Completed: Enhanced step display, Telegram preview, expandable timeline, copy functionality)
- [x] Navigation & Layout ✅ (Completed: Navigation bar, shared layout, all pages updated)
- [x] Analyses Page & Pipeline Configuration ✅ (Completed: List page, detail page with pipeline visualization, runs filtering, live updates)
- [x] Authentication ✅ (Completed: Session-based auth, login/logout, route protection, admin user creation)
- [x] Analysis Configuration Editing ✅ (Completed: Editable models, prompts, data sources before running)
- [x] Telegram Integration ✅ (Completed: Backend publish endpoint, message splitting, Settings page, credentials from AppSettings, TelegramUser model, bot handler for /start/help/status commands, automatic user registration, direct messaging to users, error handling for partial failures)
- [x] Settings Page Enhancements ✅ (Completed: Model syncing from OpenRouter API, search and filter functionality for models, scrollable model list, enabled/free filters, provider filter dropdown)
- [x] Futures Contracts Support ✅ (Completed: Bloomberg-style ticker support (NG1, B1!, etc.), MOEX futures fetching (NGX5, 400+ contracts), exchange detection (NYMEX/CME/MOEX), automatic ticker mapping)
- [x] Multiple Analysis Types ✅ (Completed: Created commodity_futures, crypto_analysis, equity_analysis analysis types with Russian prompts, PriceActionAnalyzer step, instrument filtering by analysis type, dashboard analysis type selector)
- [x] Analysis Type System ✅ (Completed: Pipeline uses analysis_type configuration, supports custom_config override, all prompts in Russian, migrated to Alembic migrations)
- [x] Model Failure Tracking ✅ (Completed: `has_failures` field added to `available_models` table, automatic marking when model errors occur, visual indicators in dropdowns and settings page, custom Select component for cross-platform support, sync logic preserves failure status, `model_failure` run status with tooltips)
- [x] Analysis Types Configuration Editing ✅ (Completed: Settings page section listing all analysis types, edit page at `/settings/analyses/{id}` for editing default configurations, API endpoint `PUT /api/analyses/{id}/config`, editable step configurations (models, prompts, temperature, max_tokens, num_candles), default timeframe and instrument editing, reset and save functionality)
- [x] Configurable Candle Counts ✅ (Completed: Added `num_candles` field to step config, editable in analysis detail page and Settings, prompt text dynamically updates to match configured number, migration added default values to all existing analysis types, backward compatible with defaults)
- [x] Pipeline Editor ✅ (Completed: User-created pipelines, drag-and-drop step reordering, context management, variable system, dynamic pipeline execution, access control, duplicate functionality, validation and warnings, see Section 4e for details)
- [ ] Scheduling
- [x] Deployment (single VM) ✅ (Scripts and documentation ready - see `docs/PRODUCTION_DEPLOYMENT.md`)
- [ ] Backtesting (Phase 2)


### 15) Next Actions

**✅ Completed:**
- Foundation milestone (skeletons, MySQL setup, migrations, automation scripts)

**🎯 Recommended Development Strategy:**

**Hybrid Approach: Build Minimal UI Early for Testing**

Since we need to test and observe the analysis pipeline, we should build a **minimal UI** early rather than testing only via API endpoints. This gives us:
- Visual feedback during development
- Ability to see intrastep outputs in real-time
- Faster debugging and validation
- Early UX validation

**Revised Milestone Order:**

**1. Data Adapters + Minimal UI Foundation** ✅ **COMPLETED** (1–2 days)
- Implement CCXT/yfinance adapters ✅
- Create normalized OHLCV data structure ✅
- **Build minimal UI:** Basic dashboard with instrument selector and "Run Analysis" button ✅
- **Build minimal run detail page:** Show run status and basic outputs ✅
- **Testing:** Can trigger a data fetch and see results in UI ✅
- Fixed: Database migration for MEDIUMTEXT payload column ✅

**2. Daystart Pipeline + UI Integration** ✅ **COMPLETED** (3–5 days)
- Implement analysis steps (Wyckoff, SMC, VSA, Delta, ICT, Merge) ✅
- OpenRouter integration for LLM calls ✅
- **Enhance UI:** Show intrastep timeline with expandable steps ✅ (Basic implementation)
- **Testing:** Full pipeline visible in UI, can see each step's prompt/output ✅
- Verified: All 6 steps execute successfully, costs tracked, Telegram post generated ✅

**3. Polish UI** ✅ **COMPLETED** (1 day)
- Improve run detail page with better formatting ✅
- Add Telegram post preview section with copy functionality ✅
- Add expandable accordion-style step timeline ✅
- Enhanced visual hierarchy and UX ✅
- **Testing:** Complete user flow works end-to-end ✅

**4. Polish UI** ✅ **COMPLETED** (1 day)
- Improve run detail page with better formatting ✅
- Add Telegram post preview section with copy functionality ✅
- Add expandable accordion-style step timeline ✅
- Enhanced visual hierarchy and UX ✅
- **Testing:** Complete user flow works end-to-end ✅

**5. Analyses Page & Pipeline Configuration** ✅ **COMPLETED** (2-3 days)
- Create `/analyses` list page (show all analysis types) ✅
- Create `/analyses/{id}` detail page with pipeline visualization ✅
- Add `analysis_types` table to store analysis configurations ✅
- Show step configuration (models, prompts, data sources) before running ✅
- Create `/runs` page with filtering by analysis type ✅
- Fix live updates for run steps (polling every 2s) ✅
- **Testing:** Can view pipeline config, run analysis, see live updates ✅

**6. Navigation & Layout** ✅ **COMPLETED** (1 day)
- Add top navigation bar (Home, Analyses, Runs, Schedules, Settings) ✅
- Create layout component with navigation ✅
- Update all pages to use shared layout ✅
- **Testing:** Navigation works across all pages ✅

**7. Authentication** (0.5-1 day)
- Backend auth endpoints (login/logout)
- Frontend login page
- Session management
- **Note:** Admin-only for MVP, no trader role yet

**8. Telegram Integration** (0.5-1 day)
- Publish endpoint
- Message splitting
- Add "Publish to Telegram" button in run detail

**7. Authentication** ✅ **COMPLETED** (0.5-1 day)
- Backend auth endpoints (login/logout) ✅
- Frontend login page ✅
- Session management ✅
- Route protection ✅
- Admin user creation script ✅
- **Testing:** Can login, logout, protected routes work ✅

**8. Analysis Configuration Editing** ✅ **COMPLETED** (1 day)
- Editable configuration UI in analysis detail page ✅
- Edit models, prompts, temperature, max_tokens, data sources ✅
- Reset to defaults functionality ✅
- Custom config passed to backend ✅
- **Testing:** Can edit config before running analysis ✅

**9. Telegram Integration** ✅ **COMPLETED** (0.5-1 day)
- Backend publish endpoint ✅
- Message splitting ✅
- Frontend publish button ✅
- Settings page for Telegram bot token ✅
- Telegram publisher reads credentials from Settings (AppSettings table) ✅
- **Telegram User Management:**
  - Created `TelegramUser` model to store users who started the bot ✅
  - Bot handler for `/start`, `/help`, `/status` commands ✅
  - Automatic user registration when users send `/start` ✅
  - Messages sent to all active users (not channel) ✅
  - Settings page shows active users count ✅
- **Error Handling:**
  - Detailed error reporting for partial failures ✅
  - Frontend shows warnings when some users fail to receive messages ✅
  - Backend logs detailed error information for debugging ✅
- **Testing:** Can publish to Telegram, users automatically registered via /start command ✅

**10. Settings Page Enhancements** ✅ **COMPLETED** (1 day)
- **Model Management:**
  - Added "Sync from OpenRouter" button to fetch latest models from OpenRouter API ✅
  - Backend endpoint `/api/settings/models/sync` fetches models via OpenRouter API ✅
  - New models added to database (disabled by default) ✅
  - Existing models preserved (not overwritten) ✅
- **Advanced Filtering:**
  - Search by model name, provider, or description ✅
  - Provider filter dropdown (dynamically populated) ✅
  - "Enabled only" toggle to filter enabled models ✅
  - "Free to use models" toggle to filter free models ✅
- **UI Improvements:**
  - Scrollable model list container (max height 500px) ✅
  - Model count display ("X models found") ✅
  - Empty state message when no models match ✅
  - Hover effects and consistent styling ✅
  - Responsive layout with flex-wrap for smaller screens ✅
- **Testing:** Can sync models from API, filter by provider/enabled/free, search works correctly ✅

**11. Model Failure Tracking** ✅ **COMPLETED** (1 day)
- **Database Schema:**
  - Added `has_failures` boolean field to `available_models` table ✅
  - Added `model_failure` status to `analysis_runs.status` enum ✅
  - Migration created and applied ✅
- **Pipeline Integration:**
  - Automatic detection of model errors (429 rate limits, 404 not found, invalid model) ✅
  - Models marked with `has_failures=True` when errors occur ✅
  - Pipeline stops execution immediately on model errors ✅
  - Failure details stored in `model_failures` step for easy retrieval ✅
- **Visual Indicators:**
  - Custom Select component for cross-platform dropdown support (works on macOS, Windows, Linux) ✅
  - Failed models show ⚠️ icon and orange styling in dropdowns ✅
  - Warning message displayed when failed model is selected ✅
  - Settings page shows "Has Failures" badge for failed models ✅
  - Tooltip component for error messages (Bootstrap-like styling) ✅
- **Sync Preservation:**
  - When syncing from OpenRouter API, `has_failures` flag is preserved for existing models ✅
  - Only new models are added; existing models keep their failure status ✅
- **UI Improvements:**
  - Analysis cards show default timeframe (reliable) instead of default instrument (can be disabled) ✅
  - Card buttons docked to bottom for consistent alignment ✅
  - Run status badges show `model_failure` with orange color ✅
  - Tooltips show error details on hover for failed runs ✅
- **Testing:** Model failures detected, marked in database, shown in UI, sync preserves status ✅

**Why This Approach:**
- ✅ Can test visually instead of just API calls
- ✅ See intrastep data immediately (critical for prompt tuning)
- ✅ Faster iteration on analysis logic
- ✅ Early validation of UX flow
- ✅ FastAPI `/docs` still available for API testing
- ✅ Minimal UI can be polished later without blocking backend work


---

Notes:
- OpenRouter provides a unified OpenAI-compatible interface to many models which simplifies switching and increases availability: `https://openrouter.ai/`.
- This document is the living source of truth; update checkboxes and milestone notes as we progress.

---

### 16) Local Setup Validation (Completed)

**Date**: Initial setup validation after project migration

**Completed Tasks**:
1. ✅ **Database Setup**: Created dedicated `research_flow_dev` database and `research_flow_user` MySQL user
2. ✅ **Configuration**: Created `backend/app/config_local.py` with proper database credentials
3. ✅ **Python Environment**: Set up Python virtual environment and installed all backend dependencies
4. ✅ **Database Migrations**: Successfully ran all Alembic migrations (16 migrations applied)
5. ✅ **Frontend Dependencies**: Installed all frontend npm packages
6. ✅ **Database Connection**: Verified database connection works correctly
7. ✅ **Admin User**: Created initial admin user (admin@rf.ru / 1234)
8. ✅ **Project Name Updates**: Updated all references from "Max Signal Bot" to "Research Flow" across codebase

**Database Status**:
- Database: `research_flow_dev` ✅
- User: `research_flow_user` ✅
- Tables created: 12 tables (alembic_version, analysis_runs, analysis_steps, analysis_types, app_settings, available_data_sources, available_models, data_cache, instruments, telegram_posts, telegram_users, users) ✅
- Analysis types seeded: 4 types ✅
- Admin user created: 1 user ✅

**Configuration Files**:
- `backend/app/config_local.py`: Created with database credentials (gitignored)
- Database password: `research_flow_password` (as set in mysql_local_setup.sql)

**Next Steps for Full Functionality Testing**:
1. Start backend server: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload`
2. Start frontend server: `cd frontend && npm run dev`
3. Test login with admin credentials
4. Test API endpoints (instruments, analyses, runs)
5. Verify Telegram bot integration (requires API keys)

**Files Updated**:
- `backend/app/main.py`: Updated API title and lock file paths
- `backend/app/__init__.py`: Updated project name
- `backend/app/api/health.py`: Updated service name
- `backend/app/services/telegram/bot_handler.py`: Updated bot welcome messages
- `scripts/stop_all.sh`: Updated service name
- `scripts/README.md`: Updated path reference
- `frontend/app/page.tsx`: Updated landing page text
- `backend/scripts/test_polling_lock.py`: Updated lock file paths

---

### 17) Production Deployment (Completed)

**Date**: Production deployment to dedicated server

**Production Server Details**:
- **Hostname**: `zfeafctorr`
- **External IP**: `84.54.30.222`
- **Private IP**: `10.19.0.3`
- **OS**: Ubuntu 24.04.3 LTS
- **SSH Alias**: `rf-prod`
- **Deployment Path**: `/srv/research-flow`

**Database Configuration**:
- **Database Name**: `rf_prod`
- **MySQL Server**: Remote (`10.19.0.2:3306`)
- **Database User**: `rf_prod`
- **Remote Access Password**: `&rJx&kD86*EZ` (for connections from `10.19.0.3`)
- **Connection String**: `mysql+pymysql://rf_prod:&rJx&kD86*EZ@10.19.0.2:3306/rf_prod?charset=utf8mb4`

**Deployment Steps Completed**:
1. ✅ **Server Prerequisites**: Node.js 20.x installed, Python 3.12.3 available
2. ✅ **Repository Setup**: Cloned to `/srv/research-flow`
3. ✅ **Backend Setup**: 
   - Python virtual environment created
   - All dependencies installed
   - `config_local.py` configured with production database
   - SESSION_SECRET generated: `b85ad761d02e1c2eb6c52be75b167744378b471d9717221c35b641b6b52ebe32`
4. ✅ **Database Setup**:
   - All Alembic migrations applied successfully (16 migrations)
   - Production database seeded with 4 analysis types
   - Admin user created: `admin@rf.ru` / `1234`
5. ✅ **Frontend Setup**:
   - Dependencies installed (`npm ci`)
   - Production build completed successfully
   - Environment configured: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
6. ✅ **Systemd Services**:
   - Backend service: `research-flow-backend.service` (running on port 8000)
   - Frontend service: `research-flow-frontend.service` (running on port 3000)
   - Both services enabled for auto-start on boot
7. ✅ **Verification**:
   - Backend health endpoint: ✅ `http://localhost:8000/health`
   - Frontend: ✅ `http://localhost:3000` (HTTP 200)
   - Database connection: ✅ Verified
   - Services status: ✅ Both active and running

**Service Configuration**:
- **Backend**: Uvicorn with 2 workers, auto-restart enabled
- **Frontend**: Next.js production server, auto-restart enabled
- **Logs**: Available via `journalctl -u research-flow-backend` and `journalctl -u research-flow-frontend`

**Access Information**:
- **Frontend URL**: `http://84.54.30.222:3000` (or via domain if reverse proxy configured)
- **Backend API**: `http://84.54.30.222:8000`
- **API Docs**: `http://84.54.30.222:8000/docs`
- **Admin Login**: `admin@rf.ru` / `1234`

**Deployment Scripts**:
- `research-flow-deploy`: Standalone deployment script installed in `/usr/local/bin/`
  - Complete end-to-end deployment: git pull, dependencies, migrations, build, restart services
  - Usage: `research-flow-deploy` (can be run from anywhere)
  - Installation: `sudo bash scripts/install_standalone_deploy.sh`
  - **External to project**: Script is copied to `/usr/local/bin/` and won't be overwritten by git pull
  - **Tested and verified**: Successfully deployed and tested on production server
- `scripts/deploy.sh`: Pulls latest changes, updates dependencies, runs migrations, builds frontend
- `scripts/restart_backend.sh`: Restarts backend service
- `scripts/restart_frontend.sh`: Restarts frontend service
- `scripts/install_systemd_services.sh`: Installs systemd service files (requires non-root user)

**Next Steps for Production**:
1. Configure reverse proxy (Nginx/Caddy) for HTTPS and domain name
2. Set up firewall rules (ports 8000, 3000, or reverse proxy ports)
3. Configure OpenRouter API key via Settings UI
4. Configure Telegram bot token via Settings UI
5. Set up monitoring and log rotation
6. Configure backup strategy for database

**Security Notes**:
- `config_local.py` has secure permissions (`chmod 600`)
- SESSION_SECRET is unique for production
- Database credentials stored securely (not in git)
- SSH key-based authentication configured
- Services run as root (consider creating dedicated user for production)


