'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { API_BASE_URL } from '@/lib/config'
import { useAuth } from '@/hooks/useAuth'

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
      max_tokens: number
      data_sources: string[]
    }>
    estimated_cost: number
    estimated_duration_seconds: number
  }
  is_active: number
  user_id: number | null
  is_system: boolean
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

export default function AnalysesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()
  const [filter, setFilter] = useState<'my' | 'system'>('my')
  
  const { data: analysisTypes = [], isLoading, error, refetch } = useQuery({
    queryKey: ['analysis-types', filter],
    queryFn: () => fetchAnalysisTypes(filter),
    enabled: isAuthenticated !== false, // Wait for auth check
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAnalysisType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-types', filter] })
    },
  })

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
          >
            Создать процесс
          </button>
        </div>

        {/* Filter Tabs */}
        {isAuthenticated && (
          <div className="mb-6 flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setFilter('my')}
              className={`px-4 py-2 font-medium transition-colors ${
                filter === 'my'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Мои процессы
            </button>
            <button
              onClick={() => setFilter('system')}
              className={`px-4 py-2 font-medium transition-colors ${
                filter === 'system'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Примеры процессов
            </button>
          </div>
        )}

        {filter === 'system' && analysisTypes.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              💡 Это примеры процессов для ознакомления. Нажмите кнопку клонирования, чтобы создать свою копию и начать редактирование.
            </p>
          </div>
        )}

        {analysisTypes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            {filter === 'my' ? (
              <>
                <p className="text-gray-600 mb-4">У вас пока нет созданных процессов.</p>
                <button
                  onClick={() => router.push('/pipelines/new')}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  Создать первый процесс
                </button>
              </>
            ) : (
              <p className="text-gray-600">Нет доступных примеров процессов.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {analysisTypes.map((analysis) => (
              <div
                key={analysis.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all p-6 flex flex-col"
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
                    <span className="text-gray-500 uppercase tracking-wide text-xs">Стоимость:</span>
                    <span className="text-gray-900 font-semibold">
                      ${analysis.config.estimated_cost.toFixed(3)}
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
                  {analysis.is_system ? (
                    <>
                      <button
                        onClick={() => handleDuplicate(analysis.id)}
                        className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm flex items-center justify-center"
                        title="Дублировать"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <Link
                        href={`/analyses/${analysis.id}`}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-center transition-colors shadow-sm flex items-center justify-center"
                        title="Запустить"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </Link>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => router.push(`/pipelines/${analysis.id}/edit`)}
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
                        onClick={() => handleDelete(analysis.id, analysis.display_name)}
                        disabled={deleteMutation.isPending}
                        className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Удалить"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => router.push(`/runs?analysis_type_id=${analysis.id}`)}
                    className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center justify-center"
                    title="История"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

