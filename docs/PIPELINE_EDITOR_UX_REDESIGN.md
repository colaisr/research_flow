# Pipeline Editor UX Redesign

## Vision: Simple, Iterative, Visual Flow Building

**Core Principle**: Users should build research flows step-by-step, testing each step as they go, seeing results immediately, and iterating until satisfied before moving to the next step.

**Inspiration**: n8n workflow execution visualization - users see progress flow through steps in real-time, not just final results.

---

## Current Problems

1. **Too much noise**: Many fields visible at once (metadata, advanced settings, multiple buttons)
2. **No visual flow**: Results appear only at the end in a modal, not during execution
3. **Not iterative**: Hard to test → tweak → test again quickly
4. **Complex step configuration**: Advanced settings, model selection, temperature sliders all visible
5. **No execution visualization**: Can't see which step is running, what's happening

---

## New UX Design

### 1. Layout Structure: Focused Step-by-Step Building

#### 1.1 Main Layout (Split View)

```
┌─────────────────────────────────────────────────────────────┐
│ Header: [Pipeline Name] [Save] [Settings]                  │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│  STEP BUILDER           │   EXECUTION VIEW                 │
│  (Left Panel - 50%)     │   (Right Panel - 50%)            │
│                          │                                  │
│  ┌────────────────────┐ │   ┌──────────────────────────┐  │
│  │ Step 1: [Active]   │ │   │ Visual Flow Diagram       │  │
│  │ ┌────────────────┐ │ │   │                          │  │
│  │ │ Prompt Editor  │ │ │   │  [Step 1] → [Step 2]    │  │
│  │ │                │ │ │   │                          │  │
│  │ └────────────────┘ │ │   │  Results appear here     │  │
│  │                     │ │   │  as flow executes        │  │
│  │ [Test Step]         │ │   │                          │  │
│  └────────────────────┘ │   └──────────────────────────┘  │
│                          │                                  │
│  ┌────────────────────┐ │                                  │
│  │ Step 2: [Inactive]  │ │                                  │
│  └────────────────────┘ │                                  │
│                          │                                  │
│  ┌────────────────────┐ │                                  │
│  │ + Add Next Step    │ │                                  │
│  └────────────────────┘ │                                  │
│                          │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

**Key Changes**:
- **Split view**: Step builder on left, execution visualization on right
- **One step active at a time**: Only one step expanded/editable
- **Visual flow**: Right panel shows flow diagram with execution progress
- **Results inline**: Step results appear in the flow diagram as they execute

#### 1.2 Step Builder Panel (Left)

**When no steps exist**:
```
┌─────────────────────────────────────┐
│                                     │
│   Start your research flow          │
│                                     │
│   ┌─────────────────────────────┐   │
│   │ What do you want to        │   │
│   │ research or analyze?        │   │
│   │                             │   │
│   │ [Type your first question]  │   │
│   └─────────────────────────────┘   │
│                                     │
│   [Start Building]                  │
│                                     │
└─────────────────────────────────────┘
```

**When steps exist**:
```
┌─────────────────────────────────────┐
│ Step 1: Generate Cities List       │
│ ─────────────────────────────────── │
│                                     │
│ System Prompt:                      │
│ ┌─────────────────────────────────┐ │
│ │ You are an expert...            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ User Prompt:                        │
│ ┌─────────────────────────────────┐ │
│ │ Generate a list of 8 popular...│ │
│ │ {variables}                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Variables: [city_list] [weather]   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ [Test This Step]                │ │
│ └─────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ Step 2: Analyze Weather             │
│ [Click to edit]                     │
├─────────────────────────────────────┤
│ Step 3: Final Recommendation        │
│ [Click to edit]                     │
├─────────────────────────────────────┤
│ [+ Add Next Step]                   │
└─────────────────────────────────────┘
```

**Key Features**:
- **One step active**: Only expanded step is editable
- **Simplified prompts**: Large, focused text areas
- **Variables inline**: Small pill buttons below prompt
- **Test button prominent**: Large, visible "Test This Step" button
- **Collapsed steps**: Other steps show name only, click to expand

#### 1.3 Execution View Panel (Right)

**When not executing**:
```
┌─────────────────────────────────────┐
│ Visual Flow                          │
│ ─────────────────────────────────── │
│                                     │
│   ┌──────────┐                      │
│   │ Step 1   │                      │
│   │ Generate │                      │
│   └────┬─────┘                      │
│        │                            │
│        ▼                            │
│   ┌──────────┐                      │
│   │ Step 2   │                      │
│   │ Analyze  │                      │
│   └────┬─────┘                      │
│        │                            │
│        ▼                            │
│   ┌──────────┐                      │
│   │ Step 3   │                      │
│   │ Final    │                      │
│   └──────────┘                      │
│                                     │
│   [Test Full Pipeline]              │
│                                     │
└─────────────────────────────────────┘
```

**During execution** (like n8n):
```
┌─────────────────────────────────────┐
│ Visual Flow (Running...)             │
│ ─────────────────────────────────── │
│                                     │
│   ┌──────────┐                      │
│   │ Step 1   │ ✓                    │
│   │ Generate │                      │
│   └────┬─────┘                      │
│        │                            │
│        ▼ [pulse animation]          │
│   ┌──────────┐                      │
│   │ Step 2   │ ⏳ Running...        │
│   │ Analyze  │                      │
│   │          │                      │
│   │ Result preview:                 │
│   │ "Based on weather data..."      │
│   └────┬─────┘                      │
│        │                            │
│        ▼                            │
│   ┌──────────┐                      │
│   │ Step 3   │ ⏸ Waiting...        │
│   │ Final    │                      │
│   └──────────┘                      │
│                                     │
│   [Stop]                            │
│                                     │
└─────────────────────────────────────┘
```

**After execution**:
```
┌─────────────────────────────────────┐
│ Visual Flow (Completed)              │
│ ─────────────────────────────────── │
│                                     │
│   ┌──────────┐                      │
│   │ Step 1   │ ✓                    │
│   │ Generate │                      │
│   │          │ Result: "Paris, ..."  │
│   └────┬─────┘                      │
│        │                            │
│        ▼                            │
│   ┌──────────┐                      │
│   │ Step 2   │ ✓                    │
│   │ Analyze  │                      │
│   │          │ Result: "Moderate..." │
│   └────┬─────┘                      │
│        │                            │
│        ▼                            │
│   ┌──────────┐                      │
│   │ Step 3   │ ✓                    │
│   │ Final    │                      │
│   │          │ Result: "Recommend..."│
│   └──────────┘                      │
│                                     │
│   [Test Again] [Save Pipeline]     │
│                                     │
└─────────────────────────────────────┘
```

**Key Features**:
- **Visual flow diagram**: Steps connected with arrows
- **Real-time progress**: Shows which step is executing
- **Inline results**: Step results appear below each step box
- **Status indicators**: ✓ Success, ⏳ Running, ✗ Error, ⏸ Waiting
- **Pulse animation**: Visual indicator flowing through steps
- **Expandable results**: Click step to see full result

---

### 2. Simplified Step Configuration

#### 2.1 Default Step View (Minimal)

**What's visible by default**:
- Step name (editable inline)
- System prompt (large textarea)
- User prompt (large textarea with variable palette)
- Variables (small pills below prompt)
- Test button (prominent)

**What's hidden**:
- Model selection (default to gpt-4o-mini)
- Temperature (default to 0.7)
- Max tokens (default to 2000)
- Advanced settings (collapsed by default)

#### 2.2 Advanced Settings (Collapsible)

**Only show when needed**:
```
┌─────────────────────────────────────┐
│ [▼] Advanced Settings                │
│                                     │
│ Model: [gpt-4o-mini ▼]              │
│ Temperature: [━━━━●━━] 0.7          │
│ Max Tokens: [2000]                  │
│                                     │
└─────────────────────────────────────┘
```

**Rationale**: Most users don't need to change these. Hide them to reduce noise.

---

### 3. Iterative Testing Workflow

#### 3.1 Test Step Flow

1. **User types prompt** → Clicks "Test This Step"
2. **Step executes** → Right panel shows:
   - Step box pulses (⏳ Running...)
   - Loading indicator
3. **Result appears** → Right panel shows:
   - Step box shows ✓ Success
   - Result preview below step box
   - Click to expand full result
4. **User tweaks prompt** → Clicks "Test This Step" again
5. **New result appears** → User compares, iterates

#### 3.2 Test Pipeline Flow

1. **User clicks "Test Full Pipeline"** → Right panel shows:
   - All steps visible in flow diagram
   - Step 1 starts executing (⏳ Running...)
   - Pulse animation flows through steps
2. **As each step completes**:
   - Step box shows ✓ Success
   - Result preview appears below
   - Next step starts automatically
3. **Final result** → All steps show results
   - User can expand any step to see full result
   - User can test again or save

#### 3.3 Real-time Execution Visualization

**Backend Support Needed**:
- WebSocket or Server-Sent Events (SSE) for real-time updates
- Or: Polling every 500ms during execution
- Backend sends step-by-step progress updates

**Frontend Implementation**:
- Visual flow diagram component
- Step status indicators (✓ ⏳ ✗ ⏸)
- Pulse animation between steps
- Inline result previews
- Expandable result views

---

### 4. Information Hierarchy

#### 4.1 What's Most Important (Always Visible)

1. **Current step prompt** (large, focused)
2. **Test button** (prominent, easy to find)
3. **Execution visualization** (right panel)
4. **Step results** (inline, expandable)

#### 4.2 What's Secondary (Collapsible/Hidden)

1. **Pipeline metadata** (name, description) - Top header, minimal
2. **Advanced settings** (model, temperature) - Collapsed by default
3. **Step reordering** - Drag handles, but not prominent
4. **Save button** - Top header, not blocking workflow

#### 4.3 What's Least Important (Settings Page)

1. **System process flag** - Settings modal
2. **Output handlers** - Settings modal
3. **Input parameters** - Settings modal (future)

---

### 5. User Flow: Creating a New Pipeline

#### Step 1: Initial Setup
```
User clicks "Create Pipeline"
→ Shows empty state with "Start your research flow"
→ User types first question
→ Clicks "Start Building"
→ Creates Step 1 with question as user prompt
```

#### Step 2: Building First Step
```
Step 1 is active (expanded)
→ User edits system prompt (optional)
→ User edits user prompt
→ User adds variables if needed
→ User clicks "Test This Step"
→ Right panel shows execution → result appears
→ User tweaks prompt → tests again
→ User satisfied → clicks "Add Next Step"
```

#### Step 3: Building Subsequent Steps
```
Step 2 is created and active
→ User edits prompts
→ User can reference Step 1 output: {step1_output}
→ User tests Step 2
→ User iterates until satisfied
→ User adds Step 3, etc.
```

#### Step 4: Testing Full Pipeline
```
User clicks "Test Full Pipeline"
→ Right panel shows visual flow
→ Steps execute one by one
→ Results appear as each step completes
→ User can expand any step to see full result
→ User can test again or save
```

#### Step 5: Saving
```
User clicks "Save" in header
→ Pipeline saved
→ User can continue editing or exit
```

---

### 6. Visual Design Details

#### 6.1 Step Boxes in Flow Diagram

**Default state**:
```
┌────────────────────┐
│ Step 1: Generate   │
│                    │
└────────────────────┘
```

**Running state**:
```
┌────────────────────┐
│ Step 1: Generate   │ ⏳
│                    │
│ [pulse animation] │
└────────────────────┘
```

**Success state**:
```
┌────────────────────┐
│ Step 1: Generate   │ ✓
│                    │
│ Result preview:    │
│ "Paris, London..." │
│ [Click to expand]  │
└────────────────────┘
```

**Error state**:
```
┌────────────────────┐
│ Step 1: Generate   │ ✗
│                    │
│ Error: "Model..."  │
│ [Click to expand]  │
└────────────────────┘
```

#### 6.2 Connection Lines

**Default**:
```
Step 1 ──→ Step 2
```

**Executing**:
```
Step 1 ──→ [pulse] ──→ Step 2
```

**Completed**:
```
Step 1 ──→ Step 2 ✓
```

#### 6.3 Color Scheme

- **Success**: Green (#10b981)
- **Running**: Blue (#3b82f6) with pulse animation
- **Error**: Red (#ef4444)
- **Waiting**: Gray (#6b7280)
- **Active step**: Blue border (#3b82f6)
- **Inactive step**: Gray border (#e5e7eb)

---

### 7. Technical Implementation

#### 7.1 Backend Changes

**New Endpoint**: `POST /api/analyses/{id}/test-pipeline-stream`
- Returns Server-Sent Events (SSE) or WebSocket
- Sends step-by-step progress updates:
  ```json
  {
    "step_index": 0,
    "step_name": "generate_cities",
    "status": "running",
    "progress": 0.5
  }
  ```
- Sends step completion:
  ```json
  {
    "step_index": 0,
    "step_name": "generate_cities",
    "status": "completed",
    "result": "Paris, London...",
    "tokens": 150,
    "cost": 0.001
  }
  ```

**Alternative**: Polling approach
- Frontend polls `/api/analyses/{id}/test-pipeline-status` every 500ms
- Backend returns current execution state

#### 7.2 Frontend Components

**New Components**:
1. **FlowDiagram**: Visual flow diagram with step boxes
2. **StepBox**: Individual step box with status indicators
3. **ExecutionProgress**: Real-time progress visualization
4. **StepResultPreview**: Inline result preview (expandable)

**Modified Components**:
1. **PipelineEditor**: Split view layout
2. **StepConfigurationPanel**: Simplified, minimal by default
3. **TestResults**: Inline results instead of modal

#### 7.3 State Management

**New State**:
- `activeStepIndex`: Which step is currently being edited
- `executionState`: Current execution state (idle/running/completed)
- `stepResults`: Results for each step (from execution)
- `executionProgress`: Current step being executed

---

### 8. Migration Strategy

#### Phase 1: Layout Changes (Non-breaking)
- Implement split view layout
- Keep existing functionality
- Add visual flow diagram (static first)

#### Phase 2: Execution Visualization
- Add real-time execution updates
- Implement step-by-step progress
- Add inline result previews

#### Phase 3: Simplified Configuration
- Hide advanced settings by default
- Simplify step configuration UI
- Improve variable palette

#### Phase 4: Polish
- Add animations
- Improve visual design
- Add keyboard shortcuts

---

### 9. Key UX Principles

1. **One thing at a time**: Focus on current step, hide others
2. **Test early, test often**: Prominent test buttons, quick iteration
3. **See progress**: Visual flow shows what's happening
4. **Results inline**: See results where they matter, not in separate modal
5. **Less is more**: Hide advanced settings, show defaults
6. **Iterative workflow**: Test → Tweak → Test → Move on

---

### 10. Example User Journey

**Scenario**: User wants to create a research flow about tourist cities

1. **Start**: Clicks "Create Pipeline" → Types "Generate list of tourist cities"
2. **Step 1**: 
   - System prompt: "You are a travel expert"
   - User prompt: "Generate a list of 8 popular tourist cities"
   - Clicks "Test This Step"
   - Sees result: "Paris, London, Tokyo..."
   - Satisfied, clicks "Add Next Step"
3. **Step 2**:
   - System prompt: "You are a climate analyst"
   - User prompt: "Analyze weather for: {step1_output}"
   - Clicks "Test This Step"
   - Sees result: "Paris: Moderate climate..."
   - Satisfied, clicks "Add Next Step"
4. **Step 3**:
   - System prompt: "You are a travel advisor"
   - User prompt: "Recommend best city from: {step1_output} and {step2_output}"
   - Clicks "Test This Step"
   - Sees result: "Based on weather..."
   - Satisfied
5. **Full Test**:
   - Clicks "Test Full Pipeline"
   - Watches flow execute step by step
   - Sees all results inline
   - Satisfied, clicks "Save"

**Total time**: ~5-10 minutes
**Iterations**: 3-5 test runs per step
**Result**: Working pipeline with tested steps

---

## Next Steps

1. **Review this design** with stakeholders
2. **Create detailed mockups** for key screens
3. **Implement Phase 1** (layout changes)
4. **Test with users** → Iterate
5. **Implement Phase 2** (execution visualization)
6. **Polish and refine**

---

## Questions to Consider

1. **WebSocket vs SSE vs Polling**: Which approach for real-time updates?
2. **Mobile support**: How to adapt split view for mobile?
3. **Keyboard shortcuts**: What shortcuts would be helpful?
4. **Undo/Redo**: Should we add undo/redo for prompt edits?
5. **Step templates**: Should we offer step templates/presets?
6. **Collaboration**: How to support multiple users editing same pipeline?

---

## Success Metrics

- **Time to first test**: < 30 seconds
- **Iterations per step**: 2-3 (down from 5+)
- **User satisfaction**: High (qualitative feedback)
- **Completion rate**: More users complete pipelines
- **Error rate**: Fewer errors due to better testing



