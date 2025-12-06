# Onboarding Hints & User Guidance Plan

## Overview

This document outlines the strategy for implementing non-intrusive, informative hints to guide new users through creating their first analysis flows, with special emphasis on RAG tools and the general workflow.

## UI Framework

### Selected: React Joyride

**Why React Joyride:**
- ✅ **React-native**: Built specifically for React (fits Next.js perfectly)
- ✅ **TypeScript support**: Full TypeScript definitions included
- ✅ **Non-intrusive**: Supports tooltips, spotlights, and beacons
- ✅ **Easy dismissal**: Built-in skip/close functionality
- ✅ **Progress tracking**: Shows step progress (e.g., "Step 1 of 5")
- ✅ **Customizable**: Works seamlessly with TailwindCSS
- ✅ **Accessible**: ARIA attributes and keyboard navigation
- ✅ **Well-maintained**: Active development, 1M+ weekly downloads
- ✅ **Lightweight**: ~15KB gzipped

**Installation:**
```bash
npm install react-joyride
```

### Implementation Approach

**State Management:**
- Store hint state in localStorage (per user)
- Track which hints have been dismissed (permanent)
- Track which flows have been skipped (permanent)
- Track global disable state (permanent)
- **No reset option** - hints are one-time only for first-time users
- **Existing users see hints too** - helps them discover features they might have missed

**Trigger Conditions:**
- **All users** (new and existing) see hints by default when feature is deployed
- Hints show based on context (empty states, first-time actions, etc.)
- Once dismissed/disabled, hints stay off permanently
- Existing users can discover features they might have missed through hints

**Handling Existing Users:**
- When hints feature is deployed, all users start with hints enabled
- Existing users will see hints as if they're first-time users
- This helps existing users discover features they might have missed
- Users can dismiss individual hints or disable all hints
- Once dismissed/disabled, hints stay off permanently (no re-enable)

---

## Hint Map

### Flow 1: General New User Onboarding (First Login)

**Trigger:** User logs in for the first time OR has 0 pipelines created

**Location:** Dashboard (`/dashboard`)

#### Hint 1.1: Welcome Message
- **Target:** Welcome header section
- **Type:** Spotlight + Tooltip
- **Content (Russian):**
  ```
  Добро пожаловать в Research Flow! 🎉
  
  Начните создавать свои первые аналитические процессы. 
  Вы можете использовать готовые примеры или создать процесс с нуля.
  
  [Начать] [Позже]
  ```
- **Action:** Click "Начать" → Navigate to Analyses page with hint flow
- **Dismissible:** Yes, with "Не показывать снова"

#### Hint 1.2: Quick Actions - Create Process
- **Target:** "Создать процесс" quick action card
- **Type:** Beacon (pulsing dot) + Tooltip
- **Content:**
  ```
  Создайте свой первый процесс здесь
  
  Процесс — это последовательность шагов, которые выполняют анализ данных.
  ```
- **Action:** Click to navigate to `/pipelines/new`
- **Dismissible:** Yes

#### Hint 1.3: Statistics Cards Context
- **Target:** Statistics cards section
- **Type:** Info tooltip (appears on hover)
- **Content:**
  ```
  Здесь вы увидите статистику ваших процессов и запусков.
  Пока здесь пусто — создайте первый процесс!
  ```
- **Trigger:** Hover over empty stats area
- **Dismissible:** Auto-dismiss on mouse leave

---

### Flow 2: Analyses Page Hints

**Trigger:** User visits `/analyses` with 0 personal processes

#### Hint 2.1: Create First Process
- **Target:** "Создать процесс" button (top right)
- **Type:** Beacon + Tooltip
- **Content:**
  ```
  Создайте свой первый процесс здесь
  
  Процесс состоит из нескольких шагов, которые выполняются последовательно.
  Каждый шаг может использовать разные инструменты (API, базы данных, RAG).
  ```
- **Action:** Navigate to `/pipelines/new`
- **Dismissible:** Yes

#### Hint 2.2: Use Example Processes
- **Target:** "Примеры процессов" tab
- **Type:** Beacon + Tooltip
- **Content:**
  ```
  Или начните с готового примера!
  
  Переключитесь на вкладку "Примеры процессов" и клонируйте готовый процесс.
  Это поможет быстро понять, как работают процессы.
  ```
- **Condition:** Only show if user hasn't visited "Примеры процессов" tab yet
- **Dismissible:** Yes

#### Hint 2.3: System Process Duplication
- **Target:** "Дублировать" button on first system process card
- **Type:** Beacon + Tooltip
- **Content:**
  ```
  Клонируйте этот пример процесса
  
  Нажмите эту кнопку, чтобы создать свою копию процесса.
  Вы сможете редактировать и настраивать его под свои нужды.
  ```
