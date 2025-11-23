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
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

interface Model {
  id: number
  name: string
  display_name: string
  provider: string
  description: string | null
  is_enabled: boolean
  has_failures: boolean
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

interface ToolReference {
  tool_id: number
  variable_name: string
  // extraction_method and extraction_config removed - AI-based extraction is automatic
  // Kept for backward compatibility but ignored
  extraction_method?: 'natural_language' | 'explicit' | 'template'
  extraction_config?: {
    query_template?: string
    context_window?: number
  }
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
  tool_references?: ToolReference[]
}

interface PipelineConfig {
  steps: StepConfig[]
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

async function fetchTools() {
  const { data } = await axios.get<Tool[]>(`${API_BASE_URL}/api/tools`, { withCredentials: true })
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
  is_system?: boolean
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
  is_system?: boolean
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
  system_prompt: 'Вы эксперт-аналитик.',
  user_prompt_template: 'Выполните анализ и предоставьте результаты.',
  temperature: 0.7,
  max_tokens: 2000,
  data_sources: [],
}

interface PipelineEditorProps {
  pipelineId: number | null // null for new pipeline
}

export default function PipelineEditor({ pipelineId }: PipelineEditorProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isPlatformAdmin } = useAuth()
  const isNew = pipelineId === null

  const [pipelineName, setPipelineName] = useState('')
  const [pipelineDescription, setPipelineDescription] = useState('')
  const [isSystemProcess, setIsSystemProcess] = useState(false)
  const [steps, setSteps] = useState<StepConfig[]>([])
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
  const [newStepName, setNewStepName] = useState('')
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

  const { data: tools = [] } = useQuery({
    queryKey: ['tools'],
    queryFn: fetchTools,
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
      setIsSystemProcess(existingPipeline.is_system || false)
      setSteps(existingPipeline.config.steps || [])
    } else if (isNew) {
      // Initialize empty pipeline
      setIsSystemProcess(false)
      setSteps([])
    }
  }, [existingPipeline, isNew])

