'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'

interface Schedule {
  id: number
  analysis_type_id: number
  analysis_type_name: string
  schedule_type: 'daily' | 'weekly' | 'interval' | 'cron'
  schedule_config: {
    time?: string  // HH:MM format for daily/weekly
    day_of_week?: number  // 0-6 (Monday-Sunday) for weekly
    interval_minutes?: number  // for interval type
    cron_expression?: string  // for cron type
  }
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

interface AnalysisType {
  id: number
  display_name: string
  description: string | null
}

interface ScheduleStats {
  total: number
  active: number
  next_run_in: string | null
}

async function fetchSchedules(): Promise<Schedule[]> {
  // TODO: Replace with actual API endpoint when backend is ready
  // For now, return empty array
  const { data } = await axios.get<Schedule[]>(`${API_BASE_URL}/api/schedules`, {
    withCredentials: true,
    validateStatus: (status) => status === 200 || status === 404
  }).catch(() => ({ data: [] }))
  return Array.isArray(data) ? data : []
}

async function fetchAnalysisTypes(): Promise<AnalysisType[]> {
  const { data } = await axios.get<AnalysisType[]>(`${API_BASE_URL}/api/analyses/my`, {
    withCredentials: true
  })
  return data
}

async function createSchedule(schedule: Partial<Schedule>) {
  const { data } = await axios.post(`${API_BASE_URL}/api/schedules`, {
    analysis_type_id: schedule.analysis_type_id,
    schedule_type: schedule.schedule_type,
    schedule_config: schedule.schedule_config,
    is_active: schedule.is_active ?? true,
  }, {
    withCredentials: true
  })
  return data
}

async function updateSchedule(id: number, schedule: Partial<Schedule>) {
  const { data } = await axios.put(`${API_BASE_URL}/api/schedules/${id}`, {
    schedule_type: schedule.schedule_type,
    schedule_config: schedule.schedule_config,
    is_active: schedule.is_active,
  }, {
    withCredentials: true
  })
  return data
}

async function deleteSchedule(id: number) {
  await axios.delete(`${API_BASE_URL}/api/schedules/${id}`, {
    withCredentials: true
  })
}

async function toggleSchedule(id: number, is_active: boolean) {
  const { data } = await axios.put(`${API_BASE_URL}/api/schedules/${id}`, { is_active }, {
    withCredentials: true
  })
  return data
}

export default function SchedulesPage() {
  const router = useRouter()
  const { isLoading: authLoading, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: fetchSchedules,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: analysisTypes = [] } = useQuery({
    queryKey: ['analysis-types'],
    queryFn: fetchAnalysisTypes,
  })

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setShowCreateModal(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, schedule }: { id: number; schedule: Partial<Schedule> }) =>
      updateSchedule(id, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setEditingSchedule(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      toggleSchedule(id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
    },
  })

  // Calculate statistics
  const stats: ScheduleStats = {
    total: schedules.length,
    active: schedules.filter(s => s.is_active).length,
    next_run_in: schedules
      .filter(s => s.is_active && s.next_run_at)
      .sort((a, b) => {
        if (!a.next_run_at) return 1
        if (!b.next_run_at) return -1
        return new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime()
      })[0]?.next_run_at || null,
  }

