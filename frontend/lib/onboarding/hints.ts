/**
 * Hint Definitions
 * 
 * Centralized hint configurations for all flows
 * Each hint follows the format: flow-number.hint-number
 */

import type { HintConfig } from './hintConfig'

// Flow 1: Dashboard Hints
export const dashboardHints: HintConfig[] = [
  {
    id: '1.1',
    flow: 'dashboard',
    target: '[data-hint="welcome-header"]',
    content: {
      title: 'Добро пожаловать в Research Flow! 🎉',
      body: `Начните создавать свои первые аналитические процессы. 
Вы можете использовать готовые примеры или создать процесс с нуля.`
    },
    placement: 'center',
    type: 'spotlight',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 1000
  },
  {
    id: '1.2',
    flow: 'dashboard',
    target: '[data-hint="create-process-action"]',
    content: {
      body: `Создайте свой первый процесс здесь

Процесс — это последовательность шагов, которые выполняют анализ данных.`
    },
    placement: 'bottom',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'medium'
  },
  {
    id: '1.3',
    flow: 'dashboard',
    target: '[data-hint="statistics-cards"]',
    content: {
      body: `Здесь вы увидите статистику ваших процессов и запусков.
Пока здесь пусто — создайте первый процесс!`
    },
    placement: 'top',
    type: 'info',
    trigger: 'hover',
    dismissible: true,
    priority: 'low'
  }
]

// Flow 2: Analyses Page Hints
export const analysesHints: HintConfig[] = [
  {
    id: '2.1',
    flow: 'analyses',
    target: '[data-hint="create-process-button"]',
    content: {
      body: `Создайте свой первый процесс здесь

Процесс состоит из нескольких шагов, которые выполняются последовательно.
Каждый шаг может использовать разные инструменты (API, базы данных, RAG).`
    },
    placement: 'bottom',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'high'
  },
  {
    id: '2.2',
    flow: 'analyses',
    target: '[data-hint="system-processes-tab"]',
    content: {
      body: `Или начните с готового примера!

Переключитесь на вкладку "Примеры процессов" и клонируйте готовый процесс.
Это поможет быстро понять, как работают процессы.`
    },
    placement: 'bottom',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'medium'
  },
  {
    id: '2.3',
    flow: 'analyses',
    target: '[data-hint="duplicate-button"]',
    content: {
      body: `Клонируйте этот пример процесса

Нажмите эту кнопку, чтобы создать свою копию процесса.
Вы сможете редактировать и настраивать его под свои нужды.`
    },
    placement: 'left',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'medium'
  }
]

// Flow 4: Tools Page Hints (RAGs are shown here)
export const toolsHints: HintConfig[] = [
  {
    id: '4.1',
    flow: 'tools',
    target: '[data-hint="create-tool-button"]',
    content: {
      body: `Создайте свой первый инструмент

Инструменты подключают внешние источники данных (API, базы данных, RAG) для использования в процессах.`
    },
    placement: 'bottom',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 500
  },
  {
    id: '4.2',
    flow: 'tools',
    target: '[data-hint="tools-empty-state"]',
    content: {
      body: `Здесь будут отображаться все ваши инструменты

После создания инструменты появятся в этом списке. Вы сможете редактировать, тестировать и использовать их в процессах анализа.`
    },
    placement: 'center',
    type: 'info',
    trigger: 'auto',
    dismissible: true,
    priority: 'medium'
  }
]

// Flow 3: Pipeline Editor Hints (Critical)
export const pipelineEditorHints: HintConfig[] = [
  {
    id: '3.2',
    flow: 'pipeline-editor',
    target: '[data-hint="add-step-button"]',
    content: {
      body: `Добавьте первый шаг процесса

Шаги выполняются последовательно. Каждый шаг может:
- Использовать LLM для анализа
- Запрашивать данные из API
- Запрашивать базу данных
- Использовать RAG для поиска информации`
    },
    placement: 'top',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 1000
  },
  {
    id: '3.4',
    flow: 'pipeline-editor',
    target: '[data-hint="variable-palette"]',
    content: {
      body: `Переменные инструментов

Создайте инструмент на странице "Инструменты" — переменная появится здесь автоматически. Нажмите на переменную, чтобы вставить её в промпт.`
    },
    placement: 'right',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 500
  },
  {
    id: '3.5',
    flow: 'pipeline-editor',
    target: '[data-hint="variable-palette"]',
    content: {
      title: 'Использование переменных',
      body: `Переменные передают данные между шагами:

• Фиолетовые — результаты предыдущих шагов
  Формат: {название_шага_output}

• Синие/зелёные — результаты инструментов

Нажмите на переменную, чтобы вставить её в промпт.`
    },
    placement: 'right',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 500
  }
]

