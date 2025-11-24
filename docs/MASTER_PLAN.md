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
- **Home (`/`)**: Landing page with product overview, quick stats, recent activity, quick actions
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

These serve as **templates** that users can duplicate and customize for their needs. See Section 4a for more details.

### 4e) User-Created Pipelines (Pipeline Editor)

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

### 4a) Example Analysis Flows (Templates)

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

### 10a) Authentication and User Accounts

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

**0.1) User Roles & Authentication Enhancement** ✅ **COMPLETE**
- [x] **Roles System**:
  - Current: Basic admin/user distinction (`is_admin` boolean)
  - New: Two-level role system:
    - **Platform-level** (`users.role`): `admin` (platform admin) or `user` (regular user)
    - **Organization-level** (`organization_members.role`): `org_admin` (organization admin) or `org_user` (organization member)
  - Database: 
    - `users.role`: `admin` or `user` (platform-level permissions)
    - `organization_members.role`: `org_admin` or `org_user` (organization-specific permissions)
  - **Key Concept**: 
    - Platform admins can manage all users and organizations
    - Regular users have organization-specific roles that vary per organization
    - A user can be `org_admin` in one org and `org_user` in another org
  - Migration: 
    - Update existing users: `is_admin=True` → `role='admin'`, `is_admin=False` → `role='user'`
    - Organization roles stored in `organization_members.role` (not in `users.role`)
- [x] **Personal Organization Auto-Creation**:
  - **Trigger**: Automatically created on user registration
  - **Fallback**: Also created on-demand if missing (for existing users during migration)
  - **Properties**:
    - Name: "{User's Name} Personal" or "{User's Email} Personal"
    - `is_personal=True` (database flag)
    - `owner_id=user.id` (always belongs to creator)
    - User automatically added as `org_admin` member
  - **Behavior**:
    - User is always `org_admin` of their personal org
  - All user's resources belong to their personal org (never NULL)
    - Cannot be deleted (deleted when user is deleted)
    - Cannot be transferred (ownership always belongs to creator)
    - Cannot be left (user always member of their personal org)
  - **Implementation**: `create_personal_organization()` function in `app/services/organization.py`
- [x] **Registration Flow**:
  - Public registration endpoint (`POST /api/auth/register`)
  - Email verification (optional for MVP, can be added later)
  - Default role: `org_admin` (can be changed by admin to `admin`)
  - Auto-create personal organization on registration
  - Admin can enable/disable public registration
- [x] **Index Page (Pre-Login)**:
  - Landing page with product overview
  - "Sign Up" and "Sign In" buttons
  - Public information about platform capabilities
  - No authentication required
- [x] **User Settings Page** (`/user-settings`):
  - Profile: Name, email, password change
  - Preferences: Theme, language, timezone, notifications
  - API Keys: OpenRouter API key (user-specific)
  - Feature Toggles: Which features user can access (for future pricing)
  - **Organizations Section**:
    - List all organizations user belongs to
    - Show role in each organization (org_admin/org_user)
    - Quick switch to any organization (placeholder for Phase 0.2)
    - Leave organization (if org_user) (placeholder for Phase 0.2)
    - Create new organization (placeholder for Phase 0.2)
- [x] **Admin Settings Page** (`/admin/settings`):
  - Platform Configuration:
    - Enable/disable public registration
    - Default user role for new registrations (always `org_admin` for regular users, can be changed to `admin`)
    - Platform-wide feature flags
  - System Limits:
    - Max pipelines per user
    - Max runs per day/month
    - Max tokens per user
  - Global API Keys: Fallback OpenRouter key (if user doesn't have one)

**0.2) Organization & Multi-Tenancy** ✅ **COMPLETE**

**Key Concept**: Users can belong to multiple organizations simultaneously, but work in ONE context at a time:
- **Personal Organization**: Auto-created, always exists, user is `org_admin`
- **Shared Organizations**: User can be invited to multiple orgs as `org_admin` or `org_user`
- **Organization Context**: User selects active organization to work within
- **Complete Separation**: When working in an organization context, user sees ONLY that organization's resources
  - No mixing of resources from different organizations
  - Different companies = different contexts (complete isolation)
  - Example: Analyst working for Company A cannot see Company B's resources (even if member of both)
- **Context Switching**: Switching organizations = complete context switch (different resources, different data)
- [x] **Organizations Table**:
  - `organizations`: id, name, slug, owner_id, is_personal (boolean, default False), created_at, updated_at
  - `organization_members`: id, organization_id, user_id, role (org_admin/org_user), invited_by, joined_at
  - `organization_invitations`: id, organization_id, email, token, role, invited_by, expires_at, accepted_at
- [x] **Personal Organization**:
  - Every user has exactly one personal organization (auto-created on registration)
  - Personal org marked with `is_personal=True`
  - User is `org_admin` of their personal org
  - Personal org cannot be deleted (user deletion removes it)
- [x] **Organization Management**:
  - Users can create additional organizations (beyond their personal one)
    - UI: "Создать организацию" button in user settings → Organizations tab
    - Form with organization name input
    - Auto-creates user as `org_admin` of the new organization
  - Organization admins can invite users (email invitations)
    - Validation: Checks if user already exists and is member
    - Validation: Prevents duplicate invitations for same organization
    - Validation: Allows multiple invitations from different organizations
    - Invitation expires in 7 days
    - Users can accept invitations by invitation ID (from pending invitations list)
  - Organization admins can add users directly (temporary, for testing without email)
    - UI: "Добавить пользователя" button in organization management page
    - Form: Email, password, full name (optional), role
    - If user exists: Adds them to organization (removes pending invitation if exists)
    - If user doesn't exist: Creates new user account + personal org + adds to organization
    - **Note**: This feature will be removed when email invitations are properly implemented
  - Invited users can accept invitations
    - UI: Pending invitations shown in user settings → Organizations tab
    - Yellow banner displays pending invitations with organization name
    - One-click accept button
    - Auto-refreshes organizations list after acceptance
  - Organization admins can manage members (remove, change roles):
    - UI: Organization management page (`/organizations/{id}`)
    - View all members with roles and join dates
    - Change member roles (Admin ↔ User)
    - Remove members (cannot remove yourself, cannot remove owner)
    - See member count
    - **Owner Protection Logic**:
      - Organization owner (`organizations.owner_id`) cannot be removed
      - Organization owner's role cannot be changed
      - Owner badge: Purple "Владелец" badge shown next to owner's name
      - Owner's edit/remove buttons are hidden in UI
      - Backend validates: `if organization.owner_id == member.user_id: raise 403`
      - **Rationale**: Prevents invited `org_admin` from removing/demoting the actual owner
    - **Owner Management Access**:
      - Organization owners can always manage their own organizations (even if not explicitly `org_admin` member)
      - Backend `check_org_admin()` function prioritizes ownership check: owners can manage regardless of `organization_members.role`
      - Frontend permission check includes `isOwner` flag: `canManage = isOwner || userMember?.role === 'org_admin' || user?.role === 'admin'`
      - **Backend Endpoint**: `GET /api/organizations/{organization_id}` - Returns organization details with `owner_id` for permission checks
      - **Frontend**: Fetches organization details separately to ensure `owner_id` is available before checking permissions
      - **Loading States**: Frontend waits for organization details, members list, and organizations list to load before rendering permission checks
    - **Role Management**:
      - `org_admin`: Can invite users, manage members, change roles (except owner)
      - `org_user`: Regular member, cannot manage organization
      - Platform `admin`: Can manage any organization
  - Transfer ownership (shared organizations only):
    - **UI**: "Передать владение" button in organization management page
      - Only visible to current owner (`organization.owner_id == current_user.id`)
      - Hidden for personal organizations (`organization.is_personal == True`)
      - Opens modal with dropdown of organization members
    - **Backend**: `POST /api/organizations/{id}/transfer-ownership`
      - Body: `{new_owner_user_id: int}`
      - **Validations**:
        1. Only current owner can transfer (`organization.owner_id == current_user.id`)
        2. Cannot transfer to yourself (`new_owner_user_id != current_user.id`)
        3. New owner must be member of organization (query `OrganizationMember`)
        4. Cannot transfer personal organization (`organization.is_personal == False`)
      - **Process**:
        1. Verify new owner is member (raise 404 if not)
        2. Auto-promote new owner to `org_admin` if currently `org_user`
        3. Update `organization.owner_id = new_owner_user_id`
        4. Commit changes
      - **Use Case**: When organization owner leaves company, transfers ownership to another member
    - **Personal Organization Protection**:
      - Personal organizations (`is_personal=True`) cannot have ownership transferred
      - Always belongs to creator (`owner_id` set on creation, never changes)
      - Backend validation: `if organization.is_personal: raise 400`
  - Users can leave organizations (if org_user, cannot leave personal org)
    - UI: "Покинуть" button for org_user role in user settings
    - Confirmation dialog before leaving
    - Auto-switches to personal org after leaving
    - Backend prevents leaving personal organization
  - Users can belong to multiple organizations (personal + any number of shared orgs)
  - **Multi-Organization Support**: Same email/user can have:
    - Personal organization (auto-created, always exists)
    - Multiple shared organizations (invited as org_admin or org_user)
  - **Validation**:
    - Invite endpoint: Checks if user already member, prevents duplicate invitations
    - Add-user endpoint: Checks if user exists, handles existing users gracefully
    - Both endpoints: Allow multiple invitations from different organizations
