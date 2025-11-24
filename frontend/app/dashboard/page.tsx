'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'

interface AnalysisType {
  id: number
  name: string
  display_name: string
  description: string | null
  is_system: boolean
}

interface Run {
  id: number
  trigger_type: string
  instrument: string
  timeframe: string
  status: string
  created_at: string
  finished_at: string | null
  cost_est_total: number
  analysis_type_id?: number | null
}

interface DashboardStats {
  pipelines_total: number
  pipelines_active: number
  runs_total: number
  runs_this_month: number
  runs_succeeded: number
  runs_failed: number
  runs_running: number
  cost_total: number
  cost_this_month: number
}

async function fetchAnalysisTypes() {
  const { data } = await axios.get<AnalysisType[]>(`${API_BASE_URL}/api/analyses/my`, {
    withCredentials: true
  })
  return data
}

async function fetchRuns(limit: number = 10) {
  const { data } = await axios.get<Run[]>(`${API_BASE_URL}/api/runs?limit=${limit}`, {
    withCredentials: true
  })
  return data
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  // Fetch runs to calculate stats
  const runs = await fetchRuns(1000) // Get more runs for stats
  
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  const runsThisMonth = runs.filter(run => new Date(run.created_at) >= startOfMonth)
  const runsSucceeded = runs.filter(run => run.status === 'succeeded')
  const runsFailed = runs.filter(run => run.status === 'failed' || run.status === 'model_failure')
  const runsRunning = runs.filter(run => run.status === 'running' || run.status === 'queued')
  
  const costTotal = runs.reduce((sum, run) => sum + run.cost_est_total, 0)
  const costThisMonth = runsThisMonth.reduce((sum, run) => sum + run.cost_est_total, 0)
  
  // Fetch pipelines
  const pipelines = await fetchAnalysisTypes()
  const pipelinesActive = pipelines.filter(p => p.is_system === false).length
  
  return {
    pipelines_total: pipelines.length,
    pipelines_active: pipelinesActive,
    runs_total: runs.length,
    runs_this_month: runsThisMonth.length,
    runs_succeeded: runsSucceeded.length,
    runs_failed: runsFailed.length,
    runs_running: runsRunning.length,
    cost_total: costTotal,
    cost_this_month: costThisMonth,
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { isLoading: authLoading, user, isAuthenticated } = useAuth()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: recentRuns = [], isLoading: runsLoading } = useQuery({
    queryKey: ['dashboard-runs'],
    queryFn: () => fetchRuns(5),
    refetchInterval: 5000, // Poll every 5 seconds for running jobs
  })

  const { data: pipelines = [] } = useQuery({
    queryKey: ['dashboard-pipelines'],
    queryFn: fetchAnalysisTypes,
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'model_failure':
        return 'bg-orange-50 text-orange-700 border-orange-200'
      case 'running':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'queued':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'model_failure':
        return 'Ошибка модели'
      case 'succeeded':
        return 'Успешно'
      case 'failed':
        return 'Ошибка'
      case 'running':
        return 'Выполняется'
      case 'queued':
        return 'В очереди'
      default:
    return status
    }
  }

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(4)}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'только что'
    if (diffMins < 60) return `${diffMins} мин назад`
    if (diffHours < 24) return `${diffHours} ч назад`
    if (diffDays < 7) return `${diffDays} дн назад`
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  if (authLoading || statsLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Загрузка...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Добро пожаловать{user?.full_name ? `, ${user.full_name}` : ''}!
              </h1>
              <p className="text-gray-600">
                Обзор ваших аналитических процессов и результатов
              </p>
            </div>
            <button
              onClick={() => router.push('/pipelines/new')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Создать процесс
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pipelines Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <Link
                href="/analyses"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Все →
              </Link>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {stats?.pipelines_total || 0}
            </div>
            <div className="text-sm text-gray-600">
              Процессов {stats?.pipelines_active ? `(${stats.pipelines_active} активных)` : ''}
            </div>
            </div>

          {/* Runs Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-50 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <Link
                href="/runs"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Все →
              </Link>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {stats?.runs_total || 0}
            </div>
            <div className="text-sm text-gray-600">
              Запусков {stats?.runs_this_month ? `(${stats.runs_this_month} в этом месяце)` : ''}
            </div>
            </div>

          {/* Success Rate Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-50 rounded-lg">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {stats && stats.runs_total > 0
                ? `${Math.round((stats.runs_succeeded / stats.runs_total) * 100)}%`
                : '0%'}
            </div>
            <div className="text-sm text-gray-600">
              Успешных запусков
            </div>
          </div>

          {/* Cost Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-50 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {formatCurrency(stats?.cost_total || 0)}
            </div>
            <div className="text-sm text-gray-600">
              Всего потрачено {stats?.cost_this_month ? `(${formatCurrency(stats.cost_this_month)} в этом месяце)` : ''}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Быстрые действия</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/pipelines/new')}
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Создать процесс</span>
              </div>
              <p className="text-sm text-gray-600">Создайте новый аналитический процесс с нуля</p>
            </button>

            <Link
              href="/analyses"
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Запустить анализ</span>
              </div>
              <p className="text-sm text-gray-600">Выберите процесс и запустите анализ</p>
            </Link>

            <Link
              href="/tools"
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-left group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="font-medium text-gray-900">Управление инструментами</span>
              </div>
              <p className="text-sm text-gray-600">Настройте источники данных и API</p>
            </Link>
          </div>
        </div>

        {/* Recent Runs & Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Runs */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Последние запуски</h2>
              <Link
                href="/runs"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Все запуски →
              </Link>
            </div>

          {runsLoading ? (
              <div className="flex items-center gap-3 py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <p className="text-gray-600">Загрузка...</p>
              </div>
            ) : recentRuns.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-gray-600 mb-4">Пока нет запусков</p>
                <Link
                  href="/analyses"
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Запустить первый анализ
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            #{run.id}
                          </span>
                          <span className="text-sm text-gray-600">
                            {run.instrument} • {run.timeframe}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(run.created_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(run.status)}`}>
                          {getStatusLabel(run.status)}
                        </span>
                        <span className="text-sm text-gray-600">
                          {formatCurrency(run.cost_est_total)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Status Overview */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Статус</h2>
            <div className="space-y-4">
              {stats && stats.runs_running > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span className="font-medium text-blue-900">
                      {stats.runs_running} {stats.runs_running === 1 ? 'запуск выполняется' : 'запусков выполняется'}
                    </span>
                  </div>
                  <p className="text-sm text-blue-700">
                    Проверьте статус в разделе запусков
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Успешных</span>
                  <span className="text-sm font-semibold text-green-600">
                    {stats?.runs_succeeded || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Ошибок</span>
                  <span className="text-sm font-semibold text-red-600">
                    {stats?.runs_failed || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Активных процессов</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {stats?.pipelines_active || 0}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <Link
                  href="/runs"
                  className="block w-full text-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Просмотреть все запуски
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        {pipelines.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Ваши процессы</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pipelines.slice(0, 6).map((pipeline) => (
                        <Link
                  key={pipeline.id}
                  href={`/analyses/${pipeline.id}`}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
                        >
                  <div className="font-medium text-gray-900 mb-1">{pipeline.display_name}</div>
                  {pipeline.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{pipeline.description}</p>
                  )}
                        </Link>
              ))}
            </div>
            {pipelines.length > 6 && (
              <div className="mt-4 text-center">
                <Link
                  href="/analyses"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Показать все процессы ({pipelines.length}) →
                </Link>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
