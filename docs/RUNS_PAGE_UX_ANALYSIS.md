# Runs Page UX Analysis & Recommendations

## Current State Analysis

### Current Columns
1. **ID** ✅ - Essential for identification and linking
2. **Инструмент (Instrument)** ❌ - Domain-specific (trading only)
3. **Таймфрейм (Timeframe)** ❌ - Domain-specific (trading only)
4. **Статус (Status)** ✅ - Essential for understanding execution state
5. **Стоимость (Cost)** ✅ - Important for cost tracking
6. **Выполнено (Execution timestamp)** ✅ - Recently improved, shows completion time
7. **Действия (Actions)** ✅ - Essential for navigation

### Issues Identified

#### 1. **Domain-Specific Columns**
- **Problem**: "Инструмент" and "Таймфрейм" are trading/finance-specific
- **Impact**: Platform is general-purpose (per MASTER_PLAN.md), so these columns are irrelevant for:
  - Business intelligence workflows
  - Research reports
  - Compliance monitoring
  - Any non-trading analyses
- **UX Principle Violation**: Platform should be domain-agnostic

#### 2. **Missing Critical Information**
- **Problem**: No "Analysis Type/Process Name" column
- **Impact**: Users cannot identify which process/analysis was executed
- **MASTER_PLAN Reference**: Section 474 mentions "Analysis Type" as a column
- **User Need**: "Which process did this run execute?" is a primary question

#### 3. **Missing Progress Information**
- **Problem**: No "Steps Completed" indicator
- **Impact**: For running analyses, users cannot see progress
- **MASTER_PLAN Reference**: Section 476 mentions "Steps Completed" as a column
- **User Need**: "How far along is this run?" is important for long-running analyses

## Recommended Column Structure

### Essential Columns (Always Visible)
1. **ID** - Run identifier (#123)
2. **Процесс (Process)** - Analysis type/process name (e.g., "Daystart Analysis", "Tour Operator Cities")
3. **Статус (Status)** - Execution status with color badges
4. **Стоимость (Cost)** - Total cost in USD
5. **Выполнено (Execution timestamp)** - When execution completed (or "В процессе" if running)
6. **Действия (Actions)** - Link to detail view

### Optional/Contextual Columns
- **Шагов выполнено (Steps Completed)** - Show as "3/5" for running analyses, "5/5" for completed
- **Тип запуска (Trigger Type)** - "Вручную" (Manual) or "По расписанию" (Scheduled) - could be shown as icon/badge

### Removed Columns
- **Инструмент (Instrument)** - Remove (domain-specific)
- **Таймфрейм (Timeframe)** - Remove (domain-specific)

## Implementation Recommendations

### Phase 1: Core Changes (High Priority)
1. **Add "Процесс" column** showing `analysis_type.display_name`
   - Backend: Update `RunResponse` to include `analysis_type_name: Optional[str]`
   - Frontend: Display as first column after ID
   - Fallback: Show "N/A" or "Удалённый процесс" if analysis_type is null

2. **Remove "Инструмент" and "Таймфрейм" columns**
   - These are trading-specific and don't apply to general-purpose platform
   - If needed for legacy/trading-specific views, can be added as optional filters

### Phase 2: Enhanced Information (Medium Priority)
3. **Add "Шагов выполнено" column**
   - Show progress for running analyses (e.g., "3/5")
   - Show total for completed analyses (e.g., "5/5")
   - Backend: Calculate from `steps` count vs expected steps from `analysis_type.config`
   - Frontend: Display with progress indicator for running analyses

4. **Add "Тип запуска" indicator**
   - Show as icon/badge: 🕐 for scheduled, 👤 for manual
   - Or small text badge next to status
   - Helps users understand run context

### Phase 3: Advanced Features (Low Priority)
5. **Add filters** (as mentioned in MASTER_PLAN)
   - Filter by Analysis Type
   - Filter by Status
   - Filter by Date Range
   - Filter by Trigger Type

6. **Add sorting options**
   - Sort by execution time (newest first - default)
   - Sort by cost (highest first)
   - Sort by process name
   - Sort by status

## UX Principles Applied

1. **General-Purpose Design**: Removed domain-specific columns to support all use cases
2. **Information Hierarchy**: Most important info (Process name) is prominently displayed
3. **Progressive Disclosure**: Detailed info available in detail view, summary in list
4. **Contextual Relevance**: Only show information that applies to all analyses
5. **User Goals**: Help users quickly identify "What ran?" and "What happened?"

## Backend Changes Required

1. **Update `RunResponse` model**:
```python
class RunResponse(BaseModel):
    id: int
    trigger_type: str
    instrument: str  # Keep for backward compatibility, but mark as optional/deprecated
    timeframe: str  # Keep for backward compatibility, but mark as optional/deprecated
    status: str
    created_at: datetime
    finished_at: Optional[datetime] = None
    cost_est_total: float = 0.0
    steps: list[RunStepResponse] = []
    analysis_type_id: Optional[int] = None
    analysis_type_name: Optional[str] = None  # NEW: display_name from AnalysisType
    analysis_type_config: Optional[dict] = None
    steps_completed: Optional[int] = None  # NEW: count of completed steps
    steps_total: Optional[int] = None  # NEW: total steps from config
```

2. **Update `list_runs` endpoint**:
   - Include `analysis_type.display_name` in response
   - Calculate `steps_completed` and `steps_total` from steps and config

## Frontend Changes Required

1. **Update table columns**:
   - Add "Процесс" column (after ID)
   - Remove "Инструмент" and "Таймфрейм" columns
   - Optionally add "Шагов выполнено" column

2. **Update `Run` interface**:
```typescript
interface Run {
  id: number
  trigger_type: string
  instrument: string  // Keep for backward compatibility
  timeframe: string  // Keep for backward compatibility
  status: string
  created_at: string
  finished_at: string | null
  cost_est_total: number
  analysis_type_id?: number | null
  analysis_type_name?: string | null  // NEW
  steps_completed?: number | null  // NEW
  steps_total?: number | null  // NEW
}
```

## Migration Strategy

1. **Backward Compatibility**: Keep `instrument` and `timeframe` in API response but don't display in UI
2. **Gradual Rollout**: 
   - Phase 1: Add process name, keep old columns hidden
   - Phase 2: Remove old columns from UI
   - Phase 3: Add enhanced features (steps completed, filters)

## Success Metrics

- Users can identify which process was executed without clicking into details
- Table is relevant for all analysis types (not just trading)
- Information density is appropriate (not too cluttered, not too sparse)
- Users can quickly scan and find relevant runs
