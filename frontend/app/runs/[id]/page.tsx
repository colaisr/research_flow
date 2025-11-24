'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { API_BASE_URL } from '@/lib/config'
import Tooltip from '@/components/Tooltip'

interface RunStep {
  step_name: string
  input_blob: any
  output_blob: string | null
  llm_model: string | null
  tokens_used: number
  cost_est: number
  created_at: string
}

interface Run {
  id: number
  trigger_type: string
  instrument: string
  timeframe: string
  status: string
  created_at: string
  finished_at: string | null
  cost_est_total: number
  steps: RunStep[]
  analysis_type_id: number | null
  analysis_type_config: {
    steps: Array<{
      step_name: string
    }>
  } | null
}

async function fetchRun(id: string) {
  const { data } = await axios.get<Run>(`${API_BASE_URL}/api/runs/${id}`, {
    withCredentials: true
  })
  return data
}

export default function RunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const runId = params.id as string
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const { data: run, isLoading, error } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => fetchRun(runId),
    refetchInterval: (query) => {
      const data = query.state.data as Run | undefined
      // Poll every 2 seconds if still running/queued, otherwise stop polling
      if (data?.status === 'running' || data?.status === 'queued') {
        return 2000
      }
      return false
    },
    // Force refetch on mount and window focus
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    // Don't cache stale data when polling - always fetch fresh
    staleTime: 0,
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'text-green-700 bg-green-50 border-green-200'
      case 'failed':
        return 'text-red-700 bg-red-50 border-red-200'
      case 'model_failure':
        return 'text-orange-700 bg-orange-50 border-orange-200'
      case 'running':
        return 'text-blue-700 bg-blue-50 border-blue-200'
      case 'queued':
        return 'text-amber-700 bg-amber-50 border-amber-200'
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return '✓'
      case 'failed':
        return '✕'
      case 'model_failure':
        return '⚠'
      case 'running':
        return '⟳'
      case 'queued':
        return '⏳'
      default:
        return '○'
    }
  }

  // Extract model failure errors from steps
  const getModelFailureMessage = (run: Run): string | null => {
    if (run.status !== 'model_failure') return null
    
    // Look for model_failures step
    const failureStep = run.steps.find(s => s.step_name === 'model_failures')
    if (failureStep && failureStep.input_blob?.failures) {
      const failures = failureStep.input_blob.failures
      if (failures.length > 0) {
        const firstFailure = failures[0]
        return `${firstFailure.step} step failed: ${firstFailure.model} - ${firstFailure.error.split('\n')[0]}`
      }
    }
    
    // Fallback: look for steps with model errors
    const errorSteps = run.steps.filter(s => 
      s.input_blob?.is_model_error || 
      (s.output_blob && s.output_blob.includes('Error:'))
    )
    if (errorSteps.length > 0) {
      const firstError = errorSteps[0]
      const errorMsg = firstError.output_blob?.replace('Error: ', '') || 'Model error'
      return `${firstError.step_name} step: ${errorMsg.split('\n')[0]}`
    }
    
    return null
  }

  // Get error details from pipeline_error step
  const getErrorDetails = (run: Run) => {
    const errorStep = run.steps.find(s => s.step_name === 'pipeline_error')
    if (errorStep && errorStep.input_blob) {
      return {
        message: errorStep.output_blob || errorStep.input_blob.error || 'Unknown error',
        traceback: errorStep.input_blob.traceback || null
      }
    }
    return null
  }

  // Calculate progress
  const progress = useMemo(() => {
    if (!run || !run.analysis_type_config?.steps) {
      return { completed: run?.steps.length || 0, total: 0, percentage: 0 }
    }
    const totalSteps = run.analysis_type_config.steps.length
    const completedSteps = run.steps.length
    return {
      completed: completedSteps,
      total: totalSteps,
      percentage: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
    }
  }, [run])

  // Get current step (the one that's running or next to run)
  const getCurrentStep = () => {
    if (!run || !run.analysis_type_config?.steps) return null
    if (run.status !== 'running' && run.status !== 'queued') return null
    
    const completedStepNames = new Set(run.steps.map(s => s.step_name))
    const allSteps = run.analysis_type_config.steps
    
    // Find first step that's not completed
    for (const stepConfig of allSteps) {
      if (!completedStepNames.has(stepConfig.step_name)) {
        return stepConfig.step_name
      }
    }
    return null
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getResearchResult = () => {
    if (!run || run.steps.length === 0) return null
    
    // Simplified: Always use the last step as result
    return run.steps[run.steps.length - 1]?.output_blob || null
  }

  const researchResult = getResearchResult()
  const errorDetails = run ? getErrorDetails(run) : null
  const currentStep = getCurrentStep()
  const failureMessage = run ? getModelFailureMessage(run) : null

  // Calculate duration
  const getDuration = () => {
    if (!run) return null
    const start = new Date(run.created_at)
    const end = run.finished_at ? new Date(run.finished_at) : new Date()
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Загрузка деталей запуска...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-900 mb-2">Ошибка загрузки запуска</h2>
            <p className="text-red-700">
              {error instanceof Error ? error.message : 'Неизвестная ошибка'}
            </p>
            <button
              onClick={() => router.push('/runs')}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              Назад к запускам
            </button>
          </div>
        </div>
      </div>
    )
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

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/runs')}
              className="text-sm text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1 transition-colors"
            >
              <span>←</span> Назад к запускам
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              Run #{run.id}
            </h1>
            {run.analysis_type_config && (
              <p className="text-sm text-gray-500 mt-1">
                {run.analysis_type_config.steps?.length || 0} шагов
              </p>
            )}
          </div>
          <div className={`px-4 py-2 rounded-lg border-2 font-semibold ${getStatusColor(run.status)}`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{getStatusIcon(run.status)}</span>
              <span className="uppercase text-sm">
                {run.status === 'model_failure' ? 'Ошибка модели' : 
                 run.status === 'succeeded' ? 'Успешно' :
                 run.status === 'failed' ? 'Ошибка' :
                 run.status === 'running' ? 'Выполняется' :
                 run.status === 'queued' ? 'В очереди' : run.status}
              </span>
            </div>
          </div>
        </div>

        {/* Error Banner - Prominent if failed */}
        {(run.status === 'failed' || run.status === 'model_failure' || errorDetails) && (
          <div className={`border-2 rounded-lg p-6 ${
            run.status === 'failed' || errorDetails
              ? 'bg-red-50 border-red-200'
              : 'bg-orange-50 border-orange-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className="text-2xl flex-shrink-0">
                {run.status === 'failed' ? '✕' : '⚠'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-red-900 mb-2">
                  {run.status === 'failed' ? 'Ошибка выполнения процесса' : 'Ошибка модели'}
                </h3>
                {errorDetails && (
                  <div className="mb-3">
                    <p className="text-red-800 font-medium mb-2">Ошибка:</p>
                    <pre className="text-sm text-red-700 bg-red-100 p-3 rounded border border-red-200 whitespace-pre-wrap break-words">
                      {errorDetails.message}
                    </pre>
                  </div>
                )}
                {failureMessage && (
                  <p className="text-sm text-orange-800">
                    {failureMessage}
                  </p>
                )}
                {errorDetails?.traceback && (
                  <details className="mt-3">
                    <summary className="text-sm text-red-700 cursor-pointer hover:underline font-medium">
                      Показать полный traceback
                    </summary>
                    <pre className="mt-2 text-xs text-red-600 bg-red-100 p-3 rounded border border-red-200 overflow-x-auto">
                      {errorDetails.traceback}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Progress Overview */}
        {(run.status === 'running' || run.status === 'queued') && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Прогресс процесса
              </h2>
              {currentStep && (
                <span className="text-sm text-blue-600 font-medium">
                  Текущий: {stepNames[currentStep] || currentStep}
                </span>
              )}
            </div>
            
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>
                  {progress.completed} из {progress.total > 0 ? progress.total : '?'} шагов завершено
                </span>
                <span className="font-medium">{progress.percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Длительность</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {getDuration() || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Стоимость</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  ${run.cost_est_total.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Статус</p>
                <p className="text-lg font-semibold text-blue-600 mt-1">
                  {run.status === 'running' ? 'Выполняется...' : 'В очереди'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pipeline Steps - Visual Timeline */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Шаги процесса
            </h2>
            {run.status === 'succeeded' && run.finished_at && (
              <span className="text-sm text-gray-500">
                Завершено за {getDuration()}
              </span>
            )}
          </div>

          {run.steps.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">
                {run.status === 'running' || run.status === 'queued' 
                  ? 'Процесс запускается... Шаги появятся здесь по мере выполнения.'
                  : 'Шаги не выполнены.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {run.steps.map((step, index) => {
                const isExpanded = expandedSteps.has(step.step_name)
                // Result step is always the last step
                const isResultStep = run.steps.length > 0 && 
                  run.steps[run.steps.length - 1].step_name === step.step_name
                const stepLabel = stepNames[step.step_name] || step.step_name
                const isError = step.step_name === 'pipeline_error' || step.step_name === 'model_failures'

                return (
                  <div
                    key={index}
                    className={`border rounded-lg overflow-hidden transition-all ${
                      isError
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Step Header */}
                    <button
                      onClick={() => toggleStep(step.step_name)}
                      className="w-full px-5 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Step Number & Status Indicator */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shadow-sm ${
                            isError
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            ✓
                          </div>
                          <div className="text-left min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-semibold text-gray-900">
                                {stepLabel}
                              </span>
                              {isResultStep && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 rounded text-blue-700 font-medium">
                                  Результат
                                </span>
                              )}
                              {isError && (
                                <span className="text-xs px-2 py-0.5 bg-red-100 rounded text-red-700 font-medium">
                                  Ошибка
                                </span>
                              )}
                            </div>
                            {step.llm_model && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {step.llm_model}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 flex-shrink-0">
                        {step.tokens_used > 0 && (
                          <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Токены</p>
                            <p className="text-sm font-medium text-gray-700">
                              {step.tokens_used.toLocaleString()}
                            </p>
                          </div>
                        )}
                        {step.cost_est > 0 && (
                          <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Стоимость</p>
                            <p className="text-sm font-medium text-gray-700">
                              ${step.cost_est.toFixed(4)}
                            </p>
                          </div>
                        )}
                        <div className="text-gray-400 text-lg flex-shrink-0">
                          {isExpanded ? '▼' : '▶'}
                        </div>
                      </div>
                    </button>

                    {/* Step Content (Expandable) */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-gray-200 bg-gray-50">
                        {step.input_blob && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                              Входной промпт
                            </p>
                            <div className="bg-white rounded-lg p-4 text-sm border border-gray-200">
                              {step.input_blob.system_prompt && (
                                <div className="mb-3">
                                  <p className="font-semibold text-gray-700 mb-1">Система:</p>
                                  <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">
                                    {step.input_blob.system_prompt}
                                  </p>
                                </div>
                              )}
                              {step.input_blob.user_prompt && (
                                <div>
                                  <p className="font-semibold text-gray-700 mb-1">Пользователь:</p>
                                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
                                    {step.input_blob.user_prompt}
                                  </pre>
                                </div>
                              )}
                              {step.input_blob.error && (
                                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                                  <p className="text-xs font-semibold text-red-700 mb-1">Ошибка:</p>
                                  <pre className="text-xs text-red-600 whitespace-pre-wrap break-words">
                                    {step.input_blob.error}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {step.output_blob && (
                          <div className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Вывод
                              </p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(step.output_blob || '')
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                              >
                                {copied ? '✓ Скопировано' : 'Копировать'}
                              </button>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                              <pre className="whitespace-pre-wrap text-sm text-gray-900 leading-relaxed font-sans">
                                {step.output_blob}
                              </pre>
                            </div>
                          </div>
                        )}

                        <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                          <span>Завершено: {new Date(step.created_at).toLocaleString('ru-RU')}</span>
                          {step.tokens_used > 0 && (
                            <span>${step.cost_est.toFixed(4)} • {step.tokens_used.toLocaleString()} токенов</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Research Result - Prominent when available */}
        {researchResult && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm p-8 border-2 border-blue-100">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Результат исследования
                </h2>
                {run.steps.length > 0 && (
                  <p className="text-sm text-gray-600">
                    Создано: <span className="font-medium text-gray-700">{stepNames[run.steps[run.steps.length - 1].step_name] || run.steps[run.steps.length - 1].step_name}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => copyToClipboard(researchResult)}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-900 rounded-lg text-sm font-medium transition-colors shadow-sm border border-gray-200"
              >
                {copied ? '✓ Скопировано!' : 'Копировать в буфер обмена'}
              </button>
            </div>
            
            <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-inner">
              <pre className="whitespace-pre-wrap text-sm text-gray-900 leading-relaxed font-sans">
                {researchResult}
              </pre>
            </div>
          </div>
        )}

        {/* Summary Footer */}
        {run.status === 'succeeded' && (
          <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500 uppercase tracking-wide text-xs">Общая стоимость</p>
                <p className="font-semibold text-gray-900 mt-1">${run.cost_est_total.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-wide text-xs">Длительность</p>
                <p className="font-semibold text-gray-900 mt-1">{getDuration()}</p>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-wide text-xs">Шагов завершено</p>
                <p className="font-semibold text-gray-900 mt-1">{run.steps.length}</p>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-wide text-xs">Завершено в</p>
                <p className="font-semibold text-gray-900 mt-1">
                  {run.finished_at ? new Date(run.finished_at).toLocaleString('ru-RU') : '—'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
