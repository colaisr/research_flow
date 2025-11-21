'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth, useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'
import axios from 'axios'

interface PlatformSettings {
  platform_config: {
    allow_public_registration: boolean
    default_user_role: string
  }
  system_limits: {
    max_pipelines_per_user: number | null
    max_runs_per_day: number | null
    max_runs_per_month: number | null
    max_tokens_per_user: number | null
  }
  global_api_keys: {
    openrouter_fallback_key: string | null
    openrouter_fallback_key_masked: string | null
  }
}

// Users Management Tab Component
interface UserListItem {
  id: number
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  personal_org_id: number | null
  personal_org_name: string | null
  other_orgs_count: number
  created_at: string
}

async function fetchUsers(params: { role?: string; status?: string; search?: string } = {}) {
  const queryParams = new URLSearchParams()
  if (params.role) queryParams.append('role', params.role)
  if (params.status) queryParams.append('status', params.status)
  if (params.search) queryParams.append('search', params.search)
  queryParams.append('limit', '100')
  queryParams.append('offset', '0')

  const { data } = await apiClient.get<UserListItem[]>(
    `${API_BASE_URL}/api/admin/users?${queryParams.toString()}`,
    { withCredentials: true }
  )
  return data
}

async function updateUser(userId: number, updates: { role?: string; is_active?: boolean }) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/admin/users/${userId}`,
    updates,
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

function UsersManagementTab({ router, queryClient }: { router: any; queryClient: any }) {
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users', roleFilter, statusFilter, debouncedSearch],
    queryFn: () => fetchUsers({
      role: roleFilter || undefined,
      status: statusFilter || undefined,
      search: debouncedSearch || undefined
    })
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, updates }: { userId: number; updates: any }) => updateUser(userId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    }
  })

  const impersonateMutation = useMutation({
    mutationFn: impersonateUser,
    onSuccess: () => {
      // Invalidate auth query and redirect
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      router.push('/dashboard')
      router.refresh()
    }
  })

  const handleToggleActive = (user: UserListItem) => {
    if (confirm(`Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} user ${user.email}?`)) {
      updateUserMutation.mutate({
        userId: user.id,
        updates: { is_active: !user.is_active }
      })
    }
  }

  const handleChangeRole = (user: UserListItem, newRole: string) => {
    const roleLabel = newRole === 'admin' ? 'Platform Admin' : 'User'
    if (confirm(`Change platform role of ${user.email} to ${roleLabel}?`)) {
      updateUserMutation.mutate({
        userId: user.id,
        updates: { role: newRole }
      })
    }
  }

  const handleImpersonate = (user: UserListItem) => {
    if (confirm(`You are about to log in as ${user.email}. Continue?`)) {
      impersonateMutation.mutate(user.id)
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
        Управление пользователями
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Просмотр и управление всеми пользователями платформы
      </p>

      {/* Filters */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Поиск
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Email или имя..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Роль
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Все роли</option>
              <option value="admin">Platform Admin</option>
              <option value="user">User</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Статус
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Все статусы</option>
              <option value="active">Активные</option>
              <option value="inactive">Неактивные</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setRoleFilter('')
                setStatusFilter('')
                setSearchQuery('')
              }}
              className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Пользователи не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Пользователь
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Роль
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Организации
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Создан
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {user.full_name || user.email}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {user.role === 'admin' ? 'Platform Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div>
                        {user.personal_org_name && (
                          <div className="text-xs">
                            Личная: {user.personal_org_name}
                          </div>
                        )}
                        {user.other_orgs_count > 0 && (
                          <div className="text-xs">
                            Других: {user.other_orgs_count}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        user.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                        {user.is_active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(user.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => router.push(`/admin/users/${user.id}`)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Просмотр деталей"
                        >
                          Просмотр
                        </button>
                        <button
                          onClick={() => handleToggleActive(user)}
                          className={`${
                            user.is_active
                              ? 'text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300'
                              : 'text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300'
                          }`}
                          title={user.is_active ? 'Деактивировать' : 'Активировать'}
                        >
                          {user.is_active ? 'Деактивировать' : 'Активировать'}
                        </button>
                        <select
                          value={user.role}
                          onChange={(e) => handleChangeRole(user, e.target.value)}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-700 dark:text-white"
                          title="Изменить платформенную роль"
                        >
                          <option value="user">User</option>
                          <option value="admin">Platform Admin</option>
                        </select>
                        <button
                          onClick={() => handleImpersonate(user)}
                          className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300"
                          title="Войти как пользователь"
                        >
                          Войти как
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
    </div>
  )
}

interface Model {
  id: number
  name: string
  display_name: string
  provider: string
  description: string | null
  max_tokens: number | null
  cost_per_1k_tokens: string | null
  is_enabled: boolean
  has_failures: boolean
}

interface DataSource {
  id: number
  name: string
  display_name: string
  description: string | null
  supports_crypto: boolean
  supports_stocks: boolean
  supports_forex: boolean
  is_enabled: boolean
}

interface Instrument {
  symbol: string
  type: string
  exchange: string | null
  display_name: string
  is_enabled: boolean
  id: number | null
}

async function fetchAdminSettings() {
  const { data } = await apiClient.get<PlatformSettings>(`${API_BASE_URL}/api/admin/settings`, {
    withCredentials: true
  })
  return data
}

async function updatePlatformConfig(config: Partial<PlatformSettings['platform_config']>) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/admin/settings/platform-config`,
    config,
    { withCredentials: true }
  )
  return data
}