- **Condition:** Show when user is viewing system processes tab
- **Dismissible:** Yes

---

### Flow 3: Pipeline Editor Hints ⭐ **CRITICAL SECTION**

**Trigger:** User creates new pipeline (`/pipelines/new`)

#### Hint 3.1: Pipeline Name
- **Target:** Pipeline name input field
- **Type:** Tooltip (appears after 2 seconds on empty field)
- **Content:**
  ```
  Дайте название вашему процессу
  
  Например: "Анализ продаж", "Мониторинг рынка", "Обработка документов"
  ```
- **Dismissible:** Auto-dismiss when user starts typing

#### Hint 3.2: Add First Step
- **Target:** "Добавить шаг" button
- **Type:** Beacon + Tooltip
- **Content:**
  ```
  Добавьте первый шаг процесса
  
  Шаги выполняются последовательно. Каждый шаг может:
  - Использовать LLM для анализа
  - Запрашивать данные из API
  - Запрашивать базу данных
  - Использовать RAG для поиска информации
  ```
- **Condition:** Show when steps list is empty
- **Dismissible:** Yes

#### Hint 3.3: Step Configuration - Tool Selection
- **Target:** Tool dropdown in step configuration
- **Type:** Info badge (small "i" icon) + Tooltip on hover
- **Content:**
  ```
  Выберите инструмент для этого шага
  
  Инструменты — это настроенные источники данных:
  - API: внешние сервисы и API
  - База данных: подключения к БД
  - RAG: базы знаний с документами
  
  Сначала создайте инструмент в разделе "Инструменты".
  ```
- **Condition:** Show when no tools are available
- **Action:** Link to `/tools` page
- **Dismissible:** Yes

---

#### **Hint 3.4: Variables Introduction** ⭐ **HIGH PRIORITY**
- **Target:** Variable Palette component (when first step is added)
- **Type:** Spotlight + Large Tooltip
- **Content:**
  ```
  💡 Переменные — ключевая функция процессов!
  
  Переменные позволяют передавать данные между шагами:
  
  📊 {step_name}_output — результат предыдущего шага
  🔧 {tool_name} — результат работы инструмента
  📥 {input_param} — входной параметр процесса
  
  Используйте переменные, чтобы каждый следующий шаг мог 
  использовать результаты предыдущих шагов.
  
  [Показать пример] [Понятно]
  ```
- **Condition:** Show when first step is added and user hasn't used variables yet
- **Action:** "Показать пример" → Show example in tooltip
- **Dismissible:** Yes, but encourage learning

#### **Hint 3.5: Variable Palette Usage** ⭐ **HIGH PRIORITY**
- **Target:** Variable Palette sidebar/panel
- **Type:** Beacon + Tooltip
- **Content:**
  ```
  Палитра переменных
  
  Здесь показаны все доступные переменные:
  
  🟣 Фиолетовые — результаты предыдущих шагов
     Пример: {analyze_data_output}
  
  🔵 Синие — результаты инструментов
     Пример: {binance_api}, {my_rag}
  
  💡 Просто нажмите на переменную, чтобы вставить её в промпт!
  ```
- **Condition:** Show when Variable Palette is visible and user hasn't clicked any variable
- **Dismissible:** Yes

---
**Note:** Hints 3.6-3.16 (additional variable hints) have been removed as not relevant.

### Flow 4: Tools Page Hints

**Trigger:** User visits `/tools` with 0 tools created

#### Hint 4.1: Create First Tool
- **Target:** "Создать инструмент" button
- **Type:** Beacon + Tooltip
- **Content:**
  ```
  Создайте свой первый инструмент
  
  Инструменты — это источники данных для ваших процессов:
  - API: подключения к внешним сервисам
  - База данных: подключения к БД (MySQL, PostgreSQL)
  - RAG: базы знаний с документами
  
  Начните с RAG — это самый простой способ добавить знания в процессы.
  ```
- **Action:** Navigate to `/tools/new`
- **Dismissible:** Yes

#### Hint 4.2: Tool Types Explanation
- **Target:** Tool type filter tabs (if visible)
- **Type:** Info cards (appear below header)
- **Content:**
  ```
  Типы инструментов:
  
  🔌 API — подключения к внешним сервисам (REST API, GraphQL)
  💾 База данных — подключения к БД (MySQL, PostgreSQL, MongoDB)
  📚 RAG — базы знаний с документами (PDF, Excel, текстовые файлы)
  
  Рекомендуем начать с RAG — загрузите документы и используйте их в процессах!
  ```