- [x] **Organization Context & Switching**:
  - **Current Organization Context**: 
    - Stored in session cookie (`organization_id` in session data)
    - User selects active organization to work within
    - All API requests filtered by current organization context
    - Backend dependency: `get_current_organization_dependency()` extracts `organization_id` from session
    - Fallback logic: If session org invalid/missing → fallback to user's personal org
  
  - **Complete Separation Logic**:
    - When working in organization A context, user sees ONLY organization A's resources
    - No visibility of resources from other organizations (even if user is member)
    - Complete context switch when switching organizations (different resources, different data)
    - Different companies = different contexts (no mixing)
    - **Backend Filtering**: All resource queries include `WHERE organization_id = :current_org_id`
    - **Example**: Analyst working for Company A cannot see Company B's analyses (even if member of both)
  
  - **Organization Selector UI**: 
    - Location: Compact workspace switcher in sidebar (under user card)
    - Visibility: Only visible when sidebar is expanded (`!isCollapsed`) - needs space for dropdown
    - Design: Small, minimal - workspace icon + organization name + dropdown arrow
    - Text size: `text-xs` for compact appearance
    - Content: Lists all organizations user belongs to (personal + shared)
    - Visual indicators: 
      - Personal org badge ("Личная") shown in dropdown items
      - Shared orgs show organization name
      - Checkmark indicates current organization
    - Dropdown shows: Organization name, "Личная" badge for personal orgs, checkmark for current org
    - Action: Click to switch → calls `POST /api/organizations/switch` → updates session → reloads page
    - **UX Design**: Designed as utility control, not prominent feature - appropriate for workspace switcher
    - **Note**: If sidebar is collapsed, switcher is hidden (user must expand sidebar to switch organizations)
  
  - **Context Persistence**: 
    - **Session Storage**: `organization_id` stored in session cookie (server-side)
    - **Frontend Storage**: Also stored in localStorage for UI state
    - **Default**: Personal org on first login (or if session org invalid)
    - **Switching**: `POST /api/organizations/switch` updates session cookie, frontend reloads/refetches
    - **Backend Filtering**: All resource endpoints filter by `current_organization.id` from session
    - **Validation**: Backend verifies user is member of requested org before switching
- [x] **Resource Ownership**:
  - **Simplified Model**: All resources belong to an organization (never NULL)
  - `analysis_types` and `analysis_runs` have `organization_id` (required, not nullable)
  - Resources can belong to:
    - Personal organization (private to user)
    - Shared organization (accessible to all org members when in that org's context)
  - **Complete Separation**: 
    - Resources are ONLY visible when working in their organization's context
    - No cross-organization visibility (even if user is member of multiple orgs)
    - Switching organizations = complete context switch (different resources, different data)
  - Access control: Users can access resources from organizations where they're members, but ONLY when in that organization's context
  - **Resource Creation**: New resources created in current organization context (cannot create in other orgs)
  - Migration: Updated existing resources to belong to user's personal org

**0.3) Feature Enablement System** ✅ **CORE COMPLETE**

**Feature Model: User-First (Simplified)**

The feature enablement system uses a simplified model where features are enabled per user only. Organizations automatically inherit features from their owners.

**Available Features:**
- `local_llm`: Local LLM model support
- `openrouter`: OpenRouter API integration
- `rag`: RAG Knowledge Bases
- `api_tools`: API Tools system
- `database_tools`: Database Tools system
- `scheduling`: Scheduled analysis runs
- `webhooks`: Webhook output handlers

**Database Schema:**

**User Features Table** (`user_features`):
- `id`: Primary key
- `user_id`: Foreign key to `users.id`
- `feature_name`: String (50 chars), one of the available features
- `enabled`: Boolean (True = enabled, False = disabled)
- `expires_at`: DateTime (nullable) - Optional expiration date
- `created_at`, `updated_at`: Timestamps
- Unique constraint: `(user_id, feature_name)` - One record per user per feature
- **Semantics**: `None` (not set) = inherit from organization, `True/False` = explicit user setting

**Organization Features Table** (`organization_features`):
- `id`: Primary key
- `organization_id`: Foreign key to `organizations.id`
- `feature_name`: String (50 chars), one of the available features
- `enabled`: Boolean (True = enabled, False = disabled)
- `expires_at`: DateTime (nullable) - Optional expiration date
- `created_at`, `updated_at`: Timestamps
- Unique constraint: `(organization_id, feature_name)` - One record per org per feature
- **Semantics**: Defaults to `True` if not explicitly set (organizations get all features by default)

**Feature Logic:**

**1. Organization Features (Primary Source):**
- Organizations have features enabled by default (`True`) if not explicitly set
- Admin can enable/disable features for entire organizations
- When Tom purchases features for his organization, all members get access (unless restricted)
- Example: Organization "Acme Corp" has `rag=True`, `api_tools=True`, `scheduling=False`

**2. User Features (Restrictions/Overrides):**
- Users can have explicit feature settings (`enabled=True/False`) or no setting (`None`)
- `None` = inherit from organization (user hasn't set this feature)
- `True` = user wants feature enabled (but still requires org to have it)
- `False` = user restriction (cannot use feature even if org has it)
- Example: User Jerry has `rag=None` (inherit), `api_tools=False` (restricted), `scheduling=None` (inherit)

**3. Effective Features (What Users Get):**
The `get_effective_features()` function returns organization owner's features:

```python
effective_features = get_organization_features(org_id)
# Which internally does:
owner_features = get_user_features(org.owner_id)
sync_organization_features_from_owner(org_id, owner_id)  # Cache sync
return owner_features
```

**Example Scenarios:**

**Scenario 1: User works in organization owned by Tom**
- Tom (owner) has: `rag=True`, `api_tools=True`, `scheduling=False`
- Organization "Acme Corp" (owned by Tom) has: `rag=True`, `api_tools=True`, `scheduling=False` (synced from Tom)
- Jerry (member) working in Acme Corp gets: `rag=True`, `api_tools=True`, `scheduling=False` ✅
- **Use Case**: Jerry invited to Tom's workspace gets all Tom's features

**Scenario 2: User works in their personal organization**
- Jerry has: `rag=False`, `api_tools=False`, `scheduling=False` (all disabled)
- Jerry's personal org (owned by Jerry) has: `rag=False`, `api_tools=False`, `scheduling=False` (synced from Jerry)
- Jerry working in his personal org gets: `rag=False`, `api_tools=False`, `scheduling=False` ❌
- **Use Case**: User gets their own features in their personal workspace

**Scenario 3: Organization ownership transfer**
- Tom transfers "Acme Corp" ownership to Jerry
- Organization features automatically sync from Jerry's features
- All members now get Jerry's features when working in Acme Corp
- **Use Case**: Ownership transfer automatically updates organization features

**4. Feature Expiration:**
- Both user and organization features can have `expires_at` dates
- Expired features are automatically treated as `False`
- Expiration checked in `get_user_features()` and `get_organization_features()`

**API Endpoints:**

**Admin Feature Management:**
- `GET /api/admin/features` - List all available features (returns `FEATURES` dict)
- `GET /api/admin/users/{user_id}/features` - Get user's features (returns `dict[str, bool]`, defaults to `False` if not set)
- `PUT /api/admin/users/{user_id}/features/{feature_name}` - Set user feature (body: `{enabled: bool, expires_at?: datetime}`)
  - Automatically syncs to all organizations owned by this user
- `GET /api/admin/organizations/{org_id}/features` - Get organization features (returns `dict[str, bool]`, derived from owner)
- `PUT /api/admin/organizations/{org_id}/features/{feature_name}` - DEPRECATED: Sets feature on organization owner instead

**User Feature API:**
- `GET /api/user-settings/features` - Get effective features for current user in current organization context (returns `dict[str, bool]`)

**Feature Check Dependency:**
- `require_feature(feature_name: str)` - FastAPI dependency factory
- Usage: `Depends(require_feature('rag'))` in endpoint
- Checks `has_feature(db, user_id, organization_id, feature_name)`
- Returns 403 Forbidden if feature not enabled
- Requires organization context (uses `get_current_organization_dependency`)

**UI Components:**

**Admin Settings - Features Tab:**
- User Feature Management:
  - Enter user ID input field
  - Fetch user features via `GET /api/admin/users/{id}/features`
  - Display all features with toggle switches
  - Show actual state (checked/unchecked based on API response)
  - Update via `PUT /api/admin/users/{id}/features/{name}`
  
- Organization Feature Management:
  - Organization dropdown selector
  - Fetch org features via `GET /api/admin/organizations/{id}/features`
  - Display all features with toggle switches
  - Show actual state (defaults to checked if not explicitly set)
  - Update via `PUT /api/admin/organizations/{id}/features/{name}`

**Future Enhancements (Phase 1+):**
- Add `require_feature()` checks to endpoints that use specific features
- Add feature-based UI visibility (show/hide features in UI)
- Feature usage analytics
- Bulk feature management

**0.4) Admin Dashboard - User Management** ✅ **COMPLETE**
- [x] **Users List Page** (`/admin/users`):
  - Table with columns: Name, Email, Platform Role (admin/user), Personal Org, Other Orgs, Status, Created, Actions
  - Filters: Platform Role (admin/user), Organization, Status (active/inactive)
  - Search by name/email
  - Actions: Edit, Disable/Enable, Delete, View Details, Change Platform Role (admin ↔ user), **Impersonate**
  - **Note**: Organization-specific roles (`org_admin`/`org_user`) are managed per-organization, not at platform level
