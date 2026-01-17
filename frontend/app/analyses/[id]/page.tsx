'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { API_BASE_URL } from '@/lib/config'
import Select from '@/components/Select'
import { fetchCurrentSubscription } from '@/lib/api/subscriptions'
import Link from 'next/link'
import VariableTextEditor, { VariableTextEditorHandle } from '@/components/VariableTextEditor'

interface Model {
  id: number
  name: string
  display_name: string
  provider: string
  description: string | null
  is_enabled: boolean
  has_failures: boolean
}

interface DataSource {
  id: number
  name: string
  display_name: string
  description: string | null
  is_enabled: boolean
}

interface Tool {
  id: number
  user_id: number
  organization_id: number | null
  tool_type: 'database' | 'api' | 'rag'
  display_name: string
  config: Record<string, any>
  is_active: boolean
  is_shared: boolean
  created_at: string
  updated_at: string | null
}

interface StepConfig {
  step_name: string
  step_type: string
  model?: string
  system_prompt?: string
  user_prompt_template?: string
  temperature?: number
  data_sources?: string[]
  tool_references?: Array<{
    tool_id: number
    variable_name: string
  }>
}

interface AnalysisType {
  id: number
  name: string
  display_name: string
  description: string | null
  version: string
  config: {
    steps: StepConfig[]
    estimated_cost: number
    estimated_duration_seconds: number
  }
  is_active: number
  created_at: string
  updated_at: string
}

async function fetchEnabledModels() {
  const { data } = await axios.get<Model[]>(`${API_BASE_URL}/api/settings/models?enabled_only=true`)
  return data
}

async function fetchEnabledDataSources() {
  const { data } = await axios.get<DataSource[]>(`${API_BASE_URL}/api/settings/data-sources?enabled_only=true`)
  return data
}

async function fetchTools() {
  const { data } = await axios.get<Tool[]>(`${API_BASE_URL}/api/tools`, { withCredentials: true })
  return data
}

// Helper function to normalize step names for variables
function normalizeStepNameForVariable(stepName: string): string {
  const trimmed = stepName.trim()
  if (!trimmed) {
    return ''
  }

  let normalized = Array.from(trimmed)
    .map((char) => {
      if (char === '_') {
        return char
      }

      const lower = char.toLowerCase()
      const upper = char.toUpperCase()
      const isLetter = lower !== upper
      const isDigit = char >= '0' && char <= '9'

      if (isLetter || isDigit) {
        return lower
      }

      return '_'
    })
    .join('')

  normalized = normalized.replace(/_+/g, '_')
  normalized = normalized.replace(/^_+|_+$/g, '')

  if (normalized) {
    const first = normalized[0]
    const isLetter = first.toLowerCase() !== first.toUpperCase()
    if (!isLetter && first !== '_') {
      normalized = '_' + normalized
    }
  }

  return normalized
}

function normalizeToolVariableName(displayName: string, toolId: number): string {
  const trimmed = displayName.trim()
  if (!trimmed) {
    return `tool_${toolId}`
  }

  const normalized = Array.from(trimmed)
    .map((char) => {
      const lower = char.toLowerCase()
      const upper = char.toUpperCase()
      const isLetter = lower !== upper
      const isDigit = char >= '0' && char <= '9'

      if (isLetter || isDigit) {
        return lower
      }

      return '_'
    })
    .join('')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || `tool_${toolId}`
}

// Helper function to get user-friendly temperature label
function getTemperatureLabel(temperature: number | undefined): string {
  if (temperature === undefined || temperature === null) return '—'
  const temp = temperature
  if (temp <= 0.3) return 'Консервативный (0.2)'
  if (temp <= 0.5) return 'Консервативный (0.4)'
  if (temp <= 0.7) return 'Сбалансированный (0.7)'
  if (temp <= 1.0) return 'Креативный (1.0)'
  return 'Креативный (1.5)'
}

