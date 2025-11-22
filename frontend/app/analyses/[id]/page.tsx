'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
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

interface Instrument {
  symbol: string
  type: string
  exchange: string | null
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
    default_instrument: string
    default_timeframe: string
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

async function fetchInstruments(analysisTypeId?: number) {
  const url = analysisTypeId 
    ? `${API_BASE_URL}/api/instruments?analysis_type_id=${analysisTypeId}`
    : `${API_BASE_URL}/api/instruments`
  const { data } = await axios.get<Instrument[]>(url)
  return data
}

async function fetchAnalysisType(id: string) {
  const { data } = await axios.get<AnalysisType>(`${API_BASE_URL}/api/analyses/${id}`)
  return data
}

interface Tool {
  id: number
  display_name: string
  tool_type: 'database' | 'api' | 'rag'
  is_active: boolean
}

async function fetchTools() {
  const { data } = await axios.get<Tool[]>(`${API_BASE_URL}/api/tools?tool_type=api`, {
    withCredentials: true
  })
  return data
}

async function createRun(
  analysisTypeId: number, 
  instrument: string, 
  timeframe: string,
  customConfig?: AnalysisType['config'],
  toolId?: number | null
) {
  const payload: any = {
    analysis_type_id: analysisTypeId,
    instrument,
    timeframe,
  }
  if (customConfig) {
    payload.custom_config = customConfig
  }
  if (toolId) {
    payload.tool_id = toolId
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
  const [selectedInstrument, setSelectedInstrument] = useState<string>('')
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('')
  const [selectedToolId, setSelectedToolId] = useState<number | null>(null)
  const [editableConfig, setEditableConfig] = useState<AnalysisType['config'] | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['analysis-type', analysisId],
    queryFn: () => fetchAnalysisType(analysisId),
  })

  const { data: enabledModels = [] } = useQuery({
    queryKey: ['settings', 'models', 'enabled'],
    queryFn: fetchEnabledModels,
    staleTime: 0, // Always fetch fresh data to get latest has_failures status
  })

  const { data: enabledDataSources = [] } = useQuery({
    queryKey: ['settings', 'data-sources', 'enabled'],
    queryFn: fetchEnabledDataSources,
  })

  const { data: instruments = [], isLoading: instrumentsLoading, error: instrumentsError } = useQuery({
    queryKey: ['instruments', analysisId],
    queryFn: () => fetchInstruments(analysis?.id),
    enabled: !!analysis,
  })

  const { data: tools = [], isLoading: toolsLoading } = useQuery({
    queryKey: ['tools', 'api'],
    queryFn: fetchTools,
  })

  const createRunMutation = useMutation({
    mutationFn: ({ instrument, timeframe, toolId }: { instrument: string; timeframe: string; toolId?: number | null }) =>
      createRun(analysis?.id || 0, instrument, timeframe, editableConfig || undefined, toolId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      router.push(`/runs/${data.id}`)
    },
    onError: (error: any) => {
      // Error is already handled by the UI below
    },
  })

  // Initialize editable config when analysis loads
  useEffect(() => {
    if (analysis && !editableConfig) {
      setEditableConfig(JSON.parse(JSON.stringify(analysis.config))) // Deep copy
    }
  }, [analysis, editableConfig])

  // Set defaults on load - only if default instrument is available in enabled instruments
  useEffect(() => {
    if (analysis && instruments.length > 0) {
      // Check if default instrument is available in enabled instruments
      const defaultInstrumentAvailable = instruments.some(
        inst => inst.symbol === analysis.config.default_instrument
      )
      
      if (!selectedInstrument) {
        if (defaultInstrumentAvailable && analysis.config.default_instrument) {
          // Use default if available
          setSelectedInstrument(analysis.config.default_instrument)
        } else if (instruments.length > 0) {
          // Otherwise use first available instrument
          setSelectedInstrument(instruments[0].symbol)
        }
      }
      if (!selectedTimeframe && analysis.config.default_timeframe) {
        setSelectedTimeframe(analysis.config.default_timeframe)
      }
    }
  }, [analysis, instruments, selectedInstrument, selectedTimeframe])

