'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { API_BASE_URL } from '@/lib/config'
import Select from '@/components/Select'
import VariableTextEditor, { VariableTextEditorHandle } from '@/components/VariableTextEditor'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import TestResults from '@/components/TestResults'
import FlowDiagram from '@/components/FlowDiagram'

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

async function testStep(
  analysisTypeId: number,
  stepIndex: number,
  customConfig: PipelineConfig,
  instrument: string = 'N/A',
  timeframe: string = 'N/A',
  toolId?: number
) {
  const url = `${API_BASE_URL}/api/analyses/${analysisTypeId}/test-step`
  const payload = {
    step_index: stepIndex,
    custom_config: customConfig,
    instrument,
    timeframe,
    tool_id: toolId,
  }
  console.log('[testStep] Request:', { url, payload, API_BASE_URL })
  try {
    const { data } = await axios.post(
      url,
      payload,
      { 
        withCredentials: true,
        timeout: 60000, // 60 seconds timeout for LLM calls
      }
    )
    return data
  } catch (error: any) {
    console.error('[testStep] Request failed:', {
      url,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
      stack: error.stack,
    })
    
    // Provide more context for network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      console.error('[testStep] Network error details:', {
        API_BASE_URL,
        url,
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
        protocol: typeof window !== 'undefined' ? window.location.protocol : 'N/A',
      })
    }
    
    throw error
  }
}

async function testPipeline(
  analysisTypeId: number,
  customConfig: PipelineConfig,
  instrument: string = 'N/A',
  timeframe: string = 'N/A',
  toolId?: number
) {
  const url = `${API_BASE_URL}/api/analyses/${analysisTypeId}/test-pipeline`
  const payload = {
    custom_config: customConfig,
    instrument,
    timeframe,
    tool_id: toolId,
  }
  console.log('[testPipeline] Request:', { url, payload, API_BASE_URL })
  try {
    const { data } = await axios.post(
      url,
      payload,
      { 
        withCredentials: true,
        timeout: 300000, // 300 seconds (5 minutes) timeout for full pipeline - pipelines can have many steps
      }
    )
    return data
  } catch (error: any) {
    console.error('[testPipeline] Request failed:', {
      url,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
      stack: error.stack,
    })
    
    // Provide more context for network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      console.error('[testPipeline] Network error details:', {
        API_BASE_URL,
        url,
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
        protocol: typeof window !== 'undefined' ? window.location.protocol : 'N/A',
      })
    }
    
    throw error
  }
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

