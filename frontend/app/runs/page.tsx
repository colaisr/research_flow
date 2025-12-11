'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { API_BASE_URL } from '@/lib/config'

interface Run {
  id: number
  trigger_type: string
  instrument: string
  timeframe: string
  status: string
  created_at: string
  finished_at: string | null
  duration_seconds?: number | null
  cost_est_total: number
  analysis_type_id?: number | null
  analysis_type_name?: string | null
}

async function fetchRuns(analysisTypeId?: string) {
  const url = analysisTypeId 
    ? `${API_BASE_URL}/api/runs?analysis_type_id=${analysisTypeId}`
    : `${API_BASE_URL}/api/runs`
  const { data } = await axios.get<Run[]>(url, { withCredentials: true })
  return data
}

const formatDuration = (durationSeconds?: number | null, start?: string, end?: string | null) => {
  // Prefer precomputed duration; fallback to timestamps if provided
  let diffSeconds: number | null = null
  if (durationSeconds !== undefined && durationSeconds !== null) {
    diffSeconds = durationSeconds
  } else if (start && end) {
    const startDate = new Date(start)
    const endDate = new Date(end)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '—'
    const diffMs = endDate.getTime() - startDate.getTime()
    if (diffMs < 0) return '—'
    diffSeconds = Math.floor(diffMs / 1000)
  } else {
    return '—'
  }

  if (diffSeconds === null) return '—'
  if (diffSeconds < 1) return '<1с'

  const hours = Math.floor(diffSeconds / 3600)
  const minutes = Math.floor((diffSeconds % 3600) / 60)
  const seconds = diffSeconds % 60

  if (hours > 0) return `${hours}ч ${minutes}м`
  if (minutes > 0) return `${minutes}м ${seconds}с`
  return `${seconds}с`
}

function RunsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const analysisTypeId = searchParams.get('analysis_type_id')

  const { data: runs = [], isLoading, error } = useQuery({
    queryKey: ['runs', analysisTypeId],
    queryFn: () => fetchRuns(analysisTypeId || undefined),
    refetchInterval: 5000, // Poll every 5 seconds
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'text-green-700 bg-green-50'
      case 'failed':
        return 'text-red-700 bg-red-50'
      case 'model_failure':
        return 'text-orange-700 bg-orange-50'
      case 'running':
        return 'text-blue-700 bg-blue-50'
      case 'queued':
        return 'text-yellow-700 bg-yellow-50'
      default:
        return 'text-gray-700 bg-gray-50'
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Загрузка запусков...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">
              Ошибка загрузки запусков: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Запуски
          </h1>
          {analysisTypeId && (
            <p className="text-gray-600">
              Отфильтровано по типу анализа ID: {analysisTypeId}
            </p>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <p className="text-gray-600">
              {analysisTypeId 
                ? 'Запусков для этого типа анализа не найдено.' 
                : 'Пока нет запусков. Создайте один на странице Главная или Анализы!'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Процесс
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Время выполнения
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Выполнено
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{run.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {run.analysis_type_name || 'Процесс'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(run.status)}`}>
                          {run.status === 'model_failure' ? 'Ошибка модели' : 
                           run.status === 'succeeded' ? 'Успешно' :
                           run.status === 'failed' ? 'Ошибка' :
                           run.status === 'running' ? 'Выполняется' :
                           run.status === 'queued' ? 'В очереди' : run.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDuration(run.duration_seconds, run.created_at, run.finished_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {run.finished_at 
                          ? new Date(run.finished_at).toLocaleString('ru-RU')
                          : (run.status === 'running' || run.status === 'queued')
                          ? 'В процессе'
                          : 'Не завершено'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          href={`/runs/${run.id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                        >
                          Просмотр
                        </Link>
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

export default function RunsPage() {
  return (
    <Suspense fallback={
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Загрузка запусков...</p>
        </div>
      </div>
    }>
      <RunsContent />
    </Suspense>
  )
}