  const createMutation = useMutation({
    mutationFn: createPipeline,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      router.push(`/pipelines/${data.id}/edit`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (request: { display_name?: string; description?: string | null; config?: PipelineConfig; is_system?: boolean }) =>
      updatePipeline(pipelineId!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      queryClient.invalidateQueries({ queryKey: ['analysis-type', pipelineId] })
    },
  })

  const addStep = (stepName?: string) => {
    const nameToUse = stepName || newStepName.trim()
    if (!nameToUse) {
      return
    }
    
    const newStep: StepConfig = {
      ...DEFAULT_STEP_TEMPLATE,
      step_name: nameToUse,
      order: steps.length + 1,
    } as StepConfig
    
    setSteps([...steps, newStep])
    setNewStepName('')
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
              `Шаг "${step.step_name}" (позиция ${i + 1}) ссылается на {${varName}} из шага "${referencedStepName}" (позиция ${referencedStepIndex + 1}), который идёт после него. Это вызовет ошибку.`
            )
        }
      }
      
      // Removed include_context validation - users now use {step_name_output} variables directly in prompts
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
      alert('Введите название процесса')
      return
    }
    if (steps.length === 0) {
      alert('Добавьте хотя бы один шаг')
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
      estimated_cost: 0.1 * steps.length, // Rough estimate
      estimated_duration_seconds: 20 * steps.length, // Rough estimate
    }

    if (isNew) {
      createMutation.mutate({
        name: pipelineName.toLowerCase().replace(/\s+/g, '_'),
        display_name: pipelineName,
        description: pipelineDescription || null,
        config,
        is_system: isPlatformAdmin && isSystemProcess ? true : undefined,
      })
    } else {
      updateMutation.mutate({
        display_name: pipelineName,
        description: pipelineDescription || null,
        config,
        is_system: isPlatformAdmin && isSystemProcess ? true : undefined,
      })
    }
  }

  if (!isNew && isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Загрузка процесса...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Pipeline Metadata */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">
          Метаданные процесса
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">
              Название процесса *
            </label>
            <input
              type="text"
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              placeholder="Например: Мой анализ"
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {isPlatformAdmin && (
            <div className="flex items-start p-4 bg-blue-50 border border-blue-200 rounded-md">
              <input
                type="checkbox"
                id="is_system"
                checked={isSystemProcess}
                onChange={(e) => setIsSystemProcess(e.target.checked)}
                className="mt-1 mr-3 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="is_system" className="text-sm text-gray-700 cursor-pointer flex-1">
                <span className="font-medium">
                  {isNew ? 'Создать как системный процесс' : 'Системный процесс'}
                </span>
                <span className="block text-xs text-gray-600 mt-1">
                  {isNew 
                    ? 'Системные процессы видны всем пользователям как примеры и могут быть скопированы'
                    : 'Отметьте, чтобы сделать процесс видимым всем пользователям как пример. Снимите отметку, чтобы сделать его личным процессом.'
                  }
                </span>
              </label>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">
              Описание
            </label>
            <textarea
              value={pipelineDescription}
              onChange={(e) => setPipelineDescription(e.target.value)}
              placeholder="Опишите, что делает этот процесс..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Pipeline Steps */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Шаги процесса ({steps.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={savePipeline}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Сохранение...' : isNew ? 'Создать процесс' : 'Сохранить'}
            </button>
            <button
              onClick={() => router.push('/analyses')}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>

        {steps.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
            <p className="text-gray-600 mb-4">Пока нет шагов. Добавьте первый шаг ниже, чтобы начать.</p>
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
                    tools={tools}
                    onSelect={() => setSelectedStepIndex(selectedStepIndex === index ? null : index)}
                    onRemove={() => removeStep(index)}
                    onUpdate={(updates) => updateStep(index, updates)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add Step - Always after last step */}
        <div className="mt-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newStepName}
              onChange={(e) => setNewStepName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStepName.trim()) {
                  addStep()
                }
              }}
              placeholder="Название нового шага (нажмите Enter для добавления)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => addStep()}
              disabled={!newStepName.trim()}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Все шаги одинаковы по структуре - они отличаются только промптами. Настройте промпты после добавления шага.
          </p>
        </div>
      </div>

      {/* Reorder Warning Dialog */}
      {reorderWarning && (
        <WarningDialog
          title="⚠️ Изменение порядка может нарушить ссылки на переменные"
          message={reorderWarning.warnings.join('\n\n')}
          onConfirm={() => {
            setSteps(reorderWarning.newSteps)
            setReorderWarning(null)
          }}
          onCancel={() => setReorderWarning(null)}
          confirmText="Продолжить"
          cancelText="Отмена"
        />
      )}

      {/* Save Warning Dialog */}
      {saveWarning && (
        <WarningDialog
          title="⚠️ Некорректные ссылки на переменные"
          message={saveWarning.join('\n\n') + '\n\nЭто вызовет ошибки при запуске процесса. Сохранить всё равно?'}
          onConfirm={() => {
            setSaveWarning(null)
            // Continue with save
            const orderedSteps = steps.map((step, index) => ({
              ...step,
              order: step.order || index + 1,
            }))

            const config: PipelineConfig = {
              steps: orderedSteps,
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
          confirmText="Сохранить"
          cancelText="Отмена"
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
  tools: Tool[]
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
  tools,
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
      className={`border rounded-lg overflow-hidden transition-all ${
        selectedStepIndex === index
          ? 'border-blue-500 shadow-sm'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="px-4 py-3 flex justify-between items-center bg-gray-50">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0"
            title="Перетащите для изменения порядка"
          >
            ☰
          </button>
          <span className="text-sm font-medium text-gray-500 flex-shrink-0">
            {step.order || index + 1}.
          </span>
          <span className="font-semibold text-gray-900 truncate">
            {step.step_name}
          </span>
          <span className="text-xs px-2 py-1 bg-blue-100 rounded text-blue-700 font-medium flex-shrink-0">
            {step.model}
          </span>
          {false && (
            <span className="text-xs px-2 py-1 bg-green-100 rounded text-green-700 font-medium flex-shrink-0">
              Результат
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onSelect}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
          >
            {selectedStepIndex === index ? 'Скрыть' : 'Настроить'}
          </button>
          <button
            onClick={onRemove}
            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
            title="Удалить шаг"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {selectedStepIndex === index && (
        <StepConfigurationPanel
          step={step}
          stepIndex={index}
          allSteps={allSteps}
          enabledModels={enabledModels}
            tools={tools}
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
  tools: Tool[]
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

function StepConfigurationPanel({ step, stepIndex, allSteps, enabledModels, tools, onUpdate }: StepConfigurationPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const availableStepNames = allSteps
    .slice(0, stepIndex)
    .map(s => s.step_name)
    .filter(name => name !== step.step_name)

  // Get model display info for summary
  const currentModel = enabledModels.find(m => m.name === step.model)
  const modelDisplayName = currentModel?.display_name || step.model
  const temperatureDisplay = step.temperature <= 0.3 ? '0.2' : step.temperature <= 0.5 ? '0.4' : step.temperature <= 0.7 ? '0.7' : step.temperature <= 1.0 ? '1.0' : '1.5'

  return (
    <div className="px-4 pb-4 border-t border-gray-200 bg-gray-50 space-y-4">
      {/* PROMPTS - Main content, always visible */}
      <div className="space-y-4">
        {/* System Prompt */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Системный промпт</label>
          <textarea
            value={step.system_prompt}
            onChange={(e) => onUpdate({ system_prompt: e.target.value })}
            rows={3}
            placeholder="Определите роль и стиль ответов модели..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
        </div>

        {/* User Prompt Template */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Пользовательский промпт</label>
        {(() => {
          // Get available variables
          const previousSteps = allSteps.slice(0, stepIndex)
          // Removed trading-specific variables: {instrument}, {timeframe}, {market_data_summary}
          // These are only relevant for trading pipelines and are handled automatically by the backend
          const stepOutputVars = previousSteps.map(s => `{${s.step_name}_output}`)
          // Add all tool variables (simplified - no configuration needed)
          const toolVars = tools
            .filter(tool => tool.is_active)
            .map(tool => {
              const variableName = tool.display_name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
              return `{${variableName}}`
            })
          const availableVariables = [...stepOutputVars, ...toolVars]
          
          return (
            <>
              <VariablePalette
                allSteps={allSteps}
                currentStepIndex={stepIndex}
                tools={tools}
                step={step}
                onUpdate={onUpdate}
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
                    <div className="mb-2 p-2 bg-red-50 rounded border border-red-200">
                      <p className="text-xs font-semibold text-red-800 mb-1">
                        ⚠️ Некорректные ссылки на переменные
                      </p>
                      <p className="text-xs text-red-700">
                        Этот шаг ссылается на: {invalidRefs.join(', ')} из шагов, которые идут <strong>после</strong> него. 
                        Эти переменные не будут доступны и вызовут ошибку. Измените порядок шагов или удалите эти ссылки.
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
              {modelDisplayName} • {temperatureDisplay} • {step.max_tokens} токенов
            </span>
          )}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1 text-gray-700">Модель</label>
                <Select
                  value={step.model}
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
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-700">Макс. токенов</label>
                <input
                  type="number"
                  min="1"
                  value={step.max_tokens}
                  onChange={(e) => onUpdate({ max_tokens: parseInt(e.target.value) })}
                  className="w-full px-2 py-1 border border-gray-300 rounded bg-white text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
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
                      const temp = step.temperature
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
                    const temp = step.temperature
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

// Variable Palette Component
interface VariablePaletteProps {
  allSteps: StepConfig[]
  currentStepIndex: number
  editorRef?: (index: number) => React.RefObject<VariableTextEditorHandle>
  onInsertVariable: (variable: string, editorRef?: React.RefObject<VariableTextEditorHandle>) => void
  tools?: Tool[]
  step: StepConfig
  onUpdate: (updates: Partial<StepConfig>) => void
}

function VariablePalette({ allSteps, currentStepIndex, editorRef, onInsertVariable, tools = [], step, onUpdate }: VariablePaletteProps) {
  // Get previous steps (steps before current one)
  const previousSteps = allSteps.slice(0, currentStepIndex)
  const currentStep = allSteps[currentStepIndex]
  
  // Standard variables (removed trading-specific: instrument, timeframe, market_data_summary)
  // These are only relevant for trading pipelines and are handled automatically by the backend
  const standardVars: Array<{ name: string; desc: string }> = []
  
  // Previous step outputs
  const stepOutputVars = previousSteps.map(step => ({
    name: `{${step.step_name}_output}`,
    desc: `Вывод из шага "${step.step_name}"`,
  }))
  
  // All available tools as variables (simplified - no configuration needed)
  const toolVars = tools
    .filter(tool => tool.is_active)
    .map(tool => {
      // Generate variable name from display_name
      const variableName = tool.display_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
      
      return {
        toolId: tool.id,
        name: `{${variableName}}`,
        desc: `${tool.display_name} (${tool.tool_type})`,
        variableName,
      }
    })
  
  // Handle tool variable click - automatically add to tool_references if not already there
  const handleToolVariableClick = (toolVar: { toolId: number; name: string; variableName: string }, editorRef?: React.RefObject<VariableTextEditorHandle>) => {
    // Check if tool is already in tool_references
    const existingRef = (step.tool_references || []).find(ref => ref.tool_id === toolVar.toolId)
    
    if (!existingRef) {
      // Add tool reference (simplified format - no extraction_method or extraction_config)
      const newRef: ToolReference = {
        tool_id: toolVar.toolId,
        variable_name: toolVar.variableName
        // extraction_method and extraction_config removed - AI-based extraction is automatic
      }
      const newRefs = [...(step.tool_references || []), newRef]
      onUpdate({ tool_references: newRefs })
    }
    
    // Insert variable into prompt
    if (editorRef?.current) {
      editorRef.current.insertVariable(toolVar.name)
    }
  }
  
  return (
    <div className="mb-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-gray-500 mr-1">Переменные:</span>
        {standardVars.map((v) => {
          const ref = editorRef ? editorRef(currentStepIndex) : undefined
          return (
            <button
              key={v.name}
              type="button"
              onClick={() => onInsertVariable(v.name, ref)}
              className="text-xs px-2 py-0.5 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 text-blue-700 font-mono cursor-pointer transition-colors"
              title={v.desc}
            >
              {v.name}
            </button>
          )
        })}
        {stepOutputVars.length > 0 && (
          <>
            <span className="text-xs text-gray-300 self-center">•</span>
            {stepOutputVars.map((v) => {
              const ref = editorRef ? editorRef(currentStepIndex) : undefined
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => onInsertVariable(v.name, ref)}
                  className="text-xs px-2 py-0.5 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200 text-purple-700 font-mono cursor-pointer transition-colors"
                  title={v.desc}
                >
                  {v.name}
                </button>
              )
            })}
          </>
        )}
        {toolVars.length > 0 && (
          <>
            <span className="text-xs text-gray-300 self-center">•</span>
            {toolVars.map((v) => {
              const ref = editorRef ? editorRef(currentStepIndex) : undefined
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => handleToolVariableClick(v, ref)}
                  className="text-xs px-2 py-0.5 bg-green-50 hover:bg-green-100 rounded border border-green-200 text-green-700 font-mono cursor-pointer transition-colors"
                  title={v.desc}
                >
                  {v.name}
                </button>
              )
            })}
          </>
        )}
        {previousSteps.length === 0 && toolVars.length === 0 && standardVars.length === 0 && (
          <span className="text-xs text-blue-600 italic">
            (Нет доступных переменных - добавьте шаги перед этим или создайте инструменты)
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

function WarningDialog({ title, message, onConfirm, onCancel, confirmText = 'Продолжить', cancelText = 'Отмена' }: WarningDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
        <h3 className="text-xl font-semibold mb-4 text-gray-900">{title}</h3>
        
        <div className="mb-6">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200 max-h-96 overflow-y-auto">
            {message}
          </pre>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}


