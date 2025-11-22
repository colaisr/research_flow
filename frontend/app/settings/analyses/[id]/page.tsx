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

interface StepConfig {
  step_name: string
  step_type: string
  model: string
  system_prompt: string
  user_prompt_template: string
  temperature: number
  max_tokens: number
  data_sources: string[]
  num_candles?: number
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

async function fetchAnalysisType(id: string) {
  const { data } = await axios.get<AnalysisType>(`${API_BASE_URL}/api/analyses/${id}`)
  return data
}

async function updateAnalysisTypeConfig(id: number, config: AnalysisType['config']) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/analyses/${id}/config`,
    { config },
    { withCredentials: true }
  )
  return data
}

const stepNames: Record<string, string> = {
  wyckoff: '1️⃣ Wyckoff Analysis',
  smc: '2️⃣ Smart Money Concepts (SMC)',
  vsa: '3️⃣ Volume Spread Analysis (VSA)',
  delta: '4️⃣ Delta Analysis',
  ict: '5️⃣ ICT Analysis',
  price_action: '6️⃣ Price Action / Patterns',
  merge: '7️⃣ Merge & Telegram Post',
}

export default function AnalysisTypeEditPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const analysisId = params.id as string
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [editableConfig, setEditableConfig] = useState<AnalysisType['config'] | null>(null)

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['analysis-type', analysisId],
    queryFn: () => fetchAnalysisType(analysisId),
  })

  const { data: enabledModels = [] } = useQuery({
    queryKey: ['settings', 'models', 'enabled'],
    queryFn: fetchEnabledModels,
    staleTime: 0,
  })

  const updateConfigMutation = useMutation({
    mutationFn: (config: AnalysisType['config']) =>
      updateAnalysisTypeConfig(analysis?.id || 0, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-type', analysisId] })
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      alert('Configuration saved successfully!')
    },
    onError: (error: any) => {
      alert(`Failed to save configuration: ${error.response?.data?.detail || error.message}`)
    },
  })

  // Initialize editable config when analysis loads
  useEffect(() => {
    if (analysis && !editableConfig) {
      setEditableConfig(JSON.parse(JSON.stringify(analysis.config))) // Deep copy
    }
  }, [analysis, editableConfig])

  const toggleStep = (stepName: string) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepName)) {
      newExpanded.delete(stepName)
    } else {
      newExpanded.add(stepName)
    }
    setExpandedSteps(newExpanded)
  }

  const updateStepConfig = (stepIndex: number, field: keyof StepConfig, value: any) => {
    if (!editableConfig) return
    const newConfig = JSON.parse(JSON.stringify(editableConfig))
    newConfig.steps[stepIndex] = { ...newConfig.steps[stepIndex], [field]: value }
    setEditableConfig(newConfig)
  }

  const resetConfig = () => {
    if (analysis) {
      setEditableConfig(JSON.parse(JSON.stringify(analysis.config)))
    }
  }

  const saveConfig = () => {
    if (editableConfig) {
      updateConfigMutation.mutate(editableConfig)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400">Loading analysis configuration...</p>
        </div>
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded p-4">
            <p className="text-red-700 dark:text-red-400">
              Error loading analysis: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/settings')}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mb-4"
          >
            ← Back to Settings
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Edit: {analysis.display_name}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {analysis.description}
          </p>
        </div>

        {/* Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Overview & Defaults
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Version</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                v{analysis.version}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Steps</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {editableConfig?.steps.length || analysis.config.steps.length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Estimated Cost</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                ${(editableConfig?.estimated_cost || analysis.config.estimated_cost).toFixed(3)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Duration</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                ~{Math.round((editableConfig?.estimated_duration_seconds || analysis.config.estimated_duration_seconds) / 60)} min
              </p>
            </div>
          </div>
        </div>

        {/* Pipeline Steps */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Pipeline Steps Configuration
            </h2>
            <div className="flex gap-2">
              <button
                onClick={resetConfig}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded"
              >
                Reset
              </button>
              <button
                onClick={saveConfig}
                disabled={updateConfigMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium"
              >
                {updateConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>

          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              ⚠️ Editing default configuration. Changes will be used as defaults for all future runs of this analysis type.
            </p>
          </div>

          <div className="space-y-3">
            {(editableConfig || analysis.config)?.steps.map((step, index) => {
              const isExpanded = expandedSteps.has(step.step_name)
              const stepLabel = stepNames[step.step_name] || step.step_name

              return (
                <div
                  key={index}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* Step Header */}
                  <button
                    onClick={() => toggleStep(step.step_name)}
                    className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-gray-900 dark:text-white">
                        {stepLabel}
                      </span>
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
                        {step.model}
                      </span>
                      <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                        {step.step_type}
                      </span>
                    </div>
                    <span className="text-gray-400 dark:text-gray-500">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </button>

                  {/* Step Content (Expandable) */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                      <div className="mt-3 space-y-4">
                        {/* Model Configuration */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                            Model Configuration
                          </p>
                          <div className="bg-white dark:bg-gray-800 rounded p-3 text-sm border border-gray-200 dark:border-gray-700">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-gray-500 dark:text-gray-400">Model:</label>
                                <div className="mt-1">
                                  <Select
                                    value={step.model}
                                    onChange={(value) => updateStepConfig(index, 'model', value)}
                                    options={enabledModels.map((model) => ({
                                      value: model.name,
                                      label: `${model.display_name} (${model.provider})${model.has_failures ? ' - Has failures' : ''}`,
                                      hasFailures: model.has_failures,
                                    }))}
                                    className="w-full"
                                  />
                                  {enabledModels.find(m => m.name === step.model)?.has_failures && (
                                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                                      <span>⚠️</span>
                                      <span>This model has recorded failures and may not work reliably</span>
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-gray-500 dark:text-gray-400">Temperature:</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="2"
                                  value={step.temperature}
                                  onChange={(e) => updateStepConfig(index, 'temperature', parseFloat(e.target.value))}
                                  className="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-gray-500 dark:text-gray-400">Max Tokens:</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={step.max_tokens}
                                  onChange={(e) => updateStepConfig(index, 'max_tokens', parseInt(e.target.value))}
                                  className="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                              </div>
                              {/* Show num_candles only for steps that use candles (not merge) */}
                              {step.step_name !== 'merge' && (
                                <div>
                                  <label className="text-gray-500 dark:text-gray-400">Number of Candles:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="500"
                                    value={step.num_candles || (step.step_name === 'wyckoff' ? 20 : step.step_name === 'smc' || step.step_name === 'ict' || step.step_name === 'price_action' ? 50 : 30)}
                                    onChange={(e) => updateStepConfig(index, 'num_candles', parseInt(e.target.value))}
                                    className="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    placeholder="Number of candles to analyze"
                                  />
                                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Number of most recent candles to include in analysis
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* System Prompt */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                            System Prompt
                          </p>
                          <textarea
                            value={step.system_prompt}
                            onChange={(e) => updateStepConfig(index, 'system_prompt', e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                            placeholder="System prompt for this step..."
                          />
                        </div>

                        {/* User Prompt Template */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                            User Prompt Template
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Available variables: {'{instrument}'}, {'{timeframe}'}, {'{market_data_summary}'}, {'{wyckoff_output}'}, {'{smc_output}'}, {'{vsa_output}'}, {'{delta_output}'}, {'{ict_output}'}, {'{price_action_output}'}
                          </p>
                          <textarea
                            value={step.user_prompt_template}
                            onChange={(e) => updateStepConfig(index, 'user_prompt_template', e.target.value)}
                            rows={12}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                            placeholder="User prompt template for this step..."
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

