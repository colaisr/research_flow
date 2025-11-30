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
  - `users`: id, email, hashed_password, full_name, is_active, role (enum: admin/org_admin/org_user), created_at, updated_at
  - `organizations`: id, name, slug, owner_id, is_personal (boolean), created_at, updated_at
  - `organization_members`: id, organization_id, user_id, role (org_admin/org_user), invited_by, joined_at
  - `analysis_types`: id, organization_id (required), name, display_name, description, version, config (JSON with steps configuration), is_active, is_system, created_at, updated_at
  - `analysis_runs`: id, trigger_type (manual/scheduled), analysis_type_id, status (queued/running/succeeded/failed/model_failure), input_params (JSON), created_at, finished_at, cost_est_total
  - `analysis_steps`: id, run_id, step_name, step_type (llm/data_transform/api_call/rag_query/etc), input_blob, output_blob, tool_id (nullable, links to user_tools), llm_model (nullable), tokens (nullable), cost_est, created_at
  - `user_tools`: id, user_id (required), organization_id (nullable - home org), tool_type (database/api/rag/custom), name, display_name, config (JSON with connection details, credentials), is_active, is_shared (default true), created_at, updated_at
  - `organization_tool_access`: id, organization_id, tool_id, is_enabled (default true), created_at, updated_at
  - `rag_knowledge_bases`: id, organization_id (required), name, description, vector_db_type, embedding_model, document_count, created_at, updated_at
  - `rag_documents`: id, rag_id, title, content, file_path (nullable), metadata (JSON), embedding_status, created_at, updated_at
  - `available_models`: id, name, display_name, provider, description, max_tokens, cost_per_1k_tokens, is_enabled, has_failures, created_at, updated_at
  - `schedules`: id, user_id, organization_id (required), analysis_type_id, schedule_type (daily/weekly/interval/cron), schedule_config (JSON with type-specific config), is_active, last_run_at, next_run_at, created_at, updated_at
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
  - **Schedules**: ✅ **COMPLETE**
    - `GET /api/schedules` → list scheduled analyses for current organization
    - `POST /api/schedules` → create schedule (requires analysis_type_id, schedule_type, schedule_config)
    - `GET /api/schedules/{id}` → get schedule details
    - `PUT /api/schedules/{id}` → update schedule (updates APScheduler job, recalculates next_run_at)
    - `DELETE /api/schedules/{id}` → delete schedule (removes from APScheduler)
    - `GET /api/schedules/stats` → get schedule statistics (total, active, next_run_in)
  - **Outputs**:
    - `POST /api/runs/{id}/export` → export/deliver Summary via configured output handlers (Telegram/email/webhook/file)
    - `GET /api/runs/{id}/summary` → get Summary content
    - `GET /api/runs/{id}/export/{format}` → download Summary in specific format (PDF/JSON/CSV)
  - **System**:
    - `GET /api/models` → list available LLM models
    - `POST /api/models/sync` → sync models from OpenRouter
    - `GET /api/health` → health probe

- Frontend (Next.js)
  - **Dashboard Page (`/dashboard`)**: ✅ **REDESIGNED**
    - Welcome header with personalized greeting
    - Statistics cards: Pipelines total (with active count), Runs total (with monthly count), Success rate percentage, Total cost (with monthly breakdown)
    - Quick actions: Create process, Run analysis, Manage tools
    - Recent runs: Last 5 runs with status, cost, and timestamps
    - Status overview sidebar: Running/queued jobs indicator, success/failure counts, active processes count
    - Process preview: Quick links to user's processes (up to 6), link to view all
    - Real-time updates: Polls runs every 5 seconds, stats every 30 seconds
    - Empty states: Helpful messages and CTAs when no data exists
    - Responsive design: Mobile (single column), Tablet (2-column), Desktop (3-4 column grids)
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
  - **Schedules Page** (`/schedules`): ✅ **COMPLETE**
    - Statistics cards: Total schedules, active schedules, next scheduled run
    - List view: Table showing all scheduled analyses from current organization
    - Schedule types: Daily (specific time), Weekly (day of week + time), Interval (every N minutes), Cron (cron expression)
    - Create Schedule: Modal form for configuring schedule type and parameters
    - Edit/Delete: Manage schedules with enable/disable toggle
    - Real-time updates: Shows last run and next run timestamps
    - Organization-scoped: Only shows schedules from current organization context
  - **Settings Page**:
    - LLM Models: Configure available models
    - Output Handlers: Configure Telegram, email, webhooks
    - User Preferences: Profile, notifications

### 3a) UX Specification & Product Architecture

**Navigation Structure:**
- **Navigation Bar**:
  - Logo/Brand name
  - Main navigation links (Analyses, Tools, RAGs, Runs, Schedules, Settings)
  - **Organization Selector** (dropdown):
    - Shows current organization name
    - Lists all organizations user belongs to (personal + shared)
    - Visual indicators: Personal org badge, role badges (org_admin/org_user)
    - Quick switch without page reload
    - "Manage Organizations" link to settings
  - User info (email, role badge if admin)
  - Logout button