- **Condition:** Show when no tools exist
- **Dismissible:** Yes, with "Понятно" button

---

### Flow 5: RAGs Page Hints (Priority Focus)

**Trigger:** User visits `/rags` with 0 RAGs created

#### Hint 5.1: Create First RAG (High Priority)
- **Target:** "Создать RAG" button
- **Type:** Large beacon + Prominent tooltip
- **Content:**
  ```
  🎯 Создайте свою первую базу знаний (RAG)
  
  RAG позволяет загружать документы (PDF, Excel, текстовые файлы) 
  и использовать их в процессах для поиска информации.
  
  Это мощный инструмент для работы с вашими данными!
  
  [Создать RAG] [Позже]
  ```
- **Action:** Navigate to `/rags/new` or show RAG creation modal
- **Priority:** High (make this prominent)
- **Dismissible:** Yes, but encourage creation

#### Hint 5.2: RAG Benefits
- **Target:** Empty state area
- **Type:** Info card (appears in empty state)
- **Content:**
  ```
  💡 Что такое RAG?
  
  RAG (Retrieval-Augmented Generation) — это база знаний, которая:
  
  ✅ Хранит ваши документы (PDF, Excel, текстовые файлы)
  ✅ Позволяет искать информацию по смыслу
  ✅ Используется в процессах для получения контекста
  
  Примеры использования:
  - Загрузите протоколы компании → используйте в процессе проверки
  - Загрузите данные о клиентах → используйте в процессе анализа
  - Загрузите документацию → используйте в процессе справки
  
  [Создать RAG] [Узнать больше]
  ```
- **Condition:** Show in empty state
- **Dismissible:** Yes

#### Hint 5.3: RAG in Pipeline Editor
- **Target:** Tool selection dropdown in Pipeline Editor (when RAG tool type selected)
- **Type:** Info tooltip
- **Content:**
  ```
  Выберите RAG для этого шага
  
  Шаг будет использовать семантический поиск по вашим документам.
  Результаты поиска будут переданы в LLM для анализа.
  
  Создайте RAG в разделе "RAGs", если у вас его еще нет.
  ```
- **Condition:** Show when user selects "rag" tool type but has no RAGs
- **Action:** Link to `/rags` page
- **Dismissible:** Yes

---

### Flow 6: RAG Editor Hints (RAG Sharing - Strong Point)

**Note:** RAG Creation hints (6.1-6.4) have been removed as not relevant.

---

#### **Hint 6.5: RAG Sharing Introduction** ⭐⭐⭐ **HIGHEST PRIORITY - STRONG POINT**
- **Target:** "Поделиться" (Share) button in RAG editor
- **Type:** Large Beacon + Prominent Tooltip
- **Content:**
  ```
  🌟 Поделитесь RAG с пользователями вне платформы!
  
  Это уникальная возможность Research Flow:
  
  ✅ Создайте публичную ссылку для вашей базы знаний
  ✅ Поделитесь с коллегами, клиентами, партнёрами
  ✅ Не требуется регистрация — просто отправьте ссылку!
  
  Идеально для:
  - Совместной работы над документами
  - Предоставления доступа клиентам
  - Публикации справочной информации
  
  [Узнать больше] [Поделиться сейчас]
  ```
- **Condition:** Show when RAG has documents and public access is disabled
- **Action:** "Поделиться сейчас" → Open public access modal
- **Priority:** Highest (this is a strong differentiator)
- **Dismissible:** Yes, but encourage exploration

#### **Hint 6.6: Public Access Modes** ⭐⭐ **HIGH PRIORITY**
- **Target:** Public access modal (when opened)
- **Type:** Info card (appears in modal)
- **Content:**
  ```
  📋 Режимы публичного доступа:
  
  🔓 Полный редактор (full_editor):
     - Загрузка документов
     - Поиск и запросы к RAG
     - Чат с базой знаний
     - Скачивание документов
  
  📁 Только файлы (folder_only):
     - Загрузка документов
     - Скачивание документов
     - Без доступа к поиску и чату
  
  💡 Совет: Используйте "Полный редактор" для совместной работы,
            "Только файлы" — для простого обмена документами.
  ```
- **Condition:** Show when public access modal is opened for first time
- **Dismissible:** Yes