async function updateSystemLimits(limits: Partial<PlatformSettings['system_limits']>) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/admin/settings/system-limits`,
    limits,
    { withCredentials: true }
  )
  return data
}

async function updateGlobalApiKeys(keys: Partial<PlatformSettings['global_api_keys']>) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/admin/settings/global-api-keys`,
    keys,
    { withCredentials: true }
  )
  return data
}

// Models & Instruments functions
async function fetchModels() {
  const { data } = await axios.get<Model[]>(`${API_BASE_URL}/api/settings/models`)
  return data
}

async function updateModel(id: number, is_enabled: boolean) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/models/${id}`,
    { is_enabled },
    { withCredentials: true }
  )
  return data
}

async function syncModelsFromOpenRouter() {
  const { data } = await axios.post(
    `${API_BASE_URL}/api/settings/models/sync`,
    {},
    { withCredentials: true }
  )
  return data
}

async function fetchAllInstruments() {
  const { data } = await axios.get<Instrument[]>(`${API_BASE_URL}/api/instruments/all`, {
    withCredentials: true
  })
  return data
}

async function toggleInstrument(symbol: string) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/instruments/toggle`,
    { symbol },
    { withCredentials: true }
  )
  return data
}

// Data Sources functions
async function fetchDataSources() {
  const { data } = await axios.get<DataSource[]>(`${API_BASE_URL}/api/settings/data-sources`)
  return data
}

async function updateDataSource(id: number, is_enabled: boolean) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/data-sources/${id}`,
    { is_enabled },
    { withCredentials: true }
  )
  return data
}

// Credentials functions
async function fetchTelegramSettings() {
  const { data } = await axios.get(`${API_BASE_URL}/api/settings/telegram`, {
    withCredentials: true
  })
  return data
}

async function updateTelegramSettings(bot_token: string | null) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/telegram`,
    { bot_token },
    { withCredentials: true }
  )
  return data
}

async function fetchOpenRouterSettings() {
  const { data } = await axios.get(`${API_BASE_URL}/api/settings/openrouter`, {
    withCredentials: true
  })
  return data
}