export default function PipelineEditor({ pipelineId: initialPipelineId }: PipelineEditorProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isPlatformAdmin } = useAuth()
  
  // Track current pipeline ID (may change after auto-save during testing)
  const [currentPipelineId, setCurrentPipelineId] = useState<number | null>(initialPipelineId)
  const isNew = currentPipelineId === null

  const [pipelineName, setPipelineName] = useState('')
  const [pipelineDescription, setPipelineDescription] = useState('')
  const [isSystemProcess, setIsSystemProcess] = useState(false)
  const [steps, setSteps] = useState<StepConfig[]>([])
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
  const [newStepName, setNewStepName] = useState('')
  const [reorderWarning, setReorderWarning] = useState<{ warnings: string[]; newSteps: StepConfig[] } | null>(null)
  const [saveWarning, setSaveWarning] = useState<string[] | null>(null)
  const [testResult, setTestResult] = useState<any>(null)
  const [isTestingStep, setIsTestingStep] = useState(false)
  const [isTestingPipeline, setIsTestingPipeline] = useState(false)
  const [executionState, setExecutionState] = useState<'idle' | 'running' | 'completed'>('idle')
  const [stepResults, setStepResults] = useState<Map<number, { step_name: string; status: 'idle' | 'running' | 'completed' | 'error' | 'waiting'; result?: string; error?: string; tokens?: number; cost?: number; model?: string }>>(new Map())
  const [currentExecutingStepIndex, setCurrentExecutingStepIndex] = useState<number | undefined>(undefined)
  const newStepInputRef = useRef<HTMLInputElement>(null)

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
    queryKey: ['analysis-type', currentPipelineId],
    queryFn: () => fetchAnalysisType(currentPipelineId!),
    enabled: !isNew && currentPipelineId !== null,
  })

  // Sync currentPipelineId with prop when it changes
  useEffect(() => {
    if (initialPipelineId !== null && initialPipelineId !== currentPipelineId) {
      setCurrentPipelineId(initialPipelineId)
    }
  }, [initialPipelineId])

  // Initialize from existing pipeline
  useEffect(() => {
    if (existingPipeline && !isNew) {
      console.log('[useEffect] Loading existing pipeline:', {
        id: existingPipeline.id,
        name: existingPipeline.display_name,
        steps_count: existingPipeline.config.steps?.length || 0,
        steps: existingPipeline.config.steps?.map(s => ({
          step_name: s.step_name,
          user_prompt_template: s.user_prompt_template?.substring(0, 100),
          tool_references: s.tool_references
        })) || []
      })
      setPipelineName(existingPipeline.display_name)
      setPipelineDescription(existingPipeline.description || '')
      setIsSystemProcess(existingPipeline.is_system || false)
      setSteps(existingPipeline.config.steps || [])
      console.log('[useEffect] Pipeline loaded, steps set:', existingPipeline.config.steps?.length || 0)
    } else if (isNew && !pipelineName.trim()) {
      // Initialize empty pipeline with default name
      setIsSystemProcess(false)
      setSteps([])
      // Set default name for new pipeline
      const now = new Date()
      const timestamp = now.toLocaleString('ru-RU', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      }).replace(/[\/\s:]/g, '_')
      setPipelineName(`Новый процесс ${timestamp}`)
    }
  }, [existingPipeline, isNew])

  const createMutation = useMutation({
    mutationFn: createPipeline,
    onSuccess: (data) => {
      setCurrentPipelineId(data.id)
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      window.history.replaceState({}, '', `/pipelines/${data.id}/edit`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (request: { display_name?: string; description?: string | null; config?: PipelineConfig; is_system?: boolean }) =>
      updatePipeline(currentPipelineId!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      queryClient.invalidateQueries({ queryKey: ['analysis-type', currentPipelineId] })
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
    
    // Remove focus from input field
    if (newStepInputRef.current) {
      newStepInputRef.current.blur()
    }
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
    console.log(`[updateStep] Updating step ${index}:`, { 
      updates, 
      currentStep: steps[index],
      updatesHasToolRefs: 'tool_references' in updates,
      updatesToolRefs: updates.tool_references,
      currentToolRefs: steps[index]?.tool_references,
      updatesKeys: Object.keys(updates)
    })
    
    // Use functional update to always work with latest state
    setSteps((prevSteps) => {
      const newSteps = [...prevSteps]
      const currentStep = newSteps[index]
      
      // Only merge updates that are explicitly provided (not undefined)
      // This prevents overwriting existing fields like tool_references when they're not in updates
      const filteredUpdates: Partial<StepConfig> = {}
      for (const key in updates) {
        const typedKey = key as keyof StepConfig
        const value = updates[typedKey]
        if (value !== undefined) {
          ;(filteredUpdates as any)[typedKey] = value
        }
      }
      
      // Preserve tool_references if they exist and are not being explicitly updated
      if (!('tool_references' in filteredUpdates) && currentStep?.tool_references) {
        // Keep existing tool_references if not being updated
        filteredUpdates.tool_references = currentStep.tool_references
      }
      
      newSteps[index] = { ...currentStep, ...filteredUpdates }
      console.log(`[updateStep] Step ${index} after update (functional):`, { 
        newStep: newSteps[index],
        hasToolRefs: 'tool_references' in newSteps[index],
        toolRefs: newSteps[index].tool_references,
        filteredUpdatesKeys: Object.keys(filteredUpdates),
        preservedToolRefs: !('tool_references' in updates) && currentStep?.tool_references ? 'YES' : 'NO'
      })
      return newSteps
    })
  }

  const savePipeline = () => {
    // Validate
    if (!pipelineName.trim()) {
      alert('Введите название процесса')
      return
    }
    // Allow saving pipeline without steps - user can add steps later

    // Validate variable references only if there are steps
    if (steps.length > 0) {
      const validation = validateReordering(steps)
      if (!validation.isValid) {
        setSaveWarning(validation.warnings)
        return
      }
    }

    // Before saving, sync all editor values to state
    // This ensures we capture the latest text from contentEditable DOM
    const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
    const updatedSteps = [...steps]
    let hasUpdates = false
    
    if (refs) {
      refs.forEach((ref, stepIndex) => {
        if (ref?.current && updatedSteps[stepIndex]) {
          // Get current text directly from editor DOM
          const currentText = ref.current.getCurrentText()
          if (currentText !== updatedSteps[stepIndex].user_prompt_template) {
            updatedSteps[stepIndex] = {
              ...updatedSteps[stepIndex],
              user_prompt_template: currentText
            }
            hasUpdates = true
          }
        }
      })
    }
    
    // If we got updates from editors, update state first
    if (hasUpdates) {
      setSteps(updatedSteps)
      // Wait a tick for state updates to propagate, then save
      setTimeout(() => {
        performSave(updatedSteps)
      }, 0)
      return
    }
    
    performSave(steps)
  }

  const handleTestStep = async (stepIndex: number) => {
    setIsTestingStep(true)
    
    // If pipeline is not saved yet, save it first
    let testPipelineId = currentPipelineId
    if (!testPipelineId) {
      // Use default name if empty
      let nameToUse = pipelineName.trim()
      if (!nameToUse) {
        const now = new Date()
        const timestamp = now.toLocaleString('ru-RU', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/[\/\s:]/g, '_')
        nameToUse = `Новый процесс ${timestamp}`
        setPipelineName(nameToUse)
      }
      
      // Save pipeline first
      try {
        // Get current text from editors
        const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
        const updatedSteps = [...steps]
        
        if (refs) {
          refs.forEach((ref, idx) => {
            if (ref?.current && updatedSteps[idx]) {
              const currentText = ref.current.getCurrentText()
              if (currentText !== updatedSteps[idx].user_prompt_template) {
                updatedSteps[idx] = {
                  ...updatedSteps[idx],
                  user_prompt_template: currentText
                }
              }
            }
          })
        }

        const orderedSteps = updatedSteps.map((step, idx) => {
          const deduplicatedToolRefs = step.tool_references && step.tool_references.length > 0
            ? step.tool_references.filter((ref, index, arr) => 
                arr.findIndex(r => r.tool_id === ref.tool_id) === index
              )
            : []
          
          return {
            ...step,
            order: step.order || idx + 1,
            tool_references: deduplicatedToolRefs,
          }
        })

        const config: PipelineConfig = {
          steps: orderedSteps,
          estimated_cost: 0.1 * steps.length,
          estimated_duration_seconds: 20 * steps.length,
        }

        const createResult = await createPipeline({
          name: pipelineName.toLowerCase().replace(/\s+/g, '_'),
          display_name: pipelineName,
          description: pipelineDescription || null,
          config,
          is_system: isPlatformAdmin && isSystemProcess ? true : undefined,
        })
        
        testPipelineId = createResult.id
        setCurrentPipelineId(createResult.id)
        // Update state but don't redirect - we want to continue with testing
        queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
        // Update URL without navigation to preserve state
        window.history.replaceState({}, '', `/pipelines/${createResult.id}/edit`)
      } catch (error: any) {
        console.error('[handleTestStep] Error saving pipeline:', error)
        let errorMessage = 'Неизвестная ошибка при сохранении'
        
        if (error.response) {
          errorMessage = error.response.data?.detail || error.response.data?.message || `HTTP ${error.response.status}`
        } else if (error.message) {
          errorMessage = error.message
        }
        
        alert(`Ошибка сохранения процесса: ${errorMessage}`)
        setIsTestingStep(false)
        return
      }
    }
    try {
      // Get current text from editors (same as save)
      const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
      const updatedSteps = [...steps]
      
      if (refs) {
        refs.forEach((ref, idx) => {
          if (ref?.current && updatedSteps[idx]) {
            const currentText = ref.current.getCurrentText()
            if (currentText !== updatedSteps[idx].user_prompt_template) {
              updatedSteps[idx] = {
                ...updatedSteps[idx],
                user_prompt_template: currentText
              }
            }
          }
        })
      }

      // Get current config from updated state
      const config: PipelineConfig = {
        steps: updatedSteps.map((step, idx) => ({
          ...step,
          order: step.order || idx + 1,
          tool_references: step.tool_references || [],
        })),
        estimated_cost: 0.1 * steps.length,
        estimated_duration_seconds: 20 * steps.length,
      }

      if (!testPipelineId) {
        alert('Ошибка: не удалось получить ID процесса для тестирования')
        setIsTestingStep(false)
        return
      }
      
      console.log('[handleTestStep] Calling testStep:', { pipelineId: testPipelineId, stepIndex, config })
      const result = await testStep(testPipelineId, stepIndex, config)
      console.log('[handleTestStep] Test result:', result)
      
      // Update step result in FlowDiagram
      const newStepResults = new Map(stepResults)
      newStepResults.set(stepIndex, {
        step_name: result.step_name,
        status: result.error ? 'error' : 'completed',
        result: result.output,
        error: result.error,
        tokens: result.tokens_used,
        cost: result.cost_est,
        model: result.model,
      })
      setStepResults(newStepResults)
      
      // Also show in modal for now (will be removed later)
      setTestResult({ ...result, isPipeline: false })
    } catch (error: any) {
      console.error('[handleTestStep] Error:', error)
      let errorMessage = 'Неизвестная ошибка'
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        errorMessage = `Не удалось подключиться к серверу. Проверьте, что бэкенд запущен на ${API_BASE_URL}`
      } else if (error.response) {
        errorMessage = error.response.data?.detail || error.response.data?.message || `HTTP ${error.response.status}: ${error.response.statusText}`
      } else if (error.message) {
        errorMessage = error.message
      }
      
      alert(`Ошибка тестирования шага: ${errorMessage}`)
    } finally {
      setIsTestingStep(false)
    }
  }

  const handleTestPipeline = async () => {
    // If pipeline is not saved yet, save it first
    let testPipelineId = currentPipelineId
    if (!testPipelineId) {
      // Use default name if empty
      let nameToUse = pipelineName.trim()
      if (!nameToUse) {
        const now = new Date()
        const timestamp = now.toLocaleString('ru-RU', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/[\/\s:]/g, '_')
        nameToUse = `Новый процесс ${timestamp}`
        setPipelineName(nameToUse)
      }
      
      // Save pipeline first
      try {
        // Get current text from editors
        const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
        const updatedSteps = [...steps]
        
        if (refs) {
          refs.forEach((ref, idx) => {
            if (ref?.current && updatedSteps[idx]) {
              const currentText = ref.current.getCurrentText()
              if (currentText !== updatedSteps[idx].user_prompt_template) {
                updatedSteps[idx] = {
                  ...updatedSteps[idx],
                  user_prompt_template: currentText
                }
              }
            }
          })
        }

        const orderedSteps = updatedSteps.map((step, idx) => {
          const deduplicatedToolRefs = step.tool_references && step.tool_references.length > 0
            ? step.tool_references.filter((ref, index, arr) => 
                arr.findIndex(r => r.tool_id === ref.tool_id) === index
              )
            : []
          
          return {
            ...step,
            order: step.order || idx + 1,
            tool_references: deduplicatedToolRefs,
          }
        })

        const config: PipelineConfig = {
          steps: orderedSteps,
          estimated_cost: 0.1 * steps.length,
          estimated_duration_seconds: 20 * steps.length,
        }

        const createResult = await createPipeline({
          name: nameToUse.toLowerCase().replace(/\s+/g, '_'),
          display_name: nameToUse,
          description: pipelineDescription || null,
          config,
          is_system: isPlatformAdmin && isSystemProcess ? true : undefined,
        })
        
        testPipelineId = createResult.id
        setCurrentPipelineId(createResult.id)
        queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
        window.history.replaceState({}, '', `/pipelines/${createResult.id}/edit`)
      } catch (error: any) {
        console.error('[handleTestPipeline] Error saving pipeline:', error)
        let errorMessage = 'Неизвестная ошибка при сохранении'
        
        if (error.response) {
          errorMessage = error.response.data?.detail || error.response.data?.message || `HTTP ${error.response.status}`
        } else if (error.message) {
          errorMessage = error.message
        }
        
        alert(`Ошибка сохранения процесса: ${errorMessage}`)
        return
      }
    }

    if (steps.length === 0) {
      alert('Добавьте хотя бы один шаг для тестирования')
      return
    }

    setIsTestingPipeline(true)
    setExecutionState('running')
    setStepResults(new Map())
    setCurrentExecutingStepIndex(0)
    
    try {
      // Get current text from editors (same as save)
      const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
      const updatedSteps = [...steps]
      
      if (refs) {
        refs.forEach((ref, idx) => {
          if (ref?.current && updatedSteps[idx]) {
            const currentText = ref.current.getCurrentText()
            if (currentText !== updatedSteps[idx].user_prompt_template) {
              updatedSteps[idx] = {
                ...updatedSteps[idx],
                user_prompt_template: currentText
              }
            }
          }
        })
      }

      // Get current config from updated state
      const config: PipelineConfig = {
        steps: updatedSteps.map((step, idx) => ({
          ...step,
          order: step.order || idx + 1,
          tool_references: step.tool_references || [],
        })),
        estimated_cost: 0.1 * steps.length,
        estimated_duration_seconds: 20 * steps.length,
      }

      if (!testPipelineId) {
        alert('Ошибка: не удалось получить ID процесса для тестирования')
        setIsTestingPipeline(false)
        setExecutionState('idle')
        setCurrentExecutingStepIndex(undefined)
        return
      }
      
      console.log('[handleTestPipeline] Calling testPipeline:', { pipelineId: testPipelineId, config })
      const result = await testPipeline(testPipelineId, config)
      console.log('[handleTestPipeline] Test result:', result)
      
      // Update step results for FlowDiagram
      const newStepResults = new Map<number, any>()
      if (result.steps) {
        result.steps.forEach((step: any, index: number) => {
          newStepResults.set(index, {
            step_name: step.step_name,
            status: step.error ? 'error' : 'completed',
            result: step.output,
            error: step.error,
            tokens: step.tokens_used,
            cost: step.cost_est,
            model: step.model,
          })
        })
      }
      setStepResults(newStepResults)
      setExecutionState('completed')
      setCurrentExecutingStepIndex(undefined)
      
      // Also show in modal for now (will be removed later)
      setTestResult({ ...result, isPipeline: true })
    } catch (error: any) {
      console.error('[handleTestPipeline] Error:', error)
      setExecutionState('idle')
      setCurrentExecutingStepIndex(undefined)
      
      let errorMessage = 'Неизвестная ошибка'
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        errorMessage = `Не удалось подключиться к серверу. Проверьте, что бэкенд запущен на ${API_BASE_URL}`
      } else if (error.response) {
        errorMessage = error.response.data?.detail || error.response.data?.message || `HTTP ${error.response.status}: ${error.response.statusText}`
      } else if (error.message) {
        errorMessage = error.message
      }
      
      alert(`Ошибка тестирования пайплайна: ${errorMessage}`)
    } finally {
      setIsTestingPipeline(false)
    }
  }

  const performSave = (stepsToSave: StepConfig[]) => {
    // Ensure all steps have order and deduplicate tool_references
    const orderedSteps = stepsToSave.map((step, index) => {
      // Deduplicate tool_references by tool_id
      // Always include tool_references (even if empty array) to ensure it's saved
      const deduplicatedToolRefs = step.tool_references && step.tool_references.length > 0
        ? step.tool_references.filter((ref, idx, arr) => 
            arr.findIndex(r => r.tool_id === ref.tool_id) === idx
          )
        : []
      
      return {
        ...step,
        order: step.order || index + 1,
        tool_references: deduplicatedToolRefs, // Always include, even if empty
      }
    })

    const config: PipelineConfig = {
      steps: orderedSteps,
      estimated_cost: 0.1 * steps.length, // Rough estimate
      estimated_duration_seconds: 20 * steps.length, // Rough estimate
    }

    // Debug: Log what we're saving
    console.log('[savePipeline] Saving config:', JSON.stringify(config, null, 2))
    console.log('[savePipeline] Steps with tool_references:', orderedSteps.map(s => ({
      step_name: s.step_name,
      user_prompt_template_preview: s.user_prompt_template?.substring(0, 100),
      tool_references: s.tool_references,
      has_tool_references: !!s.tool_references && s.tool_references.length > 0
    })))

    if (isNew || !currentPipelineId) {
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
    <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header - Minimal Metadata */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={() => router.push('/analyses')}
            className="text-gray-600 hover:text-gray-900 mr-2 flex-shrink-0"
            title="Назад к анализам"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="text"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            placeholder={isNew ? "Название нового процесса..." : "Название процесса..."}
            className="text-xl font-semibold bg-transparent border-none outline-none focus:ring-0 text-gray-900 placeholder-gray-400 flex-1 min-w-0"
          />
          {isPlatformAdmin && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={isSystemProcess}
                onChange={(e) => setIsSystemProcess(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span>Системный</span>
            </label>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={savePipeline}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            {createMutation.isPending || updateMutation.isPending ? 'Сохранение...' : isNew ? 'Создать' : 'Сохранить'}
          </button>
          <button
            onClick={() => router.push('/analyses')}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>

      {/* Split View: Step Builder (Left) + Execution View (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Step Builder */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Шаги процесса ({steps.length})
            </h2>

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
                    pipelineId={currentPipelineId}
                    onSelect={() => {
                          // One step at a time: if clicking a different step, expand it and collapse others
                          if (selectedStepIndex === index) {
                            setSelectedStepIndex(null)
                          } else {
                            setSelectedStepIndex(index)
                          }
                        }}
                        onRemove={() => removeStep(index)}
                        onUpdate={(updates) => updateStep(index, updates)}
                        onTestStep={handleTestStep}
                        isTestingStep={isTestingStep}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Add Step - Always visible at bottom */}
          <div className="p-6 pt-0 border-t border-gray-200 bg-white flex-shrink-0">
            <div className="flex gap-2 items-center">
              <input
                ref={newStepInputRef}
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
          </div>
        </div>

        {/* Right Panel: Execution View */}
        <div className="w-1/2 flex flex-col bg-gray-50">
          <FlowDiagram
            steps={steps}
            executionState={executionState}
            stepResults={stepResults}
            currentStepIndex={currentExecutingStepIndex}
            onTestPipeline={handleTestPipeline}
            onStepClick={(index) => setSelectedStepIndex(index)}
            isTestingPipeline={isTestingPipeline}
          />
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
            const orderedSteps = steps.map((step, index) => {
              // Deduplicate tool_references by tool_id
              const deduplicatedToolRefs = step.tool_references 
                ? step.tool_references.filter((ref, idx, arr) => 
                    arr.findIndex(r => r.tool_id === ref.tool_id) === idx
                  )
                : undefined
              
              return {
                ...step,
                order: step.order || index + 1,
                tool_references: deduplicatedToolRefs,
              }
            })

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

      {/* Test Results Modal */}
      {testResult && (
        <TestResults
          result={testResult}
          onClose={() => setTestResult(null)}
          isPipeline={testResult.isPipeline}
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
  pipelineId: number | null
  onSelect: () => void
  onRemove: () => void
  onUpdate: (updates: Partial<StepConfig>) => void
  onTestStep: (stepIndex: number) => void
  isTestingStep: boolean
}

function SortableStepItem({
  step,
  index,
  selectedStepIndex,
  enabledModels,
  allSteps,
  tools,
  pipelineId,
  onSelect,
  onRemove,
  onUpdate,
  onTestStep,
  isTestingStep,
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
          pipelineId={pipelineId}
          onTestStep={onTestStep}
          isTestingStep={isTestingStep}
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
  pipelineId: number | null
  onTestStep: (stepIndex: number) => void
  isTestingStep: boolean
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
  // Use useLayoutEffect for synchronous registration before paint
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

function StepConfigurationPanel({ step, stepIndex, allSteps, enabledModels, tools, onUpdate, pipelineId, onTestStep, isTestingStep }: StepConfigurationPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const editorRef = useRef<VariableTextEditorHandle>(null)
  const availableStepNames = allSteps
    .slice(0, stepIndex)
    .map(s => s.step_name)
    .filter(name => name !== step.step_name)
  
  // Auto-focus and select all text when panel opens
  useEffect(() => {
    // Get ref from global map
    const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
    const ref = refs?.get(stepIndex)
    
    if (ref?.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        ref.current?.selectAll()
      }, 50)
    }
  }, [stepIndex]) // Only when stepIndex changes (panel opens)

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

        {/* Test Step Button - Always visible */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => onTestStep(stepIndex)}
            disabled={isTestingStep}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {isTestingStep ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Тестирование шага...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Тест шага
              </>
            )}
          </button>
          {!pipelineId && (
            <p className="mt-2 text-xs text-gray-500 text-center">
              Пайплайн будет автоматически сохранен перед тестированием
            </p>
          )}
        </div>
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
  
  // Use currentStep from allSteps instead of step prop to ensure we have the latest state
  const activeStep = currentStep || step
  
  // Standard variables (removed trading-specific: instrument, timeframe, market_data_summary)
  // These are only relevant for trading pipelines and are handled automatically by the backend
  const standardVars: Array<{ name: string; desc: string }> = []
  
  // Previous step outputs
  const stepOutputVars = previousSteps.map((step, index) => ({
    name: `{${step.step_name}_output}`,
    desc: `Вывод из шага "${step.step_name}"`,
    uniqueKey: `step-output-${index}-${step.step_name}`, // Unique key for React
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
    console.log('[handleToolVariableClick] Called:', { toolVar, activeStep: activeStep, currentStepIndex, activeStepToolRefs: activeStep.tool_references })
    
    // Note: We allow multiple uses of the same variable in the prompt
    // (e.g., "take cups from {binance_api} and take cups from {binance_api}")
    // Only ensure tool_references is set if not already present
    
    // Insert variable FIRST (before updating state to avoid re-render issues)
    // Try to get ref directly if not available through prop
    let actualRef = editorRef?.current
    if (!actualRef && editorRef) {
      // Fallback: try to get ref directly from global map
      const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
      const directRef = refs?.get(currentStepIndex)
      actualRef = directRef?.current || null
    }
    
    if (actualRef) {
      actualRef.insertVariable(toolVar.name)
    } else {
      // If ref is not available, update state first and retry insertion in next render
      // This handles the case where the component hasn't fully mounted yet
      setTimeout(() => {
        const refs = (window as any).variableEditorRefs as Map<number, React.RefObject<VariableTextEditorHandle>>
        const retryRef = refs?.get(currentStepIndex)?.current
        if (retryRef) {
          retryRef.insertVariable(toolVar.name)
        }
      }, 0)
    }
    
    // Then update tool_references (after insertion to avoid re-render blocking insertion)
    const existingRef = (activeStep.tool_references || []).find(ref => ref.tool_id === toolVar.toolId)
    
    console.log('[handleToolVariableClick] Checking existing ref:', { existingRef, currentRefs: activeStep.tool_references })
    
    if (!existingRef) {
      // Add tool reference (simplified format - no extraction_method or extraction_config)
      const newRef: ToolReference = {
        tool_id: toolVar.toolId,
        variable_name: toolVar.variableName
        // extraction_method and extraction_config removed - AI-based extraction is automatic
      }
      const currentRefs = activeStep.tool_references || []
      const newRefs = [...currentRefs, newRef]
      console.log('[handleToolVariableClick] Adding tool reference:', { newRef, currentRefs, newRefs, callingOnUpdate: true })
      onUpdate({ tool_references: newRefs })
    } else {
      console.log('[handleToolVariableClick] Tool reference already exists, skipping')
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
                  key={v.uniqueKey || v.name}
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