- **Home (`/`)**: Landing page with product overview, quick stats, recent activity, quick actions, and pricing section (Phase 5.4)
- **Dashboard (`/dashboard`)**: ✅ **REDESIGNED** - Main user dashboard after login
  - Personalized welcome header with user's name
  - Key metrics at a glance: Pipelines, Runs, Success Rate, Cost
  - Quick action buttons: Create process, Run analysis, Manage tools
  - Recent activity: Last 5 runs with status indicators
  - Status overview: Running jobs, success/failure counts
  - Process preview: Quick access to user's processes
  - All text in Russian, matching app design system
- **Analyses (`/analyses`)**: Create and manage analysis flows
  - List view: Cards showing analysis flows from current organization ONLY
  - Complete separation: No visibility of analyses from other organizations
  - Detail/Edit view: Pipeline editor with step-by-step configuration
  - Create: Build new analysis flow from scratch or template (in current org context)
- **Tools (`/tools`)**: Manage user-specific tools (databases, APIs, RAGs)
  - List view: All configured tools from current organization ONLY
  - Complete separation: No visibility of tools from other organizations
  - Create Tool: Wizard for setting up new tools (in current org context)
  - Edit Tool: Update tool configuration
- **RAGs (`/rags`)**: Manage knowledge bases and documents
  - List view: All RAG knowledge bases from current organization ONLY
  - Complete separation: No visibility of RAGs from other organizations
  - Create RAG: Set up new knowledge base (in current org context)
  - Document Management: Upload, organize, and manage documents
- **Runs (`/runs`)**: View all analysis runs (history, status, results)
  - Runs from current organization ONLY
  - Complete separation: No visibility of runs from other organizations
- **Schedules (`/schedules`)**: Manage scheduled analysis jobs
  - Schedules from current organization ONLY
  - Complete separation: No visibility of schedules from other organizations
