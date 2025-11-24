'use client'

import { useState } from 'react'

interface TestStepResult {
  step_name: string
  input: string
  output: string
  model: string | null
  tokens_used?: number | null
  cost_est?: number | null
  error: string | null
}

interface TestPipelineResult {
  steps: TestStepResult[]
  total_cost?: number | null
  total_tokens?: number | null
  status: 'succeeded' | 'failed'
  error: string | null
}

interface TestResultsProps {
  result: TestStepResult | TestPipelineResult
  onClose: () => void
  isPipeline?: boolean
}

export default function TestResults({ result, onClose, isPipeline = false }: TestResultsProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0]))

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedSteps(newExpanded)
  }

  if (isPipeline) {
    const pipelineResult = result as TestPipelineResult
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Результаты теста пайплайна</h2>
              <div className="mt-1 flex gap-4 text-sm text-gray-600">
                <span>Шагов: {pipelineResult.steps.length}</span>
                <span>Токенов: {pipelineResult.total_tokens != null ? pipelineResult.total_tokens.toLocaleString() : '0'}</span>
                <span>Стоимость: ${pipelineResult.total_cost != null ? pipelineResult.total_cost.toFixed(4) : '0.0000'}</span>
                <span className={`font-medium ${pipelineResult.status === 'succeeded' ? 'text-green-600' : 'text-red-600'}`}>
                  {pipelineResult.status === 'succeeded' ? '✓ Успешно' : '✗ Ошибка'}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error message if pipeline failed */}
          {pipelineResult.error && (
            <div className="px-6 py-3 bg-red-50 border-b border-red-200">
              <p className="text-sm text-red-800 font-medium">Ошибка выполнения пайплайна:</p>
              <p className="text-sm text-red-700 mt-1">{pipelineResult.error}</p>
            </div>
          )}

          {/* Steps list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {pipelineResult.steps.map((step, index) => (
              <div
                key={index}
                className={`border rounded-lg overflow-hidden ${
                  step.error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                }`}
              >
                <button
                  onClick={() => toggleStep(index)}
                  className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500">{index + 1}.</span>
                    <span className="font-semibold text-gray-900">{step.step_name}</span>
                    {step.model && (
                      <span className="text-xs px-2 py-1 bg-blue-100 rounded text-blue-700 font-medium">
                        {step.model}
                      </span>
                    )}
                    {step.error ? (
                      <span className="text-xs px-2 py-1 bg-red-100 rounded text-red-700 font-medium">
                        Ошибка
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-green-100 rounded text-green-700 font-medium">
                        ✓ Успешно
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>{step.tokens_used != null ? step.tokens_used.toLocaleString() : '0'} токенов</span>
                    <span>${step.cost_est != null ? step.cost_est.toFixed(4) : '0.0000'}</span>
                    <svg
                      className={`w-5 h-5 transition-transform ${expandedSteps.has(index) ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedSteps.has(index) && (
                  <div className="px-4 pb-4 border-t border-gray-200 space-y-3">
                    {step.error && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                        <p className="text-sm font-medium text-red-800">Ошибка:</p>
                        <p className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{step.error}</p>
                      </div>
                    )}
                    {step.input && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Входной промпт:</label>
                        <div className="p-3 bg-gray-50 rounded border border-gray-200">
                          <pre className="text-xs text-gray-800 whitespace-pre-wrap font-sans">{step.input}</pre>
                        </div>
                      </div>
                    )}
                    {step.output && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Результат:</label>
                        <div className="p-3 bg-gray-50 rounded border border-gray-200">
                          <pre className="text-xs text-gray-800 whitespace-pre-wrap font-sans">{step.output}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Single step result
  const stepResult = result as TestStepResult
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Результаты теста шага</h2>
            <div className="mt-1 flex gap-4 text-sm text-gray-600">
              <span>Шаг: {stepResult.step_name}</span>
              {stepResult.model && <span>Модель: {stepResult.model}</span>}
              <span>Токенов: {stepResult.tokens_used != null ? stepResult.tokens_used.toLocaleString() : '0'}</span>
              <span>Стоимость: ${stepResult.cost_est != null ? stepResult.cost_est.toFixed(4) : '0.0000'}</span>
              {stepResult.error ? (
                <span className="font-medium text-red-600">✗ Ошибка</span>
              ) : (
                <span className="font-medium text-green-600">✓ Успешно</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {stepResult.error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded">
              <p className="text-sm font-medium text-red-800">Ошибка выполнения:</p>
              <p className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{stepResult.error}</p>
            </div>
          )}

          {stepResult.input && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Входной промпт:</label>
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{stepResult.input}</pre>
              </div>
            </div>
          )}

          {stepResult.output && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Результат:</label>
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{stepResult.output}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