- [x] **User Details Page** (`/admin/users/{id}`):
  - User Profile: Name, email, platform role (admin/user), personal organization, organization memberships
  - Organization Roles: Show user's role in each organization (`org_admin`/`org_user` per organization)
  - **Statistics**:
    - Tokens used (total, this month)
    - Pipelines created (total, active) - across all orgs
    - Runs executed (total, this month, succeeded/failed)
    - Tools created (total, active) - across all orgs
    - RAGs created (total, documents) - across all orgs
    - Organizations: Personal org + shared orgs count
  - **Feature Management**: Enable/disable features, set expiration
  - **Activity Log**: Recent runs, pipeline creations, etc.
  - **Impersonate Button**: "Login as this user" action
- [x] **User Impersonation**:
  - **Backend API**: `POST /api/admin/users/{user_id}/impersonate`
    - Only accessible to platform `admin` role
    - Creates new session as the target user
    - Preserves original admin identity in session metadata (for audit trail)
    - Returns new session cookie
    - **Security**: 
      - Only platform admins can impersonate
      - Cannot impersonate other admins (prevent privilege escalation)
      - Session includes `impersonated_by` field (original admin user_id)
      - All actions performed while impersonating are logged with impersonation flag
  - **Frontend UI**:
    - "Impersonate" button in users list (admin-only)
    - "Login as this user" button in user details page
    - Confirmation dialog: "You are about to log in as {user_email}. Continue?"
    - After impersonation: Clear visual indicator (banner/header) showing "Impersonating: {user_email} | Exit Impersonation"
    - Exit impersonation: `POST /api/admin/exit-impersonation` - restores original admin session
    - Impersonation banner shows:
      - Current impersonated user info
      - Original admin user (who is impersonating)
      - "Exit Impersonation" button
  - **Session Management**:
    - Impersonated session includes: `user_id` (target user), `impersonated_by` (admin user_id), `is_impersonated=True`
    - Original admin session stored separately (for restoration)
    - Exit impersonation restores original admin session
    - Impersonated sessions expire normally (24 hours)
  - **Audit Trail**:
    - All actions during impersonation logged with `impersonated_by` field
    - Log entries include: timestamp, admin user, target user, action performed
    - Admin can view impersonation history in audit logs
- [ ] **Bulk Operations** (Optional - deferred to Phase 1+):
  - Enable/disable features for multiple users
  - Change roles for multiple users
  - Assign users to organizations
  - Export user statistics

**Testing Checklist for Phase 0**:
- [x] Can register new user
- [x] Personal organization is auto-created on registration
- [x] User is org_admin of their personal org
- [x] Can login/logout
- [x] Index page shows without login
- [x] User settings page works
- [x] Admin can access admin settings
- [x] Can create additional organization (beyond personal)
- [x] Can invite user to organization
- [x] Can add user directly (temporary, for testing)
- [x] Invited user can accept invitation
- [x] User can belong to multiple organizations (personal + shared)
- [x] Organization selector appears in sidebar (compact workspace switcher)
- [x] Can switch between organizations (complete context switch)
- [x] Current organization context persists across sessions
- [x] Complete separation: When in org A context, only see org A resources
- [x] Cannot see resources from other organizations (even if member)
- [x] Switching organizations reloads page/refetches data
- [x] New resources created in current organization context ONLY
- [x] Resources belong to organizations (never NULL)
- [x] Can access resources from personal org (when in personal org context)
- [x] Can access resources from shared orgs (when in that org's context)
- [x] Backend enforces organization context filtering on all resource endpoints
- [x] Can leave organization (if org_user, cannot leave personal org)
- [x] Owner protection: Cannot remove or change role of organization owner
- [x] Transfer ownership: Owner can transfer shared organization ownership to another member
- [x] Cannot transfer personal organization ownership (always belongs to creator)
- [x] Feature enablement system: User-centric model (organizations inherit from owner)
- [x] Admin can manage user features (by user ID)
- [x] Admin can view organization features (derived from owner)
- [x] Effective features API: Get features for current user in current org
- [x] Organization owner can manage their own organization (permission fix)
- [x] Backend endpoint: `GET /api/organizations/{organization_id}` for organization details
- [x] Frontend: Organization switcher shows "Личная" badge for personal orgs
- [x] Frontend: Proper loading states for organization permission checks
- [x] Organization filter in users list page - Phase 0.4 ✅
- [x] Activity Log tab in user details page (recent runs and pipeline creations) - Phase 0.4 ✅
- [x] Admin can view user statistics - Phase 0.4 ✅
- [x] Admin can change user platform roles (admin ↔ user) - Phase 0.4 ✅
- [x] Admin can view user's organization-specific roles (per organization) - Phase 0.4 ✅
- [x] Admin can impersonate users (for troubleshooting) - Phase 0.4 ✅
- [x] Impersonation audit trail (impersonation start/end events logged) - Phase 0.4 ✅
- [x] Removed redundant Features tab from Admin Settings - Phase 0.4 ✅
- [ ] Feature checks in endpoints (optional - will be added when features are implemented) - Phase 0.3
- [ ] Feature-based UI visibility (optional - will be added when features are implemented) - Phase 0.3

---

#### Phase 1: Tools System (Foundation for Data Sources) ✅ **COMPLETE**

**Goal**: Replace hardcoded data adapters with user-configurable tools system.

**Status**: Core tool system complete. Tool references in step prompts moved to Phase 1.5.

---

#### Phase 1.5: Tool References in Step Prompts & Enhanced Pipeline Editor

**Goal**: Enable tools to be used within step prompts as variables, with support for tool inputs/parameters. Rework pipeline editor to allow test runs during editing for better UX. **Note**: Platform migrated from trading-focused to general research - broader UI/UX modernization needed.

**Testing Strategy**:
- **Phase 1**: Test with existing API/Database tools (Binance API, Yahoo Finance API - already migrated)
- **Phase 2**: Test with RAG tools once Phase 2 is complete
- **Test Cases**: Use existing pipelines (e.g., "Daily Analysis" with Wyckoff, SMC, VSA, Delta, ICT steps)
  - Create tools for existing data sources
  - Adjust existing pipeline prompts to use tool references
  - Verify results match expected outputs
  - Test new UI/UX on these existing pipelines

**UI/UX Modernization Context**:
- Platform transitioned from trading-focused to general research platform
- Need to adjust: Editor, pipeline representation, results representation, terminology
- Phase 1.5 includes initial UI improvements, but broader modernization may be needed in separate phase

**1.5.1) Tool Input/Parameter System** ✅ **COMPLETE**
- [x] **AI-Based Tool Parameter Extraction** ✅:
  - **Архитектура**: AI/LLM извлекает параметры из промпта для всех типов инструментов ✅
  - **Монолитность**: Используется тот же model, что выбран в step (для совместимости с локальными LLM) ✅
  - **Прозрачность**: Нет конфигурации для пользователя - все работает автоматически ✅
  - **Кэширование**: Результаты extraction кэшируются для оптимизации ✅
  - **Guardrails**: AI валидирует параметры и защищает от ошибок (SQL injection, etc.) ✅
  - **Примеры**:
    - RAG tool: AI извлекает query из текста вокруг `{rag_bank_reports}` ✅
    - Database tool: AI конвертирует вопрос в SQL запрос ✅
    - API tool: AI извлекает endpoint/params из промпта ✅
  - **См. детали**: `docs/AI_TOOL_EXTRACTION_ARCHITECTURE.md`