async function fetchAnalysisType(id: string) {
  const { data } = await axios.get<AnalysisType>(`${API_BASE_URL}/api/analyses/${id}`)
  return data
}

async function createRun(
  analysisTypeId: number, 
  customConfig?: AnalysisType['config']
) {
  const payload: any = {
    analysis_type_id: analysisTypeId,
    instrument: 'N/A',
    timeframe: 'N/A',
  }
  if (customConfig) {
    payload.custom_config = customConfig
  }
  const { data } = await axios.post(`${API_BASE_URL}/api/runs`, payload, {
    withCredentials: true
  })
  return data
}

// Wrapper component to manage editor ref
function VariableTextEditorWrapper({ 
  stepIndex, 
  value, 
  onChange, 
  availableVariables 
}: { 
  stepIndex: number
  value: string
  onChange: (value: string) => void
  availableVariables: string[]
}) {
  const editorRef = useRef<VariableTextEditorHandle>(null)
  
  useLayoutEffect(() => {
    if (!(window as any).variableEditorRefs) {
      (window as any).variableEditorRefs = new Map()
    }
    (window as any).variableEditorRefs.set(stepIndex, editorRef)
    return () => {
      (window as any).variableEditorRefs?.delete(stepIndex)
    }
  }, [stepIndex])
  
  return (
    <VariableTextEditor
      ref={editorRef}
      value={value}
      onChange={onChange}
      stepIndex={stepIndex}
      availableVariables={availableVariables}
    />
  )
}

