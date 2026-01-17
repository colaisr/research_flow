'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useMemo } from 'react'
import { DndContext, closestCenter, pointerWithin, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, useDroppable, useDraggable } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { API_BASE_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'
import HintDisplay from '@/components/OnboardingProvider'
import { analysesHints } from '@/lib/onboarding/hints'

interface ProcessCategory {
  id: number
  name: string
  organization_id: number
  user_id: number | null
  display_order: number
  created_at: string
  updated_at: string
}

interface AnalysisType {
  id: number
  name: string
  display_name: string
  description: string | null
  version: string
  config: {
    steps: Array<{
      step_name: string
      step_type: string
      model: string
      system_prompt: string
      user_prompt_template: string
      temperature: number
      data_sources: string[]
    }>
    estimated_cost: number
    estimated_duration_seconds: number
  }
  is_active: number
  user_id: number | null
  is_system: boolean
  category_id: number | null
  created_at: string
  updated_at: string
}

async function fetchAnalysisTypes(filter: 'my' | 'system') {
  const url = filter === 'my' 
    ? `${API_BASE_URL}/api/analyses/my`
    : `${API_BASE_URL}/api/analyses/system`
  const { data } = await axios.get<AnalysisType[]>(url, { withCredentials: true })
  return data
}

async function duplicateAnalysisType(id: number) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/analyses/${id}/duplicate`,
    {},
    { withCredentials: true }
  )
  return data
}

async function deleteAnalysisType(id: number) {
  await axios.delete(
    `${API_BASE_URL}/api/analyses/${id}`,
    { withCredentials: true }
  )
}

// Category API functions
async function fetchCategories() {
  const { data } = await axios.get<ProcessCategory[]>(
    `${API_BASE_URL}/api/process-categories`,
    { withCredentials: true }
  )
  return data
}

async function createCategory(name: string, display_order?: number) {
  const { data } = await axios.post<ProcessCategory>(
    `${API_BASE_URL}/api/process-categories`,
    { name, display_order },
    { withCredentials: true }
  )
  return data
}

async function updateCategory(id: number, name?: string, display_order?: number) {
  const { data } = await axios.put<ProcessCategory>(
    `${API_BASE_URL}/api/process-categories/${id}`,
    { name, display_order },
    { withCredentials: true }
  )
  return data
}

async function deleteCategory(id: number) {
  await axios.delete(
    `${API_BASE_URL}/api/process-categories/${id}`,
    { withCredentials: true }
  )
}

async function updateAnalysisTypeCategory(id: number, category_id: number | null) {
  const { data } = await axios.put<AnalysisType>(
    `${API_BASE_URL}/api/analyses/${id}`,
    { category_id },
    { withCredentials: true }
  )
  return data
}

type TabType = 'all' | 'system' | number // 'all' = all processes, 'system' = examples, number = category id

export default function AnalysesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAuthenticated, isPlatformAdmin } = useAuth()
  const [selectedTab, setSelectedTab] = useState<TabType>('all')
  const [editingTabId, setEditingTabId] = useState<number | null>(null)
  const [editingTabName, setEditingTabName] = useState<string>('')
  const editInputRef = useRef<HTMLInputElement>(null)
  
  // Store unified tab order (includes both special tabs and categories) in localStorage
  // Format: ['all', 'system', 1, 2, ...] where numbers are category IDs
  // 'all' = "Мои процессы" (My processes)
  const [unifiedTabsOrder, setUnifiedTabsOrder] = useState<Array<'all' | 'system' | number>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('analyses-unified-tabs-order')
      if (stored) {
        return JSON.parse(stored)
      }
    }
    return ['all', 'system'] // Default: special tabs first
  })
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Require 5px of movement before starting drag (reduced for better responsiveness)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
  
  // Fetch categories (gracefully handle if table doesn't exist yet)
  const { data: categories = [], isLoading: categoriesLoading, error: categoriesError } = useQuery({
    queryKey: ['process-categories'],
    queryFn: fetchCategories,
    enabled: isAuthenticated !== false,
    retry: false, // Don't retry if it fails (likely migration not run)
  })
  
  // Handle errors separately (onError removed from useQuery in newer versions)
  // Error handling for categories fetch (migration may not be run)
  useEffect(() => {
    // Silently handle category fetch errors
  }, [categoriesError])
  
  // Fetch all user processes (we'll filter by category on frontend)
  const { data: allUserProcesses = [], isLoading: userProcessesLoading, error: userProcessesError } = useQuery({
    queryKey: ['analysis-types', 'my'],
    queryFn: () => fetchAnalysisTypes('my'),
    enabled: isAuthenticated !== false,
  })
  
  // Fetch system processes
  const { data: systemProcesses = [], isLoading: systemProcessesLoading, error: systemProcessesError } = useQuery({
    queryKey: ['analysis-types', 'system'],
    queryFn: () => fetchAnalysisTypes('system'),
    enabled: isAuthenticated !== false,
  })
  
  // Combine errors
  const error = categoriesError || userProcessesError || systemProcessesError
  
  // Sort categories by display_order for consistent rendering
  const sortedCategories = [...categories].sort((a, b) => 
    a.display_order - b.display_order
  )
  
  // Filter processes based on selected tab
  // "Мои процессы" (selectedTab === 'all') shows only processes with category_id === null
  // Other folders show processes with category_id === folder_id
  const analysisTypes = useMemo(() => {
    let filtered: AnalysisType[]
    if (selectedTab === 'system') {
      filtered = systemProcesses
    } else {
      // Helper function to normalize category_id
      const normalizeCategoryId = (categoryId: number | null | undefined): number | null => {
        if (categoryId === null || categoryId === undefined) {
          return null
        }
        const numValue = typeof categoryId === 'number' ? categoryId : Number(categoryId)
        return !isNaN(numValue) ? numValue : null
      }
      
      if (selectedTab === 'all') {
        // "Мои процессы" - only show processes with category_id === null
        filtered = allUserProcesses.filter(p => {
          const processCategoryId = normalizeCategoryId(p.category_id)
          return processCategoryId === null
        })
      } else {
        // Custom folder - show processes with category_id === selectedTab
        const targetCategoryId = typeof selectedTab === 'number' ? selectedTab : Number(selectedTab)
        
        filtered = allUserProcesses.filter(p => {
          const processCategoryId = normalizeCategoryId(p.category_id)
          return processCategoryId === targetCategoryId
        })
      }
    }
    return filtered
  }, [selectedTab, allUserProcesses, systemProcesses])
  
  // Don't block on categories loading - if migration isn't run, we'll just show empty categories
  const isLoading = userProcessesLoading || systemProcessesLoading

  const deleteMutation = useMutation({
    mutationFn: deleteAnalysisType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
    },
  })
  
  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => {
      // Set display_order to be after all existing categories
      const maxOrder = sortedCategories.length > 0 
        ? Math.max(...sortedCategories.map(c => c.display_order)) + 1 
        : 0
      return createCategory(name, maxOrder)
    },
    onSuccess: (newCategory) => {
      // Optimistically update the query cache so the new category is immediately available
      queryClient.setQueryData<ProcessCategory[]>(['process-categories'], (old = []) => {
        return [...old, newCategory]
      })
      // Also invalidate to ensure we have the latest data from server
      queryClient.invalidateQueries({ queryKey: ['process-categories'] })
      // Add new category to unified order (at the end by default)
      setUnifiedTabsOrder(prev => [...prev, newCategory.id])
      setSelectedTab(newCategory.id)
      setEditingTabId(newCategory.id)
      setEditingTabName(newCategory.name)
      // Focus input after a brief delay to ensure it's rendered
      setTimeout(() => {
        editInputRef.current?.focus()
        editInputRef.current?.select()
      }, 50)
    },
  })
  
  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, name, display_order }: { id: number; name?: string; display_order?: number }) => 
      updateCategory(id, name, display_order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-categories'] })
      setEditingTabId(null)
      setEditingTabName('')
    },
  })
  
  const reorderCategoriesMutation = useMutation({
    mutationFn: async (reorderedCategories: ProcessCategory[]) => {
      // Update display_order for all categories in the new order
      const updates = reorderedCategories.map((category, index) => 
        updateCategory(category.id, undefined, index)
      )
      await Promise.all(updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-categories'] })
    },
  })
  
  const deleteCategoryMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: (_, deletedCategoryId) => {
      queryClient.invalidateQueries({ queryKey: ['process-categories'] })
      queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      // Remove deleted category from unified order
      setUnifiedTabsOrder(prev => prev.filter(id => id !== deletedCategoryId))
      // Switch to 'all' tab if deleted category was selected
      if (typeof selectedTab === 'number' && selectedTab === deletedCategoryId) {
        setSelectedTab('all')
      }
      setEditingTabId(null)
    },
    onError: (error: any) => {
      alert(`Не удалось удалить папку: ${error.response?.data?.detail || error.message || 'Неизвестная ошибка'}`)
    },
  })
  
  const moveProcessMutation = useMutation({
    mutationFn: ({ processId, categoryId }: { processId: number; categoryId: number | null }) => {
      return updateAnalysisTypeCategory(processId, categoryId)
    },
    onMutate: async ({ processId, categoryId }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['analysis-types', 'my'] })
      
      // Snapshot the previous value
      const previousProcesses = queryClient.getQueryData<AnalysisType[]>(['analysis-types', 'my'])
      
      // Optimistically update the process's category_id
      queryClient.setQueryData<AnalysisType[]>(['analysis-types', 'my'], (old = []) => {
        const oldProcess = old.find(p => p.id === processId)
        
        // Ensure categoryId is properly typed (number | null)
        const normalizedCategoryId: number | null = categoryId === null || categoryId === undefined 
          ? null 
          : (typeof categoryId === 'number' ? categoryId : Number(categoryId))
        
        // Validate that if it's not null, it's a valid number
        const finalCategoryId = (normalizedCategoryId !== null && isNaN(normalizedCategoryId)) 
          ? null 
          : normalizedCategoryId
        
        const updated = old.map(process => 
          process.id === processId 
            ? { ...process, category_id: finalCategoryId }
            : process
        )
        return updated
      })
      
      // Switch to the target tab so user can see the process in its new location
      if (categoryId === null) {
        setSelectedTab('all')
      } else {
        setSelectedTab(categoryId)
      }
      
      // Return context with snapshot for rollback
      return { previousProcesses, previousTab: selectedTab }
    },
    onSuccess: (data, variables) => {
      // The backend response might not include category_id, so use the variable we sent
      // Normalize the categoryId to ensure it's number | null
      const finalCategoryId: number | null = variables.categoryId === null || variables.categoryId === undefined
        ? null
        : (typeof variables.categoryId === 'number' 
            ? (isNaN(variables.categoryId) ? null : variables.categoryId)
            : (Number(variables.categoryId) && !isNaN(Number(variables.categoryId)) ? Number(variables.categoryId) : null))
      
      // Update the cache using the categoryId we sent (which we know is correct)
      // The backend has already updated it, so we use our known value
      queryClient.setQueryData<AnalysisType[]>(['analysis-types', 'my'], (old = []) => {
        const updated = old.map(process => 
          process.id === variables.processId 
            ? { ...process, category_id: finalCategoryId }  // Use the categoryId we sent
            : process
        )
        return updated
      })
      
      // Invalidate after a short delay to ensure we get the latest data from backend
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['analysis-types'] })
      }, 100)
    },
    onError: (error: any, variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousProcesses) {
        queryClient.setQueryData(['analysis-types', 'my'], context.previousProcesses)
      }
      // Rollback tab switch on error
      if (context?.previousTab !== undefined) {
        setSelectedTab(context.previousTab)
      }
      alert(`Не удалось переместить процесс: ${error.response?.data?.detail || error.message || 'Неизвестная ошибка'}`)
    },
  })
  
  // Handle tab editing
  const handleStartEdit = (category: ProcessCategory) => {
    setEditingTabId(category.id)
    setEditingTabName(category.name)
    setTimeout(() => {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }, 50)
  }
  
  const handleSaveEdit = () => {
    if (editingTabId && editingTabName.trim()) {
      updateCategoryMutation.mutate({ id: editingTabId, name: editingTabName.trim() })
    } else {
      setEditingTabId(null)
      setEditingTabName('')
    }
  }
  
  const handleCancelEdit = () => {
    setEditingTabId(null)
    setEditingTabName('')
  }
  
  const handleDeleteCategory = (category: ProcessCategory) => {
    if (confirm(`Удалить папку "${category.name}"? Процессы в этой папке будут перемещены в "Мои процессы".`)) {
      deleteCategoryMutation.mutate(category.id)
    }
  }
  
  // Sync unified order when categories change (e.g., after initial load)
  useEffect(() => {
    if (sortedCategories.length > 0 && typeof window !== 'undefined') {
      // Check if we need to sync - if there are categories not in the order
      const categoryIds = sortedCategories.map(c => c.id)
      const missingCategories = categoryIds.filter(id => !unifiedTabsOrder.includes(id))
      
      if (missingCategories.length > 0) {
        // Add missing categories to the end
        setUnifiedTabsOrder(prev => [...prev, ...missingCategories])
      }
    }
  }, [sortedCategories.length]) // Only run when count changes
  
  const handleCreateCategory = () => {
    createCategoryMutation.mutate('Новая папка')
  }
  
  // Build unified tab list based on stored order
  // First, ensure all categories are in the order (add new ones at the end)
  const completeOrder = useMemo(() => {
    const order = [...unifiedTabsOrder]
    // Add any categories that aren't in the order yet (newly created)
    sortedCategories.forEach(cat => {
      if (!order.includes(cat.id)) {
        order.push(cat.id)
      }
    })
    // Remove categories that no longer exist
    return order.filter(id => {
      if (id === 'all' || id === 'system') return true
      return sortedCategories.some(cat => cat.id === id)
    })
  }, [unifiedTabsOrder, sortedCategories])
  
  // Build unified tabs array for rendering
  const unifiedTabs: Array<{ type: 'special' | 'category'; id: string | number; data?: ProcessCategory }> = useMemo(() => {
    const tabs: Array<{ type: 'special' | 'category'; id: string | number; data?: ProcessCategory }> = []
    
    completeOrder.forEach(id => {
      if (id === 'all' || id === 'system') {
        tabs.push({ type: 'special', id })
      } else {
        const category = sortedCategories.find(c => c.id === id)
        if (category) {
          tabs.push({ type: 'category', id, data: category })
        }
      }
    })
    
    return tabs
  }, [completeOrder, sortedCategories])
  
  const [activeDragId, setActiveDragId] = useState<string | number | null>(null)
  
  const handleDragStart = (event: any) => {
    setActiveDragId(event.active.id)
  }
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    
    if (!over) {
      return
    }
    
    const activeId = active.id.toString()
    const overId = over.id.toString()
    
    // Check if dragging a process card (starts with "process-")
    if (activeId.startsWith('process-')) {
      const processId = parseInt(activeId.replace('process-', ''), 10)
      
      // Determine target category
      let targetCategoryId: number | null = null
      if (overId === 'all') {
        targetCategoryId = null // Move to "Мои процессы"
      } else if (overId === 'system') {
        // Can't move to system tab
        return
      } else {
        // Dropped on a category tab
        const categoryId = parseInt(overId, 10)
        if (isNaN(categoryId)) {
          return // Invalid category ID
        }
        targetCategoryId = categoryId
      }
      
      // Only allow moving user processes (not system processes)
      const process = allUserProcesses.find(p => p.id === processId)
      if (!process || process.is_system) {
        return // Can't move system processes
      }
      
      // Don't move if already in the target category
      // Handle null comparison correctly (null === null is true, but we need to check both null and undefined)
      const currentCategoryId = process.category_id ?? null
      const targetId = targetCategoryId ?? null
      
      if (currentCategoryId === targetId) {
        return
      }
      
      // Move the process
      moveProcessMutation.mutate({ processId, categoryId: targetCategoryId })
      return
    }
    
    // Handle tab reordering (existing logic)
    if (activeId === overId) return
    
    const activeIndex = completeOrder.findIndex(id => id.toString() === activeId)
    const overIndex = completeOrder.findIndex(id => id.toString() === overId)
    
    if (activeIndex !== -1 && overIndex !== -1) {
      const newOrder = arrayMove(completeOrder, activeIndex, overIndex)
      
      // Update unified order immediately
      setUnifiedTabsOrder(newOrder)
      localStorage.setItem('analyses-unified-tabs-order', JSON.stringify(newOrder))
      
      // Update category display_order based on their position relative to other categories
      const categoryIds = newOrder.filter(id => id !== 'all' && id !== 'system') as number[]
      if (categoryIds.length > 0) {
        const reorderedCategories = categoryIds
          .map(id => sortedCategories.find(c => c.id === id))
          .filter((cat): cat is ProcessCategory => cat !== undefined)
        
        if (reorderedCategories.length > 0) {
          reorderCategoriesMutation.mutate(reorderedCategories)
        }
      }
    }
  }

  const handleDuplicate = async (id: number) => {
    try {
      const duplicated = await duplicateAnalysisType(id)
      router.push(`/pipelines/${duplicated.id}/edit`)
    } catch (error: any) {
      alert(`Не удалось дублировать: ${error.response?.data?.detail || error.message}`)
    }
  }

  const handleDelete = async (id: number, displayName: string) => {
    if (!confirm(`Вы уверены, что хотите удалить процесс "${displayName}"? Это действие нельзя отменить.`)) {
      return
    }
    
    try {
      await deleteMutation.mutateAsync(id)
    } catch (error: any) {
      alert(`Не удалось удалить: ${error.response?.data?.detail || error.message}`)
    }
  }

  // Check if user has no personal processes (show hints on "all" tab)
  // Or if on "system" tab with system processes (show hint 2.3)
  const hasNoPersonalProcesses = !isLoading && selectedTab === 'all' && analysisTypes.length === 0
  const hasSystemProcesses = !isLoading && selectedTab === 'system' && analysisTypes.length > 0
  const shouldShowHints = hasNoPersonalProcesses || hasSystemProcesses

  // Debug logging for drag functionality

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Загрузка анализов...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-900 mb-2">Ошибка загрузки анализов</h2>
            <p className="text-red-700">
              {error instanceof Error ? error.message : 'Неизвестная ошибка'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {!isLoading && isAuthenticated && (
        <HintDisplay 
          key={`${selectedTab}-${analysisTypes.length}`}
          steps={analysesHints} 
          flowId="analyses" 
          autoStart={shouldShowHints}
        />
      )}
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Анализы
            </h1>
            <p className="text-gray-600">
              Управление вашими аналитическими процессами
            </p>
          </div>
          <button
            onClick={() => router.push('/pipelines/new')}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
            data-hint="create-process-button"
          >
            Создать процесс
          </button>
        </div>

        {/* Folder Tabs and Process Cards - wrapped in DndContext */}
        {isAuthenticated && (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={[]}
          >
            {/* Folder Tabs */}
            <div className="mb-6 flex flex-nowrap gap-2 border-b border-gray-200 overflow-x-auto overflow-y-hidden">
              <SortableContext
                items={unifiedTabs.map(tab => tab.id.toString())}
                strategy={horizontalListSortingStrategy}
              >
                {/* Render all tabs in unified order */}
                {unifiedTabs.map((tab) => {
                  if (tab.type === 'special') {
                    if (tab.id === 'all') {
                      return (
                        <SortableSpecialTab
                          key="all"
                          id="all"
                          label="Мои процессы"
                          selectedTab={selectedTab}
                          onSelectTab={() => setSelectedTab('all')}
                        />
                      )
                    } else if (tab.id === 'system') {
                      return (
                        <SortableSpecialTab
                          key="system"
                          id="system"
                          label="Примеры процессов"
                          selectedTab={selectedTab}
                          onSelectTab={() => setSelectedTab('system')}
                          dataHint="system-processes-tab"
                        />
                      )
                    }
                  } else if (tab.type === 'category' && tab.data) {
                    return (
                      <SortableCategoryTab
                        key={tab.data.id}
                        category={tab.data}
                        selectedTab={selectedTab}
                        editingTabId={editingTabId}
                        editingTabName={editingTabName}
                        editInputRef={editInputRef}
                        onSelectTab={() => setSelectedTab(tab.data!.id)}
                        onStartEdit={handleStartEdit}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={handleCancelEdit}
                        onDeleteCategory={handleDeleteCategory}
                        onEditingTabNameChange={setEditingTabName}
                      />
                    )
                  }
                  return null
                })}
              </SortableContext>
              
              {/* Create New Folder Button */}
            <button
                onClick={handleCreateCategory}
                className="px-4 py-2 font-medium text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 border-b-2 border-transparent hover:border-gray-300"
                title="Создать новую папку"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            </button>
          </div>

        {selectedTab === 'system' && analysisTypes.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              💡 Это примеры процессов для ознакомления. Нажмите кнопку клонирования, чтобы создать свою копию и начать редактирование.
            </p>
          </div>
        )}

        {analysisTypes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            {selectedTab === 'all' ? (
              <>
                <p className="text-gray-600 mb-4">У вас пока нет созданных процессов.</p>
                <button
                  onClick={() => router.push('/pipelines/new')}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  Создать первый процесс
                </button>
              </>
            ) : selectedTab === 'system' ? (
              <p className="text-gray-600">Нет доступных примеров процессов.</p>
            ) : (
              <p className="text-gray-600">В этой папке пока нет процессов.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {analysisTypes.map((analysis) => (
              <DraggableProcessCard
                key={analysis.id}
                analysis={analysis}
                isSystem={analysis.is_system}
                isPlatformAdmin={isPlatformAdmin}
                onEdit={() => router.push(`/pipelines/${analysis.id}/edit`)}
                onRun={() => router.push(`/analyses/${analysis.id}`)}
                onDelete={() => handleDelete(analysis.id, analysis.display_name)}
                onDuplicate={() => handleDuplicate(analysis.id)}
                onHistory={() => router.push(`/runs?analysis_type_id=${analysis.id}`)}
                deletePending={deleteMutation.isPending}
              />
            ))}
          </div>
        )}
        
        {/* Drag Overlay - shows the dragged item following the cursor */}
        <DragOverlay>
          {activeDragId && activeDragId.toString().startsWith('process-') ? (
            <div className="bg-white rounded-lg shadow-lg border-2 border-blue-400 p-3 opacity-90 rotate-2 scale-50 origin-center">
              <div className="flex items-center gap-1">
                <div className="text-gray-400 text-xs">☰</div>
                <div className="font-semibold text-gray-900 text-sm">
                  {allUserProcesses.find(p => `process-${p.id}` === activeDragId.toString())?.display_name || 'Процесс'}
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  )
}

// Sortable Category Tab Component
interface SortableCategoryTabProps {
  category: ProcessCategory
  selectedTab: TabType
  editingTabId: number | null
  editingTabName: string
  editInputRef: React.RefObject<HTMLInputElement>
  onSelectTab: () => void
  onStartEdit: (category: ProcessCategory) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDeleteCategory: (category: ProcessCategory) => void
  onEditingTabNameChange: (name: string) => void
}

function SortableCategoryTab({
  category,
  selectedTab,
  editingTabId,
  editingTabName,
  editInputRef,
  onSelectTab,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteCategory,
  onEditingTabNameChange,
}: SortableCategoryTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id.toString() })
  
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: category.id.toString(),
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setDroppableRef(node)
      }}
      style={style}
      className={`group relative px-4 py-2 font-medium transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-2 cursor-pointer min-h-[44px] ${
        selectedTab === category.id
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      } ${isDragging ? 'z-50' : ''} ${isOver ? 'bg-blue-50 border-b-2 border-blue-400 ring-2 ring-blue-300' : ''}`}
    >
      {editingTabId === category.id ? (
        <div className="flex items-center gap-2 min-w-[150px]">
          <input
            ref={editInputRef}
            type="text"
            value={editingTabName}
            onChange={(e) => onEditingTabNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSaveEdit()
              } else if (e.key === 'Escape') {
                onCancelEdit()
              }
            }}
            onBlur={(e) => {
              // Don't save if clicking the delete button
              if (!(e.relatedTarget as HTMLElement)?.closest('button[title="Удалить папку"]')) {
                onSaveEdit()
              }
            }}
            className="px-2 py-1 text-sm border border-blue-500 rounded bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
          />
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDeleteCategory(category)
            }}
            onMouseDown={(e) => {
              // Prevent input blur when clicking delete button
              e.preventDefault()
            }}
            className="text-red-600 hover:text-red-800 p-1 flex-shrink-0"
            title="Удалить папку"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ) : (
        <>
          {/* Drag Handle - visible on hover */}
          <button
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-opacity flex-shrink-0 p-1"
            title="Перетащите для изменения порядка"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>
          <button
            onClick={onSelectTab}
            onDoubleClick={(e) => {
              e.stopPropagation()
              onStartEdit(category)
            }}
            className="flex-1 text-left cursor-pointer hover:text-blue-700 transition-colors"
            title="Дважды кликните для переименования"
          >
            {category.name}
          </button>
        </>
      )}
    </div>
  )
}

// Sortable Special Tab Component (All processes, Examples)
interface SortableSpecialTabProps {
  id: 'all' | 'system'
  label: string
  selectedTab: TabType
  onSelectTab: () => void
  dataHint?: string
}

function SortableSpecialTab({
  id,
  label,
  selectedTab,
  onSelectTab,
  dataHint,
}: SortableSpecialTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setDroppableRef(node)
      }}
      style={style}
      className={`group relative px-4 py-2 font-medium transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-2 cursor-pointer min-h-[44px] ${
        selectedTab === id
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      } ${isDragging ? 'z-50' : ''} ${isOver ? 'bg-blue-50 border-b-2 border-blue-400 ring-2 ring-blue-300' : ''}`}
      data-hint={dataHint}
      onClick={onSelectTab}
    >
      {/* Drag Handle - visible on hover */}
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-opacity flex-shrink-0 p-1"
        title="Перетащите для изменения порядка"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </button>
      <div
        className="flex-1 text-left"
      >
        {label}
      </div>
    </div>
  )
}

// Draggable Process Card Component
interface DraggableProcessCardProps {
  analysis: AnalysisType
  isSystem: boolean
  isPlatformAdmin: boolean
  onEdit: () => void
  onRun: () => void
  onDelete: () => void
  onDuplicate: () => void
  onHistory: () => void
  deletePending: boolean
}

function DraggableProcessCard({
  analysis,
  isSystem,
  isPlatformAdmin,
  onEdit,
  onRun,
  onDelete,
  onDuplicate,
  onHistory,
  deletePending,
}: DraggableProcessCardProps) {
  // Only make user processes draggable (not system processes)
  const isDraggable = !isSystem
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `process-${analysis.id}`,
    disabled: !isDraggable,
  })
  

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      {...(isDraggable ? attributes : {})}
      style={style}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all p-6 flex flex-col group relative ${
        isDragging ? 'z-50 opacity-50' : ''
      }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2 truncate">
                      {analysis.display_name}
                    </h3>
                    <span className="inline-block text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 font-medium">
                      v{analysis.version}
                    </span>
                  </div>
        {isDraggable && (
          <div
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0 p-1"
            title="Перетащите в папку"
            style={{ touchAction: 'none', userSelect: 'none' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
        )}
                </div>

                {analysis.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3 leading-relaxed">
                    {analysis.description}
                  </p>
                )}

                <div className="space-y-2.5 mb-5 flex-grow">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 uppercase tracking-wide text-xs">Шаги:</span>
                    <span className="text-gray-900 font-semibold">
                      {analysis.config.steps.length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 uppercase tracking-wide text-xs">Длительность:</span>
                    <span className="text-gray-900 font-semibold">
                      ~{Math.round(analysis.config.estimated_duration_seconds / 60)} мин
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 mt-auto pt-4 border-t border-gray-200">
        {isSystem ? (
                    <>
                      {/* For system/example processes: only show duplicate button */}
                      <button
              onClick={onDuplicate}
                        className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm flex items-center justify-center"
                        title="Дублировать"
                        data-hint="duplicate-button"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Дублировать</span>
                      </button>
                      {isPlatformAdmin && (
                        <button
                onClick={onDelete}
                disabled={deletePending}
                          className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Удалить"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
              onClick={onEdit}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm flex items-center justify-center"
                        title="Редактировать"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <Link
                        href={`/analyses/${analysis.id}`}
                        className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-center transition-colors shadow-sm flex items-center justify-center"
                        title="Запустить"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </Link>
                      <button
              onClick={onDelete}
              disabled={deletePending}
                        className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Удалить"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <button
              onClick={onHistory}
                        className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center justify-center"
                        title="История"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </>
        )}
      </div>
    </div>
  )
}