- [x] **Tool Execution Context** ✅:
  - Each tool receives: step context (instrument, timeframe, previous step outputs) ✅
  - AI pre-step анализирует контекст вокруг tool reference и извлекает параметры ✅
  - RAG tools: AI извлекает question/query из промпта, выполняет semantic search ✅
  - Database tools: AI конвертирует вопрос в SQL запрос ✅
  - API tools: AI извлекает endpoint/params из промпта ✅
- [x] **Tool Result Formatting** ✅:
  - Tool results formatted as text/JSON based on tool type ✅
  - RAG: Formatted as "Relevant context: ..." with document excerpts ✅
  - Database: Formatted as table or JSON ✅
  - API: Formatted as JSON or text response ✅

**1.5.2) Backend - Tool Execution in Steps** ✅ **COMPLETE**
- [x] **Step Config Enhancement** ✅:
  - Add `tool_references` array to `StepConfig` ✅:
    ```json
    {
      "tool_references": [
        {
          "tool_id": 5,
          "variable_name": "rag_bank_reports"
        }
      ]
    }
    ```
    - **Note**: `extraction_method` and `extraction_config` removed - AI-based extraction is automatic ✅
- [x] **Prompt Processing Enhancement** ✅:
  - Modify `format_user_prompt_template()` to:
    1. Detect tool references in template (e.g., `{rag_bank_reports}`) ✅
    2. For each tool reference:
       - Extract parameters from prompt context using AI ✅
       - Execute tool with extracted parameters ✅
       - Replace `{tool_name}` with formatted tool result ✅
    3. Continue with standard variable replacement ✅
- [x] **Tool Execution Engine Enhancement** ✅:
  - Add `execute_tool_with_context()` method ✅:
    - Accepts: tool, step context, prompt text, tool variable name ✅
    - Extracts parameters using AI (same model as step) ✅
    - Executes tool ✅
    - Formats and returns result ✅
  - **AI-Based Extraction** ✅:
    - For RAG: Extract question from text around tool reference ✅
    - For Database: Extract SQL query from prompt context ✅
    - For API: Extract instrument/timeframe/params from prompt context ✅
- [x] **Error Handling** ✅:
  - If tool execution fails: Show error in step output ✅
  - If parameter extraction fails: Use fallback (empty query, default params) ✅
  - Log tool execution errors for debugging ✅

**1.5.3) Frontend - Enhanced Pipeline Editor** ⚠️ **PARTIALLY COMPLETE**
- [x] **Tool Reference UI in Step Configuration** (Simplified Implementation):
  - **Variable Palette Enhancement** ✅:
    - Shows all active tools as variables in palette ✅
    - Tool variables displayed with green styling (`bg-green-50`, `text-green-700`) ✅
    - Click-to-insert functionality ✅
    - Automatically adds tool to `tool_references` when clicked ✅
    - Variable name auto-generated from `display_name` (sanitized: lowercase, spaces to underscores) ✅
    - Default extraction method: `natural_language` ✅
    - Default context_window: 200 chars ✅
  - [ ] **Advanced Tool Reference Configuration** (Not Implemented):
    - Multi-select dropdown for tools (currently simplified - all tools shown in palette)
    - **Extraction Method Selector** (Natural Language / Explicit / Template):
      - **Natural Language**: Автоматическое извлечение параметров из текста (текущая реализация)
      - **Explicit**: Явное указание параметров в синтаксисе `{tool_name(param="value")}` (не реализовано)
      - **Template**: Использование шаблонов с переменными `{variable}` (частично реализовано для Database)
    - **Extraction Config UI**:
      - `context_window` input (для Natural Language) - не экспонировано в UI
      - `query_template` textarea (для Database/RAG Template method) - не экспонировано в UI
      - `endpoint_template` input (для API Template method) - не реализовано
    - "Test Tool" button (opens test modal) - not implemented
    - "Create New Tool" button in step config - not implemented
    - **See**: `docs/TOOL_REFERENCES_CONFIGURATION.md` for detailed explanation of extraction methods
- [x] **Test Run During Editing** ✅ **COMPLETE**:
  - **"Test Step" Button**: ✅ Implemented - Tests single step without saving to database
  - **"Test Pipeline" Button**: ✅ Implemented - Tests entire pipeline without saving to database
  - **Test Run UI**: ✅ Implemented - TestResults component displays results in modal with expandable steps
  - **Backend Endpoints**: ✅ `POST /api/analyses/{id}/test-step` and `POST /api/analyses/{id}/test-pipeline`
  - **Features**:
    - Gets current text from editors before testing (same as save)
    - Supports custom_config override for testing unsaved changes
    - Shows execution results with input/output, tokens, cost, errors
    - Only available for saved pipelines (requires pipelineId)
    - **Automatic Dependency Execution**: ✅ When testing a step that uses variables from previous steps (e.g., `{website_output}`), system automatically executes all dependent steps first
      - Extracts dependencies from prompt template (finds `{step_name_output}` references)
      - Recursively executes dependent steps before testing current step
      - Adds results to `previous_steps` context automatically
      - Prevents "Invalid variable" errors during step testing
      - Example: Testing step 3 that uses `{website_output}` → automatically executes step "website" first → then tests step 3 with full context
  - **Bug Fixes**:
    - ✅ Fixed syntax error in `test_pipeline` endpoint (incorrect indentation in try block) - now fully functional
    - ✅ Added default pipeline name generation to prevent "Enter process name" modal during testing
- [x] **Basic UX Improvements**:
  - **Visual Indicators**:
    - Tool variables shown in Variable Palette with distinct styling ✅
    - Tool type shown in tooltip (`{tool_name} (api)`) ✅
  - [ ] **Advanced UX Improvements** (Not Implemented):
    - Highlight tool references in prompt editor
    - Show tool status (active/inactive) next to variable name
    - Show tool execution status during test runs
    - Auto-suggest tool variables as user types `{`
    - Suggest relevant tools based on prompt content
  - [x] **Basic Validation**:
    - Tool references automatically added when variable is clicked ✅
    - Only active tools shown in palette ✅

**1.5.4) AI-Based Extraction Implementation** ✅ **COMPLETE**
- [x] **API Tool Extraction** ✅:
  - AI extracts instrument and timeframe from prompt context ✅
  - Supports patterns: BTC/USDT, AAPL, H1, 1h, etc. ✅
  - Uses same LLM model as step for consistency ✅
  - Falls back to step_context if not found in prompt ✅
  - Example: "Get latest prices from {binance_api} for BTC/USDT on H1"
    - AI extracts: `instrument="BTC/USDT"`, `timeframe="H1"` ✅
    - Executes API call with extracted parameters ✅
  - **CCXT Adapter**: Handles nested params structure from AI extraction ✅
- [x] **Database Tool Extraction** ✅:
  - AI extracts SQL query from prompt context ✅
  - Supports query templates: `SELECT * FROM orders WHERE date = '{date}'` ✅
  - Replace template variables with values from step context ✅
  - Pattern matching for SQL keywords (SELECT, INSERT, UPDATE, etc.) ✅
  - Example: "Check orders from {orders_db}: SELECT * FROM orders WHERE customer_id = 123"
    - AI extracts: SQL query from prompt ✅
- [x] **RAG Tool Extraction** ✅:
  - AI extracts question/query from text around `{rag_tool_name}` ✅
  - Context window: 200 chars before/after tool reference ✅
  - Uses same LLM model as step for consistency ✅
  - Example: "get all 21/5/2025 transactions from {rag_bank_reports} how much was received from Tom Jankins?"
    - AI extracts query: "get all 21/5/2025 transactions, how much was received from Tom Jankins" ✅

**1.5.5) Example Use Cases & Testing with Existing Pipelines**

**Phase 1 Testing Examples** (Can test immediately with existing tools):
- [ ] **API Tool in Existing Pipeline**:
  ```
  Existing "Daily Analysis" pipeline step:
  Prompt: "Analyze {instrument} on {timeframe} using market data: {market_data_summary}"
  
  Updated to use tool:
  Prompt: "Analyze {instrument} on {timeframe} using market data from {binance_api}: {market_data_summary}"
  → Executes Binance API tool (already migrated)
  → Injects API results into prompt
  → Verify results match original pipeline output
  ```
- [ ] **Database Tool in Prompt**:
  ```
  Prompt: "Check customer orders from {orders_db}: get all orders for customer {customer_id}"
  → Extracts query: "get all orders for customer {customer_id}"
  → Executes database query (or uses template)
  → Injects result: "Check customer orders from [DB results...]: ..."
  ```