// Variable Palette Component
function VariablePalette({ 
  allSteps, 
  currentStepIndex, 
  tools = [], 
  step, 
  onUpdate 
}: { 
  allSteps: StepConfig[]
  currentStepIndex: number
  tools?: Tool[]
  step: StepConfig
  onUpdate: (updates: Partial<StepConfig>) => void
}) {
  const previousSteps = allSteps.slice(0, currentStepIndex)
  
  const stepOutputVars = previousSteps.map((step, index) => {
    const varName = normalizeStepNameForVariable(step.step_name)
    return {
      name: `{${varName}_output}`,
      desc: `Вывод из шага "${step.step_name}"`,
      uniqueKey: `step-output-${index}-${step.step_name}`,
    }
  })
  
  const toolVars = tools
    .filter(tool => tool.is_active)
    .map(tool => {
      const variableName = normalizeToolVariableName(tool.display_name, tool.id)
      
      return {
        toolId: tool.id,
        name: `{${variableName}}`,
        desc: `${tool.display_name} (${tool.tool_type})`,
        variableName,
      }
    })
  
  const handleToolVariableClick = (toolVar: { toolId: number; name: string; variableName: string }) => {
    const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
    const actualRef = refs?.get(currentStepIndex)?.current
    
    if (actualRef) {
      actualRef.insertVariable(toolVar.name)
    }
    
    const existingRef = (step.tool_references || []).find(ref => ref.tool_id === toolVar.toolId)
    if (!existingRef) {
      const newRef = {
        tool_id: toolVar.toolId,
        variable_name: toolVar.variableName,
      }
      const currentRefs = step.tool_references || []
      const newRefs = [...currentRefs, newRef]
      onUpdate({ tool_references: newRefs })
    }
  }
  
  const handleStepVariableClick = (varName: string) => {
    const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
    const actualRef = refs?.get(currentStepIndex)?.current
    if (actualRef) {
      actualRef.insertVariable(varName)
    }
  }
  
  if (stepOutputVars.length === 0 && toolVars.length === 0) {
    return null
  }
  
  return (
    <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <p className="text-xs font-semibold text-blue-900 mb-2">Доступные переменные:</p>
      <div className="flex flex-wrap gap-2">
        {stepOutputVars.map((varItem) => (
          <button
            key={varItem.uniqueKey}
            onClick={() => handleStepVariableClick(varItem.name)}
            className="px-2 py-1 text-xs bg-white hover:bg-blue-100 text-blue-700 rounded border border-blue-300 transition-colors"
            title={varItem.desc}
          >
            {varItem.name}
          </button>
        ))}
        {toolVars.map((toolVar) => (
          <button
            key={toolVar.toolId}
            onClick={() => handleToolVariableClick(toolVar)}
            className="px-2 py-1 text-xs bg-white hover:bg-blue-100 text-blue-700 rounded border border-blue-300 transition-colors"
            title={toolVar.desc}
          >
            {toolVar.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// Step Edit Panel - matches PipelineEditor's StepConfigurationPanel
function StepEditPanel({
  step,
  stepIndex,
  allSteps,
  enabledModels,
  tools,
  enabledDataSources,
  isEditing,
  onUpdate,
  isModelChangedFromDefault,
  onApplyModelToAllSteps,
}: {
  step: StepConfig
  stepIndex: number
  allSteps: StepConfig[]
  enabledModels: Model[]
  tools: Tool[]
  enabledDataSources: DataSource[]
  isEditing: boolean
  onUpdate: (updates: Partial<StepConfig>) => void
  isModelChangedFromDefault: boolean
  onApplyModelToAllSteps: () => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const currentModel = enabledModels.find(m => m.name === step.model)
  const temperatureDisplay = step.temperature 
    ? (step.temperature <= 0.3 ? '0.2' : step.temperature <= 0.5 ? '0.4' : step.temperature <= 0.7 ? '0.7' : step.temperature <= 1.0 ? '1.0' : '1.5')
    : '0.7'

  // Get available variables
  const previousSteps = allSteps.slice(0, stepIndex)
  const stepOutputVars = previousSteps.map(s => {
    const varName = normalizeStepNameForVariable(s.step_name)
    return `{${varName}_output}`
  })
  const toolVars = tools
    .filter(tool => tool.is_active)
    .map(tool => {
      const variableName = normalizeToolVariableName(tool.display_name, tool.id)
      return `{${variableName}}`
    })
  const availableVariables = [...stepOutputVars, ...toolVars]

  if (!isEditing) {
    return (
      <div className="px-5 pb-5 border-t border-gray-200 bg-gray-50">
        <div className="mt-4 space-y-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Модель:</span>
                <span className="ml-2 text-gray-900 font-medium">{step.model || '—'}</span>
              </div>
              <div>
                <span className="text-gray-600">Креативность ответа:</span>
                <span className="ml-2 text-gray-900 font-medium">{getTemperatureLabel(step.temperature)}</span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Системный промпт</p>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                {step.system_prompt || '—'}
              </pre>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Пользовательский промпт</p>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                {step.user_prompt_template || '—'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pb-5 border-t border-gray-200 bg-gray-50 space-y-4">
      {/* PROMPTS - Main content, always visible */}
      <div className="space-y-4 mt-4">
        {/* System Prompt */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Системный промпт</label>
          <textarea
            value={step.system_prompt || ''}
            onChange={(e) => onUpdate({ system_prompt: e.target.value })}
            rows={3}
            placeholder="Определите роль и стиль ответов модели..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
        </div>

        {/* User Prompt Template */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Пользовательский промпт</label>
          <VariablePalette
            allSteps={allSteps}
            currentStepIndex={stepIndex}
            tools={tools}
            step={step}
            onUpdate={onUpdate}
          />
          <VariableTextEditorWrapper
            stepIndex={stepIndex}
            value={step.user_prompt_template || ''}
            onChange={(newValue) => onUpdate({ user_prompt_template: newValue })}
            availableVariables={availableVariables}
          />
        </div>
      </div>

      {/* Advanced Settings - Collapsible */}
      <div className="border-t border-gray-300 pt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          <span className="flex items-center gap-2">
            <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Дополнительные настройки
          </span>
          {!showAdvanced && (
            <span className="text-xs text-gray-500 font-normal">
              {currentModel?.display_name || step.model || '—'} • {temperatureDisplay}
            </span>
          )}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm mb-1 text-gray-700">Модель</label>
                <Select
                  value={step.model || ''}
                  onChange={(value) => onUpdate({ model: value })}
                  options={enabledModels.map(m => ({
                    value: m.name,
                    label: `${m.display_name} (${m.provider})${m.has_failures ? ' - Есть ошибки' : ''}`,
                    hasFailures: m.has_failures,
                  }))}
                />
                {currentModel?.has_failures && (
                  <p className="mt-1 text-xs text-orange-600">⚠️ У этой модели были зафиксированы ошибки</p>
                )}
                {isModelChangedFromDefault && step.model && (
                  <button
                    onClick={onApplyModelToAllSteps}
                    className="mt-2 px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                  >
                    Применить ко всем шагам
                  </button>
                )}
              </div>
            <div>
              <label className="block text-sm mb-2 text-gray-700">Креативность ответа</label>
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="4"
                    step="1"
                    value={(() => {
                      const temp = step.temperature || 0.7
                      if (temp <= 0.3) return 0
                      if (temp <= 0.5) return 1
                      if (temp <= 0.7) return 2
                      if (temp <= 1.0) return 3
                      return 4
                    })()}
                    onChange={(e) => {
                      const positions = [0.2, 0.4, 0.7, 1.0, 1.5]
                      const temp = positions[parseInt(e.target.value)]
                      onUpdate({ temperature: temp })
                    }}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700 min-w-[60px] text-right">
                    {temperatureDisplay}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span className="flex-1 text-left">Консервативный</span>
                  <span className="flex-1 text-center">Сбалансированный</span>
                  <span className="flex-1 text-right">Креативный</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {(() => {
                    const temp = step.temperature || 0.7
                    if (temp <= 0.3) return 'Более предсказуемые и стабильные ответы. Идеально для анализа данных.'
                    if (temp <= 0.5) return 'Умеренная предсказуемость. Хорошо для структурированного анализа.'
                    if (temp <= 0.7) return 'Баланс между стабильностью и разнообразием. Рекомендуется для большинства задач.'
                    if (temp <= 1.0) return 'Более разнообразные ответы. Подходит для креативных задач.'
                    return 'Максимальная креативность. Высокая вариативность ответов.'
                  })()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AnalysisDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const analysisId = params.id as string
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [editableConfig, setEditableConfig] = useState<AnalysisType['config'] | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['analysis-type', analysisId],
    queryFn: () => fetchAnalysisType(analysisId),
  })

  const { data: enabledModels = [] } = useQuery({
    queryKey: ['settings', 'models', 'enabled'],
    queryFn: fetchEnabledModels,
    staleTime: 0,
  })

  const { data: enabledDataSources = [] } = useQuery({
    queryKey: ['settings', 'data-sources', 'enabled'],
    queryFn: fetchEnabledDataSources,
  })

  const { data: tools = [] } = useQuery({
    queryKey: ['tools'],
    queryFn: fetchTools,
  })

  // Fetch current subscription to check token availability
  const { data: subscription } = useQuery({
    queryKey: ['current-subscription'],
    queryFn: fetchCurrentSubscription,
  })

  const createRunMutation = useMutation({
    mutationFn: () =>
      createRun(analysis?.id || 0, editableConfig || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      router.push(`/runs/${data.id}`)
    },
    onError: (error: any) => {
      // Error is already handled by the UI below
    },
  })

  useEffect(() => {
    if (analysis && !editableConfig) {
      setEditableConfig(JSON.parse(JSON.stringify(analysis.config)))
    }
  }, [analysis, editableConfig])

  const handleRunAnalysis = () => {
    // Check if subscription is expired
    if (subscription && subscription.status === 'expired') {
      const message = subscription.is_trial
        ? 'Ваш пробный период истек.\n\nВыберите тарифный план для продолжения работы с системой.\n\nХотите перейти на страницу выбора плана?'
        : 'Ваша подписка истекла.\n\nВыберите новый план для продолжения работы.\n\nХотите перейти на страницу выбора плана?'
      const confirmed = confirm(message)
      if (confirmed) {
        router.push('/subscription/plans')
      }
      return
    }
    
    // Check token availability before starting
    if (subscription && subscription.available_tokens === 0) {
      const confirmed = confirm(
        'Недостаточно токенов для выполнения анализа.\n\n' +
        'Доступно: 0 токенов\n\n' +
        'Хотите перейти на страницу потребления для покупки токенов?'
      )
      if (confirmed) {
        router.push('/consumption')
      }
      return
    }
    
    createRunMutation.mutate()
  }

  const toggleStep = (stepName: string) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepName)) {
      newExpanded.delete(stepName)
    } else {
      newExpanded.add(stepName)
    }
    setExpandedSteps(newExpanded)
  }

  const stepNames: Record<string, string> = {
    wyckoff: 'Анализ Wyckoff',
    smc: 'Smart Money Concepts (SMC)',
    vsa: 'Volume Spread Analysis (VSA)',
    delta: 'Анализ Delta',
    ict: 'ICT Анализ',
    price_action: 'Price Action / Паттерны',
    merge: 'Финальный результат',
    generate_cities: 'Генерация городов',
    analyze_weather: 'Анализ погоды',
    evaluate_attractions: 'Оценка достопримечательностей',
    calculate_costs: 'Расчет стоимости',
    final_recommendation: 'Финальная рекомендация',
  }

  const updateStepConfig = (stepIndex: number, field: keyof StepConfig, value: any) => {
    if (!editableConfig) return
    const newConfig = JSON.parse(JSON.stringify(editableConfig))
    newConfig.steps[stepIndex] = { ...newConfig.steps[stepIndex], [field]: value }
    setEditableConfig(newConfig)
  }

  const applyModelToAllSteps = (modelName: string) => {
    if (!editableConfig) return
    const newConfig = JSON.parse(JSON.stringify(editableConfig))
    newConfig.steps = newConfig.steps.map((step: StepConfig) => ({
      ...step,
      model: modelName
    }))
    setEditableConfig(newConfig)
  }

  const isModelChangedFromDefault = (stepIndex: number): boolean => {
    if (!editableConfig || !analysis) return false
    const currentModel = editableConfig.steps[stepIndex]?.model
    const defaultModel = analysis.config.steps[stepIndex]?.model
    return currentModel !== defaultModel
  }

  const resetConfig = () => {
    if (analysis) {
      setEditableConfig(JSON.parse(JSON.stringify(analysis.config)))
      setIsEditing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Загрузка конфигурации анализа...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-900 mb-2">Ошибка загрузки анализа</h2>
            <p className="text-red-700">
              {error instanceof Error ? error.message : 'Неизвестная ошибка'}
            </p>
            <button
              onClick={() => router.push('/analyses')}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              Назад к анализам
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => router.push('/analyses')}
            className="text-sm text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1 transition-colors"
          >
            <span>←</span> Назад к анализам
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {analysis.display_name}
          </h1>
          {analysis.description && (
            <p className="text-gray-600">{analysis.description}</p>
          )}
        </div>

        {/* Overview Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Обзор
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Версия</p>
              <p className="text-lg font-semibold text-gray-900">
                v{analysis.version}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Шагов</p>
              <p className="text-lg font-semibold text-gray-900">
                {analysis.config.steps.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Длительность</p>
              <p className="text-lg font-semibold text-gray-900">
                ~{Math.round(analysis.config.estimated_duration_seconds / 60)} мин
              </p>
            </div>
          </div>
        </div>

        {/* Pipeline Steps Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Шаги процесса
            </h2>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={resetConfig}
                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium transition-colors"
                  >
                    Сбросить
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
                  >
                    Готово
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors flex items-center gap-1.5"
                >
                  <span>✏️</span>
                  <span>Редактировать</span>
                </button>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800 flex items-center gap-2">
                <span>⚠️</span>
                <span>Вы редактируете конфигурацию. Изменения будут использованы при запуске анализа.</span>
              </p>
            </div>
          )}

          <div className="space-y-3">
            {(editableConfig || analysis.config)?.steps.map((step, index) => {
              const isExpanded = expandedSteps.has(step.step_name)
              const stepLabel = stepNames[step.step_name] || step.step_name

              return (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  {/* Step Header */}
                  <button
                    onClick={() => toggleStep(step.step_name)}
                    className="w-full px-5 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-base font-semibold text-gray-900">
                          {stepLabel}
                        </span>
                        <span className="text-xs px-2 py-1 bg-blue-100 rounded text-blue-700 font-medium">
                          {step.model}
                        </span>
                        <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 font-medium">
                          {step.step_type}
                        </span>
                      </div>
                    </div>
                    <span className="text-gray-400 text-lg flex-shrink-0 ml-4">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </button>

                  {/* Step Content (Expandable) */}
                  {isExpanded && (
                    <StepEditPanel
                      step={step}
                      stepIndex={index}
                      allSteps={(editableConfig || analysis.config)?.steps || []}
                      enabledModels={enabledModels}
                      tools={tools}
                      enabledDataSources={enabledDataSources}
                      isEditing={isEditing}
                      onUpdate={(updates) => {
                        Object.entries(updates).forEach(([key, value]) => {
                          updateStepConfig(index, key as keyof StepConfig, value)
                        })
                      }}
                      isModelChangedFromDefault={isModelChangedFromDefault(index)}
                      onApplyModelToAllSteps={() => step.model && applyModelToAllSteps(step.model)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Run Analysis Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Запуск анализа
          </h2>

          {/* Subscription Expired Warning */}
          {subscription && subscription.status === 'expired' && (
            <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">
                    {subscription.is_trial ? 'Ваш пробный период истек' : 'Ваша подписка истекла'}
                  </h3>
                  <p className="text-sm text-red-700 mb-3">
                    {subscription.is_trial 
                      ? 'Выберите тарифный план для продолжения работы с системой'
                      : 'Выберите новый план для продолжения работы'}
                  </p>
                  <Link
                    href="/subscription/plans"
                    className="inline-block px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    Выбрать план
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Token availability warning (for non-expired subscriptions with 0 tokens) */}
          {subscription && subscription.status !== 'expired' && subscription.available_tokens === 0 && (
            <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">
                    Недостаточно токенов
                  </h3>
                  <p className="text-sm text-red-700 mb-3">
                    У вас нет доступных токенов для выполнения анализа. Запросы будут заблокированы.
                  </p>
                  <Link
                    href="/consumption"
                    className="inline-block px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    Проверить баланс токенов →
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <button
              onClick={handleRunAnalysis}
              disabled={createRunMutation.isPending || (subscription && (subscription.status === 'expired' || subscription.available_tokens === 0))}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
            >
              {createRunMutation.isPending 
                ? 'Создание запуска...' 
                : (subscription && subscription.status === 'expired')
                ? 'Подписка истекла'
                : (subscription && subscription.available_tokens === 0)
                ? 'Недостаточно токенов'
                : 'Запустить анализ'}
            </button>
          </div>

          {createRunMutation.isError && (
            <div className="mt-4 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-800 font-medium mb-1">Ошибка:</p>
              <p className="text-sm text-red-700">
                {createRunMutation.error && typeof createRunMutation.error === 'object' && 'response' in createRunMutation.error
                  ? (createRunMutation.error as any).response?.data?.detail || (createRunMutation.error as any).response?.data?.message || (createRunMutation.error as Error).message
                  : createRunMutation.error instanceof Error
                  ? createRunMutation.error.message
                  : 'Не удалось создать запуск'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