- **Settings (`/settings`)**: Configuration management (models, output handlers, preferences, organizations)

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
  - Analyses from current organization context ONLY
  - No organization filter (complete separation - only current org visible)
  - Analysis name and description
  - Number of steps
  - Estimated cost range
  - Last run timestamp and status
  - Actions: "Edit", "Run", "View History", "Duplicate", "Delete"
  - Organization selector in navigation (switching org reloads page with new org's analyses)
  
  - **Detail View (`/analyses/{id}`)**: 
    - **Overview Card**: Clean grid showing version, steps count, estimated cost, duration
    - **Pipeline Steps Card**: Expandable step cards with:
      - Step name, model, step type badges
      - Expandable configuration (model settings, prompts)
      - Edit mode with inline editing capabilities
      - Visual indicators for model failures
      - Reset and "Done Editing" buttons
    - **Run Analysis Card**: Prominent action button to execute analysis
    - **Consistent Styling**: Matches Run Details and Analyses list pages
    - **Translation**: All text in Russian
    - **Removed Fields**: `num_candles` field removed (as in Pipeline Editor)
  
  - **Edit View (`/analyses/{id}/edit` or `/pipelines/new`)**: 
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

**Dashboard Page (`/dashboard`):** ✅ **REDESIGNED**
- **Welcome Section**:
  - Personalized greeting with user's name
  - Prominent "Create Process" CTA button
  - Brief description of platform purpose
- **Statistics Cards** (4-column responsive grid):
  - **Pipelines Card**: Total pipelines count with active count, link to all processes
  - **Runs Card**: Total runs with monthly count, link to all runs
  - **Success Rate Card**: Percentage of successful runs
  - **Cost Card**: Total cost with monthly breakdown
  - Each card has colored icon background (blue, green, emerald, purple)
  - Hover effects and transitions
- **Quick Actions Section**:
  - Three action cards with icons:
    - Create Process: Opens pipeline editor
    - Run Analysis: Links to analyses page
    - Manage Tools: Links to tools page
  - Dashed border cards with hover effects
- **Recent Runs Section** (2/3 width):
  - Last 5 runs displayed as cards
  - Shows: Run ID, instrument, timeframe, status badge, cost, relative timestamp
  - Click to view run details
  - Empty state with CTA to create first run
- **Status Overview Sidebar** (1/3 width):
  - Running/queued jobs indicator with spinner
  - Success/failure counts
  - Active processes count
  - Link to view all runs
- **Process Preview Section**:
  - Grid of user's processes (up to 6)
  - Shows process name and description
  - Link to view all processes if more than 6
- **Design Features**:
  - Light theme with white cards, gray borders
  - Consistent spacing and typography
  - Color-coded status badges
  - Smooth hover transitions
  - Real-time polling (runs: 5s, stats: 30s)
  - Smart date formatting (relative time with fallback)
  - Currency formatting with 4 decimal places

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
- **Light Theme**: Consistent light theme across all pages (white backgrounds, gray borders, blue accents)
- Timeline + accordions for steps
- Status badges with colors (green=succeeded, blue=running, red=failed, yellow=queued, orange=model_failure)
- Expandable sections for prompts/outputs
- Copy-to-clipboard functionality
- Real-time updates while pipeline runs (polling every 2s)
- **All UI text in Russian**: Complete translation of all user-facing text
- Instrument filtering hints ("Показаны только инструменты, подходящие для данного типа анализа")
- Custom Select component for model dropdowns (cross-platform compatibility, proper failure indicators)
- Tooltip components for error messages (Bootstrap-like styling with Tailwind CSS)
- Drag-and-drop step reordering with visual feedback
- Warning dialogs with Cancel buttons for validation errors
- **Consistent Card Design**: All cards use `rounded-lg`, `shadow-sm`, `border border-gray-200` styling
- **Icon-Based Actions**: Action buttons use icons instead of text where appropriate (Edit, Run, Duplicate, History)
- **Professional Typography**: Consistent font sizes, weights, and spacing throughout


### 4) Analysis Types and Pipelines

**Note**: The platform is general-purpose and domain-agnostic. Users can create analysis flows for any domain or topic.

**System Analysis Templates** (Examples):
The platform may include example/template analysis flows that demonstrate capabilities:
- Financial market analysis (trading analysis as example)
- Business intelligence workflows
- Research report generation
- Compliance monitoring

These serve as **templates** that users can duplicate and customize for their needs. See Section 4b for more details.

### 4a) User-Created Pipelines (Pipeline Editor)

**Overview:**
Users can create, edit, and manage their own custom analysis pipelines using the Pipeline Editor. This enables maximum flexibility - users can build any pipeline workflow, not just trading-related ones.

**Architecture:**
- **Database Schema**: 
  - `analysis_types` table includes `organization_id` (required, FK to organizations) and `is_system` (boolean) columns
  - System analyses belong to a special system organization (or can be identified by `is_system=True`)
  - User pipelines (`is_system=false`) belong to user's personal organization or shared organizations
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
- **System Pipelines**: 
  - Belong to platform admin user (`user_id=admin_user.id`)
  - Marked with `is_system=True` (visible to all users)
  - Read-only for regular users (can duplicate, can't edit)
  - Only platform admin can edit system pipelines
- **User Pipelines**: Full edit access (only by owner)
- **Admin**: Can edit any pipeline (system or user)
- **Duplicate**: Users can duplicate system pipelines to create their own copies (tools are automatically copied from admin)

**System Process Ownership Model:**
- **System processes belong to platform admin user**: All system processes are created under platform admin user (`user_id=admin_user.id`)
- **Tools in system processes belong to admin**: Tools used in system processes are owned by platform admin
- **Visibility**: System processes are visible to all users (via `is_system=True` flag) but belong to admin
- **Benefits**:
  - Admin can manage system processes and their tools centrally
  - Tools always exist (belong to admin)
  - Simple duplication logic: copy admin's tools to user

**Tool Reference Handling During Duplication:**
When a user duplicates a system pipeline that uses tools (via `tool_references` in step configs), the system automatically handles tool references:

1. **Tool Discovery**: System collects all `tool_id` values from `tool_references` in all steps
2. **Tool Source**: Tools belong to system process owner (platform admin)
3. **Tool Matching**: For each source `tool_id`:
   - Loads the source tool from admin's account
   - Searches for user's existing tool with matching `display_name` and `tool_type`
   - If found: Uses existing user's tool ID
   - If not found: Creates a copy of admin's tool for the user
4. **Tool Copying**: When creating tool copies:
   - Copies tool configuration from admin's tool (including encrypted credentials)
   - Creates `organization_tool_access` entries for all user's organizations
   - **Note**: Credentials are copied as-is (encrypted with same key), but user should verify they work
   - **Note**: If admin's credentials are specific to admin's account, user will need to update them
5. **Reference Updates**: All `tool_id` values in `tool_references` are updated to point to user's copied tools
6. **Error Handling**: If a tool cannot be found or created:
   - Reference is kept in config
   - Will show error message when pipeline executes: "[Tool {tool_id} not found]"
   - User can manually fix by selecting a different tool in the Pipeline Editor

**Best Practices:**
- **Admin Tool Management**: Platform admin should create and maintain tools for system processes
- **Tool Naming**: Use standard tool names (e.g., "Binance API", "PostgreSQL DB") that make sense when copied
- **Credentials**: Admin should use generic credentials or document that users need to update them
- **User Verification**: Users should verify tool credentials after duplicating a process that uses tools
- **Manual Updates**: Users can manually update tool references in the Pipeline Editor if needed

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

### 4b) Example Analysis Flows (Templates)

The current trading analysis flows serve as **examples/templates** that demonstrate the platform's capabilities. Users can:
- Use them as-is for financial analysis
- Duplicate and modify them for their needs
- Create completely new flows for any domain

**System Process Creation Approach:**
- **Purpose**: System processes (`is_system=True`) serve as example/template workflows that users can clone and customize
- **Ownership**: System processes belong to platform admin user (`user_id=admin_user.id`)
- **Visibility**: Marked with `is_system=True` flag, making them visible to all users
- **Creation Method**: Python scripts in `backend/scripts/` directory (e.g., `create_tour_operator_process.py`)
- **Structure**: Scripts create `AnalysisType` records with:
  - `is_system=True` (visible to all users)
  - `user_id=admin_user.id` (belongs to platform admin)
  - `organization_id=admin_org.id` (belongs to admin's organization)
- **Tools**: Tools used in system processes belong to platform admin and are copied to users when duplicating
- **Documentation**: Each system process has a markdown file in `docs/system_processes/` describing its purpose, steps, and capabilities
- **Access**: System processes appear in "Примеры процессов" (Example processes) tab on Analyses page
- **User Interaction**: Users can clone system processes to create their own editable copies (tools are automatically copied)
- **Admin Management**: Platform admin can create, edit, and manage system processes and their tools

**Example: Financial Market Analysis** (Current Implementation)
- Demonstrates: Multi-step LLM analysis, data source integration, structured outputs
- Steps: Market data retrieval → LLM analysis steps → Final report generation
- Can be adapted for: Any market analysis, competitive intelligence, trend analysis

**Example: Tour Operator Cities Selection** (System Process - Created)
- **Purpose**: Comprehensive 5-step process demonstrating all variable and prompt capabilities
- **Steps**:
  1. `generate_cities`: Generate list of 8 popular tourist cities (independent step)
  2. `analyze_weather`: Climate analysis using `{generate_cities_output}` variable
  3. `evaluate_attractions`: Attraction evaluation using `{generate_cities_output}` and `{analyze_weather_output}`
  4. `calculate_costs`: Cost calculation using all 3 previous step outputs
  5. `final_recommendation`: Final recommendation using all 4 previous step outputs
- **Demonstrates**:
  - Variable chain dependencies (each step uses variables from previous steps)
  - Multiple variables in single prompt
  - Context around variables (explanatory text)
  - Different analysis types (generation, climate, evaluation, finance, recommendation)
  - Different temperature settings (0.5-0.7 range)
  - Result step logic (last step automatically becomes result)
- **Documentation**: `docs/system_processes/tour_operator_cities_selection.md`
- **Script**: `backend/scripts/create_tour_operator_process.py`

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
- **Ownership Model**: Tools belong to users (stored in `user_tools` table with `user_id`)
- **Access Model**: Tools are available in ALL organizations where the user is owner (by default)
- **Organization-Level Control**: Users can disable specific tools per organization via `organization_tool_access` table
- **Default Behavior**: When user creates tool → automatically available in all orgs where user is owner
- **Use Case**: User creates "CRM API" tool → available in Org A and Org B (both owned) → User can disable it in Org B settings → tool no longer visible in Org B
- Configuration includes connection details, credentials (encrypted)
- Tools can be tested before use
- Tools are reusable across multiple analyses and organizations
- Tools can be enabled/disabled globally (`is_active`) or per-organization (`organization_tool_access.is_enabled`)

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
  - **Production**: Nginx reverse proxy configured for `researchflow.ru` with SSL (see Section 9a)
  - MySQL connection configured in `app/config_local.py` (local dev DB and prod DB endpoints)

### 9a) Production Domain Setup (researchflow.ru) ✅ **IMPLEMENTED**

**Status**: Production domain `researchflow.ru` is fully configured and operational.

**Domain Configuration**:
- **Domain**: `researchflow.ru` and `www.researchflow.ru`
- **Server IP**: `84.54.30.222`
- **DNS Records**: 
  - `@.researchflow.ru` → `84.54.30.222` (A record)
  - `www.researchflow.ru` → `84.54.30.222` (A record)
- **SSL Certificate**: Let's Encrypt (auto-renewing, expires 2026-02-22)

**Infrastructure Setup**:
- **Nginx Reverse Proxy**: Installed and configured
  - Routes HTTP (port 80) → HTTPS (port 443)
  - Proxies `/` → `http://localhost:3000` (frontend)
  - Proxies `/api` → `http://localhost:8000` (backend)
  - Proxies `/health` → `http://localhost:8000/health` (health check)
  - Configuration: `/etc/nginx/sites-available/researchflow.ru`
- **SSL/TLS**: 
  - Let's Encrypt certificate installed via Certbot
  - Auto-renewal configured via systemd timer
  - TLS 1.2/1.3 protocols enabled
  - Security headers configured (X-Frame-Options, X-Content-Type-Options, etc.)
- **Firewall**: UFW enabled
  - Ports open: 80 (HTTP), 443 (HTTPS), 22 (SSH)
  - Ports 3000 and 8000 not exposed externally (only via Nginx)

**Application Configuration**:
- **Frontend** (`/srv/research-flow/frontend/.env.production`):
  - `NEXT_PUBLIC_API_BASE_URL=https://researchflow.ru/api`
  - Frontend rebuilt with production API URL
- **Backend** (`/srv/research-flow/backend/app/main.py`):
  - CORS origins updated to include:
    - `https://researchflow.ru`
    - `https://www.researchflow.ru`
    - `http://localhost:3000` (dev)
    - `http://127.0.0.1:3000` (dev)

**Access URLs**:
- **Production Site**: `https://researchflow.ru`
- **Production Site (www)**: `https://www.researchflow.ru`
- **API Endpoint**: `https://researchflow.ru/api/*`
- **Health Check**: `https://researchflow.ru/health`

**Setup Process** (Completed):
1. ✅ Installed Nginx reverse proxy
2. ✅ Created Nginx configuration for domain
3. ✅ Installed Certbot for SSL certificate management
4. ✅ Obtained Let's Encrypt SSL certificate (auto-configured Nginx)
5. ✅ Configured firewall (UFW) to allow HTTP/HTTPS traffic
6. ✅ Updated frontend `.env.production` with HTTPS API URL
7. ✅ Rebuilt frontend with new configuration
8. ✅ Updated backend CORS settings for production domain
9. ✅ Restarted all services (backend, frontend, Nginx)
10. ✅ Verified HTTPS access, API endpoints, and SSL certificate

**Maintenance**:
- **SSL Renewal**: Automatic via Certbot timer (checks daily, renews 30 days before expiration)
- **Nginx Logs**: `/var/log/nginx/access.log` and `/var/log/nginx/error.log`
- **Service Management**:
  ```bash
  sudo systemctl status nginx
  sudo systemctl restart nginx
  sudo certbot renew --dry-run  # Test SSL renewal
  ```

**Documentation**: See `docs/DOMAIN_SETUP_PRODUCTION.md` for detailed setup guide and troubleshooting.

### 10) Authentication and User Accounts

**User Roles:**

**Platform-Level Roles** (`users.role`):
- `admin`: Platform administrator with full system access
- `user`: Regular platform user (default for all non-admin users)

**Organization-Level Roles** (`organization_members.role`):
- `org_admin`: Organization administrator, can manage organization members and settings
- `org_user`: Regular organization member with limited permissions

**Key Concept**: 
- Platform admins (`users.role = 'admin'`) have full system access and can manage all users and organizations
- Regular users (`users.role = 'user'`) have organization-specific permissions defined in `organization_members.role`
- A user can have different roles in different organizations (e.g., `org_admin` in their personal org, `org_user` in a shared org)
- Organization-specific roles are managed per-organization, not at the platform level

**Authentication Flow:**
- Email/password login with bcrypt password hashing
- Session cookie (`researchflow_session`) stored as HttpOnly cookie (secure in prod)
- Server-side session validation; no tokens stored in frontend
- Session includes: `user_id`, `email`, `is_admin`, `role`, `organization_id`
- Endpoints: 
  - `POST /api/auth/login` - Authenticate and create session
  - `POST /api/auth/logout` - Destroy session
  - `GET /api/auth/me` - Get current user profile
  - `POST /api/auth/register` - Public registration (can be disabled by admin)

**Organization Context:**
- Each user session has a current `organization_id` stored in session cookie
- All resource queries filtered by current organization context
- User can switch organization context via `POST /api/organizations/switch`
- Switching organization updates session cookie and reloads page/refetches data
- Default: User's personal organization on first login
- Fallback: If session org invalid, automatically falls back to personal org

**Personal Organization:**
- Auto-created on user registration
- Marked with `is_personal=True` in database
- User is always `org_admin` of their personal org
- Cannot be deleted or transferred
- Cannot leave personal organization
- Always exists (created on-demand if missing for existing users)

**Session Management:**
- Session token created via `create_session()` function
- Includes user info and current organization context
- Cookie settings: `httponly=True`, `secure=False` (dev) / `secure=True` (prod), `samesite="lax"`
- Session expires after 24 hours (configurable)
- Protected routes require valid session via `get_current_user_dependency`

- Frontend
  - Login page; guard protected pages; show current user, role, and current organization.
  - Error states and lockouts; logout action.
  - Organization selector in navigation for switching contexts.

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

### 11) Security and Observability

- Secrets only on server in `config_local.py` (never committed)
- Log aggregation: journald via `journalctl -u ...`
- Basic request/step logging with structlog; redact secrets
- Health endpoint for uptime checks




### 12) Risk Log and Mitigations

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


### 13) Notes

- OpenRouter provides a unified OpenAI-compatible interface to many models which simplifies switching and increases availability: `https://openrouter.ai/`.
- This document is the living source of truth for the Research Flow platform architecture and vision.
- **Development Approach**: Each phase should be fully tested before moving to the next. Use feature flags to enable/disable new features during development.

### 12a) System Process Creation & Management

**Purpose**: System processes serve as example/template workflows that demonstrate platform capabilities and can be cloned by users.

**Creation Methods**:

**Method 1: Via Python Scripts** (Recommended for initial setup)
1. **Design**: Create markdown documentation in `docs/system_processes/` describing the process purpose, steps, and capabilities
2. **Implementation**: Create Python script in `backend/scripts/` (e.g., `create_tour_operator_process.py`)
3. **Execution**: Run script to create `AnalysisType` record with:
   - `is_system=True` (visible to all users)
   - `user_id=admin_user.id` (belongs to platform admin)
   - `organization_id=admin_org.id` (belongs to admin's organization)
   - Complete step configuration in `config` JSON
4. **Tools**: If process uses tools:
   - Create tools under platform admin account first
   - Tools belong to admin and are copied to users when duplicating
   - Admin can manage all system process tools centrally
5. **Verification**: Process appears in "Примеры процессов" tab on Analyses page

**Method 2: Via UI** (For platform admins)
1. **Create Process**: Platform admin creates a new process via Pipeline Editor (`/pipelines/new`)
2. **Mark as System**: Admin checks "Создать как системный процесс" checkbox during creation
   - Process is created with `is_system=True`
   - Process belongs to admin (`user_id=admin_user.id`)
   - Process is visible to all users in "Примеры процессов" tab
3. **Convert Existing Process**: Admin can convert any existing process to system process:
   - Open process in Pipeline Editor (`/pipelines/{id}/edit`)
   - Check "Системный процесс" checkbox
   - Save changes
   - Process becomes visible to all users
4. **Convert System to Personal**: Admin can also convert system process back to personal:
   - Uncheck "Системный процесс" checkbox
   - Process becomes personal (visible only to admin in "Мои процессы")

**Process Status Management**:
- **System Process** (`is_system=True`):
  - Visible to all users in "Примеры процессов" tab
  - Can be cloned by any user
  - Only platform admin can edit/delete
  - Belongs to platform admin (`user_id=admin_user.id`)
- **Personal Process** (`is_system=False`):
  - Visible only to owner in "Мои процессы" tab
  - Owner can edit/delete
  - Belongs to creating user (`user_id=current_user.id`)

**Filtering Logic**:
- **"Мои процессы" tab**: Shows only personal processes (`is_system=False`) owned by current user in current organization
- **"Примеры процессов" tab**: Shows only system processes (`is_system=True`) visible to all users
- **Backend filtering**: `list_my_analysis_types` excludes system processes even if they belong to admin
- **Rationale**: Prevents system processes from appearing in "Мои процессы" even though they technically belong to admin

**Tool Management for System Processes**:
- **Admin Creates Tools**: Platform admin creates and configures tools for system processes
- **Tool Ownership**: Tools belong to admin (`user_id=admin_user.id`)
- **Tool Visibility**: Tools are available to admin in all their organizations
- **Duplication**: When user duplicates system process:
  - Admin's tools are automatically copied to user
  - User gets their own copies of tools (can modify credentials)
  - Tool references in process config are updated to point to user's tools
- **Benefits**:
  - Centralized tool management (admin controls all system tools)
  - No broken references (tools always exist)
  - Simple duplication logic (just copy admin's tools)
  - Users can customize tool credentials after duplication

**Example Process Structure**:
- **Tour Operator Cities Selection** (`tour_operator_cities_selection`):
  - 5-step process demonstrating variable dependencies
  - Each step uses variables from previous steps
  - Shows different analysis types and temperature settings
  - Documentation: `docs/system_processes/tour_operator_cities_selection.md`
  - Script: `backend/scripts/create_tour_operator_process.py`

**Best Practices**:
- Each system process should demonstrate specific platform capabilities
- Use clear, descriptive step names
- Include comprehensive variable usage examples
- Document the process purpose and what it demonstrates
- Test the process before making it available as a system process

**User Interaction**:
- System processes appear in "Примеры процессов" tab (read-only for regular users)
- Users can clone system processes to create editable copies
- Cloned processes become user-owned (`is_system=False`, `user_id=current_user.id`)
- **Tool Copying**: When duplicating, admin's tools are automatically copied to user
- Users can modify cloned processes freely
- Users can update tool credentials in copied tools after duplication

**Admin Capabilities**:
- **Create System Processes**: Platform admin can create system processes via UI (checkbox in Pipeline Editor)
- **Convert Processes**: Admin can convert any process to/from system status via UI
- **Delete System Processes**: Only platform admin can delete system processes (delete button visible in "Примеры процессов" tab)
- **Edit System Processes**: Only platform admin can edit system processes (full access via Pipeline Editor)

**Access Control**:
- **Creation**: Only platform admin can set `is_system=True` when creating process
- **Update**: Only platform admin can change `is_system` flag after creation
- **Deletion**: System processes can only be deleted by platform admin
- **Editing**: System processes can only be edited by platform admin
- **Validation**: When converting to system process, backend checks for global name uniqueness

### 12b) System Process Creation & Deployment Workflow

**Purpose**: Standardized workflow for creating, testing, and deploying system processes to production.

**Overview**:
System processes are created via Python scripts in `backend/scripts/` directory. Each script follows a consistent pattern and can be executed locally for testing, then deployed to production.

**Key Workflow Steps**:
1. **Local Development**: Create script following standard pattern, test locally
2. **Verification**: Verify process appears in UI and executes correctly
3. **Commit & Push**: Commit script to repository
4. **Production Deployment**: SSH to production, pull changes, run script

**Script Requirements**:
- **Idempotency**: Safe to run multiple times (check for existing tools/processes)
- **Error Handling**: Proper try-except blocks with rollback on error
- **Admin Context**: Always use platform admin user and admin's organization
- **Tool Management**: Create tools if needed, set up organization access
- **Process Configuration**: Complete step configuration with prompts, model settings, tool references

**Common Patterns**:
- **Process with Tools**: Create/get tools, reference in steps, configure tool access
- **Process without Tools**: LLM-only steps with variable dependencies
- **Reusing Tools**: Check for existing tools by name/type before creating

**Deployment**:
- Scripts are executed on production server after pulling latest code
- Processes appear in "Примеры процессов" tab after creation
- Tools are automatically copied to users when they duplicate system processes

### 12c) UI/UX Design Principles

**Design System**:
- **Theme**: Consistent light theme across all pages (white backgrounds, gray borders, blue accents)
- **Language**: All user-facing text in Russian with consistent terminology
- **Components**: Standardized card, button, and typography styles
- **Layout**: Responsive design with consistent spacing and hover effects

**Key Pages**:
- **Dashboard**: Statistics cards, quick actions, recent runs, process preview
- **Analyses**: Filter tabs (My processes / Example processes), expandable step configuration
- **Pipeline Editor**: Inline step management, variable palette, test functionality
- **Run Details**: Timeline view with expandable steps, prominent result section


### 14) On-Premise LLM Deployment Guide

**Purpose**: This section provides guidance for customers who want to deploy on-premise LLM servers for data privacy, cost optimization at scale, or compliance requirements.

**Overview**:
The platform supports on-premise LLM servers via OpenAI-compatible API. Customers can deploy dedicated LLM servers (e.g., Ollama, vLLM) and configure them in Admin Settings. Access is controlled per-user via `local_llm` feature flag. When enabled, on-prem models appear in model dropdowns alongside OpenRouter models.

**Architecture Options**:

**Option 1: Single Server with Multiple Models** (Recommended for Start)
- One Ollama server can serve multiple models concurrently
- Models loaded on-demand (first request loads model into memory)
- Configuration: `OLLAMA_MAX_LOADED_MODELS=3`, `OLLAMA_NUM_PARALLEL=4`
- Best for: Cost efficiency, simpler management, moderate traffic

**Option 2: Multiple Servers per Tier** (For Scale)
- Separate servers for different user tiers (Basic, Premium, Enterprise)
- Complete isolation between tiers
- Dedicated resources per tier
- Best for: High volume, strict SLAs, different hardware per tier

**Recommended Solution: Ollama**

Ollama is the recommended solution for on-premise deployment due to:
- **Easy Deployment**: Single binary, minimal dependencies
- **OpenAI-Compatible API**: Works seamlessly with existing LLMClient
- **Simple Packaging**: Can bundle model + server for customer deployment
- **Good Performance**: Optimized inference, GPU support
- **Active Development**: Well-maintained, good documentation

**Available Models in Ollama**:

**Text Models**:
- `llama3.1:8b` - General purpose, good quality/speed balance (recommended)
- `llama3.1:70b` - High quality, requires significant resources
- `mistral:7b` - Fast and efficient
- `qwen2.5:7b` - Strong multilingual support (including Russian)
- `phi3:3.8b` - Lightweight option
- `OxW/Saiga_YandexGPT_8B` - Russian language (community model, based on YandexGPT)

**Vision Models** (Image Processing):
- `llava:7b` - Best balance for vision tasks
- `llava:13b` - Higher quality vision
- `gemma3:12b` - Google multimodal model
- `qwen2.5-vl:7b` - Multilingual vision

**Note**: `llama3.1:8b` is **text-only** (not multimodal). For OCR/PDF processing, you need:
1. OCR step first (extract text from PDFs/images)
2. Then send extracted text to LLM
3. Or use vision model like `llava:7b` for direct image processing

**GigaChat and YandexGPT On-Premise Status**:

**GigaChat**:
- ❌ **Not Available**: No public on-premise deployment options
- Proprietary model (Sberbank), cloud-only via API
- Contact Sberbank directly for enterprise/private cloud options
- No self-hosted version available

**YandexGPT**:
- ✅ **YandexGPT 5 Lite (8B)**: Available now via Ollama community model
  - Model: `OxW/Saiga_YandexGPT_8B` (community port)
  - Pull: `ollama pull OxW/Saiga_YandexGPT_8B`
  - Good Russian language support
- ⏳ **YandexGPT 5 Pro**: Official on-premise expected 2025
  - Part of Yandex 360 on-premise suite
  - Contact Yandex Cloud for enterprise options
- ✅ **Alternative**: ValueAI platform supports YandexGPT on-premise (third-party)

**VM Specifications for On-Premise LLM Servers**:

**Server 1: Single Model - `llama3.1:8b` Only**

**Minimum Requirements**:
- **GPU**: RTX 3090 (24GB VRAM) or RTX 4090 (24GB VRAM)
- **CPU**: 16-core+ CPU
- **RAM**: 32GB+ system RAM
- **Storage**: 50GB+ SSD for model files

**Recommended**:
- **GPU**: RTX 4090 (24GB VRAM) - Best price/performance ratio
- **CPU**: 16-core+ CPU (Intel Xeon or AMD EPYC)
- **RAM**: 64GB system RAM
- **Storage**: 100GB+ NVMe SSD

**Estimated Costs**:
- **Cloud (Hetzner)**: RTX 4090 server ~€200-300/month
- **Cloud (AWS)**: g5.2xlarge (A10G 24GB) ~$1,000/month
- **Cloud (GCP)**: n1-standard-16 + T4 GPU ~$800/month
- **Dedicated Server**: RTX 4090 server ~$200-400/month

**Use Cases**:
- Text analysis, document processing, general LLM tasks
- Good for: Most use cases, cost-effective deployment
- Limitations: Text-only (no vision), single model

---

**Server 2: Multiple Models - `llama3.1:8b` + `llama3.1:70b` + `mistral:7b`**

**Critical Constraint**: `llama3.1:70b` requires ~80GB+ VRAM

**Requirements**:
- **GPU**: Multiple A100 80GB (2-4x) or H100 80GB (2x)
- **CPU**: 32-core+ CPU (Intel Xeon or AMD EPYC)
- **RAM**: 256GB+ system RAM
- **Storage**: 500GB+ NVMe SSD

**Estimated Costs**:
- **Cloud (AWS)**: p4d.24xlarge (8x A100 40GB) ~$32,000/month
- **Cloud (AWS)**: p5.48xlarge (8x H100 80GB) ~$98,000/month
- **Cloud (GCP)**: a2-highgpu-8g (8x A100 40GB) ~$25,000/month
- **Dedicated Server**: 2x A100 80GB server ~$5,000-8,000/month

**Note**: `llama3.1:70b` is extremely expensive to run. Consider:
- Using quantized versions (Q4, Q8) to reduce VRAM requirements
- Deploying only when high-quality output is critical
- Using OpenRouter for occasional 70B requests (pay-per-use)

**Use Cases**:
- High-quality analysis requiring 70B model
- Multiple model options for different tasks
- Premium tier service offering

---

**Cost Analysis: Self-Hosted vs OpenRouter**:

**Break-Even Analysis**:

| Monthly Requests | OpenRouter Cost | Self-Hosted Cost | Recommendation |
|------------------|-----------------|------------------|----------------|
| **3,000** (low) | $0.60 | $300 | ✅ **OpenRouter** |
| **30,000** (medium) | $6 | $300 | ✅ **OpenRouter** |
| **300,000** (high) | $60 | $300 | ⚠️ **Consider self-hosted** |
| **3,000,000** (very high) | $600 | $300 | ✅ **Self-hosted** |

**Break-Even Point**: ~50,000-100,000 requests/month

**Assumptions**:
- Average 2,000 tokens per request
- OpenRouter: ~$0.10 per 1M tokens for `llama3.1:8b`
- Self-hosted: RTX 4090 server ~$300/month

**Recommendation**:
- **Low-Medium Volume**: Use OpenRouter (pay-as-you-go, no infrastructure)
- **High Volume**: Deploy self-hosted (cost-effective, data privacy)
- **Enterprise/Compliance**: Self-hosted required (data isolation)

---

**Deployment Guide for Customers**:

**Step 1: Choose Deployment Model**
- **Single Model**: Start with `llama3.1:8b` only (RTX 4090 server)
- **Multiple Models**: Add more models as needed (larger server)
- **Multiple Servers**: Deploy separate servers per tier (future scale)

**Step 2: Provision VM**
- Minimum: RTX 4090 server (24GB VRAM, 64GB RAM)
- Recommended: Dedicated GPU server (Hetzner, AWS, GCP, or on-premise)
- OS: Ubuntu 22.04 LTS or similar

**Step 3: Install Ollama**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull models
ollama pull llama3.1:8b
ollama pull mistral:7b
# Optional: ollama pull llama3.1:70b (if server has 80GB+ VRAM)

# Start server with OpenAI-compatible API
OLLAMA_HOST=0.0.0.0:8000 ollama serve
```

**Step 4: Configure in Research Flow**
- Admin Settings → Credentials → Local LLM
- Base URL: `http://ollama-server:8000/v1`
- Model Name: `llama3.1:8b` (or other model)
- Display Name: `Llama 3.1 8B (On-Prem)`
- Enable toggle: ON

**Step 5: Enable for Users**
- Admin Settings → Features
- Enable `local_llm` feature for specific users
- Users will see on-prem model in model dropdowns

**Step 6: Test**
- Create test pipeline using on-prem model
- Verify responses and performance
- Monitor server resources

---

**Packaging for Customer Deployment**:

For customers who want to deploy on their own infrastructure:

**Package Contents**:
```
customer-llm-package/
├── install.sh              # Installation script
├── ollama                  # Ollama binary
├── models/                 # Pre-downloaded models
│   ├── llama3.1:8b/
│   └── mistral:7b/
├── start-server.sh         # Start script
├── config.env              # Configuration template
└── README.md              # Installation instructions
```

**Installation Process**:
1. Customer receives package
2. Runs `./install.sh` (installs Ollama, sets up models)
3. Runs `./start-server.sh` (starts server)
4. Provides server URL to admin
5. Admin configures in Research Flow system

---

**Future Enhancements**:

**Multiple On-Premise Servers**:
- Support for multiple Local LLM configurations
- Model-based routing (`local/llama3.1:8b` vs `local/yandex/yandexgpt-8b`)
- Per-tier server allocation (Basic, Premium, Enterprise)

**Additional Models**:
- YandexGPT Pro (when official on-premise available in 2025)
- GigaChat (if Sberbank releases on-premise solution)
- Custom fine-tuned models

**Advanced Features**:
- Load balancing across multiple Ollama instances
- Auto-scaling based on demand
- Health monitoring and failover
- Cost tracking per server

---

**References**:
- Ollama: https://ollama.com/
- Ollama Models: https://ollama.com/library
- YandexGPT Lite: https://huggingface.co/yandex/YaLM-2-8B-pretrain
- OpenRouter Pricing: https://openrouter.ai/models