**Phase 2 Testing Examples** (After RAG system is complete):
- [ ] **RAG Tool in Prompt**:
  ```
  Prompt: "Based on company knowledge base {company_kb}, analyze the market trends for {instrument}"
  → Extracts query: "market trends for {instrument}"
  → Executes RAG query
  → Injects result: "Based on company knowledge base [RAG results...], analyze..."
  ```
- [ ] **RAG Tool with Complex Query**:
  ```
  Prompt: "get all 21/5/2025 transactions from {rag_bank_reports} how much was received from Tom Jankins?"
  → Extracts query: "get all 21/5/2025 transactions, how much was received from Tom Jankins"
  → Executes RAG semantic search
  → Injects relevant document excerpts
  ```

**Testing Checklist for Phase 1.5**:
- [x] **API Tool Testing** ✅ (Phase 1 - Core functionality complete):
  - [x] API tool variables appear in variable palette ✅
  - [x] Can insert API tool variables in prompt template ✅
  - [x] Natural language extraction works for API tools ✅
  - [x] API tool results are correctly injected into prompt ✅
  - [x] Existing pipelines (e.g., "Daily Analysis") work with API tool references ✅
  - [x] Results match expected outputs when using tool references vs. direct adapters ✅
  - [x] Test Step button executes step with API tool references ✅
  - [x] Test Pipeline button executes pipeline with API tool references ✅
- [x] **Database Tool Testing** ✅ (Phase 1 - Core functionality complete):
  - [x] Database tool variables appear in variable palette ✅
  - [x] Natural language extraction works for Database tools (SQL query extraction) ✅
  - [x] Database tool results are correctly injected into prompt ✅
- [x] **RAG Tool Testing** ⚠️ (Phase 2 - Basic implementation, full support after Phase 2):
  - [x] Basic natural language extraction works for RAG tools ✅
  - [x] RAG tool results are correctly injected into prompt ✅
  - [ ] Advanced extraction: "get all 21/5/2025 transactions from {rag_bank_reports} how much was received from Tom Jankins?" (Not fully implemented)
- [x] **General Testing** ✅:
  - [x] Tool execution errors are handled gracefully ✅
  - [x] Multiple tool references in same step work correctly ✅
  - [x] Tool references work with other variables ({step_name_output}, etc.) ✅
  - [x] UI/UX improvements work well with existing pipelines ✅

---

**1.1) Database Schema**

**Hybrid Model: User-Owned Tools with Organization-Level Access Control**

- [x] **User Tools Table** (`user_tools`):
  - `id`: Primary key
  - `user_id`: Foreign key to `users.id` (required) - Tools belong to USER
  - `organization_id`: Foreign key to `organizations.id` (nullable) - "Home" org where tool was created (for reference)
  - `tool_type`: Enum (`database`, `api`, `rag`) - Type of tool
  - `name`: String - Internal name (e.g., "CRM API", "Orders DB")
  - `display_name`: String - User-friendly display name
  - `config`: JSON - Type-specific configuration (credentials, connection details)
  - `is_active`: Boolean - Tool enabled/disabled globally
  - `is_shared`: Boolean (default `True`) - If true, available in all orgs where user is owner
  - `created_at`, `updated_at`: Timestamps
  
  **Key Concept**: Tools belong to users, not organizations. By default, tools are shared across all organizations where the user is owner.

- [x] **Organization Tool Access Table** (`organization_tool_access`):
  - `id`: Primary key
  - `organization_id`: Foreign key to `organizations.id` (required)
  - `tool_id`: Foreign key to `user_tools.id` (required)
  - `is_enabled`: Boolean (default `True`) - Tool enabled for this organization
  - `created_at`, `updated_at`: Timestamps
  - Unique constraint: `(organization_id, tool_id)` - One access record per org per tool
  
  **Purpose**: Allows disabling specific tools per organization. By default, all user's tools are enabled in all orgs where user is owner.

- [x] **Tool Configuration Schema**:
  - **Database tools**: `{connector_type: 'predefined' | 'custom', connector_name?: string, host, port, database, username, password_encrypted, ssl_mode, connection_string}`
    - **Predefined**: `connector_type='predefined'`, `connector_name='postgresql'` or `'mysql'` or `'mongodb'`
    - **Custom**: `connector_type='custom'`, full connection details
    - **Security**: Credentials encrypted using `cryptography` library ✅ **COMPLETE**
    - **Access**: Read-only queries only (for now)
  - **API tools**: `{connector_type: 'predefined' | 'custom', connector_name?: string, base_url, auth_type, api_key_encrypted, headers, timeout, request_template, adapter_config?: {adapter_type, exchange_name?, ...}}`
    - **Predefined**: `connector_type='predefined'`, `connector_name='binance'` or `'tinkoff'` or `'yfinance'`
      - May include `adapter_config` for adapter-specific settings (e.g., CCXT exchange name)
    - **Custom**: `connector_type='custom'`, full API configuration
    - **Security**: API keys encrypted using `cryptography` library ✅ **COMPLETE**
  - **RAG tools**: `{rag_id}` (references `rag_knowledge_bases` table - Phase 2)

- [x] **Access Logic**:
  - **Tool Creation**: User creates tool → automatically available in ALL orgs where user is owner (if `is_shared=True`)
  - **Tool Visibility**: When listing tools in org context:
    - Show all tools where `user_tools.user_id = current_user.id` AND `organizations.owner_id = current_user.id` AND `is_enabled = True` (from `organization_tool_access`)
  - **Org-Level Control**: User can go to org settings → disable specific tools for that org
  - **Use Case**: User creates "CRM API" tool → available in Org A and Org B (both owned by user) → User disables it in Org B settings → tool no longer visible in Org B

- [x] **Migration**:
  - Create `user_tools` table ✅
  - Create `organization_tool_access` table ✅
  - **Migrate existing adapters to user tools**:
    - For each existing user: Create tools based on current adapters
    - **CCXT → "Binance API" tool**: Create API tool with `base_url` and CCXT-specific config
    - **yfinance → "Yahoo Finance API" tool**: Create API tool (no API key needed)
    - **Tinkoff → "Tinkoff Invest API" tool**: Create API tool with token from `AppSettings.tinkoff_api_token` (if configured)
    - These become the user's actual tools (not examples/templates)
    - Auto-create `organization_tool_access` entries for all orgs where user is owner
  - **Note**: These migrated tools serve as good candidates for testing the new system

**1.2) Backend - Tool Management API**

- [x] **Tool CRUD Endpoints**:
  - `GET /api/tools` - List tools available in current organization context
    - Returns: All user's tools where user is owner of current org AND tool is enabled for current org
    - Filters by: `user_tools.user_id = current_user.id` AND `organizations.owner_id = current_user.id` AND `organization_tool_access.is_enabled = True`
  - `POST /api/tools` - Create new tool (belongs to user, available in all owned orgs by default)
    - Body: `{tool_type, name, display_name, config, is_shared (default true)}`
    - Creates tool with `user_id = current_user.id`
    - Sets `organization_id = current_organization.id` (home org reference)
    - Auto-creates `organization_tool_access` entries for ALL orgs where user is owner (if `is_shared=True`)
  - `GET /api/tools/{id}` - Get tool details (only if user owns tool AND tool is enabled in current org)
  - `PUT /api/tools/{id}` - Update tool (only if user owns tool)
    - Can update: name, display_name, config, is_active
    - **`is_shared` changes**: For now, not allowed to change after creation (can be added later)
    - If `is_shared` changes (future): Updates `organization_tool_access` entries accordingly
  - `DELETE /api/tools/{id}` - Delete tool (only if user owns tool)
    - **Usage Check**: Verifies tool is actually used in analysis prompts before allowing deletion
    - **Check Logic**: 
      - Iterates through all active `AnalysisType` configurations
      - For each step, checks if tool is referenced in `tool_references`
      - **Critical**: Verifies tool's variable name (`{variable_name}`) actually appears in `user_prompt_template` or `system_prompt` text
      - **Rationale**: Tool may be in `tool_references` (added via palette) but not used in prompt text
    - **If Used**: Returns HTTP 400 error with list of analyses using the tool (up to 3 names + count)
    - **If Not Used**: Deletes tool and all `organization_tool_access` entries
    - **Error Message**: Detailed Russian error message listing dependent analyses
  - `POST /api/tools/{id}/test` - Test tool connection (only if user owns tool)

- [x] **Organization Tool Access Endpoints**:
  - `GET /api/organizations/{org_id}/tools` - List all user's tools with access status for this org
    - Returns: All user's tools + `is_enabled` flag per tool for this org
    - Only accessible if user is owner of the org
  - `PUT /api/organizations/{org_id}/tools/{tool_id}/access` - Enable/disable tool for organization
    - Body: `{is_enabled: boolean}`
    - Only accessible if user is owner of the org AND user owns the tool
    - Creates/updates `organization_tool_access` record