#### **Hint 6.7: Public Access URL and Sharing** ⭐⭐ **HIGH PRIORITY**
- **Target:** Public URL field in public access modal
- **Type:** Beacon + Tooltip
- **Content:**
  ```
  🔗 Публичная ссылка
  
  Скопируйте эту ссылку и отправьте тем, кому хотите предоставить доступ.
  
  ✅ Ссылка работает без регистрации
  ✅ Доступ только по этой ссылке (безопасно)
  ✅ Можно отключить в любой момент
  
  💡 Примеры использования:
     - Отправьте клиенту для доступа к документации
     - Поделитесь с командой для совместной работы
     - Опубликуйте справочную информацию
  
  [Скопировать ссылку]
  ```
- **Condition:** Show when public access is enabled and URL is visible
- **Action:** "Скопировать ссылку" → Copy URL to clipboard
- **Dismissible:** Yes

---
**Note:** Additional RAG sharing hints (6.8-6.12) have been removed as not relevant.

---

### Flow 7: Contextual Hints (Throughout App)

#### Hint 7.1: First Run Success
- **Target:** Run details page after first successful run
- **Type:** Success banner
- **Content:**
  ```
  🎉 Отлично! Ваш первый процесс выполнен успешно!
  
  Теперь вы можете:
  - Просмотреть результаты каждого шага
  - Экспортировать результаты
  - Настроить расписание для автоматического запуска
  
  [Создать еще процесс] [Настроить расписание]
  ```
- **Condition:** Show after first successful run
- **Dismissible:** Yes

#### Hint 7.2: Schedule First Analysis
- **Target:** Schedules page (when 0 schedules)
- **Type:** Info card
- **Content:**
  ```
  Настройте автоматический запуск процессов
  
  Вы можете настроить расписание для регулярного выполнения процессов:
  - Ежедневно в определенное время
  - Еженедельно
  - По интервалу (каждые N минут)
  - По cron-выражению
  
  [Создать расписание]
  ```
- **Condition:** Show when user has processes but no schedules
- **Dismissible:** Yes

#### Hint 7.3: Use RAG in Process
- **Target:** Pipeline Editor step configuration (when process has no RAG steps)
- **Type:** Suggestion card (appears below steps list)
- **Content:**
  ```
  💡 Совет: Используйте RAG в вашем процессе
  
  Если у вас есть база знаний (RAG), добавьте шаг типа "RAG Query"
  для поиска информации из ваших документов.
  
  Это сделает ваш процесс более информативным!
  
  [Добавить RAG шаг] [Создать RAG]
  ```
- **Condition:** Show when user has RAGs but process doesn't use them
- **Dismissible:** Yes

---

### Flow 8: Organizations Page Hints ⭐ **STRONG POINT - SHARING**

**Trigger:** User visits `/organizations/{id}` (organization management page)

#### **Hint 8.1: Organizations Introduction** ⭐⭐⭐ **HIGHEST PRIORITY**
- **Target:** Organization page header or "Пригласить пользователя" button
- **Type:** Large Beacon + Prominent Tooltip
- **Content:**
  ```
  👥 Организации — простой способ совместной работы!
  
  Это уникальная возможность Research Flow:
  
  ✅ Пригласите пользователей в организацию
  ✅ Все процессы, инструменты и RAG автоматически доступны участникам
  ✅ Не нужно настраивать доступ для каждого ресурса отдельно
  ✅ Идеально для командной работы
  
  Пригласите коллег, и они сразу получат доступ ко всем ресурсам организации!
  
  [Узнать больше] [Пригласить пользователя]
  ```
- **Condition:** Show when user is org_admin/owner and organization has 1 member (just owner)
- **Action:** "Пригласить пользователя" → Open invite form
- **Priority:** Highest (this is a strong differentiator)
- **Dismissible:** Yes, but encourage exploration

#### **Hint 8.2: Invite User to Organization** ⭐⭐ **HIGH PRIORITY**
- **Target:** "Пригласить пользователя" button
- **Type:** Beacon + Tooltip
- **Content:**
  ```
  Пригласите пользователя в организацию
  
  Приглашённые пользователи автоматически получат доступ к:
  - Все процессы организации
  - Все инструменты организации
  - Все RAG базы знаний организации
  
  Просто введите email и выберите роль (Пользователь или Администратор).
  ```
- **Condition:** Show when user is org_admin/owner and invite form is not visible
- **Action:** Navigate to invite form or open it
- **Dismissible:** Yes

---
**Note:** Additional organization hints (8.3-8.7) have been removed as not relevant.

---

## Implementation Strategy

### Complete Implementation Roadmap

#### **Step 1: Project Setup** (Day 1)
1. Install React Joyride
   ```bash
   cd frontend
   npm install react-joyride
   ```
