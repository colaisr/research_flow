'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useRequireAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'

interface UserDetails {
  id: number
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
  updated_at: string | null
  personal_organization: {
    id: number
    name: string
    slug: string
    is_personal: boolean
  } | null
  organizations: Array<{
    id: number
    name: string
    slug: string | null
    is_personal: boolean
    role: string
    joined_at: string | null
  }>
  statistics: {
    tokens_used_total: number
    tokens_used_this_month: number
    pipelines_created_total: number
    pipelines_active: number
    runs_executed_total: number
    runs_executed_this_month: number
    runs_succeeded: number
    runs_failed: number
    tools_created_total: number
    tools_active: number
    rags_created_total: number
    rags_documents_total: number
    organizations_count: number
  }
}

interface UserFeatures {
  [feature_name: string]: boolean | null
}

interface ActivityLogItem {
  type: 'run' | 'pipeline'
  id: number
  name: string
  status: string | null
  created_at: string
  organization_name: string | null
}

async function fetchUserDetails(userId: number) {
  const { data } = await apiClient.get<UserDetails>(
    `${API_BASE_URL}/api/admin/users/${userId}`,
    { withCredentials: true }
  )
  return data
}

async function fetchUserFeatures(userId: number) {
  const { data } = await apiClient.get<UserFeatures>(
    `${API_BASE_URL}/api/admin/users/${userId}/features`,
    { withCredentials: true }
  )
  return data
}

async function fetchAvailableFeatures() {
  const { data } = await apiClient.get<Record<string, string>>(
    `${API_BASE_URL}/api/admin/features`,
    { withCredentials: true }
  )
  return data
}

async function updateUser(userId: number, updates: { role?: string; is_active?: boolean; full_name?: string; email?: string }) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/admin/users/${userId}`,
    updates,
    { withCredentials: true }
  )
  return data
}

async function setUserFeature(userId: number, featureName: string, enabled: boolean) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/admin/users/${userId}/features/${featureName}`,
    { enabled },
    { withCredentials: true }
  )
  return data
}

async function fetchUserActivity(userId: number) {
  const { data } = await apiClient.get<ActivityLogItem[]>(
    `${API_BASE_URL}/api/admin/users/${userId}/activity?limit=50`,
    { withCredentials: true }
  )
  return data
}

async function impersonateUser(userId: number) {
  const { data } = await apiClient.post(
    `${API_BASE_URL}/api/admin/users/${userId}/impersonate`,
    {},
    { withCredentials: true }
  )
  return data
}

