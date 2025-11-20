'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { API_BASE_URL } from '@/lib/config'
import Select from '@/components/Select'
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

interface StepConfig {
  step_name: string
  order?: number
  step_type: string
  model: string
  system_prompt: string
  user_prompt_template: string
  temperature: number
  max_tokens: number
  data_sources: string[]
  num_candles?: number
  publish_to_telegram?: boolean
  include_context?: {
    steps: string[]
    placement: 'before' | 'after'
    format: 'full' | 'summary'
    auto_detected?: string[]
  }
}

interface PipelineConfig {
  steps: StepConfig[]
  default_instrument: string
  default_timeframe: string
  estimated_cost: number
  estimated_duration_seconds: number
}

interface AnalysisType {
  id: number
  name: string
  display_name: string
  description: string | null
  version: string
  config: PipelineConfig
  is_active: number
  user_id: number | null
  is_system: boolean
  created_at: string
  updated_at: string
}

async function fetchEnabledModels() {
  const { data } = await axios.get<Model[]>(`${API_BASE_URL}/api/settings/models?enabled_only=true`, { withCredentials: true })
  return data
}

async function fetchAnalysisType(id: number) {
  const { data } = await axios.get<AnalysisType>(`${API_BASE_URL}/api/analyses/${id}`, { withCredentials: true })
  return data
}

async function createPipeline(request: {
  name: string
  display_name: string
  description?: string | null
  config: PipelineConfig
}) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/analyses`,
    request,
    { withCredentials: true }
  )
  return data
}

async function updatePipeline(id: number, request: {
  display_name?: string
  description?: string | null
  config?: PipelineConfig
}) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/analyses/${id}`,
    request,
    { withCredentials: true }
  )
  return data
}

// Default step template - all steps are the same, just with different prompts
const DEFAULT_STEP_TEMPLATE: Partial<StepConfig> = {
  step_type: 'llm_analysis',
  model: 'openai/gpt-4o-mini',
  system_prompt: 'You are an expert analyst.',
  user_prompt_template: 'Analyze {instrument} on {timeframe}.\n\n{market_data_summary}',
  temperature: 0.7,
  max_tokens: 2000,
  data_sources: ['market_data'],
  num_candles: 30,
}

interface PipelineEditorProps {
  pipelineId: number | null // null for new pipeline
}