2. Create directory structure
   ```
   frontend/
   ├── contexts/
   │   └── OnboardingContext.tsx
   ├── hooks/
   │   └── useOnboarding.ts
   ├── lib/
   │   └── onboarding/
   │       ├── hintState.ts
   │       ├── hintConfig.ts
   │       └── hints.ts
   └── components/
       └── OnboardingProvider.tsx
   ```

#### **Step 2: Core Infrastructure** (Day 2-3)
1. Create `hintState.ts` - localStorage state management
   - `getHintState()` - Read from localStorage
   - `saveHintState()` - Write to localStorage
   - `shouldShowHint()` - Check if hint should show
   - `dismissHint()` - Mark hint as dismissed
   - `skipFlow()` - Mark flow as skipped
   - `disableAllHints()` - Global disable

2. Create `OnboardingContext.tsx` - React context
   - Provides hint state to all components
   - Provides methods to dismiss/skip/disable
   - Handles React Joyride integration

3. Create `OnboardingProvider.tsx` - Provider component
   - Wraps app in LayoutWrapper
   - Initializes hint state
   - Manages React Joyride instance

4. Create `hintConfig.ts` - Hint configuration
   - TypeScript interfaces for hint configs
   - Helper functions to build hint configs

#### **Step 3: Integration Points** (Day 4)
1. Update `LayoutWrapper.tsx`
   - Add `<OnboardingProvider>` wrapper
   - Ensure context is available everywhere

2. Create hint trigger hooks
   - `useHintTrigger()` - Hook to trigger hints on pages
   - `useHintCondition()` - Hook to check hint conditions

#### **Step 4: Phase 1 - MVP Hints** (Day 5-7)
**Priority Order:**
1. **Dashboard welcome hint (1.1)**
   - File: `frontend/app/dashboard/page.tsx`
   - Add hint trigger on page load
   - Test: First login shows welcome hint

2. **RAGs page - Create RAG hint (5.1)** ⭐ **HIGHEST PRIORITY**
   - File: `frontend/app/rags/page.tsx`
   - Add beacon on "Создать RAG" button
   - Test: Empty RAGs page shows hint

3. **Analyses page - Create process hint (2.1)**
   - File: `frontend/app/analyses/page.tsx`
   - Add beacon on "Создать процесс" button
   - Test: Empty analyses page shows hint

4. **Pipeline Editor - Add step hint (3.2)**
   - File: `frontend/components/PipelineEditor.tsx`
   - Add beacon on "Добавить шаг" button
   - Test: Empty pipeline shows hint

5. **Organizations page - Invite user hint (8.1, 8.2)** ⭐ **STRONG POINT**
   - File: `frontend/app/organizations/[id]/page.tsx`
   - Add beacon on "Пригласить пользователя" button
   - Test: Organization with 1 member shows hint

**Testing Checklist:**
- [ ] Hints show on first visit
- [ ] Hints dismiss correctly
- [ ] Skip flow works
- [ ] Disable all hints works
- [ ] State persists in localStorage
- [ ] No console errors

#### **Step 5: Phase 2 - Variable Hints** (Day 8-10)
**Pipeline Editor Variable Hints (Critical):**
1. Variables Introduction (3.4)
2. Variable Palette Usage (3.5)

**Note:** Additional variable hints (3.6-3.16) have been removed as not relevant.

**Files to modify:**
- `frontend/components/PipelineEditor.tsx`
- `frontend/components/VariableTextEditor.tsx`
- `frontend/components/VariablePalette.tsx` (if exists)

#### **Step 6: Phase 3 - RAG Sharing Hints** (Day 11-12)
**RAG Editor Sharing Hints (Strong Point):**
1. RAG Sharing Introduction (6.5)
2. Public Access Modes (6.6)
3. Public Access URL (6.7)

**Note:** Additional RAG sharing hints (6.8-6.12) have been removed as not relevant.

**Files to modify:**
- `frontend/app/rags/[id]/page.tsx`

#### **Step 7: Phase 4 - Remaining Hints** (Day 13-15)
1. All remaining dashboard hints (1.2, 1.3) - ✅ Already implemented
2. Tools page hints (4.1, 4.2) - ✅ Already implemented
3. Contextual hints (7.1-7.3) - Optional

**Note:** RAG creation hints (6.1-6.4) and Organizations hints (8.3-8.7) have been removed as not relevant.

#### **Step 8: Testing & Refinement** (Day 16-17)
1. **User Testing**
   - Test with 2-3 real users
   - Gather feedback on hint clarity
   - Check if hints are helpful or annoying

2. **Bug Fixes**
   - Fix any positioning issues
   - Fix any timing issues
   - Fix any state management bugs

