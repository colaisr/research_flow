'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { API_BASE_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'
import { fetchEffectiveFeatures } from '@/lib/api/features'

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

async function fetchTools(toolType?: string) {
  let url = `${API_BASE_URL}/api/tools`
  if (toolType) {
    url += `?tool_type=${toolType}`
  }
  const { data } = await axios.get<Tool[]>(url, { withCredentials: true })
  return data
}

async function testTool(toolId: number) {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/tools/${toolId}/test`,
    {},
    { withCredentials: true }
  )
  return data
}

async function deleteTool(toolId: number) {
  const { data } = await axios.delete(
    `${API_BASE_URL}/api/tools/${toolId}`,
    { withCredentials: true }
  )
  return data
}

export default function ToolsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()
  const [toolTypeFilter, setToolTypeFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Fetch effective features to check if user has tools access
  const { data: effectiveFeatures, isLoading: featuresLoading } = useQuery({
    queryKey: ['effective-features'],
    queryFn: fetchEffectiveFeatures,
    enabled: isAuthenticated !== false,
  })

  // Check if user has tools feature (api_tools or database_tools)
  const hasToolsFeature = effectiveFeatures 
    ? (effectiveFeatures['api_tools'] === true || effectiveFeatures['database_tools'] === true)
    : false

  const { data: tools = [], isLoading, error, refetch } = useQuery({
    queryKey: ['tools', toolTypeFilter],
    queryFn: () => fetchTools(toolTypeFilter || undefined),
    enabled: isAuthenticated !== false && hasToolsFeature,
  })

  const testMutation = useMutation({
    mutationFn: testTool,
    onSuccess: (data) => {
      alert(`Tool test ${data.success ? 'succeeded' : 'failed'}: ${data.message}`)
    },
    onError: (error: any) => {
      alert(`Tool test failed: ${error.response?.data?.detail || error.message}`)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTool,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] })
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail || error.message || 'Неизвестная ошибка'
      alert(`Не удалось удалить инструмент: ${errorMessage}`)
    }
  })

  const handleTest = (toolId: number) => {
    if (confirm('Test this tool connection?')) {
      testMutation.mutate(toolId)
    }
  }

  const handleDelete = (toolId: number, toolName: string) => {
    if (confirm(`Вы уверены, что хотите удалить инструмент "${toolName}"? Это действие нельзя отменить. Инструмент не может быть удален, если он используется в процессах.`)) {
      deleteMutation.mutate(toolId)
    }
  }

  const getToolTypeBadgeColor = (toolType: string) => {
    switch (toolType) {
      case 'api':
        return 'bg-blue-100 text-blue-800'
      case 'database':
        return 'bg-green-100 text-green-800'
      case 'rag':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getToolTypeLabel = (toolType: string) => {
    switch (toolType) {
      case 'api':
        return 'API'
      case 'database':
        return 'Database'
      case 'rag':
        return 'RAG'
      default:
        return toolType
    }
  }

  // Filter tools by search query
  const filteredTools = tools.filter(tool => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      tool.display_name.toLowerCase().includes(query)
    )
  })

  // Show loading state while checking features
  if (featuresLoading || (effectiveFeatures === undefined && isAuthenticated)) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-100 border border-red-400 rounded p-4">
            <p className="text-red-700">
              Ошибка загрузки инструментов: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show upgrade banner if tools feature is not available
  // Wait for features to load, then show banner if tools are not available
  if (effectiveFeatures !== undefined && !hasToolsFeature) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Инструменты</h1>
            <p className="text-gray-600 mt-1">Управление инструментами для анализа данных</p>
          </div>

          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                  Инструменты недоступны на вашем тарифном плане
                </h3>
                <p className="text-sm text-yellow-700 mb-4">
                  Создание и использование инструментов (API, Database, RAG) доступно только в плане "Профессиональный".
                  Обновите свой план, чтобы получить доступ к этой функции.
                </p>
                <Link
                  href="/subscription/plans"
                  className="inline-block px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                >
                  Обновить план
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Инструменты</h1>
            <p className="text-gray-600 mt-1">Управление инструментами для анализа данных</p>
          </div>
          <Link
            href="/tools/new"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Создать инструмент
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Поиск по названию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={toolTypeFilter}
            onChange={(e) => setToolTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Все типы</option>
            <option value="api">API</option>
            <option value="database">Database</option>
            <option value="rag">RAG</option>
          </select>
        </div>

        {/* Tools List */}
        {filteredTools.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">
              {searchQuery || toolTypeFilter
                ? 'Инструменты не найдены'
                : 'У вас пока нет инструментов'}
            </p>
            {!searchQuery && !toolTypeFilter && (
              <Link
                href="/tools/new"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Создать первый инструмент
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Название
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Тип
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Создан
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTools.map((tool) => (
                    <tr key={tool.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {tool.display_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getToolTypeBadgeColor(tool.tool_type)}`}>
                          {getToolTypeLabel(tool.tool_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {tool.is_active ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Активен
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                            Неактивен
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(tool.created_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          {tool.tool_type === 'rag' && tool.config?.rag_id && (
                            <button
                              onClick={() => router.push(`/rags/${tool.config.rag_id}`)}
                              className="text-purple-600 hover:text-purple-900 font-medium"
                            >
                              Открыть редактор
                            </button>
                          )}
                          {tool.tool_type !== 'rag' && (
                            <>
                          <button
                            onClick={() => handleTest(tool.id)}
                            disabled={testMutation.isPending}
                            className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                          >
                            Тест
                          </button>
                          <button
                            onClick={() => router.push(`/tools/${tool.id}/edit`)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            Редактировать
                          </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(tool.id, tool.display_name)}
                            disabled={deleteMutation.isPending}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