  const handleRunAnalysis = () => {
    if (!selectedInstrument || !selectedTimeframe) {
      alert('Please select instrument and timeframe')
      return
    }
    createRunMutation.mutate({
      instrument: selectedInstrument,
      timeframe: selectedTimeframe,
      toolId: selectedToolId,
    })
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
    wyckoff: '1️⃣ Wyckoff Analysis',
    smc: '2️⃣ Smart Money Concepts (SMC)',
    vsa: '3️⃣ Volume Spread Analysis (VSA)',
    delta: '4️⃣ Delta Analysis',
    ict: '5️⃣ ICT Analysis',
    merge: '6️⃣ Merge & Telegram Post',
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
            onClick={() => router.push('/analyses')}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mb-4"
          >
            ← Back to Analyses
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            {analysis.display_name}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">{analysis.description}</p>
        </div>

        {/* Analysis Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Version</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                v{analysis.version}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Steps</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {analysis.config.steps.length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Estimated Cost</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                ${analysis.config.estimated_cost.toFixed(3)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Duration</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                ~{Math.round(analysis.config.estimated_duration_seconds / 60)} min
              </p>
            </div>
          </div>
        </div>

        {/* Pipeline Visualization */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Pipeline Steps
            </h2>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={resetConfig}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    Done Editing
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded"
                >
                  ✏️ Edit Configuration
                </button>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                ⚠️ You're editing the configuration. Changes will be used when you run the analysis.
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
                                {isEditing ? (
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
                                    {isModelChangedFromDefault(index) && (
                                      <button
                                        onClick={() => applyModelToAllSteps(step.model)}
                                        className="mt-2 px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded transition-colors"
                                      >
                                        Apply to all steps
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="ml-2">
                                    <span className="text-gray-900 dark:text-white font-medium">
                                      {step.model}
                                    </span>
                                    {enabledModels.find(m => m.name === step.model)?.has_failures && (
                                      <span className="ml-2 text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded text-orange-600 dark:text-orange-400">
                                        ⚠️ Has failures
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="text-gray-500 dark:text-gray-400">Temperature:</label>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="2"
                                    value={step.temperature}
                                    onChange={(e) => updateStepConfig(index, 'temperature', parseFloat(e.target.value))}
                                    className="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                  />
                                ) : (
                                  <span className="ml-2 text-gray-900 dark:text-white font-medium">
                                    {step.temperature}
                                  </span>
                                )}
                              </div>
                              <div>
                                <label className="text-gray-500 dark:text-gray-400">Max Tokens:</label>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={step.max_tokens}
                                    onChange={(e) => updateStepConfig(index, 'max_tokens', parseInt(e.target.value))}
                                    className="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                  />
                                ) : (
                                  <span className="ml-2 text-gray-900 dark:text-white font-medium">
                                    {step.max_tokens.toLocaleString()}
                                  </span>
                                )}
                              </div>
                              {/* Show num_candles only for steps that use candles (not merge) */}
                              {step.step_name !== 'merge' && (
                                <div>
                                  <label className="text-gray-500 dark:text-gray-400">Number of Candles:</label>
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="1"
                                      max="500"
                                      value={step.num_candles || (step.step_name === 'wyckoff' ? 20 : step.step_name === 'smc' || step.step_name === 'ict' || step.step_name === 'price_action' ? 50 : 30)}
                                      onChange={(e) => updateStepConfig(index, 'num_candles', parseInt(e.target.value))}
                                      className="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                      placeholder="Number of candles to analyze"
                                    />
                                  ) : (
                                    <span className="ml-2 text-gray-900 dark:text-white font-medium">
                                      {step.num_candles || (step.step_name === 'wyckoff' ? 20 : step.step_name === 'smc' || step.step_name === 'ict' || step.step_name === 'price_action' ? 50 : 30)}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div>
                                <label className="text-gray-500 dark:text-gray-400">Data Source:</label>
                                {isEditing ? (
                                  <select
                                    value={Array.isArray(step.data_sources) ? step.data_sources[0] || '' : step.data_sources || ''}
                                    onChange={(e) => {
                                      // Store as single value (array for backward compatibility)
                                      updateStepConfig(index, 'data_sources', [e.target.value])
                                    }}
                                    className="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                  >
                                    <option value="">Auto (detect from instrument)</option>
                                    {enabledDataSources.map((source) => (
                                      <option key={source.id} value={source.name}>
                                        {source.display_name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="ml-2 text-gray-900 dark:text-white font-medium">
                                    {Array.isArray(step.data_sources) 
                                      ? (step.data_sources[0] || 'Auto')
                                      : (step.data_sources || 'Auto')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* System Prompt */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                            System Prompt
                          </p>
                          {isEditing ? (
                            <textarea
                              value={step.system_prompt}
                              onChange={(e) => updateStepConfig(index, 'system_prompt', e.target.value)}
                              rows={6}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono"
                            />
                          ) : (
                            <div className="bg-white dark:bg-gray-800 rounded p-3 text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                              <pre className="whitespace-pre-wrap">{step.system_prompt}</pre>
                            </div>
                          )}
                        </div>

                        {/* User Prompt Template */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                            User Prompt Template
                          </p>
                          {isEditing ? (
                            <textarea
                              value={step.user_prompt_template}
                              onChange={(e) => updateStepConfig(index, 'user_prompt_template', e.target.value)}
                              rows={6}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono"
                            />
                          ) : (
                            <div className="bg-white dark:bg-gray-800 rounded p-3 text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                              <pre className="whitespace-pre-wrap">{step.user_prompt_template}</pre>
                              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                                Variables: {step.user_prompt_template.match(/\{(\w+)\}/g)?.join(', ') || 'None'}
                              </p>
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

        {/* Run Analysis */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Run Analysis
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex flex-col">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Instrument
              </label>
              <select
                value={selectedInstrument}
                onChange={(e) => setSelectedInstrument(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={instrumentsLoading}
              >
                <option value="">Select instrument...</option>
                {instrumentsLoading ? (
                  <option disabled>Loading instruments...</option>
                ) : (
                  instruments.map((inst) => (
                    <option key={inst.symbol} value={inst.symbol}>
                      {inst.symbol} ({inst.type})
                    </option>
                  ))
                )}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Показаны только инструменты, подходящие для данного типа анализа
              </p>
              {instrumentsError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Failed to load instruments
                </p>
              )}
            </div>

            <div className="flex flex-col">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Timeframe
              </label>
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="M1">1 Minute</option>
                <option value="M5">5 Minutes</option>
                <option value="M15">15 Minutes</option>
                <option value="H1">1 Hour</option>
                <option value="D1">1 Day</option>
              </select>
              <div className="mt-1 h-5"></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Data Source Tool (Optional)
              </label>
              <select
                value={selectedToolId || ''}
                onChange={(e) => setSelectedToolId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={toolsLoading}
              >
                <option value="">Use default data source</option>
                {toolsLoading ? (
                  <option disabled>Loading tools...</option>
                ) : (
                  tools.filter(t => t.is_active).map((tool) => (
                    <option key={tool.id} value={tool.id}>
                      {tool.display_name}
                    </option>
                  ))
                )}
              </select>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Select a custom tool for data fetching
                </p>
                <Link
                  href="/tools/new"
                  className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  Create Tool →
                </Link>
              </div>
            </div>

            <div className="flex flex-col">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 opacity-0">
                Action
              </label>
              <button
                onClick={handleRunAnalysis}
                disabled={!selectedInstrument || !selectedTimeframe || createRunMutation.isPending}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
              >
                {createRunMutation.isPending ? 'Creating...' : 'Run Analysis'}
              </button>
            </div>
          </div>
          </div>

          {createRunMutation.isError && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded text-red-700 dark:text-red-400">
              Error: {
                createRunMutation.error && typeof createRunMutation.error === 'object' && 'response' in createRunMutation.error
                  ? (createRunMutation.error as any).response?.data?.detail || (createRunMutation.error as any).response?.data?.message || (createRunMutation.error as Error).message
                  : createRunMutation.error instanceof Error
                  ? createRunMutation.error.message
                  : 'Failed to create run'
              }
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