3. **Polish**
   - Ensure all hints are in Russian
   - Check mobile responsiveness
   - Verify accessibility

#### **Step 9: Deployment** (Day 18)
1. **Code Review**
   - Review all hint implementations
   - Check for performance issues
   - Verify no console errors

2. **Deploy to Production**
   - Merge to main branch
   - Deploy using existing deployment process
   - Monitor for errors

3. **Post-Deployment**
   - Monitor user feedback
   - Track hint dismissal rates
   - Adjust hints based on data

---

### Phase Breakdown (Alternative View)

#### **Phase 1: Framework Setup** (Days 1-4)
1. Install React Joyride
2. Create infrastructure (state, context, provider)
3. Integrate into LayoutWrapper
4. Test basic hint display

#### **Phase 2: Core Hints (MVP)** (Days 5-7)
1. Dashboard welcome hint (1.1)
2. RAGs page - Create RAG hint (5.1) ⭐ **Priority**
3. Analyses page - Create process hint (2.1)
4. Pipeline Editor - Add step hint (3.2)
5. Organizations page - Invite user hint (8.1, 8.2) ⭐ **Strong Point**

#### **Phase 3: Critical Features** (Days 8-12)
1. Pipeline Editor - Variable hints (3.4-3.5) ⭐ **Critical** - ✅ Implemented
2. RAG Editor - Sharing hints (6.5-6.7) ⭐ **Strong Point** - ✅ Implemented

#### **Phase 4: Enhanced Hints** (Days 13-15)
1. All remaining dashboard hints - ✅ Already implemented
2. Tools page hints - ✅ Already implemented
3. Contextual hints throughout app (7.1-7.3) - Optional

**Note:** RAG creation hints and additional Organizations hints have been removed as not relevant.

#### **Phase 5: Testing & Deployment** (Days 16-18)
1. User testing
2. Bug fixes and polish
3. Production deployment

---

## Technical Implementation Details

### Hint State Management

```typescript
// Store in localStorage + backend user preferences
interface HintState {
  // Global settings
  hintsEnabled: boolean                    // Global toggle
  flowsEnabled: Record<string, boolean>    // Per-flow toggles
  
  // Dismissed hints
  dismissedHints: string[]                 // Array of hint IDs
  permanentlyDismissed: string[]           // Hints with "Don't show again"
  
  // Completed flows
  completedFlows: string[]                 // Array of flow IDs
  skippedFlows: string[]                  // Flows user skipped
  
  // Metadata
  lastResetDate?: string                   // Date when hints were reset
  hintsDisabledDate?: string              // When user disabled all hints
}

// Hint IDs format: "flow-number.hint-number"
// Example: "1.1", "2.1", "5.1", "6.5"
```

### Hint Configuration Structure

```typescript
interface HintConfig {
  id: string                    // Unique hint ID
  flow: string                  // Flow identifier
  target: string                // CSS selector or ref
  content: {
    title?: string
    body: string
    actions?: {
      primary?: { label: string; action: () => void }
      secondary?: { label: string; action: () => void }
    }
  }
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
  type: 'tooltip' | 'beacon' | 'spotlight' | 'info'
  trigger: 'auto' | 'hover' | 'click' | 'focus'
  conditions?: {
    page?: string
    hasData?: boolean
    userAction?: string
  }
  dismissible: boolean
  priority: 'low' | 'medium' | 'high'
}
```

### Integration Points

1. **LayoutWrapper**: Add OnboardingProvider
2. **Dashboard**: Add hint triggers
3. **Analyses Page**: Add hint triggers
4. **RAGs Page**: Add hint triggers (priority)
5. **Pipeline Editor**: Add hint triggers
6. **Tools Page**: Add hint triggers

---

## User Experience Principles

1. **Non-Intrusive**: Hints should not block user workflow
2. **Contextual**: Show hints when they're relevant
3. **Dismissible**: Always allow users to skip hints
4. **Progressive**: Don't overwhelm with too many hints at once
5. **Helpful**: Focus on actionable guidance, not just information
6. **Respectful**: Don't show hints repeatedly if user dismisses them
7. **User Control**: Users can skip or disable hints at any time - **permanently** (hints are for first-time users only, no re-enable needed)

---

## User Control & Hint Management ⭐ **CRITICAL - SIMPLIFIED**

**Philosophy**: Hints are **one-time only for first-time users**. Once dismissed or disabled, they stay off permanently. No settings page, no re-enable options.

### Skip Entire Flow

**Every hint flow must have a "Skip" option:**