- [x] **Organization Context API**:
  - `GET /api/auth/organizations` - List all organizations user belongs to ✅
  - `POST /api/auth/organizations/{id}/switch` - Switch active organization context ✅
  - `GET /api/auth/current-organization` - Get current organization context ✅
- [x] **Tool Execution Engine**:
  - `ToolExecutor` class with methods per tool type
  - **Database executor**: Execute SQL queries safely (read-only for now)
    - Support for MySQL, PostgreSQL, MongoDB (via connectors or generic config)
    - Query validation and safety checks
  - **API executor**: Make HTTP requests with auth
    - Support for predefined connectors (CCXT, yfinance, Tinkoff) via adapter pattern
    - Support for generic REST APIs
    - Auth handling: API Key, OAuth, Basic Auth, None
  - **RAG executor**: Query knowledge base (Phase 2)
  - **Connector Pattern**: Predefined connectors can use adapter classes internally
    - Example: "Binance API" tool → uses `CCXTAdapter` internally
    - Example: "Tinkoff Invest API" tool → uses `TinkoffAdapter` internally
  - Error handling and validation

**1.3) Frontend - Tools Management UI**

- [x] **Tools List Page** (`/tools`):
  - List tools available in current organization context
  - Shows: All user's tools where user is owner of current org AND tool is enabled
  - Filter by type (Database, API, RAG)
  - Search functionality
  - Actions: Create (belongs to user, available in all owned orgs), Edit, Delete, Test, Duplicate
  - Organization selector in navigation (switching org reloads page with different tool visibility)
  - **Note**: Same tools may appear in multiple orgs (if user owns multiple orgs), but access can be disabled per org

- [x] **Organization Settings - Tools Tab** (`/organizations/{id}/settings` or `/organizations/{id}`):
  - List all user's tools with toggle switches (enable/disable per org)
  - Shows: Tool name, type, status (enabled/disabled for this org)
  - Toggle switches: Enable/disable tool for this organization
  - Only visible if user is owner of the organization
  - **Use Case**: User creates "CRM API" → available in Org A and Org B → User goes to Org B settings → disables "CRM API" → tool no longer visible in Org B
- [x] **Create/Edit Tool Wizard** (Hybrid Approach):
  - **Step 1**: Select tool type (Database, API, RAG)
  - **Step 2**: Choose creation method:
    - **Option A**: Predefined Connector (if available for tool type)
      - Select connector from library (e.g., "Binance", "PostgreSQL", "MySQL")
      - Fill connector-specific settings form
    - **Option B**: Custom Tool
      - Fill generic configuration form:
        - **API**: Base URL, auth type, API key, headers, timeout
        - **Database**: Database type, host, port, database, username, password, SSL mode
  - **Step 3**: Test connection
  - **Step 4**: Name and save
  - **Note**: For Phase 1, start with generic tool creation. Predefined connectors can be added incrementally.
- [x] **Tool Integration in Run Creation**:
  - Tool selector dropdown in run creation forms ✅
  - Filter tools by type (API tools for data fetching) ✅
  - "Create New Tool" link opens tool wizard ✅
  - **Note**: Tool references in step prompts moved to Phase 1.5

- [ ] **Tool References in Step Prompts** (Phase 1 Enhancement):
  - **Step Tool Selection**: Add tool selector dropdown in step configuration panel
  - **Tool Variables in Prompts**: Users can reference tools in prompt templates via `{tool_name}_result` or `{tool_display_name}_result`
  - **Tool Execution**: Execute selected tools before step execution, inject results into prompt context
  - **Variable Palette Enhancement**: Add tool variables to clickable variable palette in prompt editor
  - **UX Improvements**:
    - Show available tools in variable palette (filtered by tool type if needed)
    - Click-to-insert tool variables
    - Visual indicator showing which tools are used in current step
    - Tool execution preview/test button
  - **Backend Integration**:
    - Add `tool_ids` array to `StepConfig` (steps can use multiple tools)
    - Modify `format_user_prompt_template()` to execute tools and inject results
    - Tool results formatted as text/JSON based on tool type
    - Error handling: If tool execution fails, show error in step output
  - **Example Usage**:
    - Step prompt: "Analyze {instrument} using data from CRM: {crm_api_result}"
    - Step prompt: "Check order status from database: {orders_db_result}"
    - Step prompt: "Use knowledge base context: {company_kb_result}"

**1.4) Migration from Data Adapters**

- [x] **Migrate Existing Adapters to User Tools**:
  - **Migration Strategy**: For each existing user, create tools based on current adapters ✅
  - **CCXT Adapter → "Binance API" Tool**:
    - Create API tool with `tool_type='api'` ✅
    - Config: `{connector_type: 'predefined', connector_name: 'binance', adapter_config: {adapter_type: 'ccxt', exchange_name: 'binance'}}` ✅
    - These become user's actual tools (not examples) ✅
  - **yfinance Adapter → "Yahoo Finance API" Tool**:
    - Create API tool with `tool_type='api'` ✅
    - Config: `{connector_type: 'predefined', connector_name: 'yfinance', adapter_config: {adapter_type: 'yfinance'}}` ✅
    - No API key needed ✅
  - **Tinkoff Adapter → "Tinkoff Invest API" Tool**:
    - Create API tool with `tool_type='api'` ✅
    - Config: `{connector_type: 'predefined', connector_name: 'tinkoff', adapter_config: {adapter_type: 'tinkoff'}, api_token: <from AppSettings>}` ✅
    - Only create if `AppSettings.tinkoff_api_token` is configured ✅
  - **Auto-setup**: For each user, create tools in their personal org ✅
  - **Auto-share**: Create `organization_tool_access` entries for all orgs where user is owner ✅
  - **Testing**: Migration script executed successfully ✅

- [x] **Update Pipeline Execution**:
  - Modify `AnalysisPipeline.run()` to use tools instead of hardcoded adapters ✅
  - **Tool Selection Logic**: 
    - If `run.tool_id` is set: Use that tool ✅
    - If no `tool_id`: Fallback to old adapter logic (backward compatibility) ✅
  - **Migration Path**: 
    - Existing analyses continue to work (fallback to adapters) ✅
    - New analyses can use tools via `tool_id` parameter ✅
    - Users can update existing analyses to use tools ✅
  - **Backward Compatibility**: Keep old adapters during transition period ✅

- [ ] **Tool Creation UI** (Hybrid Approach - Option C):
  - **Predefined Connectors** (Common Services):
    - Library of popular connectors with dedicated settings pages
    - Examples: Binance, Coinbase, PostgreSQL, MySQL, MongoDB, etc.
    - Each connector has:
      - Pre-configured `base_url` or connection template
      - Connector-specific settings form (API keys, credentials, etc.)
      - Validation rules and test connection logic
    - User selects connector → fills in credentials → tool created
  - **Generic Tool Creation** (Custom APIs/Databases):
    - Generic form for custom APIs:
      - Base URL input
      - Auth type selector (API Key, OAuth, Basic Auth, None)
      - Headers configuration
      - Timeout settings
    - Generic form for custom databases:
      - Database type selector (MySQL, PostgreSQL, MongoDB, etc.)
      - Connection details (host, port, database, username, password)
      - SSL mode configuration
    - User provides all configuration manually
  - **UI Flow**:
    - Step 1: Select tool type (Database, API, RAG)
    - Step 2a: If API/Database → Choose "Predefined Connector" or "Custom"
    - Step 2b: If Predefined → Select connector from library → Fill connector-specific form
    - Step 2c: If Custom → Fill generic form
    - Step 3: Test connection
    - Step 4: Name and save
  - **For Phase 1**: Implement basic generic tool creation first, add predefined connectors incrementally

**Testing Checklist for Phase 1**:
- [x] Can create database tool (read-only) ✅
- [x] Can create API tool ✅
- [x] Tool test connection works ✅
- [x] Credentials encrypted/decrypted correctly ✅ **IMPLEMENTED**
- [x] Can use tool in analysis run (via `tool_id` parameter) ✅
- [x] Tool execution works in pipeline ✅ **IMPLEMENTED**
- [x] Migrated tools (CCXT, yfinance, Tinkoff) work correctly ✅ **MIGRATION COMPLETE**
- [x] Tools available in all orgs where user is owner ✅
- [x] Can disable tool in specific org via settings ✅
- [x] Tool deletion prevented (if used in analyses) ✅
  - **Implementation**: Checks for actual variable usage in prompt text, not just `tool_references` presence ✅
  - **Logic**: Tool is considered "used" only if variable appears in `user_prompt_template` or `system_prompt` ✅