export default function UserDetailsPage() {
  useRequireAuth()
  const router = useRouter()
  const params = useParams()
  const queryClient = useQueryClient()
  const userId = parseInt(params.id as string)

  const [activeTab, setActiveTab] = useState<'profile' | 'statistics' | 'features' | 'organizations' | 'activity'>('profile')
  const [editingName, setEditingName] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => fetchUserDetails(userId),
    enabled: !!userId
  })

  const { data: userFeatures = {} } = useQuery({
    queryKey: ['admin', 'user-features', userId],
    queryFn: () => fetchUserFeatures(userId),
    enabled: !!userId
  })

  const { data: availableFeatures = {} } = useQuery({
    queryKey: ['admin', 'features'],
    queryFn: fetchAvailableFeatures
  })

  const { data: activityLog = [] } = useQuery({
    queryKey: ['admin', 'user-activity', userId],
    queryFn: () => fetchUserActivity(userId),
    enabled: !!userId && activeTab === 'activity'
  })

  const updateUserMutation = useMutation({
    mutationFn: (updates: any) => updateUser(userId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
      setEditingName(false)
      setEditingEmail(false)
    }
  })

  const setFeatureMutation = useMutation({
    mutationFn: ({ featureName, enabled }: { featureName: string; enabled: boolean }) =>
      setUserFeature(userId, featureName, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user-features', userId] })
    }
  })

  const impersonateMutation = useMutation({
    mutationFn: () => impersonateUser(userId),
    onSuccess: () => {
      // Invalidate auth query and redirect
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      router.push('/dashboard')
      router.refresh()
    }
  })

  if (userLoading || !user) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
      </div>
    )
  }

  const handleSaveName = () => {
    updateUserMutation.mutate({ full_name: newName || null })
  }

  const handleSaveEmail = () => {
    updateUserMutation.mutate({ email: newEmail })
  }

  const handleImpersonate = () => {
    if (confirm(`You are about to log in as ${user.email}. Continue?`)) {
      impersonateMutation.mutate()
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'user':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin/users')}
          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mb-4"
        >
          ← Назад к списку пользователей
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {user.full_name || user.email}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleImpersonate}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Войти как пользователь
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          {(['profile', 'statistics', 'features', 'organizations', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab === 'profile' && 'Профиль'}
              {tab === 'statistics' && 'Статистика'}
              {tab === 'features' && 'Функции'}
              {tab === 'organizations' && 'Организации'}
              {tab === 'activity' && 'Активность'}
            </button>
          ))}
        </nav>
      </div>

      {/* Subscription Link */}
      <div className="mb-4">
        <a
          href={`/admin/users/${userId}/subscription`}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Управление подпиской
        </a>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Имя
              </label>
              {editingName ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onBlur={() => {
                      setEditingName(false)
                      setNewName(user.full_name || '')
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Сохранить
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 dark:text-white">{user.full_name || 'Не указано'}</span>
                  <button
                    onClick={() => {
                      setNewName(user.full_name || '')
                      setEditingName(true)
                    }}
                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400"
                  >
                    Изменить
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              {editingEmail ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onBlur={() => {
                      setEditingEmail(false)
                      setNewEmail(user.email)
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveEmail}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Сохранить
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 dark:text-white">{user.email}</span>
                  <button
                    onClick={() => {
                      setNewEmail(user.email)
                      setEditingEmail(true)
                    }}
                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400"
                  >
                    Изменить
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Роль
              </label>
              <select
                value={user.role}
                onChange={(e) => updateUserMutation.mutate({ role: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="user">User</option>
                <option value="admin">Platform Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Статус
              </label>
              <div className="flex items-center gap-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  user.is_active
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {user.is_active ? 'Активен' : 'Неактивен'}
                </span>
                <button
                  onClick={() => updateUserMutation.mutate({ is_active: !user.is_active })}
                  className={`px-4 py-2 rounded-md ${
                    user.is_active
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {user.is_active ? 'Деактивировать' : 'Активировать'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Дата создания
              </label>
              <span className="text-gray-900 dark:text-white">
                {new Date(user.created_at).toLocaleString('ru-RU')}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'statistics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Токены (всего)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.statistics.tokens_used_total.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Токены (этот месяц)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.statistics.tokens_used_this_month.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Пайплайны (всего)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.statistics.pipelines_created_total}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Пайплайны (активные)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.statistics.pipelines_active}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Запуски (всего)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.statistics.runs_executed_total}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Запуски (этот месяц)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.statistics.runs_executed_this_month}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Успешные запуски</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {user.statistics.runs_succeeded}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Неудачные запуски</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {user.statistics.runs_failed}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Организации</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.statistics.organizations_count}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Управление функциями пользователя. Включенные функции будут доступны во всех организациях, где пользователь является владельцем. 
              При работе в организации пользователь получает функции владельца этой организации.
            </p>
            <div className="space-y-2">
              {Object.entries(availableFeatures).map(([featureName, displayName]) => {
                const isEnabled = userFeatures[featureName] ?? true
                return (
                  <div key={featureName} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{displayName}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {isEnabled ? 'Включено' : 'Отключено'}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(e) => {
                          setFeatureMutation.mutate({ featureName, enabled: e.target.checked })
                        }}
                        disabled={setFeatureMutation.isPending}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                    </label>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'organizations' && (
          <div className="space-y-4">
            {user.personal_organization && (
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="font-medium text-gray-900 dark:text-white mb-2">
                  Личная организация
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {user.personal_organization.name}
                </div>
              </div>
            )}
            {user.organizations.length > 0 && (
              <div>
                <div className="font-medium text-gray-900 dark:text-white mb-4">
                  Другие организации ({user.organizations.length})
                </div>
                <div className="space-y-2">
                  {user.organizations.map((org) => (
                    <div key={org.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div className="font-medium text-gray-900 dark:text-white">{org.name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Роль: {org.role === 'org_admin' ? 'Admin' : 'User'}
                        {org.joined_at && ` • Присоединился: ${new Date(org.joined_at).toLocaleDateString('ru-RU')}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Последние действия пользователя: запуски анализов и создание пайплайнов.
            </p>
            {activityLog.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Нет активности
              </div>
            ) : (
              <div className="space-y-2">
                {activityLog.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${
                          item.type === 'run'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}>
                          {item.type === 'run' ? 'Запуск' : 'Пайплайн'}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {item.name}
                        </span>
                        {item.status && (
                          <span className={`px-2 py-1 text-xs rounded ${
                            item.status === 'succeeded'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : item.status === 'failed' || item.status === 'model_failure'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          }`}>
                            {item.status === 'succeeded' ? 'Успешно' : 
                             item.status === 'failed' ? 'Ошибка' :
                             item.status === 'model_failure' ? 'Ошибка модели' :
                             item.status === 'running' ? 'Выполняется' :
                             item.status === 'queued' ? 'В очереди' : item.status}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(item.created_at).toLocaleString('ru-RU')}
                        {item.organization_name && ` • ${item.organization_name}`}
                      </div>
                    </div>
                    {item.type === 'run' && (
                      <button
                        onClick={() => router.push(`/runs/${item.id}`)}
                        className="ml-4 px-3 py-1 text-sm text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Просмотр
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

