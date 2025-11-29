'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useRequireAuth, useAuth } from '@/hooks/useAuth'
import { useOrganizations, Organization } from '@/hooks/useOrganizations'
import { useOrganizationContext } from '@/contexts/OrganizationContext'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'
import { useRouter } from 'next/navigation'
import { fetchCurrentSubscription, fetchSubscriptionHistory, Subscription } from '@/lib/api/subscriptions'

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


export default function UserSettingsPage() {
  const { isLoading: authLoading } = useRequireAuth()
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { organizations, switchOrganization, isSwitching, createOrganization, leaveOrganization } = useOrganizations()
  const { currentOrganizationId } = useOrganizationContext()

  const [activeTab, setActiveTab] = useState<'profile' | 'organizations' | 'subscription'>('profile')
  const [showCreateOrgForm, setShowCreateOrgForm] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')

  const handleCreateOrganization = () => {
    if (newOrgName.trim()) {
      createOrganization(newOrgName.trim())
      setNewOrgName('')
      setShowCreateOrgForm(false)
      // Reload to show new organization
      setTimeout(() => {
        window.location.reload()
      }, 500)
    }
  }

  const leaveOrgMutation = useMutation({
    mutationFn: async (organizationId: number) => {
      await leaveOrganization(organizationId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      // Reload to refresh organizations list
      setTimeout(() => {
        window.location.reload()
      }, 500)
    },
  })
  
  // Profile form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  
  // Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  

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
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">
          Настройки пользователя
        </h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {(['profile', 'organizations', 'subscription'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'profile' && 'Профиль'}
                {tab === 'organizations' && 'Организации'}
                {tab === 'subscription' && 'Подписка'}
              </button>
            ))}
          </nav>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-4 text-gray-900">
                Профиль
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Полное имя
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Роль
                  </label>
                  <input
                    type="text"
                    value={settings?.profile.role || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
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

            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-900">
                Изменить пароль
              </h3>
              
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Текущий пароль
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Новый пароль
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Подтвердите новый пароль
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
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

        {/* Organizations Tab */}
        {activeTab === 'organizations' && (
          <div className="space-y-6">
            {/* Pending Invitations */}
            <PendingInvitationsSection />
            
            {/* Organizations List */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-gray-900">
                  Организации
                </h2>
                <button
                  onClick={() => setShowCreateOrgForm(!showCreateOrgForm)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {showCreateOrgForm ? 'Отмена' : '+ Создать организацию'}
                </button>
              </div>

              {/* Create Organization Form */}
              {showCreateOrgForm && (
                <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">
                        Название организации
                      </label>
                      <input
                        type="text"
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        placeholder="Моя компания"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleCreateOrganization}
                      disabled={!newOrgName.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                    >
                      Создать организацию
                    </button>
                    {leaveOrgMutation.isError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-red-700 text-sm">
                          {(leaveOrgMutation.error as any)?.response?.data?.detail || 'Ошибка при выходе из организации'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {organizations && organizations.length > 0 ? (
              <div className="space-y-3">
                {organizations.map((org) => {
                  const isCurrent = org.id === currentOrganizationId
                  return (
                    <div
                      key={org.id}
                      className={`border rounded-lg p-4 ${
                        isCurrent
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {org.name}
                            </h3>
                            {isCurrent && (
                              <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded">
                                Текущая
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {org.is_personal && (
                              <span className="text-xs px-2 py-1 bg-blue-100 rounded text-blue-600">
                                Личная
                              </span>
                            )}
                            {org.role && (
                              <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600">
                                {org.role === 'org_admin' ? 'Администратор' : 'Пользователь'}
                              </span>
                            )}
                            <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600">
                              {org.member_count} {org.member_count === 1 ? 'участник' : 'участников'}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {(org.role === 'org_admin' || user?.role === 'admin') && (
                            <button
                              onClick={() => router.push(`/organizations/${org.id}`)}
                              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-colors"
                            >
                              Управление
                            </button>
                          )}
                          {!org.is_personal && org.role === 'org_user' && (
                            <button
                              onClick={() => {
                                if (confirm(`Вы уверены, что хотите покинуть организацию "${org.name}"?`)) {
                                  leaveOrgMutation.mutate(org.id)
                                }
                              }}
                              disabled={leaveOrgMutation.isPending}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium transition-colors"
                            >
                              {leaveOrgMutation.isPending ? 'Выход...' : 'Покинуть'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              ) : (
                <p className="text-gray-600">Нет организаций</p>
              )}
            </div>
          </div>
        )}

        {/* Subscription Tab */}
        {activeTab === 'subscription' && (
          <SubscriptionTab />
        )}
      </div>
    </div>
  )
}

function SubscriptionTab() {
  const router = useRouter()
  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ['subscription', 'current'],
    queryFn: fetchCurrentSubscription,
  })

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['subscription', 'history'],
    queryFn: () => fetchSubscriptionHistory(10, 0),
  })

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'trial':
        return 'bg-blue-100 text-blue-800'
      case 'expired':
        return 'bg-red-100 text-red-800'
      case 'cancelled':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ru-RU').format(num)
  }

  if (subscriptionLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Загрузка...</p>
      </div>
    )
  }

  if (!subscription) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Подписка не найдена</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900">
          Текущая подписка
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              План
            </label>
            <p className="text-gray-900 font-medium">{subscription.plan_display_name}</p>
            <p className="text-sm text-gray-500">{subscription.plan_name}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Статус
            </label>
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(
                subscription.status
              )}`}
            >
              {subscription.status === 'active' && 'Активна'}
              {subscription.status === 'trial' && 'Пробный период'}
              {subscription.status === 'expired' && 'Истекла'}
              {subscription.status === 'cancelled' && 'Отменена'}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Токены выделено
            </label>
            <p className="text-gray-900 font-medium">{formatNumber(subscription.tokens_allocated)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Токены использовано
            </label>
            <p className="text-gray-900 font-medium">
              {formatNumber(subscription.tokens_used_this_period)} (
              {subscription.tokens_used_percent.toFixed(1)}%)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Токены осталось
            </label>
            <p className="text-gray-900 font-medium">{formatNumber(subscription.tokens_remaining)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Доступно токенов
            </label>
            <p className="text-gray-900 font-medium">{formatNumber(subscription.available_tokens)}</p>
            <p className="text-xs text-gray-500 mt-1">
              (включая баланс)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Период
            </label>
            <p className="text-gray-900">
              {formatDate(subscription.period_start_date)} -{' '}
              {formatDate(subscription.period_end_date)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Осталось дней: {subscription.days_remaining_in_period}
            </p>
          </div>

          {subscription.status === 'trial' && subscription.trial_days_remaining !== null && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Пробный период
              </label>
              <p className="text-gray-900">
                Осталось дней: {subscription.trial_days_remaining}
              </p>
              {subscription.trial_ends_at && (
                <p className="text-sm text-gray-500 mt-1">
                  До: {formatDate(subscription.trial_ends_at)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-4">
          <button
            onClick={() => router.push('/consumption')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Просмотр потребления
          </button>
          <button
            onClick={() => router.push('/subscription/plans')}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            Изменить план
          </button>
          <button
            onClick={() => router.push('/billing')}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Биллинг
          </button>
        </div>
      </div>

      {/* Subscription History */}
      {history && history.subscriptions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900">
            История подписок
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    План
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Период
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Начало
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {history.subscriptions.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.plan_display_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                          item.status
                        )}`}
                      >
                        {item.status === 'active' && 'Активна'}
                        {item.status === 'trial' && 'Пробный период'}
                        {item.status === 'expired' && 'Истекла'}
                        {item.status === 'cancelled' && 'Отменена'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(item.period_start_date)} - {formatDate(item.period_end_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(item.started_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

interface PendingInvitation {
  id: number
  organization_id: number
  organization_name: string
  email: string
  role: string
  invited_by: number
  expires_at: string
  created_at: string
}

async function fetchPendingInvitations(): Promise<PendingInvitation[]> {
  const { data } = await apiClient.get<PendingInvitation[]>(
    `${API_BASE_URL}/api/organizations/invitations/pending`,
    { withCredentials: true }
  )
  return data
}

async function acceptInvitationById(invitationId: number): Promise<Organization> {
  const { data } = await apiClient.post<Organization>(
    `${API_BASE_URL}/api/organizations/invitations/accept`,
    { invitation_id: invitationId },
    { withCredentials: true }
  )
  return data
}

function PendingInvitationsSection() {
  const queryClient = useQueryClient()
  const { organizations } = useOrganizations()
  
  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ['pending-invitations'],
    queryFn: fetchPendingInvitations,
  })

  const acceptMutation = useMutation({
    mutationFn: acceptInvitationById,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] })
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      // Reload to show new organization
      setTimeout(() => {
        window.location.reload()
      }, 500)
    },
  })

  if (isLoading) {
    return null
  }

  if (invitations.length === 0) {
    return null
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">
        Ожидающие приглашения ({invitations.length})
      </h2>
      
      <div className="space-y-3">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="border border-yellow-200 rounded-lg p-4 bg-white"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  Приглашение в: {invitation.organization_name}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Роль: {invitation.role === 'org_admin' ? 'Администратор' : 'Пользователь'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Истекает: {new Date(invitation.expires_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <button
                onClick={() => {
                  acceptMutation.mutate(invitation.id)
                }}
                disabled={acceptMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {acceptMutation.isPending ? 'Принятие...' : 'Принять'}
              </button>
            </div>
            {acceptMutation.isError && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2">
                <p className="text-red-700 text-xs">
                  {(acceptMutation.error as any)?.response?.data?.detail || 'Ошибка при принятии приглашения'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

