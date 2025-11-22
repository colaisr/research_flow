'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { API_BASE_URL } from '@/lib/config'
import Select from '@/components/Select'

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

interface StepConfig {
  step_name: string
  step_type: string
  model: string
  system_prompt: string
  user_prompt_template: string
  temperature: number
  max_tokens: number
  data_sources: string[]
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Стоимость</p>
              <p className="text-lg font-semibold text-gray-900">
                ${analysis.config.estimated_cost.toFixed(3)}
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
                    <div className="px-5 pb-5 border-t border-gray-200 bg-gray-50">
                      <div className="mt-4 space-y-4">
                        {/* Model Configuration */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                            Настройки модели
                          </p>
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs text-gray-600 font-medium mb-1 block">Модель:</label>
                                {isEditing ? (
                                  <div>
                                    <Select
                                      value={step.model}
                                      onChange={(value) => updateStepConfig(index, 'model', value)}
                                      options={enabledModels.map((model) => ({
                                        value: model.name,
                                        label: `${model.display_name} (${model.provider})${model.has_failures ? ' - Есть ошибки' : ''}`,
                                        hasFailures: model.has_failures,
                                      }))}
                                      className="w-full"
                                    />
                                    {enabledModels.find(m => m.name === step.model)?.has_failures && (
                                      <p className="mt-2 text-xs text-orange-600 flex items-center gap-1">
                                        <span>⚠️</span>
                                        <span>У этой модели зафиксированы ошибки и она может работать нестабильно</span>
                                      </p>
                                    )}
                                    {isModelChangedFromDefault(index) && (
                                      <button
                                        onClick={() => applyModelToAllSteps(step.model)}
                                        className="mt-2 px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                                      >
                                        Применить ко всем шагам
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div>
                                    <span className="text-gray-900 font-medium">
                                      {step.model}
                                    </span>
                                    {enabledModels.find(m => m.name === step.model)?.has_failures && (
                                      <span className="ml-2 text-xs px-2 py-1 bg-orange-100 rounded text-orange-600">
                                        ⚠️ Есть ошибки
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="text-xs text-gray-600 font-medium mb-1 block">Температура:</label>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="2"
                                    value={step.temperature}
                                    onChange={(e) => updateStepConfig(index, 'temperature', parseFloat(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                ) : (
                                  <span className="text-gray-900 font-medium">
                                    {step.temperature}
                                  </span>
                                )}
                              </div>
                              <div>
                                <label className="text-xs text-gray-600 font-medium mb-1 block">Макс. токенов:</label>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={step.max_tokens}
                                    onChange={(e) => updateStepConfig(index, 'max_tokens', parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                ) : (
                                  <span className="text-gray-900 font-medium">
                                    {step.max_tokens.toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <div>
                                <label className="text-xs text-gray-600 font-medium mb-1 block">Источник данных:</label>
                                {isEditing ? (
                                  <select
                                    value={Array.isArray(step.data_sources) ? step.data_sources[0] || '' : step.data_sources || ''}
                                    onChange={(e) => {
                                      updateStepConfig(index, 'data_sources', [e.target.value])
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  >
                                    <option value="">Авто (определить по инструменту)</option>
                                    {enabledDataSources.map((source) => (
                                      <option key={source.id} value={source.name}>
                                        {source.display_name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-gray-900 font-medium">
                                    {Array.isArray(step.data_sources) 
                                      ? (step.data_sources[0] || 'Авто')
                                      : (step.data_sources || 'Авто')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* System Prompt */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                            Системный промпт
                          </p>
                          {isEditing ? (
                            <textarea
                              value={step.system_prompt}
                              onChange={(e) => updateStepConfig(index, 'system_prompt', e.target.value)}
                              rows={4}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          ) : (
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                                {step.system_prompt}
                              </pre>
                            </div>
                          )}
                        </div>

                        {/* User Prompt Template */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                            Шаблон пользовательского промпта
                          </p>
                          {isEditing ? (
                            <textarea
                              value={step.user_prompt_template}
                              onChange={(e) => updateStepConfig(index, 'user_prompt_template', e.target.value)}
                              rows={6}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          ) : (
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                                {step.user_prompt_template}
                              </pre>
                              {step.user_prompt_template.match(/\{(\w+)\}/g) && (
                                <p className="mt-3 text-xs text-gray-500 italic pt-3 border-t border-gray-200">
                                  Переменные: {step.user_prompt_template.match(/\{(\w+)\}/g)?.join(', ') || 'Нет'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
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

          <div className="mb-4">
            <button
              onClick={handleRunAnalysis}
              disabled={createRunMutation.isPending}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
            >
              {createRunMutation.isPending ? 'Создание запуска...' : 'Запустить анализ'}
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