- [x] Backward compatibility: Old analyses still work with adapters ✅ **IMPLEMENTED**

---

#### Phase 2: RAG System (Knowledge Bases)

**Goal**: Enable users to create and manage knowledge bases for use in analysis steps.

**2.1) Database Schema**
- [ ] **RAG Knowledge Bases Table**:
  - `rag_knowledge_bases`: id, organization_id (required), name, description, vector_db_type, embedding_model, document_count, created_at, updated_at
  - Note: RAGs belong to organizations (user's personal org or shared org)
- [ ] **RAG Documents Table**:
  - `rag_documents`: id, rag_id, title, content, file_path (nullable), metadata (JSON), embedding_status, created_at, updated_at
- [ ] **Vector Storage**:
  - Choose vector DB: ChromaDB (local) or Qdrant (can be remote)
  - Store embeddings per document
  - Index for semantic search

**2.2) Backend - RAG Management API**
- [ ] **RAG CRUD Endpoints**:
  - `GET /api/rags` - List RAGs from current organization context ONLY
  - Backend filters by `X-Organization-Id` header (from session)
  - No cross-organization access (user must switch org context to see other org's RAGs)
  - `POST /api/rags` - Create new RAG (in current organization context ONLY)
  - `GET /api/rags/{id}` - Get RAG details (only if RAG belongs to current org context)
  - `PUT /api/rags/{id}` - Update RAG config (only if RAG belongs to current org context)
  - `DELETE /api/rags/{id}` - Delete RAG (only if RAG belongs to current org context)
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
  - List RAGs from current organization context ONLY
  - No organization filter (complete separation - only current org visible)
  - Show: Name, document count, last updated
  - Actions: Create (in current org), Manage Documents, Query Test, Delete
  - Organization selector in navigation (switching org reloads page with new org's RAGs)
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

**5.1) Scheduling System** ✅ **COMPLETE**
- [x] **Schedules Table**:
  - `schedules`: id, user_id, organization_id (required), analysis_type_id, schedule_type (daily/weekly/interval/cron), schedule_config (JSON), is_active, last_run_at, next_run_at, created_at, updated_at
  - Schedule types supported:
    - **Daily**: `{ "time": "08:00" }` - Run at specific time every day
    - **Weekly**: `{ "day_of_week": 0, "time": "11:00" }` - Run on specific day of week (0=Monday, 6=Sunday)
    - **Interval**: `{ "interval_minutes": 60 }` - Run every N minutes
    - **Cron**: `{ "cron_expression": "0 8 * * *" }` - Run using cron expression
  - Organization-scoped: All schedules belong to organizations (complete separation)
- [x] **Scheduler Integration**:
  - APScheduler (`BackgroundScheduler`) integrated in backend
  - Scheduler starts automatically on backend startup (PID-based lock ensures single instance)
  - Schedule management API: `GET /api/schedules`, `POST /api/schedules`, `PUT /api/schedules/{id}`, `DELETE /api/schedules/{id}`, `GET /api/schedules/stats`
  - UI for creating/managing schedules: `/schedules` page with statistics, table, and modal forms
  - Schedule jobs automatically added/removed when schedules are created/updated/deleted
- [x] **Schedule Execution**:
  - Run analyses automatically via APScheduler jobs
  - Each schedule job creates `AnalysisRun` with `trigger_type='scheduled'`
  - Executes full pipeline execution (same as manual runs)
  - Tracks `last_run_at` and calculates `next_run_at` automatically
  - Scheduler service: `app/services/scheduler/scheduler_service.py`
  - Error handling: Failed runs logged, scheduler continues with other schedules

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
- [x] Can create schedules ✅
- [x] Schedules execute automatically ✅
- [ ] Conditional steps work
- [ ] Analytics display correctly
- [ ] Cost tracking accurate

---

### 12) Notes

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
System processes are created via Python scripts in `backend/scripts/` directory. Each script follows a consistent pattern and can be executed locally for testing, then deployed to production. This section documents the complete workflow from script creation to production deployment.

**Script Structure Pattern**:

All system process creation scripts follow this structure:

```python
#!/usr/bin/env python3
"""
Script to create the complete "[Process Name]" system process.

This script:
1. Gets or creates required tools for platform admin (if needed)
2. Creates the "[Process Name]" process with all steps
3. Configures tool references and variable dependencies

Run this after cleaning all processes and tools (if needed).
"""

import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.models.organization import Organization
from app.models.analysis_type import AnalysisType
from app.models.user_tool import UserTool, ToolType
from app.models.organization_tool_access import OrganizationToolAccess
from app.services.tools.encryption import encrypt_tool_config
from app.services.organization import get_user_personal_organization, create_personal_organization
from sqlalchemy.orm.attributes import flag_modified


def get_platform_admin_user(db: Session) -> User:
    """Get platform admin user."""
    admin_user = db.query(User).filter(User.role == 'admin').first()
    if not admin_user:
        raise Exception("Platform admin user not found. Please create an admin user first.")
    return admin_user


def get_or_create_admin_organization(db: Session, admin_user: User) -> Organization:
    """Get or create platform admin's personal organization."""
    org = get_user_personal_organization(db, admin_user.id)
    if not org:
        print(f"Creating personal organization for admin user {admin_user.email}...")
        org = create_personal_organization(
            db, 
            admin_user.id, 
            admin_user.full_name or "Platform Admin",
            admin_user.email
        )
        print(f"✅ Created organization: {org.name} (ID: {org.id})")
    else:
        print(f"✅ Using existing organization: {org.name} (ID: {org.id})")
    return org


def get_or_create_tool(db: Session, admin_user: User, admin_org: Organization) -> UserTool:
    """Get or create tool for platform admin (if process uses tools)."""
    # Check if tool already exists
    existing = db.query(UserTool).filter(
        UserTool.user_id == admin_user.id,
        UserTool.display_name == "[Tool Display Name]",
        UserTool.tool_type == ToolType.API.value  # or ToolType.DATABASE, ToolType.RAG
    ).first()

    if existing:
        print(f"✅ Using existing tool (ID: {existing.id})")
        return existing

    # Tool configuration
    config = {
        "connector_type": "predefined",  # or "custom"
        "connector_name": "[connector_name]",  # e.g., "binance", "yfinance", "tinkoff"
        # ... tool-specific config
    }

    # Encrypt config
    encrypted_config = encrypt_tool_config(config)

    # Create tool
    tool = UserTool(
        user_id=admin_user.id,
        organization_id=admin_org.id,
        tool_type=ToolType.API.value,
        display_name="[Tool Display Name]",
        config=encrypted_config,
        is_active=True,
        is_shared=True
    )

    db.add(tool)
    db.flush()  # Get ID

    # Create organization_tool_access entries for all admin's orgs
    admin_orgs = db.query(Organization).filter(Organization.owner_id == admin_user.id).all()
    for org in admin_orgs:
        access = OrganizationToolAccess(
            organization_id=org.id,
            tool_id=tool.id,
            is_enabled=True
        )
        db.add(access)

    db.commit()
    db.refresh(tool)

    print(f"✅ Created tool (ID: {tool.id})")
    return tool


def get_process_config(tool_id: int = None) -> dict:
    """Get process configuration with all steps."""
    return {
        "steps": [
            {
                "step_name": "step_1",
                "order": 1,
                "step_type": "llm_analysis",
                "model": "openai/gpt-4o-mini",
                "system_prompt": "...",
                "user_prompt_template": "...",
                "temperature": 0.7,
                "max_tokens": 2000,
                "tool_references": [
                    {
                        "tool_id": tool_id,
                        "variable_name": "tool_variable_name",
                        "extraction_method": "natural_language",
                        "extraction_config": {
                            "context_window": 200
                        }
                    }
                ] if tool_id else []
            },
            # ... more steps
        ],
        "estimated_cost": 0.05,
        "estimated_duration_seconds": 300
    }


def create_process(db: Session):
    """Main function to create the process."""
    print("\nStep 1: Getting platform admin and organization...")
    admin_user = get_platform_admin_user(db)
    admin_org = get_or_create_admin_organization(db, admin_user)

    # Get or create tools (if needed)
    tool = None
    if process_uses_tools:
        print("\nStep 2: Getting or creating tools...")
        tool = get_or_create_tool(db, admin_user, admin_org)

    # Check if process already exists
    existing_process = db.query(AnalysisType).filter(
        AnalysisType.name == 'process_name'
    ).first()

    config = get_process_config(tool.id if tool else None)

    if existing_process:
        print(f"⚠️  Process already exists (ID: {existing_process.id})")
        print("   Updating existing process...")
        existing_process.config = config
        existing_process.display_name = "[Process Display Name]"
        # ... update other fields
        flag_modified(existing_process, 'config')
        db.commit()
        db.refresh(existing_process)
        process = existing_process
    else:
        process = AnalysisType(
            name="process_name",
            display_name="[Process Display Name]",
            description="[Process description]",
            version="1.0.0",
            config=config,
            is_system=True,
            user_id=admin_user.id,
            organization_id=admin_org.id,
            is_active=1
        )
        db.add(process)
        db.commit()
        db.refresh(process)
        print(f"✅ Created process: {process.display_name} (ID: {process.id})")

    return process


def main():
    print("=" * 60)
    print("Creating '[Process Name]' system process")
    print("=" * 60)
    
    db: Session = SessionLocal()
    try:
        process = create_process(db)
        print("\n" + "=" * 60)
        print("✅ Success! Process created.")
        print("=" * 60)
        print(f"Process ID: {process.id}")
        print(f"Steps: {len(process.config['steps'])}")
    except Exception as e:
        print("\n" + "=" * 60)
        print("❌ Error during script execution:")
        print("=" * 60)
        print(str(e))
        import traceback
        traceback.print_exc()
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

**Key Script Requirements**:

1. **Idempotency**: Scripts should be idempotent - safe to run multiple times. Check for existing tools/processes and update if they exist.
2. **Error Handling**: Wrap main logic in try-except, rollback on error, print clear error messages.
3. **Admin Context**: Always use platform admin user (`role='admin'`) and admin's organization.
4. **Tool Management**: If process uses tools:
   - Check if tool exists before creating
   - Create `organization_tool_access` entries for all admin's orgs
   - Use `encrypt_tool_config()` for sensitive credentials
5. **Process Configuration**: Include complete step configuration with:
   - Step names, order, types
   - Prompts (system and user)
   - Model settings (temperature, max_tokens)
   - Tool references (if applicable)
   - Estimated cost and duration

**Deployment Workflow**:

**Step 1: Local Development & Testing**
```bash
# 1. Create script in backend/scripts/
# 2. Test syntax
chmod +x backend/scripts/create_[process_name].py
python -m py_compile backend/scripts/create_[process_name].py

# 3. Activate virtual environment
cd backend
source .venv/bin/activate

# 4. Run script locally
python scripts/create_[process_name].py

# 5. Verify in UI: Check that process appears in "Примеры процессов" tab
# 6. Test process: Create a run and verify it executes correctly
```

**Step 2: Commit & Push**
```bash
# 1. Stage script
git add backend/scripts/create_[process_name].py

# 2. Commit with descriptive message
git commit -m "Add script to create [Process Name] system process"

# 3. Push to repository
git push
```

**Step 3: Deploy to Production**
```bash
# 1. SSH to production server
ssh rf-prod

# 2. Pull latest changes
cd /srv/research-flow
git pull

# 3. Activate virtual environment
cd backend
source .venv/bin/activate

# 4. Run script on production
python scripts/create_[process_name].py

# 5. Verify: Check logs for success message
# 6. Verify in production UI: Process should appear in "Примеры процессов" tab
```

**Example Scripts** (Reference Implementations):

1. **`create_daily_analysis.py`**: Creates "Дневной анализ" process with Binance API tool
   - Demonstrates: API tool creation, `fetch_market_data` step, tool references
   - Uses: Binance API tool (CCXT adapter)

2. **`create_equity_analysis.py`**: Creates "Анализ акций" process with Yahoo Finance API tool
   - Demonstrates: Public API tool (no auth), market data formatting
   - Uses: Yahoo Finance API tool (yfinance adapter)

3. **`create_commodity_futures_analysis.py`**: Creates "Анализ товарных фьючерсов" process with Tinkoff Invest API tool
   - Demonstrates: API tool with token authentication
   - Uses: Tinkoff Invest API tool (Tinkoff adapter)

4. **`create_crypto_analysis.py`**: Creates "Анализ криптовалют" process with Binance API tool
   - Demonstrates: Reusing existing tool (Binance API)
   - Uses: Binance API tool (shared with daily analysis)

5. **`create_tour_operator_cities_selection.py`**: Creates "Подбор городов для туристического пакета" process
   - Demonstrates: LLM-only process (no tools), variable dependencies
   - Uses: No tools, pure LLM analysis with variable chaining

**Common Patterns**:

**Pattern 1: Process with Single API Tool**
- Create/get API tool in `get_or_create_tool()`
- Reference tool in `fetch_market_data` step (if needed)
- Use tool variable in subsequent steps

**Pattern 2: Process with Multiple Tools**
- Create multiple tools sequentially
- Reference each tool in appropriate steps
- Each tool gets its own `tool_references` entry

**Pattern 3: Process without Tools**
- Skip tool creation
- Use only LLM steps with variable dependencies
- Example: Tour operator cities selection

**Pattern 4: Reusing Existing Tools**
- Check if tool exists by `display_name` and `tool_type`
- If exists, use existing tool ID
- If not, create new tool
- Example: Crypto analysis reuses Binance API tool

**Best Practices**:

1. **Script Naming**: Use descriptive names: `create_[process_name].py` (e.g., `create_daily_analysis.py`)
2. **Process Naming**: Use snake_case for `name` field: `daily_analysis`, `equity_analysis`
3. **Display Names**: Use Russian for `display_name`: "Дневной анализ", "Анализ акций"
4. **Idempotency**: Always check for existing tools/processes before creating
5. **Error Messages**: Print clear, actionable error messages with context
6. **Logging**: Print progress messages for each major step (✅ for success, ⚠️ for warnings)
7. **Tool Encryption**: Always use `encrypt_tool_config()` for tools with credentials
8. **Organization Access**: Create `organization_tool_access` entries for all admin's orgs
9. **Testing**: Test locally before deploying to production
10. **Documentation**: Include docstring explaining what the script does

**Troubleshooting**:

**Issue**: Script fails with "Platform admin user not found"
- **Solution**: Ensure admin user exists: `db.query(User).filter(User.role == 'admin').first()`

**Issue**: Tool creation fails with encryption error
- **Solution**: Ensure `SESSION_SECRET` is set in `app/config_local.py`

**Issue**: Process appears but tools are missing
- **Solution**: Check that `organization_tool_access` entries were created for all admin's orgs

**Issue**: Script works locally but fails on production
- **Solution**: Check database connection, ensure virtual environment is activated, verify admin user exists on production

**Quick Reference Commands**:

```bash
# Local testing
cd backend && source .venv/bin/activate && python scripts/create_[name].py

# Production deployment
ssh rf-prod "cd /srv/research-flow/backend && source .venv/bin/activate && python scripts/create_[name].py"

# Check existing processes
ssh rf-prod "cd /srv/research-flow/backend && source .venv/bin/activate && python -c 'from app.core.database import SessionLocal; from app.models.analysis_type import AnalysisType; db = SessionLocal(); processes = db.query(AnalysisType).filter(AnalysisType.is_system == True).all(); [print(f\"{p.id}: {p.display_name}\") for p in processes]'"
```

**Future Enhancements**:

- **Batch Script**: Create a master script that runs all process creation scripts in sequence
- **Validation**: Add validation checks for step configuration before creating process
- **Rollback**: Add ability to rollback process creation if errors occur
- **Versioning**: Track process versions and allow updates without recreating
- **Testing**: Automated tests for process creation scripts

### 12b) UI/UX Consistency & Translation

**Light Theme Migration**:
- All pages migrated from dark theme to consistent light theme
- Removed all `dark:` Tailwind classes
- Consistent color scheme: white backgrounds (`bg-white`), gray borders (`border-gray-200`), blue accents (`text-blue-600`)
- Applied to: Login, Register, Dashboard, Sidebar, TopBar, User Settings, Analyses, Runs, Pipeline Editor, Analysis Detail

**Translation Completeness**:
- All user-facing text translated to Russian
- Consistent terminology across all pages
- Status labels, buttons, form labels, tooltips, error messages all translated
- Step names translated (including new system process steps)

**Design System Consistency**:
- **Cards**: All cards use `rounded-lg`, `shadow-sm`, `border border-gray-200` styling
- **Buttons**: Icon-based actions where appropriate (Edit, Run, Duplicate, History icons)
- **Typography**: Consistent font sizes, weights, spacing
- **Spacing**: Consistent padding and margins (`p-6`, `space-y-6`, `mb-4`)
- **Hover Effects**: Subtle hover states (`hover:border-gray-300`, `hover:shadow-sm`)

**Page-Specific Improvements**:
- **Run Details Page**: Professional layout with progress overview, expandable steps, prominent result section
- **Analysis Detail Page**: Clean overview card, expandable step configuration, inline editing
- **Analyses List Page**: Filter tabs (My processes / Example processes), icon-based actions, improved card design
- **Pipeline Editor**: Inline step addition, collapsible advanced settings, simplified variable palette