#### Skip Button in Flow
- **Location**: Every multi-step hint flow (e.g., Dashboard welcome, Pipeline Editor tour)
- **Action**: "Пропустить обучение" (Skip Tutorial) button
- **Behavior**: 
  - Marks entire flow as skipped
  - Dismisses all hints in current flow
  - Prevents flow from showing again
  - **Permanent** - no way to re-enable (hints are for first-time users only)

#### Skip Individual Hints
- **Location**: Every hint tooltip/beacon
- **Action**: "Пропустить" (Skip) or "×" (Close) button
- **Behavior**:
  - Dismisses current hint
  - Hint is permanently disabled
  - No "Don't show again" checkbox needed (always permanent)

### Global Hint Disable

**Simple One-Click Disable (No Settings Page):**

#### Disable All Hints
- **Location**: First hint that appears (Dashboard welcome hint) OR any hint
- **Action**: "Отключить все подсказки" (Disable all hints) link/button
- **Behavior**:
  - Disables ALL hints system-wide
  - **Permanent** - no re-enable option
  - Stored in localStorage only
  - Shows simple confirmation: "Все подсказки будут отключены. Это действие нельзя отменить."
  - After confirmation, all hints are permanently disabled

#### Alternative: Disable from Any Hint
- **Location**: Any hint tooltip/beacon (small, unobtrusive link)
- **Action**: "Отключить все подсказки" link/button
- **Behavior**:
  - Same as above - permanently disables all hints
  - User doesn't need to go through entire flow to disable

### Hint State Management (Simplified)

```typescript
// Store in localStorage only (no backend, no settings page)
interface HintState {
  // Global disable (permanent)
  hintsDisabled: boolean                  // If true, no hints show ever
  
  // Dismissed hints (permanent)
  dismissedHints: string[]               // Array of dismissed hint IDs
  
  // Skipped flows (permanent)
  skippedFlows: string[]                 // Array of skipped flow IDs
  
  // Completed flows (for tracking, but hints won't show again)
  completedFlows: string[]                // Array of completed flow IDs
}

// Hint IDs format: "flow-number.hint-number"
// Example: "1.1", "2.1", "5.1", "6.5"

// Simple check before showing any hint:
function shouldShowHint(hintId: string, flowId: string): boolean {
  const hintState = getHintState()
  if (hintState.hintsDisabled) return false
  if (hintState.dismissedHints.includes(hintId)) return false
  if (hintState.skippedFlows.includes(flowId)) return false
  return true
}

// Initialize hint state (for both new and existing users)
function initializeHintState(): HintState {
  const stored = localStorage.getItem('researchflow_hints')
  if (stored) {
    return JSON.parse(stored)
  }
  // Default state: hints enabled for everyone (new and existing users)
  return {
    hintsDisabled: false,
    dismissedHints: [],
    skippedFlows: [],
    completedFlows: []
  }
}
```

### Handling Existing Users

**Important**: When hints feature is deployed, **all users (new and existing) will see hints by default**.

**Rationale**:
- Existing users may have missed features
- Hints help existing users discover functionality they haven't used
- Users can dismiss/disable hints if they don't need them
- Once dismissed/disabled, hints stay off permanently

**Initial State for All Users**:
- `hintsDisabled: false` - Hints enabled by default
- `dismissedHints: []` - No hints dismissed yet
- `skippedFlows: []` - No flows skipped yet

**User Experience**:
1. **New users**: See hints on first login → can dismiss/disable
2. **Existing users**: See hints when feature is deployed → can dismiss/disable
3. **After dismissal**: Hints stay off permanently (no re-enable)