// Flow 6: RAG Editor Hints (RAG Sharing - Strong Point)
export const ragEditorHints: HintConfig[] = [
  {
    id: '6.5',
    flow: 'rag-editor',
    target: '[data-hint="rag-share-button"]',
    content: {
      body: `Поделитесь RAG с пользователями вне платформы

Создайте публичную ссылку и отправьте коллегам, клиентам или партнёрам. Регистрация не требуется.`
    },
    placement: 'bottom',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 1000
  },
  {
    id: '6.6',
    flow: 'rag-editor',
    target: '[data-hint="public-access-modal"]',
    content: {
      body: `Выберите режим доступа:

Полный редактор
Пользователи могут загружать файлы, задавать вопросы и использовать чат

Только файлы
Пользователи могут только загружать и скачивать файлы`
    },
    placement: 'center',
    type: 'info',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 500
  },
  {
    id: '6.7',
    flow: 'rag-editor',
    target: '[data-hint="public-access-url"]',
    content: {
      body: `Публичная ссылка

Скопируйте и отправьте ссылку. Доступ без регистрации, можно отключить в любой момент.`
    },
    placement: 'bottom',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 500
  }
]

// Flow 8: Organizations Hints (Strong Point)
export const organizationsHints: HintConfig[] = [
  {
    id: '8.1',
    flow: 'organizations',
    target: '[data-hint="invite-user-button"]',
    content: {
      title: 'Организации — простой способ совместной работы',
      body: `Это уникальная возможность Research Flow:

• Пригласите пользователей в организацию
• Все процессы, инструменты и RAG автоматически доступны участникам
• Не нужно настраивать доступ для каждого ресурса отдельно
• Идеально для командной работы

Пригласите коллег, и они сразу получат доступ ко всем ресурсам организации.`
    },
    placement: 'bottom',
    type: 'beacon',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 500
  },
  {
    id: '8.2',
    flow: 'organizations',
    target: '[data-hint="invite-form"]',
    content: {
      body: `Пригласите пользователя в организацию

Приглашённые пользователи автоматически получат доступ к:
- Все процессы организации
- Все инструменты организации
- Все RAG базы знаний организации

Просто введите email и выберите роль (Пользователь или Администратор).`
    },
    placement: 'right',
    type: 'tooltip',
    trigger: 'auto',
    dismissible: true,
    priority: 'medium'
  }
]

// Flow 7: Contextual Hints
export const contextualHints: HintConfig[] = [
  {
    id: '7.1',
    flow: 'contextual',
    target: '[data-hint="first-run-success"]',
    content: {
      body: `Отлично! Ваш первый процесс выполнен успешно!

Теперь вы можете:
- Просмотреть результаты каждого шага
- Экспортировать результаты
- Настроить расписание для автоматического запуска`
    },
    placement: 'center',
    type: 'spotlight',
    trigger: 'auto',
    dismissible: true,
    priority: 'high',
    delay: 1000
  },
  {
    id: '7.3',
    flow: 'contextual',
    target: '[data-hint="use-rag-suggestion"]',
    content: {
      body: `Совет: Используйте RAG в вашем процессе

Если у вас есть база знаний (RAG), добавьте шаг типа "RAG Query" для поиска информации из ваших документов.

Это сделает ваш процесс более информативным!`
    },
    placement: 'top',
    type: 'info',
    trigger: 'auto',
    dismissible: true,
    priority: 'medium',
    delay: 500
  }
]

// Export all hints by flow
export const hintsByFlow: Record<string, HintConfig[]> = {
  dashboard: dashboardHints,
  analyses: analysesHints,
  'pipeline-editor': pipelineEditorHints,
  tools: toolsHints,
  'rag-editor': ragEditorHints,
  organizations: organizationsHints,
  contextual: contextualHints,
}