  const formatSchedulePattern = (schedule: Schedule): string => {
    const { schedule_type, schedule_config } = schedule
    switch (schedule_type) {
      case 'daily':
        return `Ежедневно в ${schedule_config.time || '00:00'}`
      case 'weekly':
        const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
        const day = days[schedule_config.day_of_week || 0]
        return `Каждый ${day} в ${schedule_config.time || '00:00'}`
      case 'interval':
        const minutes = schedule_config.interval_minutes || 60
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        if (hours > 0 && mins > 0) {
          return `Каждые ${hours} ч ${mins} мин`
        } else if (hours > 0) {
          return `Каждые ${hours} ч`
        }
        return `Каждые ${minutes} мин`
      case 'cron':
        return schedule_config.cron_expression || 'Cron выражение'
      default:
        return 'Неизвестный тип'
    }
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Никогда'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    
    if (diffMs < 0) return 'Просрочено'
    
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 60) return `через ${diffMins} мин`
    if (diffHours < 24) return `через ${diffHours} ч`
    if (diffDays < 7) return `через ${diffDays} дн`
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  if (authLoading || schedulesLoading) {
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
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Расписания
              </h1>
              <p className="text-gray-600">
                Управление автоматическими запусками процессов
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Создать расписание
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {stats.total}
            </div>
            <div className="text-sm text-gray-600">
              Всего расписаний
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-50 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {stats.active}
            </div>
            <div className="text-sm text-gray-600">
              Активных расписаний
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-50 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {stats.next_run_in ? formatDate(stats.next_run_in).split(' ')[1] || 'Скоро' : '—'}
            </div>
            <div className="text-sm text-gray-600">
              {stats.next_run_in ? `Следующий запуск ${formatDate(stats.next_run_in)}` : 'Нет запланированных запусков'}
            </div>
          </div>
        </div>

        {/* Schedules Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {schedules.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-600 mb-4 text-lg">Пока нет расписаний</p>
              <p className="text-gray-500 mb-6">Создайте первое расписание для автоматического запуска процессов</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Создать расписание
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Процесс
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Расписание
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Следующий запуск
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Последний запуск
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {schedules.map((schedule) => (
                    <tr key={schedule.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {schedule.analysis_type_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatSchedulePattern(schedule)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {schedule.next_run_at
                            ? formatDate(schedule.next_run_at)
                            : 'Не запланировано'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {schedule.last_run_at
                            ? new Date(schedule.last_run_at).toLocaleString('ru-RU', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Никогда'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            schedule.is_active
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-gray-50 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {schedule.is_active ? 'Активно' : 'Неактивно'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleMutation.mutate({ id: schedule.id, is_active: !schedule.is_active })}
                            className={`px-3 py-1.5 rounded-lg transition-colors ${
                              schedule.is_active
                                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                                : 'bg-green-50 text-green-700 hover:bg-green-100'
                            }`}
                            title={schedule.is_active ? 'Отключить' : 'Включить'}
                          >
                            {schedule.is_active ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => setEditingSchedule(schedule)}
                            className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Редактировать"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Удалить расписание для "${schedule.analysis_type_name}"?`)) {
                                deleteMutation.mutate(schedule.id)
                              }
                            }}
                            className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                            title="Удалить"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {(showCreateModal || editingSchedule) && (
          <ScheduleModal
            analysisTypes={analysisTypes}
            schedule={editingSchedule}
            onClose={() => {
              setShowCreateModal(false)
              setEditingSchedule(null)
            }}
            onSave={(schedule) => {
              if (editingSchedule) {
                updateMutation.mutate({ id: editingSchedule.id, schedule })
              } else {
                createMutation.mutate(schedule)
              }
            }}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        )}
      </div>
    </div>
  )
}

// Schedule Modal Component
function ScheduleModal({
  analysisTypes,
  schedule,
  onClose,
  onSave,
  isLoading,
}: {
  analysisTypes: AnalysisType[]
  schedule: Schedule | null
  onClose: () => void
  onSave: (schedule: Partial<Schedule>) => void
  isLoading: boolean
}) {
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number>(schedule?.analysis_type_id || 0)
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'interval' | 'cron'>(
    schedule?.schedule_type || 'daily'
  )
  const [time, setTime] = useState<string>(schedule?.schedule_config.time || '08:00')
  const [dayOfWeek, setDayOfWeek] = useState<number>(schedule?.schedule_config.day_of_week || 0)
  const [intervalMinutes, setIntervalMinutes] = useState<number>(schedule?.schedule_config.interval_minutes || 60)
  const [cronExpression, setCronExpression] = useState<string>(schedule?.schedule_config.cron_expression || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAnalysisId) {
      alert('Выберите процесс')
      return
    }

    const scheduleConfig: any = {}
    if (scheduleType === 'daily' || scheduleType === 'weekly') {
      scheduleConfig.time = time
    }
    if (scheduleType === 'weekly') {
      scheduleConfig.day_of_week = dayOfWeek
    }
    if (scheduleType === 'interval') {
      scheduleConfig.interval_minutes = intervalMinutes
    }
    if (scheduleType === 'cron') {
      scheduleConfig.cron_expression = cronExpression
    }

    onSave({
      analysis_type_id: selectedAnalysisId,
      schedule_type: scheduleType,
      schedule_config: scheduleConfig,
      is_active: schedule?.is_active ?? true,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {schedule ? 'Редактировать расписание' : 'Создать расписание'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Процесс *
            </label>
            <select
              value={selectedAnalysisId}
              onChange={(e) => setSelectedAnalysisId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
              required
              disabled={!!schedule}
            >
              <option value={0}>Выберите процесс...</option>
              {analysisTypes.map((at) => (
                <option key={at.id} value={at.id}>
                  {at.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Тип расписания *
            </label>
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
              required
            >
              <option value="daily">Ежедневно</option>
              <option value="weekly">Еженедельно</option>
              <option value="interval">Интервал</option>
              <option value="cron">Cron выражение</option>
            </select>
          </div>

          {scheduleType === 'daily' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Время *
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                required
              />
            </div>
          )}

          {scheduleType === 'weekly' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  День недели *
                </label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  required
                >
                  <option value={0}>Понедельник</option>
                  <option value={1}>Вторник</option>
                  <option value={2}>Среда</option>
                  <option value={3}>Четверг</option>
                  <option value={4}>Пятница</option>
                  <option value={5}>Суббота</option>
                  <option value={6}>Воскресенье</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Время *
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  required
                />
              </div>
            </>
          )}

          {scheduleType === 'interval' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Интервал (минуты) *
              </label>
              <input
                type="number"
                min="1"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Минимальный интервал: 1 минута
              </p>
            </div>
          )}

          {scheduleType === 'cron' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cron выражение *
              </label>
              <input
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 8 * * *"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 font-mono"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Формат: минута час день месяц день_недели (например: 0 8 * * * = каждый день в 08:00)
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Сохранение...' : schedule ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
