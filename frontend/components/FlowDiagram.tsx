'use client'

import { useState } from 'react'

interface StepResult {
  step_name: string
  status: 'idle' | 'running' | 'completed' | 'error' | 'waiting'
  result?: string
  error?: string
  tokens?: number
  cost?: number
  model?: string
}

interface FlowDiagramProps {
  steps: Array<{ step_name: string; order?: number }>
  executionState: 'idle' | 'running' | 'completed'
  stepResults: Map<number, StepResult>
  currentStepIndex?: number
  onTestPipeline?: () => void
  onStepClick?: (stepIndex: number) => void
  isTestingPipeline?: boolean
}

export default function FlowDiagram({
  steps,
  executionState,
  stepResults,
  currentStepIndex,
  onTestPipeline,
  onStepClick,
  isTestingPipeline,
}: FlowDiagramProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedSteps(newExpanded)
  }

  const getStepStatus = (index: number): StepResult['status'] => {
    if (executionState === 'idle') return 'idle'
    if (executionState === 'running') {
      if (currentStepIndex === index) return 'running'
      if (currentStepIndex !== undefined && index < currentStepIndex) return 'completed'
      return 'waiting'
    }
    if (executionState === 'completed') {
      const result = stepResults.get(index)
      if (result?.error) return 'error'
      return 'completed'
    }
    return 'idle'
  }

  const getStatusIcon = (status: StepResult['status']) => {
    switch (status) {
      case 'completed':
        return <span className="text-green-600 font-bold">✓</span>
      case 'running':
        return (
          <span className="text-blue-600 flex items-center gap-1">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-xs">Выполняется...</span>
          </span>
        )
      case 'error':
        return <span className="text-red-600 font-bold">✗</span>
      case 'waiting':
        return <span className="text-gray-400">⏸</span>
      default:
        return null
    }
  }

  const getStepBorderColor = (status: StepResult['status']) => {
    switch (status) {
      case 'completed':
        return 'border-green-500'
      case 'running':
        return 'border-blue-500 ring-2 ring-blue-200 animate-pulse'
      case 'error':
        return 'border-red-500'
      case 'waiting':
        return 'border-gray-300'
      default:
        return 'border-gray-200'
    }
  }

  const getStepBgColor = (status: StepResult['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50'
      case 'running':
        return 'bg-blue-50'
      case 'error':
        return 'bg-red-50'
      case 'waiting':
        return 'bg-gray-50'
      default:
        return 'bg-white'
    }
  }

  if (steps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-gray-600 text-sm mb-2">Визуализация потока</p>
          <p className="text-gray-400 text-xs">Добавьте шаги, чтобы увидеть визуальный поток</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Визуальный поток</h3>
          {executionState === 'idle' && steps.length > 0 && (
            <button
              onClick={onTestPipeline}
              disabled={isTestingPipeline}
              className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-sm flex items-center gap-1.5"
            >
              {isTestingPipeline ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  Тестирование...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Тест пайплайна
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Flow Diagram */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          {steps.map((step, index) => {
            const status = getStepStatus(index)
            const result = stepResults.get(index)
            const isExpanded = expandedSteps.has(index)

            return (
              <div key={index} className="relative">
                {/* Step Box */}
                <div
                  className={`
                    relative border-2 rounded-lg p-4 transition-all cursor-pointer
                    ${getStepBorderColor(status)}
                    ${getStepBgColor(status)}
                    ${onStepClick ? 'hover:shadow-md' : ''}
                  `}
                  onClick={() => onStepClick?.(index)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-gray-500">
                          {step.order || index + 1}.
                        </span>
                        <span className="font-semibold text-gray-900 truncate">
                          {step.step_name}
                        </span>
                        <div className="flex-shrink-0">
                          {getStatusIcon(status)}
                        </div>
                      </div>

                      {/* Result Preview */}
                      {result && (result.result || result.error) && (
                        <div className="mt-2">
                          {result.error ? (
                            <div className="text-xs text-red-700 font-medium">
                              Ошибка: {result.error.substring(0, 100)}
                              {result.error.length > 100 && '...'}
                            </div>
                          ) : result.result ? (
                            <div className="text-xs text-gray-700">
                              <span className="font-medium">Результат:</span>{' '}
                              {result.result.substring(0, 150)}
                              {result.result.length > 150 && '...'}
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Stats */}
                      {result && (result.tokens || result.cost) && (
                        <div className="mt-2 flex gap-3 text-xs text-gray-500">
                          {result.tokens && <span>{result.tokens.toLocaleString()} токенов</span>}
                          {result.cost && <span>${result.cost.toFixed(4)}</span>}
                        </div>
                      )}
                    </div>

                    {/* Expand Button */}
                    {(result?.result || result?.error) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleStep(index)
                        }}
                        className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <svg
                          className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Expanded Result */}
                  {isExpanded && result && (result.result || result.error) && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      {result.error ? (
                        <div className="p-3 bg-red-50 border border-red-200 rounded">
                          <p className="text-xs font-medium text-red-800 mb-1">Ошибка:</p>
                          <pre className="text-xs text-red-700 whitespace-pre-wrap font-sans">
                            {result.error}
                          </pre>
                        </div>
                      ) : result.result ? (
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                          <p className="text-xs font-medium text-gray-700 mb-1">Полный результат:</p>
                          <pre className="text-xs text-gray-800 whitespace-pre-wrap font-sans">
                            {result.result}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="flex justify-center my-2">
                    <div
                      className={`
                        w-0.5 h-6 transition-all
                        ${status === 'completed' && getStepStatus(index + 1) === 'running' 
                          ? 'bg-blue-500 animate-pulse' 
                          : status === 'completed' 
                          ? 'bg-green-500' 
                          : 'bg-gray-300'
                        }
                      `}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Empty State for Execution */}
        {executionState === 'idle' && steps.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 mb-4">
              Нажмите "Тест пайплайна" чтобы увидеть выполнение потока
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