**Implementation**:
- Check `localStorage.getItem('researchflow_hints')`
- If not exists → initialize with default (hints enabled)
- If exists → use stored state (respects user's previous dismissals)
- This means existing users who haven't seen hints yet will see them

### Implementation Details

#### React Joyride Skip Functionality
```typescript
<Joyride
  steps={steps}
  run={run}
  continuous={true}
  showProgress={true}
  showSkipButton={true}  // Always show skip button
  skipButtonContent="Пропустить обучение"
  locale={{
    skip: "Пропустить",
    close: "Закрыть",
    last: "Завершить",
    next: "Далее",
    back: "Назад"
  }}
  callback={(data) => {
    if (data.action === 'skip') {
      // Mark flow as skipped
      markFlowAsSkipped(flowId)
      // Disable all hints in this flow
      disableFlowHints(flowId)
    }
    if (data.action === 'close') {
      // User closed hint
      dismissHint(data.step.target)
    }
  }}
/>
```

#### Per-Hint Dismiss with "Don't Show Again"
```typescript
// Every hint tooltip should have:
<div className="hint-tooltip">
  <div className="hint-content">{content}</div>
  <div className="hint-actions">
    <button onClick={handleAction}>Действие</button>
    <button onClick={handleDismiss}>Закрыть</button>
    <label>
      <input 
        type="checkbox" 
        checked={dontShowAgain}
        onChange={handleDontShowAgain}
      />
      Не показывать снова
    </label>
  </div>
</div>
```

#### Simple Disable Implementation
```typescript
// Simple disable function - no settings page needed
function disableAllHints() {
  const confirmed = confirm(
    "Все подсказки будут отключены. Это действие нельзя отменить.\n\n" +
    "Подсказки предназначены только для новых пользователей."
  )
  
  if (confirmed) {
    const hintState = getHintState()
    hintState.hintsDisabled = true
    saveHintState(hintState)
    // Close any currently visible hints
    closeAllHints()
  }
}

// Usage in any hint component
function HintTooltip({ hintId, flowId, content }) {
  const hintState = useHintState()
  
  // Don't show if disabled
  if (hintState.hintsDisabled) return null
  if (hintState.dismissedHints.includes(hintId)) return null
  if (hintState.skippedFlows.includes(flowId)) return null
  
  return (
    <div className="hint-tooltip">
      <div className="hint-content">{content}</div>
      <div className="hint-actions">
        <button onClick={handleAction}>Действие</button>
        <button onClick={() => dismissHint(hintId)}>Закрыть</button>
        <button 
          onClick={disableAllHints}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Отключить все подсказки
        </button>
      </div>
    </div>
  )
}
```

### User Flow for Disabling Hints (Simplified)

**Scenario 1: User wants to skip current hint**
1. Click "×" or "Пропустить" on hint
2. Hint is dismissed permanently
3. No confirmation needed - simple and quick

**Scenario 2: User wants to skip entire flow**
1. Click "Пропустить обучение" button on any hint in flow
2. Optional confirmation: "Пропустить все подсказки этого раздела?"
3. Flow is marked as skipped permanently
4. All hints in flow are disabled

**Scenario 3: User wants to disable all hints**
1. Click "Отключить все подсказки" link/button (available on any hint)
2. Confirmation: "Все подсказки будут отключены. Это действие нельзя отменить."
3. All hints are disabled permanently
4. No re-enable option (hints are for first-time users only)

**No Reset Option**: Once disabled, hints stay disabled. This is by design - hints are only for first-time users who need guidance.

### Visual Indicators

**When Hints are Disabled:**
- No hints show at all
- No visual indicators needed (hints are gone)
- User won't see any hint-related UI

**When Flow is Skipped:**
- No hints from that flow show
- No visual indicators needed

**When Hint is Dismissed:**
- Hint never shows again
- No visual indicators needed

---

## Success Metrics

Track the following metrics:
- **Hint completion rate**: % of users who complete hint flows
- **RAG creation rate**: % of new users who create a RAG
- **First process creation time**: Time from signup to first process
- **Hint dismissal rate**: Which hints are dismissed most often
- **User feedback**: Qualitative feedback on hint usefulness

---

## Next Steps - Ready to Start Implementation

1. ✅ Review and approve hint map
2. ✅ React Joyride selected
3. ✅ Complete implementation plan created
4. ✅ Step 1 - Project Setup (React Joyride installed)
5. ✅ Step 2 - Core Infrastructure (State management, Context, Provider)
6. ✅ Step 3 - Integration Points (LayoutWrapper)
7. ✅ Step 4 - Phase 1 MVP Hints (Dashboard, Analyses, Tools, Organizations)
8. ✅ Step 5 - Phase 2 Variable Hints (Pipeline Editor - 3.2, 3.4, 3.5)
9. ✅ Step 6 - Phase 3 RAG Sharing Hints (6.5, 6.6, 6.7)
10. ⏳ Step 7 - Contextual Hints (7.1-7.3) - Optional
11. ⏳ Step 8 - Testing & Refinement
12. ⏳ Step 9 - Deployment

**Note:** Additional variable hints (3.6-3.16), RAG creation hints (6.1-6.4), additional RAG sharing hints (6.8-6.12), and additional organization hints (8.3-8.7) have been removed as not relevant.

**Estimated Timeline**: 18 days (3.5 weeks) for complete implementation
**MVP Timeline**: 7 days (1.5 weeks) for Phase 1-2 (core functionality)

---

## Notes

- All hint text should be in Russian (as per product requirements)
- Hints should be accessible (keyboard navigation, screen readers)
- Consider mobile responsiveness for hint placement
- Hints should work with existing TailwindCSS styling (light theme only)

