'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useRequireAuth, useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'

interface UserSettings {
  profile: {
    id: number
    email: string
    full_name: string | null
    role: string
    is_active: boolean
    created_at: string | null
  }
  preferences: {
    theme: string
    language: string
    timezone: string
    notifications_enabled: boolean
  }
  api_keys: {
    openrouter_api_key: string | null
  }
  organizations: Array<{
    id: number
    name: string
    slug: string | null
    is_personal: boolean
    role: string | null
  }>
}

async function fetchUserSettings() {
  const { data } = await apiClient.get<UserSettings>(`${API_BASE_URL}/api/user-settings`, {
    withCredentials: true
  })
  return data
}

async function updateProfile(full_name: string | null, email: string | null) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/user-settings/profile`,
    { full_name, email },
    { withCredentials: true }
  )
  return data
}

async function changePassword(current_password: string, new_password: string) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/user-settings/password`,
    { current_password, new_password },
    { withCredentials: true }
  )
  return data
}

async function updatePreferences(preferences: Partial<UserSettings['preferences']>) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/user-settings/preferences`,
    preferences,
    { withCredentials: true }
  )
  return data
}

async function updateApiKeys(openrouter_api_key: string | null) {
  const { data } = await apiClient.put(
    `${API_BASE_URL}/api/user-settings/api-keys`,
    { openrouter_api_key },
    { withCredentials: true }
  )
  return data
}

export default function UserSettingsPage() {
  const { isLoading: authLoading } = useRequireAuth()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'api-keys' | 'organizations'>('profile')
  
  // Profile form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  
  // Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // Preferences form state
  const [theme, setTheme] = useState('system')
  const [language, setLanguage] = useState('ru')
  const [timezone, setTimezone] = useState('UTC')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  
  // API keys form state
  const [openRouterKey, setOpenRouterKey] = useState('')
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: fetchUserSettings,
    enabled: !authLoading,
  })

  // Initialize form values from API
  useEffect(() => {
    if (settings) {
      setFullName(settings.profile.full_name || '')
      setEmail(settings.profile.email)
      setTheme(settings.preferences.theme)
      setLanguage(settings.preferences.language)
      setTimezone(settings.preferences.timezone)
      setNotificationsEnabled(settings.preferences.notifications_enabled)
      setOpenRouterKey(settings.api_keys.openrouter_api_key || '')
    }
  }, [settings])

  const updateProfileMutation = useMutation({
    mutationFn: () => updateProfile(fullName || null, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      alert('Профиль обновлён')
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Ошибка при обновлении профиля')
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      alert('Пароль изменён')
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Ошибка при изменении пароля')
    },
  })

  const updatePreferencesMutation = useMutation({
    mutationFn: () => updatePreferences({ theme, language, timezone, notifications_enabled: notificationsEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
      alert('Настройки обновлены')
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Ошибка при обновлении настроек')
    },
  })

  const updateApiKeysMutation = useMutation({
    mutationFn: () => updateApiKeys(openRouterKey || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
      alert('API ключи обновлены')
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Ошибка при обновлении API ключей')
    },
  })

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      alert('Пароли не совпадают')
      return
    }
    if (newPassword.length < 8) {
      alert('Пароль должен быть не менее 8 символов')
      return
    }
    changePasswordMutation.mutate()
  }

  if (authLoading || settingsLoading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-white">
          Настройки пользователя
        </h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="flex space-x-8">
            {(['profile', 'preferences', 'api-keys', 'organizations'] as const).map((tab) => (
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
                {tab === 'preferences' && 'Предпочтения'}
                {tab === 'api-keys' && 'API Ключи'}
                {tab === 'organizations' && 'Организации'}
              </button>
            ))}
          </nav>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
                Профиль
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Полное имя
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Роль
                  </label>
                  <input
                    type="text"
                    value={settings?.profile.role || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                  />
                </div>

                <button
                  onClick={() => updateProfileMutation.mutate()}
                  disabled={updateProfileMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
                >
                  {updateProfileMutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Изменить пароль
              </h3>
              
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Текущий пароль
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Новый пароль
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Подтвердите новый пароль
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
                >
                  {changePasswordMutation.isPending ? 'Изменение...' : 'Изменить пароль'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Предпочтения
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Тема
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="system">Системная</option>
                  <option value="light">Светлая</option>
                  <option value="dark">Тёмная</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Язык
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Часовой пояс
                </label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="UTC"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="notifications"
                  checked={notificationsEnabled}
                  onChange={(e) => setNotificationsEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="notifications" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Включить уведомления
                </label>
              </div>

              <button
                onClick={() => updatePreferencesMutation.mutate()}
                disabled={updatePreferencesMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
              >
                {updatePreferencesMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              API Ключи
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  OpenRouter API Key
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
              </div>

              <button
                onClick={() => updateApiKeysMutation.mutate()}
                disabled={updateApiKeysMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
              >
                {updateApiKeysMutation.isPending ? 'Сохранение...' : 'Сохранить API ключи'}
              </button>
            </div>
          </div>
        )}

        {/* Organizations Tab */}
        {activeTab === 'organizations' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Организации
            </h2>
            
            {settings?.organizations && settings.organizations.length > 0 ? (
              <div className="space-y-3">
                {settings.organizations.map((org) => (
                  <div
                    key={org.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {org.name}
                        </h3>
                        <div className="flex gap-2 mt-2">
                          {org.is_personal && (
                            <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
                              Личная
                            </span>
                          )}
                          {org.role && (
                            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                              {org.role === 'org_admin' ? 'Администратор' : 'Пользователь'}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                        disabled
                      >
                        Переключиться
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">Нет организаций</p>
            )}
            
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Управление организациями будет доступно в следующей версии.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