async function updateOpenRouterSettings(api_key: string | null) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/openrouter`,
    { api_key },
    { withCredentials: true }
  )
  return data
}

async function fetchTinkoffSettings() {
  const { data } = await axios.get(`${API_BASE_URL}/api/settings/tinkoff`, {
    withCredentials: true
  })
  return data
}

async function updateTinkoffSettings(api_token: string | null) {
  const { data } = await axios.put(
    `${API_BASE_URL}/api/settings/tinkoff`,
    { api_token },
    { withCredentials: true }
  )
  return data
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useRequireAuth()
  const { isPlatformAdmin, isLoading: authUserLoading } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'users' | 'platform' | 'limits' | 'api-keys' | 'models' | 'data-sources' | 'credentials' | 'features'>('users')
  
  // Platform config state
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(true)
  const [defaultUserRole, setDefaultUserRole] = useState('user')
  
  // System limits state
  const [maxPipelines, setMaxPipelines] = useState<number | null>(null)
  const [maxRunsPerDay, setMaxRunsPerDay] = useState<number | null>(null)
  const [maxRunsPerMonth, setMaxRunsPerMonth] = useState<number | null>(null)
  const [maxTokens, setMaxTokens] = useState<number | null>(null)
  
  // Global API keys state
  const [openRouterKey, setOpenRouterKey] = useState('')
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)
  
  // Models & Instruments state
  const [modelSearch, setModelSearch] = useState('')
  const [modelProviderFilter, setModelProviderFilter] = useState<'all' | string>('all')
  const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false)
  const [showEnabledOnly, setShowEnabledOnly] = useState(false)
  const [instrumentSearch, setInstrumentSearch] = useState('')
  const [instrumentTypeFilter, setInstrumentTypeFilter] = useState<'all' | 'crypto' | 'equity'>('all')
  
  // Credentials state
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [openRouterKeyCreds, setOpenRouterKeyCreds] = useState('')
  const [tinkoffToken, setTinkoffToken] = useState('')
  const [showTelegramToken, setShowTelegramToken] = useState(false)
  const [showOpenRouterKeyCreds, setShowOpenRouterKeyCreds] = useState(false)
  const [showTinkoffToken, setShowTinkoffToken] = useState(false)
  const telegramInitialized = useRef(false)
  const openRouterInitialized = useRef(false)
  const tinkoffInitialized = useRef(false)

  // Only load data for active tab to improve initial load performance
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: fetchAdminSettings,
    enabled: !authLoading && isPlatformAdmin && (activeTab === 'platform' || activeTab === 'limits' || activeTab === 'api-keys'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  // Models & Instruments queries - only load when models tab is active
  const { data: models = [], isLoading: modelsLoading } = useQuery({
    queryKey: ['settings', 'models'],
    queryFn: fetchModels,
    enabled: !authLoading && isPlatformAdmin && activeTab === 'models',
    staleTime: 5 * 60 * 1000,
  })

  const { data: allInstruments = [], isLoading: instrumentsLoading } = useQuery({
    queryKey: ['instruments', 'all'],
    queryFn: fetchAllInstruments,
    enabled: !authLoading && isPlatformAdmin && activeTab === 'models',
    staleTime: 5 * 60 * 1000,
  })

  // Data Sources queries - only load when data-sources tab is active
  const { data: dataSources = [], isLoading: dataSourcesLoading } = useQuery({
    queryKey: ['settings', 'data-sources'],
    queryFn: fetchDataSources,
    enabled: !authLoading && isPlatformAdmin && activeTab === 'data-sources',
    staleTime: 5 * 60 * 1000,
  })

  // Credentials queries - only load when credentials tab is active
  const { data: telegramSettings } = useQuery({
    queryKey: ['settings', 'telegram'],
    queryFn: fetchTelegramSettings,
    enabled: !authLoading && isPlatformAdmin && activeTab === 'credentials',
    staleTime: 5 * 60 * 1000,
  })

  const { data: openRouterSettings } = useQuery({
    queryKey: ['settings', 'openrouter'],
    queryFn: fetchOpenRouterSettings,
    enabled: !authLoading && isPlatformAdmin && activeTab === 'credentials',
    staleTime: 5 * 60 * 1000,
  })

  const { data: tinkoffSettings } = useQuery({
    queryKey: ['settings', 'tinkoff'],
    queryFn: fetchTinkoffSettings,
    enabled: !authLoading && isPlatformAdmin && activeTab === 'credentials',
    staleTime: 5 * 60 * 1000,
  })

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && !isPlatformAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isPlatformAdmin, router])

  // Initialize form values from API
  useEffect(() => {
    if (settings) {
      setAllowPublicRegistration(settings.platform_config.allow_public_registration)
      setDefaultUserRole(settings.platform_config.default_user_role)
      setMaxPipelines(settings.system_limits.max_pipelines_per_user)
      setMaxRunsPerDay(settings.system_limits.max_runs_per_day)
      setMaxRunsPerMonth(settings.system_limits.max_runs_per_month)
      setMaxTokens(settings.system_limits.max_tokens_per_user)
      setOpenRouterKey(settings.global_api_keys.openrouter_fallback_key || '')
    }
  }, [settings])

  // Initialize credentials from API
  useEffect(() => {
    if (telegramSettings && !telegramInitialized.current) {
      if (telegramSettings.bot_token) {
        setTelegramBotToken(telegramSettings.bot_token)
      }
      telegramInitialized.current = true
    }
  }, [telegramSettings])

  useEffect(() => {
    if (openRouterSettings?.api_key && !openRouterInitialized.current) {
      setOpenRouterKeyCreds(openRouterSettings.api_key)
      openRouterInitialized.current = true
    }
  }, [openRouterSettings])

  useEffect(() => {
    if (tinkoffSettings?.api_token && !tinkoffInitialized.current) {
      setTinkoffToken(tinkoffSettings.api_token)
      tinkoffInitialized.current = true
    }
  }, [tinkoffSettings])

  const updatePlatformConfigMutation = useMutation({
    mutationFn: () => updatePlatformConfig({
      allow_public_registration: allowPublicRegistration,
      default_user_role: defaultUserRole,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      alert('Настройки платформы обновлены')
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Ошибка при обновлении настроек')
    },
  })

  const updateSystemLimitsMutation = useMutation({
    mutationFn: () => updateSystemLimits({
      max_pipelines_per_user: maxPipelines,
      max_runs_per_day: maxRunsPerDay,
      max_runs_per_month: maxRunsPerMonth,
      max_tokens_per_user: maxTokens,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      alert('Лимиты системы обновлены')
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Ошибка при обновлении лимитов')
    },
  })

  const updateGlobalApiKeysMutation = useMutation({
    mutationFn: () => updateGlobalApiKeys({
      openrouter_fallback_key: openRouterKey || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      setOpenRouterKey('')
      alert('Глобальные API ключи обновлены')
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Ошибка при обновлении API ключей')
    },
  })

  // Models & Instruments mutations
  const updateModelMutation = useMutation({
    mutationFn: ({ id, is_enabled }: { id: number; is_enabled: boolean }) =>
      updateModel(id, is_enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'models'] })
    },
  })

  const syncModelsMutation = useMutation({
    mutationFn: syncModelsFromOpenRouter,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'models'] })
      alert(`Успешно! Добавлено ${data.added} новых моделей, ${data.skipped} уже существовало.`)
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.detail || error.message || 'Ошибка синхронизации моделей'
      alert(`Ошибка синхронизации моделей: ${errorMsg}`)
    },
  })

  const toggleInstrumentMutation = useMutation({
    mutationFn: toggleInstrument,
    onSuccess: (data) => {
      queryClient.setQueryData(['instruments', 'all'], (old: Instrument[] | undefined) => {
        if (!old) return old
        return old.map(inst => 
          inst.symbol === data.symbol 
            ? { ...inst, is_enabled: data.is_enabled, id: data.id }
            : inst
        )
      })
      queryClient.invalidateQueries({ queryKey: ['instruments', 'all'] })
      queryClient.invalidateQueries({ queryKey: ['instruments'] })
    },
    onError: (error) => {
      console.error('Failed to toggle instrument:', error)
      alert('Ошибка при переключении инструмента. Попробуйте снова.')
    },
  })

  // Data Sources mutations
  const updateDataSourceMutation = useMutation({
    mutationFn: ({ id, is_enabled }: { id: number; is_enabled: boolean }) =>
      updateDataSource(id, is_enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'data-sources'] })
    },
  })

  // Credentials mutations
  const updateTelegramMutation = useMutation({
    mutationFn: () => updateTelegramSettings(telegramBotToken || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'telegram'] })
      alert('Настройки Telegram сохранены!')
    },
  })

  const updateOpenRouterMutation = useMutation({
    mutationFn: () => updateOpenRouterSettings(openRouterKeyCreds || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'openrouter'] })
      alert('Настройки OpenRouter сохранены!')
    },
  })

  const updateTinkoffMutation = useMutation({
    mutationFn: () => updateTinkoffSettings(tinkoffToken || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'tinkoff'] })
      alert('Настройки Tinkoff сохранены!')
    },
  })

  // Filter functions
  const filteredModels = models.filter((model) => {
    const matchesSearch = model.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                         model.display_name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                         (model.description && model.description.toLowerCase().includes(modelSearch.toLowerCase()))
    const matchesProvider = modelProviderFilter === 'all' || model.provider === modelProviderFilter
    const matchesFreeFilter = !showFreeModelsOnly || model.name.toLowerCase().includes(':free') || 
                              model.name.toLowerCase().includes('free') ||
                              model.display_name.toLowerCase().includes('free')
    const matchesEnabledFilter = !showEnabledOnly || model.is_enabled
    return matchesSearch && matchesProvider && matchesFreeFilter && matchesEnabledFilter
  })

  const filteredInstruments = allInstruments.filter((inst) => {
    const matchesSearch = inst.symbol.toLowerCase().includes(instrumentSearch.toLowerCase()) ||
                         inst.display_name.toLowerCase().includes(instrumentSearch.toLowerCase())
    const matchesType = instrumentTypeFilter === 'all' || inst.type === instrumentTypeFilter
    return matchesSearch && matchesType
  })

  const uniqueProviders = Array.from(new Set(models.map(m => m.provider))).sort()

  // Show loading only if auth is loading
  // Don't block on tab-specific data loading (show tabs immediately, load data per tab)
  if (authLoading || authUserLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    )
  }
  
  // If auth loaded but user is not admin, show nothing (redirect will happen)
  if (!isPlatformAdmin) {
    return null
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-white">
          Настройки администратора
        </h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="flex space-x-8 overflow-x-auto">
            {(['users', 'platform', 'limits', 'api-keys', 'models', 'data-sources', 'credentials'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab === 'users' && 'Пользователи'}
                {tab === 'platform' && 'Конфигурация платформы'}
                {tab === 'limits' && 'Лимиты системы'}
                {tab === 'api-keys' && 'Глобальные API ключи'}
                {tab === 'models' && 'Модели и инструменты'}
                {tab === 'data-sources' && 'Источники данных'}
                {tab === 'credentials' && 'Учётные данные'}
              </button>
            ))}
          </nav>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && <UsersManagementTab router={router} queryClient={queryClient} />}

        {/* Platform Config Tab */}
        {activeTab === 'platform' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Конфигурация платформы
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="allow-registration"
                  checked={allowPublicRegistration}
                  onChange={(e) => setAllowPublicRegistration(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="allow-registration" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Разрешить публичную регистрацию
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Роль по умолчанию для новых пользователей
                </label>
                <select
                  value={defaultUserRole}
                  onChange={(e) => setDefaultUserRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор платформы</option>
                </select>
              </div>

              <button
                onClick={() => updatePlatformConfigMutation.mutate()}
                disabled={updatePlatformConfigMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
              >
                {updatePlatformConfigMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
            </div>
          </div>
        )}

        {/* System Limits Tab */}
        {activeTab === 'limits' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Лимиты системы
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Максимум пайплайнов на пользователя
                </label>
                <input
                  type="number"
                  value={maxPipelines || ''}
                  onChange={(e) => setMaxPipelines(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Без ограничений"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Максимум запусков в день
                </label>
                <input
                  type="number"
                  value={maxRunsPerDay || ''}
                  onChange={(e) => setMaxRunsPerDay(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Без ограничений"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Максимум запусков в месяц
                </label>
                <input
                  type="number"
                  value={maxRunsPerMonth || ''}
                  onChange={(e) => setMaxRunsPerMonth(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Без ограничений"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Максимум токенов на пользователя
                </label>
                <input
                  type="number"
                  value={maxTokens || ''}
                  onChange={(e) => setMaxTokens(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Без ограничений"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <button
                onClick={() => updateSystemLimitsMutation.mutate()}
                disabled={updateSystemLimitsMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
              >
                {updateSystemLimitsMutation.isPending ? 'Сохранение...' : 'Сохранить лимиты'}
              </button>
            </div>
          </div>
        )}

        {/* Global API Keys Tab */}
        {activeTab === 'api-keys' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Глобальные API ключи
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Эти ключи используются как резервные, если у пользователя нет собственных ключей.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  OpenRouter Fallback API Key
                </label>
                <div className="relative">
                  <input
                    type={showOpenRouterKey ? 'text' : 'password'}
                    value={openRouterKey}
                    onChange={(e) => setOpenRouterKey(e.target.value)}
                    placeholder="Получите на https://openrouter.ai"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showOpenRouterKey ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {settings?.global_api_keys.openrouter_fallback_key_masked && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Текущий: {settings.global_api_keys.openrouter_fallback_key_masked}
                  </p>
                )}
              </div>

              <button
                onClick={() => updateGlobalApiKeysMutation.mutate()}
                disabled={updateGlobalApiKeysMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
              >
                {updateGlobalApiKeysMutation.isPending ? 'Сохранение...' : 'Сохранить API ключи'}
              </button>
            </div>
          </div>
        )}

        {/* Models & Instruments Tab */}
        {activeTab === 'models' && (
          <div className="space-y-6">
            {/* Models Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    Доступные модели
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Включите или отключите LLM модели. Только включённые модели будут отображаться в выпадающих списках конфигурации анализа.
                    {filteredModels.length > 0 && (
                      <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                        Найдено: {filteredModels.length} моделей
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => syncModelsMutation.mutate()}
                  disabled={syncModelsMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {syncModelsMutation.isPending ? 'Синхронизация...' : 'Синхронизировать с OpenRouter'}
                </button>
              </div>

              {modelsLoading ? (
                <p className="text-gray-600 dark:text-gray-400">Загрузка моделей...</p>
              ) : (
                <div className="space-y-4">
                  {/* Search and Filter Controls */}
                  <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Поиск моделей по названию, провайдеру или описанию..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                      />
                    </div>
                    <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={showEnabledOnly}
                        onChange={(e) => setShowEnabledOnly(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-white whitespace-nowrap">
                        Только включённые
                      </span>
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={showFreeModelsOnly}
                        onChange={(e) => setShowFreeModelsOnly(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-white whitespace-nowrap">
                        Бесплатные модели
                      </span>
                    </label>
                    <select
                      value={modelProviderFilter}
                      onChange={(e) => setModelProviderFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="all">Все провайдеры</option>
                      {uniqueProviders.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider.charAt(0).toUpperCase() + provider.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Models List */}
                  {filteredModels.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Модели не найдены по вашему запросу.
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
                        {filteredModels.map((model) => (
                          <div
                            key={model.id}
                            className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {model.has_failures && <span className="text-orange-600 dark:text-orange-400 mr-1">⚠️</span>}
                                    {model.display_name}
                                  </h3>
                                  <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                                    {model.provider}
                                  </span>
                                  <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
                                    {model.name}
                                  </span>
                                  {model.has_failures && (
                                    <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded text-orange-600 dark:text-orange-400 font-medium">
                                      Есть ошибки
                                    </span>
                                  )}
                                </div>
                                {model.description && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {model.description}
                                  </p>
                                )}
                                <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                                  {model.max_tokens && (
                                    <span>Макс. токенов: {model.max_tokens.toLocaleString()}</span>
                                  )}
                                  {model.cost_per_1k_tokens && (
                                    <span>Стоимость: {model.cost_per_1k_tokens}/1k токенов</span>
                                  )}
                                </div>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer ml-4">
                                <input
                                  type="checkbox"
                                  checked={model.is_enabled}
                                  onChange={(e) =>
                                    updateModelMutation.mutate({ id: model.id, is_enabled: e.target.checked })
                                  }
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Instruments Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
                Доступные инструменты
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Включите или отключите инструменты. Только включённые инструменты будут отображаться в выпадающих списках по всему приложению.
                {filteredInstruments.length > 0 && (
                  <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                    Найдено: {filteredInstruments.length} инструментов
                  </span>
                )}
              </p>

              {instrumentsLoading ? (
                <p className="text-gray-600 dark:text-gray-400">Загрузка инструментов...</p>
              ) : (
                <div className="space-y-4">
                  {/* Search and Filter Controls */}
                  <div className="flex gap-4 items-center">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Поиск инструментов по символу или названию..."
                        value={instrumentSearch}
                        onChange={(e) => setInstrumentSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                      />
                    </div>
                    <select
                      value={instrumentTypeFilter}
                      onChange={(e) => setInstrumentTypeFilter(e.target.value as 'all' | 'crypto' | 'equity')}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="all">Все типы</option>
                      <option value="crypto">Криптовалюты</option>
                      <option value="equity">Акции</option>
                    </select>
                  </div>

                  {/* Instruments List */}
                  {filteredInstruments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Инструменты не найдены по вашему запросу.
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
                        {filteredInstruments.map((instrument) => (
                          <div
                            key={instrument.symbol}
                            className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {instrument.display_name}
                                  </span>
                                  <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                                    {instrument.symbol}
                                  </span>
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    instrument.type === 'crypto' 
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  }`}>
                                    {instrument.type === 'crypto' ? 'Криптовалюта' : 'Акция'}
                                  </span>
                                  {instrument.exchange && (
                                    <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-700 dark:text-purple-400">
                                      {instrument.exchange}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer ml-4">
                                <input
                                  type="checkbox"
                                  checked={instrument.is_enabled}
                                  onChange={() => toggleInstrumentMutation.mutate(instrument.symbol)}
                                  disabled={toggleInstrumentMutation.isPending}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Data Sources Tab */}
        {activeTab === 'data-sources' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Источники данных
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Источники данных, используемые системой для получения рыночных данных. Источники автоматически выбираются на основе типа инструмента.
            </p>

            {dataSourcesLoading ? (
              <p className="text-gray-600 dark:text-gray-400">Загрузка источников данных...</p>
            ) : (
              <div className="space-y-4">
                {dataSources.map((source) => (
                  <div
                    key={source.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {source.display_name}
                          </h3>
                          <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                            {source.name}
                          </span>
                        </div>
                        {source.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {source.description}
                          </p>
                        )}
                        <div className="flex gap-2 text-xs">
                          {source.supports_crypto && (
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-green-700 dark:text-green-400">
                              Криптовалюты
                            </span>
                          )}
                          {source.supports_stocks && (
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-700 dark:text-blue-400">
                              Акции
                            </span>
                          )}
                          {source.supports_forex && (
                            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-700 dark:text-purple-400">
                              Форекс
                            </span>
                          )}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={source.is_enabled}
                          onChange={(e) =>
                            updateDataSourceMutation.mutate({ id: source.id, is_enabled: e.target.checked })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Credentials Tab */}
        {activeTab === 'credentials' && (
          <div className="space-y-6">
            {/* Telegram Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
                Конфигурация Telegram
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Настройте токен Telegram бота. Сообщения будут отправляться всем пользователям, которые запустили бота (отправили команду /start).
                {telegramSettings?.active_users_count !== undefined && (
                  <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                    Активных пользователей: {telegramSettings.active_users_count}
                  </span>
                )}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Токен бота
                  </label>
                  <div className="relative">
                    <input
                      type={showTelegramToken ? "text" : "password"}
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.target.value)}
                      placeholder="Получите от @BotFather"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTelegramToken(!showTelegramToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      {showTelegramToken ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  {telegramSettings?.bot_token_masked && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Текущий: {telegramSettings.bot_token_masked}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => updateTelegramMutation.mutate()}
                  disabled={updateTelegramMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
                >
                  {updateTelegramMutation.isPending ? 'Сохранение...' : 'Сохранить настройки Telegram'}
                </button>
              </div>
            </div>

            {/* OpenRouter Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
                Конфигурация OpenRouter
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Настройте ваш API ключ OpenRouter для доступа к LLM моделям.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    API ключ
                  </label>
                  <div className="relative">
                    <input
                      type={showOpenRouterKeyCreds ? "text" : "password"}
                      value={openRouterKeyCreds}
                      onChange={(e) => setOpenRouterKeyCreds(e.target.value)}
                      placeholder="Получите на https://openrouter.ai"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenRouterKeyCreds(!showOpenRouterKeyCreds)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      {showOpenRouterKeyCreds ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  {openRouterSettings?.api_key_masked && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Текущий: {openRouterSettings.api_key_masked}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => updateOpenRouterMutation.mutate()}
                  disabled={updateOpenRouterMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
                >
                  {updateOpenRouterMutation.isPending ? 'Сохранение...' : 'Сохранить настройки OpenRouter'}
                </button>
              </div>
            </div>

            {/* Tinkoff Invest API Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
                Конфигурация Tinkoff Invest API
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Настройте ваш токен Tinkoff Invest API для инструментов MOEX (Московская биржа).
                Требуется для получения данных по российским акциям, облигациям и ETF.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    API токен
                  </label>
                  <div className="relative">
                    <input
                      type={showTinkoffToken ? "text" : "password"}
                      value={tinkoffToken}
                      onChange={(e) => setTinkoffToken(e.target.value)}
                      placeholder="Получите в настройках аккаунта Tinkoff Invest"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTinkoffToken(!showTinkoffToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      {showTinkoffToken ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  {tinkoffSettings?.api_token_masked && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Текущий: {tinkoffSettings.api_token_masked}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => updateTinkoffMutation.mutate()}
                  disabled={updateTinkoffMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
                >
                  {updateTinkoffMutation.isPending ? 'Сохранение...' : 'Сохранить настройки Tinkoff'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}