export default function PipelineEditor({ pipelineId }: PipelineEditorProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const isNew = pipelineId === null

  const [pipelineName, setPipelineName] = useState('')
  const [pipelineDescription, setPipelineDescription] = useState('')
  const [defaultInstrument, setDefaultInstrument] = useState('BTC/USDT')
  const [defaultTimeframe, setDefaultTimeframe] = useState('H1')
  const [steps, setSteps] = useState<StepConfig[]>([])
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
  const [showAddStepDialog, setShowAddStepDialog] = useState(false)
  const [reorderWarning, setReorderWarning] = useState<{ warnings: string[]; newSteps: StepConfig[] } | null>(null)
  const [saveWarning, setSaveWarning] = useState<string[] | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const { data: enabledModels = [] } = useQuery({
    queryKey: ['settings', 'models', 'enabled'],
    queryFn: fetchEnabledModels,
    staleTime: 0,
  })

  const { data: existingPipeline, isLoading } = useQuery({
    queryKey: ['analysis-type', pipelineId],
    queryFn: () => fetchAnalysisType(pipelineId!),
    enabled: !isNew && pipelineId !== null,
  })

  // Initialize from existing pipeline
  useEffect(() => {
    if (existingPipeline && !isNew) {
      setPipelineName(existingPipeline.display_name)
      setPipelineDescription(existingPipeline.description || '')
      setDefaultInstrument(existingPipeline.config.default_instrument)
      setDefaultTimeframe(existingPipeline.config.default_timeframe)
      setSteps(existingPipeline.config.steps || [])
    } else if (isNew) {
      // Initialize empty pipeline
      setSteps([])
    }
  }, [existingPipeline, isNew])

  const createMutation = useMutation({
    mutationFn: createPipeline,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      alert('Pipeline created successfully!')
      router.push(`/pipelines/${data.id}/edit`)
    },
    onError: (error: any) => {
      alert(`Failed to create pipeline: ${error.response?.data?.detail || error.message}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (request: { display_name?: string; description?: string | null; config?: PipelineConfig }) =>
      updatePipeline(pipelineId!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      queryClient.invalidateQueries({ queryKey: ['analysis-type', pipelineId] })
      alert('Pipeline updated successfully!')
    },
    onError: (error: any) => {
      alert(`Failed to update pipeline: ${error.response?.data?.detail || error.message}`)
    },
  })

  const addStep = (stepName: string) => {
    if (!stepName.trim()) {
      alert('Please enter a step name')
      return
    }
    
    const newStep: StepConfig = {
      ...DEFAULT_STEP_TEMPLATE,
      step_name: stepName.trim(),
      order: steps.length + 1,
    } as StepConfig
    
    setSteps([...steps, newStep])
    setShowAddStepDialog(false)
    setSelectedStepIndex(steps.length)
  }

  // Extract variable references from a prompt template
  const extractVariableReferences = (template: string): string[] => {
    const matches = template.match(/\{(\w+)_output\}/g)
    return matches ? matches.map(m => m.replace(/[{}]/g, '')) : []
  }

  // Check if reordering would break variable references
  const validateReordering = (newSteps: StepConfig[]): { isValid: boolean; warnings: string[] } => {
    const warnings: string[] = []
    
    for (let i = 0; i < newSteps.length; i++) {
      const step = newSteps[i]
      
      // Check variable references in prompt template
      const template = step.user_prompt_template || ''
      const referencedVars = extractVariableReferences(template)
      
      for (const varName of referencedVars) {
        const referencedStepName = varName.replace('_output', '')
        const referencedStepIndex = newSteps.findIndex(s => s.step_name === referencedStepName)
        
        // If referenced step comes AFTER current step, it's invalid
        if (referencedStepIndex > i) {
          warnings.push(
            `Step "${step.step_name}" (position ${i + 1}) references {${varName}} from step "${referencedStepName}" (position ${referencedStepIndex + 1}), which comes after it. This will cause an error.`
          )
        }
      }
      
      // Check include_context references
      if (step.include_context && step.include_context.steps) {
        for (const referencedStepName of step.include_context.steps) {
          const referencedStepIndex = newSteps.findIndex(s => s.step_name === referencedStepName)
          
          // If referenced step comes AFTER current step, it's invalid
          if (referencedStepIndex > i) {
            warnings.push(
              `Step "${step.step_name}" (position ${i + 1}) includes context from step "${referencedStepName}" (position ${referencedStepIndex + 1}), which comes after it. This will cause an error.`
            )
          }
        }
      }
    }
    
    return {
      isValid: warnings.length === 0,
      warnings
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setSteps((items) => {
        const oldIndex = items.findIndex((_, i) => i.toString() === active.id)
        const newIndex = items.findIndex((_, i) => i.toString() === over.id)
        const newSteps = arrayMove(items, oldIndex, newIndex)
        
        // Update order numbers
        newSteps.forEach((step, i) => {
          step.order = i + 1
        })
        
        // Validate variable references
        const validation = validateReordering(newSteps)
        if (!validation.isValid) {
          // Show warning dialog with cancel option
          setReorderWarning({ warnings: validation.warnings, newSteps })
          return items // Don't apply reordering yet
        }
        
        // Update selected step index if needed
        if (selectedStepIndex !== null) {
          if (selectedStepIndex === oldIndex) {
            setSelectedStepIndex(newIndex)
          } else if (selectedStepIndex === newIndex) {
            setSelectedStepIndex(oldIndex)
          } else if (selectedStepIndex > oldIndex && selectedStepIndex <= newIndex) {
            setSelectedStepIndex(selectedStepIndex - 1)
          } else if (selectedStepIndex < oldIndex && selectedStepIndex >= newIndex) {
            setSelectedStepIndex(selectedStepIndex + 1)
          }
        }
        
        return newSteps
      })
    }
  }

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index)
    // Update order numbers
    newSteps.forEach((step, i) => {
      step.order = i + 1
    })
    setSteps(newSteps)
    if (selectedStepIndex === index) {
      setSelectedStepIndex(null)
    } else if (selectedStepIndex !== null && selectedStepIndex > index) {
      setSelectedStepIndex(selectedStepIndex - 1)
    }
  }

  const updateStep = (index: number, updates: Partial<StepConfig>) => {
    const newSteps = [...steps]
    newSteps[index] = { ...newSteps[index], ...updates }
    setSteps(newSteps)
  }

  const savePipeline = () => {
    // Validate
    if (!pipelineName.trim()) {
      alert('Please enter a pipeline name')
      return
    }
    if (steps.length === 0) {
      alert('Please add at least one step')
      return
    }

    // Validate variable references
    const validation = validateReordering(steps)
    if (!validation.isValid) {
      setSaveWarning(validation.warnings)
      return
    }

    // Ensure all steps have order
    const orderedSteps = steps.map((step, index) => ({
      ...step,
      order: step.order || index + 1,
    }))

    const config: PipelineConfig = {
      steps: orderedSteps,
      default_instrument: defaultInstrument,
      default_timeframe: defaultTimeframe,
      estimated_cost: 0.1 * steps.length, // Rough estimate
      estimated_duration_seconds: 20 * steps.length, // Rough estimate
    }

    if (isNew) {
      createMutation.mutate({
        name: pipelineName.toLowerCase().replace(/\s+/g, '_'),
        display_name: pipelineName,
        description: pipelineDescription || null,
        config,
      })
    } else {
      updateMutation.mutate({
        display_name: pipelineName,
        description: pipelineDescription || null,
        config,
      })
    }
  }

  if (!isNew && isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <p className="text-gray-600 dark:text-gray-400">Loading pipeline...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Pipeline Metadata */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Pipeline Metadata
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Pipeline Name *
            </label>
            <input
              type="text"
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              placeholder="e.g., My Custom Analysis"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              value={pipelineDescription}
              onChange={(e) => setPipelineDescription(e.target.value)}
              placeholder="Describe what this pipeline does..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Default Timeframe
              </label>
              <select
                value={defaultTimeframe}
                onChange={(e) => setDefaultTimeframe(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="M1">1 Minute</option>
                <option value="M5">5 Minutes</option>
                <option value="M15">15 Minutes</option>
                <option value="H1">1 Hour</option>
                <option value="D1">1 Day</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Default Instrument
              </label>
              <input
                type="text"
                value={defaultInstrument}
                onChange={(e) => setDefaultInstrument(e.target.value)}
                placeholder="e.g., BTC/USDT"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Steps */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Pipeline Steps ({steps.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddStepDialog(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium"
            >
              Add Step
            </button>
            <button
              onClick={savePipeline}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : isNew ? 'Create Pipeline' : 'Save Pipeline'}
            </button>
            <button
              onClick={() => router.push('/analyses')}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-md text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Warning for multiple publishable steps */}
        {(() => {
          const publishableSteps = steps.filter(s => s.publish_to_telegram === true)
          if (publishableSteps.length > 1) {
            const lastPublishableStep = publishableSteps[publishableSteps.length - 1]
            return (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-600 dark:text-yellow-400 text-lg">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                      Multiple steps marked for Telegram publishing
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400">
                      {publishableSteps.length} steps have "Publish to Telegram" checked. Only the <strong>last</strong> one ({lastPublishableStep.step_name}) will be published. Consider unchecking others to avoid confusion.
                    </p>
                  </div>
                </div>
              </div>
            )
          }
          return null
        })()}

        {steps.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <p className="text-gray-600 dark:text-gray-400 mb-4">No steps yet. Click "Add Step" to get started.</p>
            <button
              onClick={() => setShowAddStepDialog(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
            >
              Add First Step
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((_, index) => index.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <SortableStepItem
                    key={index}
                    step={step}
                    index={index}
                    selectedStepIndex={selectedStepIndex}
                    enabledModels={enabledModels}
                    allSteps={steps}
                    onSelect={() => setSelectedStepIndex(selectedStepIndex === index ? null : index)}
                    onRemove={() => removeStep(index)}
                    onUpdate={(updates) => updateStep(index, updates)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add Step Dialog */}
      {showAddStepDialog && (
        <AddStepDialog
          onAdd={(stepName) => addStep(stepName)}
          onClose={() => setShowAddStepDialog(false)}
        />
      )}

      {/* Reorder Warning Dialog */}
      {reorderWarning && (
        <WarningDialog
          title="⚠️ Reordering May Break Variable References"
          message={reorderWarning.warnings.join('\n\n')}
          onConfirm={() => {
            setSteps(reorderWarning.newSteps)
            setReorderWarning(null)
          }}
          onCancel={() => setReorderWarning(null)}
          confirmText="Continue Anyway"
          cancelText="Cancel"
        />
      )}

      {/* Save Warning Dialog */}
      {saveWarning && (
        <WarningDialog
          title="⚠️ Invalid Variable References"
          message={saveWarning.join('\n\n') + '\n\nThis will cause errors when running the pipeline. Do you want to save anyway?'}
          onConfirm={() => {
            setSaveWarning(null)
            // Continue with save
            const orderedSteps = steps.map((step, index) => ({
              ...step,
              order: step.order || index + 1,
            }))

            const config: PipelineConfig = {
              steps: orderedSteps,
              default_instrument: defaultInstrument,
              default_timeframe: defaultTimeframe,
              estimated_cost: 0.1 * steps.length,
              estimated_duration_seconds: 20 * steps.length,
            }

            if (isNew) {
              createMutation.mutate({
                name: pipelineName.toLowerCase().replace(/\s+/g, '_'),
                display_name: pipelineName,
                description: pipelineDescription || null,
                config,
              })
            } else {
              updateMutation.mutate({
                display_name: pipelineName,
                description: pipelineDescription || null,
                config,
              })
            }
          }}
          onCancel={() => setSaveWarning(null)}
          confirmText="Save Anyway"
          cancelText="Cancel"
        />
      )}
    </div>
  )
}

// Sortable Step Item Component
interface SortableStepItemProps {
  step: StepConfig
  index: number
  selectedStepIndex: number | null
  enabledModels: Model[]
  allSteps: StepConfig[]
  onSelect: () => void
  onRemove: () => void
  onUpdate: (updates: Partial<StepConfig>) => void
}

function SortableStepItem({
  step,
  index,
  selectedStepIndex,
  enabledModels,
  allSteps,
  onSelect,
  onRemove,
  onUpdate,
}: SortableStepItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: index.toString() })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg overflow-hidden ${
        selectedStepIndex === index
          ? 'border-blue-500 dark:border-blue-400'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="px-4 py-3 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center gap-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Drag to reorder"
          >
            ☰
          </button>
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {step.order || index + 1}.
          </span>
          <span className="font-semibold text-gray-900 dark:text-white">
            {step.step_name}
          </span>
          <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
            {step.model}
          </span>
          {step.publish_to_telegram && (
            <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-green-600 dark:text-green-400">
              📤 Publishable
            </span>
          )}
          {step.include_context && step.include_context.steps.length > 0 && (
            <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-600 dark:text-purple-400">
              🔗 Uses context
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelect}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            {selectedStepIndex === index ? 'Hide' : 'Configure'}
          </button>
          <button
            onClick={onRemove}
            className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
          >
            Remove
          </button>
        </div>
      </div>

      {selectedStepIndex === index && (
        <StepConfigurationPanel
          step={step}
          stepIndex={index}
          allSteps={allSteps}
          enabledModels={enabledModels}
          onUpdate={onUpdate}
        />
      )}
    </div>
  )
}

// Step Configuration Panel Component
interface StepConfigurationPanelProps {
  step: StepConfig
  stepIndex: number
  allSteps: StepConfig[]
  enabledModels: Model[]
  onUpdate: (updates: Partial<StepConfig>) => void
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
  
  // Store ref in a global map for VariablePalette access
  useEffect(() => {
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

function StepConfigurationPanel({ step, stepIndex, allSteps, enabledModels, onUpdate }: StepConfigurationPanelProps) {
  const availableStepNames = allSteps
    .slice(0, stepIndex)
    .map(s => s.step_name)
    .filter(name => name !== step.step_name)

  return (
    <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 space-y-4">
      {/* Model Configuration */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">Model Configuration</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Model</label>
            <Select
              value={step.model}
              onChange={(value) => onUpdate({ model: value })}
              options={enabledModels.map(m => ({
                value: m.name,
                label: `${m.display_name} (${m.provider})${m.has_failures ? ' - Has failures' : ''}`,
                hasFailures: m.has_failures,
              }))}
            />
            {enabledModels.find(m => m.name === step.model)?.has_failures && (
              <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">⚠️ This model has recorded failures</p>
            )}
          </div>
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={step.temperature}
              onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Max Tokens</label>
            <input
              type="number"
              min="1"
              value={step.max_tokens}
              onChange={(e) => onUpdate({ max_tokens: parseInt(e.target.value) })}
              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          {step.step_name !== 'merge' && (
            <div>
              <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Number of Candles</label>
              <input
                type="number"
                min="1"
                max="500"
                value={step.num_candles || 30}
                onChange={(e) => onUpdate({ num_candles: parseInt(e.target.value) })}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Context Inclusion */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">Context Inclusion</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!step.include_context}
              onChange={(e) => {
                if (e.target.checked) {
                  onUpdate({
                    include_context: {
                      steps: [],
                      placement: 'before',
                      format: 'summary',
                    },
                  })
                } else {
                  onUpdate({ include_context: undefined })
                }
              }}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Include context from previous steps</span>
          </label>
          {step.include_context && (
            <div className="ml-6 space-y-2">
              {(() => {
                // Check for invalid context references (steps that come after this one)
                const invalidContextSteps = step.include_context!.steps.filter(referencedStepName => {
                  const referencedStepIndex = allSteps.findIndex(s => s.step_name === referencedStepName)
                  return referencedStepIndex > stepIndex
                })
                
                if (invalidContextSteps.length > 0) {
                  return (
                    <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                      <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-1">
                        ⚠️ Invalid Context References
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-400">
                        This step includes context from: {invalidContextSteps.join(', ')} which come <strong>after</strong> it. 
                        These won't be available and will cause an error. Please reorder steps or remove these references.
                      </p>
                    </div>
                  )
                }
                return null
              })()}
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Select Steps</label>
                <div className="space-y-1">
                  {availableStepNames.map(stepName => (
                    <label key={stepName} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={step.include_context!.steps.includes(stepName)}
                        onChange={(e) => {
                          const currentSteps = step.include_context!.steps
                          const newSteps = e.target.checked
                            ? [...currentSteps, stepName]
                            : currentSteps.filter(s => s !== stepName)
                          onUpdate({
                            include_context: {
                              ...step.include_context!,
                              steps: newSteps,
                            },
                          })
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{stepName}</span>
                    </label>
                  ))}
                  {availableStepNames.length === 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">No previous steps available</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Placement</label>
                  <select
                    value={step.include_context!.placement}
                    onChange={(e) => onUpdate({
                      include_context: {
                        ...step.include_context!,
                        placement: e.target.value as 'before' | 'after',
                      },
                    })}
                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="before">Before prompt</option>
                    <option value="after">After prompt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">Format</label>
                  <select
                    value={step.include_context!.format}
                    onChange={(e) => onUpdate({
                      include_context: {
                        ...step.include_context!,
                        format: e.target.value as 'full' | 'summary',
                      },
                    })}
                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="summary">Summary (200 chars)</option>
                    <option value="full">Full output</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Publish to Telegram */}
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={step.publish_to_telegram || false}
            onChange={(e) => {
              onUpdate({ publish_to_telegram: e.target.checked })
            }}
            className="rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Publish to Telegram</span>
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-6 mt-1">
          This step's output will be available for publishing to Telegram
        </p>
        {(() => {
          const publishableSteps = allSteps.filter(s => s.publish_to_telegram === true)
          const isLastPublishable = publishableSteps.length > 0 && 
            publishableSteps[publishableSteps.length - 1].step_name === step.step_name
          const isNotLastPublishable = step.publish_to_telegram && publishableSteps.length > 1 && !isLastPublishable
          
          if (isNotLastPublishable) {
            return (
              <p className="text-xs text-yellow-600 dark:text-yellow-400 ml-6 mt-1">
                ⚠️ Another step will be published instead (only the last publishable step is used)
              </p>
            )
          }
          if (isLastPublishable && publishableSteps.length > 1) {
            return (
              <p className="text-xs text-green-600 dark:text-green-400 ml-6 mt-1">
                ✓ This step will be published (it's the last publishable step)
              </p>
            )
          }
          return null
        })()}
      </div>

      {/* System Prompt */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">System Prompt</p>
        <textarea
          value={step.system_prompt}
          onChange={(e) => onUpdate({ system_prompt: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
        />
      </div>

      {/* User Prompt Template */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">User Prompt Template</p>
        {(() => {
          // Get available variables
          const previousSteps = allSteps.slice(0, stepIndex)
          const standardVars = ['{instrument}', '{timeframe}', '{market_data_summary}']
          const stepOutputVars = previousSteps.map(s => `{${s.step_name}_output}`)
          const availableVariables = [...standardVars, ...stepOutputVars]
          
          return (
            <>
              <VariablePalette
                allSteps={allSteps}
                currentStepIndex={stepIndex}
                editorRef={(index: number) => {
                  const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
                  return refs?.get(index) || { current: null }
                }}
                onInsertVariable={(variable, editorRef) => {
                  if (editorRef?.current) {
                    editorRef.current.insertVariable(variable)
                  }
                }}
              />
              {(() => {
                // Check for invalid variable references (steps that come after this one)
                const template = step.user_prompt_template || ''
                const referencedVars = template.match(/\{(\w+)_output\}/g) || []
                const invalidRefs: string[] = []
                
                referencedVars.forEach(varMatch => {
                  const varName = varMatch.replace(/[{}]/g, '')
                  const referencedStepName = varName.replace('_output', '')
                  const referencedStepIndex = allSteps.findIndex(s => s.step_name === referencedStepName)
                  
                  if (referencedStepIndex > stepIndex) {
                    invalidRefs.push(`{${varName}}`)
                  }
                })
                
                if (invalidRefs.length > 0) {
                  return (
                    <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                      <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-1">
                        ⚠️ Invalid Variable References
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-400">
                        This step references: {invalidRefs.join(', ')} from steps that come <strong>after</strong> it. 
                        These variables won't be available and will cause an error. Please reorder steps or remove these references.
                      </p>
                    </div>
                  )
                }
                return null
              })()}
              <VariableTextEditorWrapper
                stepIndex={stepIndex}
                value={step.user_prompt_template}
                onChange={(newValue) => onUpdate({ user_prompt_template: newValue })}
                availableVariables={availableVariables}
              />
            </>
          )
        })()}
      </div>
    </div>
  )
}

// Variable Palette Component
interface VariablePaletteProps {
  allSteps: StepConfig[]
  currentStepIndex: number
  editorRef?: (index: number) => React.RefObject<VariableTextEditorHandle>
  onInsertVariable: (variable: string, editorRef?: React.RefObject<VariableTextEditorHandle>) => void
}

function VariablePalette({ allSteps, currentStepIndex, editorRef, onInsertVariable }: VariablePaletteProps) {
  // Get previous steps (steps before current one)
  const previousSteps = allSteps.slice(0, currentStepIndex)
  
  // Standard variables
  const standardVars = [
    { name: '{instrument}', desc: 'Instrument symbol (e.g., "BTC/USDT")' },
    { name: '{timeframe}', desc: 'Timeframe (e.g., "H1", "M15")' },
    { name: '{market_data_summary}', desc: 'Formatted OHLCV candle data' },
  ]
  
  // Previous step outputs
  const stepOutputVars = previousSteps.map(step => ({
    name: `{${step.step_name}_output}`,
    desc: `Output from "${step.step_name}" step`,
  }))
  
  return (
    <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
      <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-2">
        Available Variables (click to insert):
      </p>
      <div className="flex flex-wrap gap-2">
        {standardVars.map((v) => {
          const ref = editorRef ? editorRef(currentStepIndex) : undefined
          return (
            <button
              key={v.name}
              type="button"
              onClick={() => onInsertVariable(v.name, ref)}
              className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 font-mono cursor-pointer transition-colors"
              title={v.desc}
            >
              {v.name}
            </button>
          )
        })}
        {stepOutputVars.length > 0 && (
          <>
            <span className="text-xs text-blue-600 dark:text-blue-400 self-center">|</span>
            {stepOutputVars.map((v) => {
              const ref = editorRef ? editorRef(currentStepIndex) : undefined
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => onInsertVariable(v.name, ref)}
                  className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300 font-mono cursor-pointer transition-colors"
                  title={v.desc}
                >
                  {v.name}
                </button>
              )
            })}
          </>
        )}
        {previousSteps.length === 0 && (
          <span className="text-xs text-blue-600 dark:text-blue-400 italic">
            (No previous steps - add steps before this one to reference their outputs)
          </span>
        )}
      </div>
    </div>
  )
}

// Warning Dialog Component
interface WarningDialogProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
}

function WarningDialog({ title, message, onConfirm, onCancel, confirmText = 'Continue', cancelText = 'Cancel' }: WarningDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
        <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
        
        <div className="mb-6">
          <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900/50 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
            {message}
          </pre>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-md"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// Add Step Dialog Component
interface AddStepDialogProps {
  onAdd: (stepName: string) => void
  onClose: () => void
}

function AddStepDialog({ onAdd, onClose }: AddStepDialogProps) {
  const [stepName, setStepName] = useState('')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Add Step</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Step Name *
            </label>
            <input
              type="text"
              value={stepName}
              onChange={(e) => setStepName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && stepName.trim()) {
                  onAdd(stepName.trim())
                  setStepName('')
                }
              }}
              placeholder="e.g., wyckoff, smc, my_analysis"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              All steps are the same - they differ only by their prompts. You'll configure the prompts after adding the step.
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (stepName.trim()) {
                  onAdd(stepName.trim())
                  setStepName('')
                }
              }}
              disabled={!stepName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md"
            >
              Add Step
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

