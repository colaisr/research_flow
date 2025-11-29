'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useRequireAuth, useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'
import axios from 'axios'
import {
  fetchProviderCredentials,
  updateProviderCredential,
  getProviderApiKey,
  ProviderCredential,
  UpdateProviderCredentialRequest,
} from '@/lib/api/admin-provider-credentials'
import {
  fetchPricing,
  updateModelPricing,
  ModelPricing,
  UpdatePricingRequest,
} from '@/lib/api/admin-pricing'


// Users Management Tab Component
import {
  fetchUserSubscription,
  updateUserSubscription,
  fetchSubscriptionPlans,
  UserSubscription,
  SubscriptionPlan,
} from '@/lib/api/admin-subscriptions'

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

interface ListUsersParams {
  role?: string
  organization_id?: number
  status?: string
  search?: string
  limit?: number
  offset?: number
}

interface Organization {
  id: number
  name: string
  slug: string | null
  is_personal: boolean
  owner_id: number | null
  created_at: string | null
}

async function fetchOrganizations() {
  const { data } = await apiClient.get<Organization[]>(
    `${API_BASE_URL}/api/admin/organizations`,
    { withCredentials: true }
  )
  return data
}

async function fetchUsers(params: ListUsersParams = {}) {
  const queryParams = new URLSearchParams()
  if (params.role) queryParams.append('role', params.role)
  if (params.organization_id) queryParams.append('organization_id', params.organization_id.toString())
  if (params.status) queryParams.append('status', params.status)
  if (params.search) queryParams.append('search', params.search)
  if (params.limit) queryParams.append('limit', params.limit.toString())
  if (params.offset) queryParams.append('offset', params.offset.toString())

  const { data } = await apiClient.get<UserListItem[]>(
    `${API_BASE_URL}/api/admin/users?${queryParams.toString()}`,
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
  const [organizationFilter, setOrganizationFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set())

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: organizations = [] } = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: fetchOrganizations
  })

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users', roleFilter, statusFilter, organizationFilter, debouncedSearch],
    queryFn: () => fetchUsers({
      role: roleFilter || undefined,
      status: statusFilter || undefined,
      organization_id: organizationFilter ? parseInt(organizationFilter) : undefined,
      search: debouncedSearch || undefined,
      limit: 100,
      offset: 0
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
    if (confirm(`Change role of ${user.email} to ${newRole}?`)) {
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

  const toggleUserExpanded = (userId: number) => {
    setExpandedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'org_admin':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'org_user':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        Управление пользователями
      </h2>
        <p className="text-gray-600 dark:text-gray-400">
        Просмотр и управление всеми пользователями платформы
      </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Поиск
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Email или имя..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Роль
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Все роли</option>
              <option value="admin">Platform Admin</option>
              <option value="user">User</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Организация
            </label>
            <select
              value={organizationFilter}
              onChange={(e) => setOrganizationFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Все организации</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id.toString()}>
                  {org.name} {org.is_personal ? '(Личная)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Статус
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
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
                setOrganizationFilter('')
                setSearchQuery('')
              }}
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Сбросить
            </button>
          </div>
        </div>
      </div>

      {/* Users List */}
        {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Загрузка пользователей...</p>
        </div>
        ) : users.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">Пользователи не найдены</p>
        </div>
      ) : (
        <div className="space-y-4">
                {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              isExpanded={expandedUsers.has(user.id)}
              onToggleExpand={() => toggleUserExpanded(user.id)}
              onToggleActive={handleToggleActive}
              onChangeRole={handleChangeRole}
              onImpersonate={handleImpersonate}
              getRoleBadgeColor={getRoleBadgeColor}
              router={router}
              queryClient={queryClient}
            />
          ))}
                          </div>
                        )}
                          </div>
  )
}

interface UserCardProps {
  user: UserListItem
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleActive: (user: UserListItem) => void
  onChangeRole: (user: UserListItem, role: string) => void
  onImpersonate: (user: UserListItem) => void
  getRoleBadgeColor: (role: string) => string
  router: any
  queryClient: any
}

function UserCard({
  user,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  onChangeRole,
  onImpersonate,
  getRoleBadgeColor,
  router,
  queryClient,
}: UserCardProps) {
  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ['admin', 'user', user.id, 'subscription'],
    queryFn: () => fetchUserSubscription(user.id),
    enabled: isExpanded,
    retry: false,
  })


  const { data: plans = [] } = useQuery({
    queryKey: ['admin', 'subscription-plans'],
    queryFn: fetchSubscriptionPlans,
    enabled: isExpanded,
  })

  const updateSubscriptionMutation = useMutation({
    mutationFn: (updates: any) => updateUserSubscription(user.id, updates),
    onSuccess: async (data) => {
      // Update the cache directly with the returned data first
      queryClient.setQueryData(['admin', 'user', user.id, 'subscription'], data)
      // Then invalidate and refetch to ensure consistency
      await queryClient.invalidateQueries({ queryKey: ['admin', 'user', user.id, 'subscription'] })
      await queryClient.refetchQueries({ 
        queryKey: ['admin', 'user', user.id, 'subscription'],
        exact: true 
      })
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Ошибка при обновлении подписки')
    },
  })

  const [editingSubscriptionTokens, setEditingSubscriptionTokens] = useState(false)
  const [editingBalanceTokens, setEditingBalanceTokens] = useState(false)
  const [newSubscriptionTokens, setNewSubscriptionTokens] = useState('')
  const [newBalanceTokens, setNewBalanceTokens] = useState('')
  const [addTokensAmount, setAddTokensAmount] = useState('')
  const [newPlanId, setNewPlanId] = useState<number | null>(null)

  useEffect(() => {
    if (subscription) {
      setNewSubscriptionTokens(subscription.tokens_used_this_period.toString())
      setNewBalanceTokens(subscription.token_balance.toString())
      setNewPlanId(subscription.plan_id)
    }
  }, [subscription])

  const handleSaveSubscriptionTokens = () => {
    const value = parseInt(newSubscriptionTokens)
    if (isNaN(value) || value < 0) {
      alert('Введите корректное число (>= 0)')
      return
    }
    updateSubscriptionMutation.mutate({ set_tokens_used: value })
    setEditingSubscriptionTokens(false)
  }

  const handleSaveBalanceTokens = () => {
    const value = parseInt(newBalanceTokens)
    if (isNaN(value)) {
      alert('Введите корректное число')
      return
    }
    updateSubscriptionMutation.mutate({ set_token_balance: value })
    setEditingBalanceTokens(false)
  }

  const handleAddTokens = () => {
    const amount = parseInt(addTokensAmount)
    if (!amount || amount <= 0) {
      alert('Введите корректное количество токенов')
      return
    }
    updateSubscriptionMutation.mutate({ add_tokens: amount })
    setAddTokensAmount('')
  }

  const handleChangePlan = () => {
    if (!newPlanId || newPlanId === subscription?.plan_id) return
    updateSubscriptionMutation.mutate({ plan_id: newPlanId })
  }

  const handleResetPeriod = () => {
    if (!confirm('Сбросить период подписки? Это обновит даты начала и конца периода.')) return
    updateSubscriptionMutation.mutate({ reset_period: true })
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ru-RU').format(num)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all hover:shadow-md">
      {/* User Header - Always Visible */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Avatar */}
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg ${
              user.is_active ? 'bg-blue-600' : 'bg-gray-400'
            }`}>
              {(user.full_name || user.email).charAt(0).toUpperCase()}
                      </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {user.full_name || user.email}
                </h3>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                  {user.role === 'admin' ? 'Admin' : 'User'}
                </span>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        user.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                        {user.is_active ? 'Активен' : 'Неактивен'}
                      </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{user.email}</p>
            </div>

            {/* Quick Stats */}
            {subscription && !subscriptionLoading && (
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-gray-500 dark:text-gray-400 text-xs">Подписка</div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {subscription.plan_display_name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500 dark:text-gray-400 text-xs">Токены</div>
                  <div className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatNumber(subscription.tokens_remaining + subscription.token_balance)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Expand/Collapse Icon */}
          <div className="flex-shrink-0 ml-4">
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          {subscriptionLoading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Загрузка подписки...</p>
            </div>
          ) : subscription ? (
            <div className="p-6 space-y-6">
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                        <button
                  onClick={() => onToggleActive(user)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            user.is_active
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                          }`}
                        >
                          {user.is_active ? 'Деактивировать' : 'Активировать'}
                        </button>
                        <select
                          value={user.role}
                  onChange={(e) => onChangeRole(user, e.target.value)}
                  className="px-4 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="user">User</option>
                  <option value="admin">Admin</option>
                        </select>
                        <button
                  onClick={() => onImpersonate(user)}
                  className="px-4 py-2 bg-purple-100 text-purple-700 rounded-md text-sm font-medium hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 transition-colors"
                >
                  Войти как пользователь
                </button>
                <button
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 transition-colors"
                >
                  Подробнее
                        </button>
                      </div>

              {/* Subscription Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">План</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {subscription.plan_display_name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {subscription.status === 'trial' && subscription.trial_days_remaining != null
                      ? `Пробный период (${subscription.trial_days_remaining} дней)`
                      : subscription.status === 'active'
                      ? 'Активная подписка'
                      : subscription.status === 'cancelled'
                      ? 'Отменена'
                      : subscription.status === 'expired'
                      ? 'Истекла'
                      : subscription.status}
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Токены из подписки</div>
                  <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    {formatNumber(subscription.tokens_remaining)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    из {formatNumber(subscription.tokens_allocated)}
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Токены на балансе</div>
                  <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {formatNumber(subscription.token_balance)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Из пакетов
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Всего доступно</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatNumber(subscription.tokens_remaining + subscription.token_balance)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {subscription.status === 'trial' && 
                     subscription.trial_days_remaining !== null && 
                     subscription.trial_days_remaining !== undefined
                      ? `${subscription.trial_days_remaining} дней до окончания пробного периода`
                      : `${subscription.days_remaining_in_period} дней до обновления`}
                  </div>
                </div>
              </div>

              {/* Token Management */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Управление токенами</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Subscription Tokens */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Использовано токенов из подписки
                    </label>
                    {editingSubscriptionTokens ? (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={newSubscriptionTokens}
                          onChange={(e) => setNewSubscriptionTokens(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                          min="0"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveSubscriptionTokens}
                          disabled={updateSubscriptionMutation.isPending}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={() => {
                            setEditingSubscriptionTokens(false)
                            setNewSubscriptionTokens(subscription.tokens_used_this_period.toString())
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-900 dark:text-white">
                          {formatNumber(subscription.tokens_used_this_period)} / {formatNumber(subscription.tokens_allocated)}
                        </span>
                        <button
                          onClick={() => setEditingSubscriptionTokens(true)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm"
                        >
                          Изменить
                        </button>
                      </div>
                    )}
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(subscription.tokens_used_percent, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Balance Tokens */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Токены на балансе
                    </label>
                    {editingBalanceTokens ? (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={newBalanceTokens}
                          onChange={(e) => setNewBalanceTokens(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveBalanceTokens}
                          disabled={updateSubscriptionMutation.isPending}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={() => {
                            setEditingBalanceTokens(false)
                            setNewBalanceTokens(subscription.token_balance.toString())
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-900 dark:text-white">
                          {formatNumber(subscription.token_balance)}
                        </span>
                        <button
                          onClick={() => setEditingBalanceTokens(true)}
                          className="text-green-600 hover:text-green-800 dark:text-green-400 text-sm"
                        >
                          Изменить
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Из приобретённых пакетов
                    </p>
                  </div>
                </div>

                {/* Add Tokens */}
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Добавить токены на баланс
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={addTokensAmount}
                      onChange={(e) => setAddTokensAmount(e.target.value)}
                      placeholder="Количество токенов"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                      min="1"
                    />
                    <button
                      onClick={handleAddTokens}
                      disabled={updateSubscriptionMutation.isPending || !addTokensAmount}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              </div>

              {/* Subscription Management */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Управление подпиской</h3>
                
                <div className="space-y-4">
                  {/* Change Plan */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Изменить план
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={newPlanId || subscription.plan_id}
                        onChange={(e) => setNewPlanId(parseInt(e.target.value))}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                        disabled={updateSubscriptionMutation.isPending}
                      >
                        {plans
                          .filter((p) => p.is_active)
                          .map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.display_name} ({formatNumber(plan.monthly_tokens)} токенов/мес)
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleChangePlan}
                        disabled={updateSubscriptionMutation.isPending || newPlanId === subscription.plan_id}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        Изменить
                      </button>
                    </div>
                  </div>

                  {/* Reset Period */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Период подписки
                    </label>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {formatDate(subscription.period_start_date)} - {formatDate(subscription.period_end_date)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {subscription.status === 'trial' && 
                           subscription.trial_days_remaining !== null && 
                           subscription.trial_days_remaining !== undefined
                            ? `Пробный период: ${subscription.trial_days_remaining} дней осталось (до ${subscription.trial_ends_at ? formatDate(subscription.trial_ends_at) : 'N/A'})`
                            : `Осталось дней: ${subscription.days_remaining_in_period}`}
                        </p>
                      </div>
                      <button
                        onClick={handleResetPeriod}
                        disabled={updateSubscriptionMutation.isPending}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
                      >
                        Сбросить период
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Нет активной подписки
          </div>
        )}
      </div>
      )}
    </div>
  )
}

// Provider Credentials Tab Component
function ProviderSection({
  credential,
  onUpdate,
  isUpdating,
}: {
  credential: ProviderCredential
  onUpdate: (updates: UpdateProviderCredentialRequest) => void
  isUpdating: boolean
}) {
  const [localState, setLocalState] = useState({
    apiKey: '', // Current API key (will be loaded)
    baseUrl: credential.base_url,
    isActive: credential.is_active,
    showApiKey: false,
    isLoadingApiKey: true, // Start loading the actual key
    originalApiKey: null as string | null, // Store original to detect changes
  })

  // Load actual API key on mount
  useEffect(() => {
    const loadApiKey = async () => {
      if (credential.api_key_encrypted) {
        try {
          const result = await getProviderApiKey(credential.provider)
          setLocalState((prev) => ({
            ...prev,
            apiKey: result.api_key || '',
            originalApiKey: result.api_key || null,
            isLoadingApiKey: false,
          }))
        } catch (error) {
          console.error('Failed to fetch API key:', error)
          setLocalState((prev) => ({ ...prev, isLoadingApiKey: false }))
        }
      } else {
        setLocalState((prev) => ({ ...prev, isLoadingApiKey: false }))
      }
    }
    loadApiKey()
  }, [credential.provider, credential.api_key_encrypted])

  const hasChanges =
    localState.apiKey !== localState.originalApiKey ||
    localState.baseUrl !== credential.base_url ||
    localState.isActive !== credential.is_active

  const handleSave = () => {
    const updates: UpdateProviderCredentialRequest = {}
    if (localState.apiKey !== localState.originalApiKey) {
      updates.api_key_encrypted = localState.apiKey || null
    }
    if (localState.baseUrl !== credential.base_url) {
      updates.base_url = localState.baseUrl
    }
    if (localState.isActive !== credential.is_active) {
      updates.is_active = localState.isActive
    }
    onUpdate(updates)
    // Update original after save
    setLocalState((prev) => ({ ...prev, originalApiKey: prev.apiKey }))
  }

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
            {credential.display_name}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Provider: {credential.provider}</p>
        </div>
        <span
          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(
            credential.is_active
          )}`}
        >
          {credential.is_active ? 'Активен' : 'Неактивен'}
        </span>
      </div>

      <div className="space-y-4">
        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API ключ
          </label>
          <div className="relative">
            <input
              type={localState.showApiKey ? 'text' : 'password'}
              value={localState.isLoadingApiKey ? 'Загрузка...' : localState.apiKey}
              onChange={(e) => setLocalState((prev) => ({ ...prev, apiKey: e.target.value }))}
              disabled={localState.isLoadingApiKey}
              placeholder="Введите API ключ"
              className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white disabled:opacity-50"
            />
            <button
              onClick={() => setLocalState((prev) => ({ ...prev, showApiKey: !prev.showApiKey }))}
              disabled={localState.isLoadingApiKey}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
              type="button"
            >
              {localState.showApiKey ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Base URL
          </label>
          <input
            type="text"
            value={localState.baseUrl}
            onChange={(e) => setLocalState((prev) => ({ ...prev, baseUrl: e.target.value }))}
            placeholder="https://api.example.com"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Active Toggle */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={localState.isActive}
              onChange={(e) => setLocalState((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Провайдер активен
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isUpdating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdating ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          )}
        </div>

        {/* Metadata */}
        {(credential.created_at || credential.updated_at) && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              {credential.created_at && (
                <div>Создано: {new Date(credential.created_at).toLocaleString('ru-RU')}</div>
              )}
              {credential.updated_at && (
                <div>Обновлено: {new Date(credential.updated_at).toLocaleString('ru-RU')}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProvidersManagementTab({ queryClient }: { queryClient: any }) {
  const [updatingProvider, setUpdatingProvider] = useState<string | null>(null)

  const { data: credentials = [], isLoading: credentialsLoading } = useQuery({
    queryKey: ['admin', 'provider-credentials'],
    queryFn: fetchProviderCredentials,
  })

  const updateMutation = useMutation({
    mutationFn: ({
      provider,
      updates,
    }: {
      provider: string
      updates: UpdateProviderCredentialRequest
    }) => updateProviderCredential(provider, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'provider-credentials'] })
      setUpdatingProvider(null)
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Ошибка при обновлении учетных данных')
      setUpdatingProvider(null)
    },
  })

  const handleUpdate = (provider: string, updates: UpdateProviderCredentialRequest) => {
    setUpdatingProvider(provider)
    updateMutation.mutate({ provider, updates })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
        Управление учетными данными провайдеров
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Настройка API ключей и параметров подключения для провайдеров AI моделей
      </p>

      {credentialsLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : credentials.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Провайдеры не найдены
        </div>
      ) : (
        <div>
          {credentials.map((credential) => (
            <ProviderSection
              key={credential.id}
              credential={credential}
              onUpdate={(updates) => handleUpdate(credential.provider, updates)}
              isUpdating={updatingProvider === credential.provider}
            />
          ))}
        </div>
      )}
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







// Models functions
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


// Data Sources functions


export default function AdminSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoading: authLoading } = useRequireAuth()
  const { isPlatformAdmin, isLoading: authUserLoading } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'users' | 'llm-providers' | 'models' | 'pricing' | 'features'>('users')
  
  
  // Models state
  const [modelSearch, setModelSearch] = useState('')
  const [modelProviderFilter, setModelProviderFilter] = useState<'all' | string>('all')
  const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false)
  const [showEnabledOnly, setShowEnabledOnly] = useState(false)
  


  // Models queries - only load when models tab is active
  const { data: models = [], isLoading: modelsLoading } = useQuery({
    queryKey: ['settings', 'models'],
    queryFn: fetchModels,
    enabled: !authLoading && isPlatformAdmin && activeTab === 'models',
    staleTime: 5 * 60 * 1000,
  })


  // Data Sources queries - only load when data-sources tab is active


  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && !isPlatformAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isPlatformAdmin, router])




  // Models mutations
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'pricing'] })
      const pricingMsg = data.pricing_synced ? `, обновлено ${data.pricing_synced} записей цен` : ''
      alert(`Успешно! Добавлено ${data.added} новых моделей, ${data.skipped} уже существовало${pricingMsg}.`)
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.detail || error.message || 'Ошибка синхронизации'
      alert(`Ошибка синхронизации моделей и цен: ${errorMsg}`)
    },
  })


  // Data Sources mutations


  // Filter functions
  const filteredModels = models.filter((model) => {
    const searchLower = modelSearch.toLowerCase().trim()
    let matchesSearch = false
    
    if (searchLower) {
      // Normalize search: replace spaces with hyphens for matching (handles "gpt-5 mini" -> "gpt-5-mini")
      const searchNormalized = searchLower.replace(/\s+/g, '-')
      const searchNormalizedSpaces = searchLower.replace(/-/g, ' ')
      
      // Handle "Provider: Model Name" format (e.g., "OpenAI: GPT-5 Mini")
      if (searchLower.includes(':')) {
        const [providerPart, modelPart] = searchLower.split(':').map(s => s.trim())
        const modelPartNormalized = modelPart.replace(/\s+/g, '-')
        const modelPartSpaces = modelPart.replace(/-/g, ' ')
        
        // Check if provider part matches the model name prefix (e.g., "openai" in "openai/gpt-5-mini")
        // OR matches the actual provider field
        const modelNameLower = model.name.toLowerCase()
        const providerMatches = modelNameLower.startsWith(providerPart + '/') ||
                               model.provider.toLowerCase().includes(providerPart)
        
        const modelMatches = model.name.toLowerCase().includes(modelPart) ||
                            model.name.toLowerCase().includes(modelPartNormalized) ||
                            model.name.toLowerCase().includes(modelPartSpaces) ||
                            model.display_name.toLowerCase().includes(modelPart) ||
                            model.display_name.toLowerCase().includes(modelPartNormalized) ||
                            model.display_name.toLowerCase().includes(modelPartSpaces) ||
                            (model.description && model.description.toLowerCase().includes(modelPart)) ||
                            (model.description && model.description.toLowerCase().includes(modelPartNormalized)) ||
                            (model.description && model.description.toLowerCase().includes(modelPartSpaces))
        matchesSearch = providerMatches && modelMatches
      } else {
        // Regular search - check all fields with normalized versions
        matchesSearch = model.name.toLowerCase().includes(searchLower) ||
                       model.name.toLowerCase().includes(searchNormalized) ||
                       model.name.toLowerCase().includes(searchNormalizedSpaces) ||
                       model.display_name.toLowerCase().includes(searchLower) ||
                       model.display_name.toLowerCase().includes(searchNormalized) ||
                       model.display_name.toLowerCase().includes(searchNormalizedSpaces) ||
                       model.provider.toLowerCase().includes(searchLower) ||
                       (model.description && model.description.toLowerCase().includes(searchLower)) ||
                       (model.description && model.description.toLowerCase().includes(searchNormalized)) ||
                       (model.description && model.description.toLowerCase().includes(searchNormalizedSpaces))
      }
    } else {
      matchesSearch = true // No search query means show all
    }
    
    const matchesProvider = modelProviderFilter === 'all' || model.provider === modelProviderFilter
    const matchesFreeFilter = !showFreeModelsOnly || model.name.toLowerCase().includes(':free') || 
                              model.name.toLowerCase().includes('free') ||
                              model.display_name.toLowerCase().includes('free')
    const matchesEnabledFilter = !showEnabledOnly || model.is_enabled
    return matchesSearch && matchesProvider && matchesFreeFilter && matchesEnabledFilter
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
            {(['users', 'llm-providers', 'models', 'pricing'] as const).map((tab) => (
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
                {tab === 'llm-providers' && 'LLM провайдеры'}
                {tab === 'models' && 'Модели и инструменты'}
                {tab === 'pricing' && 'Управление ценами'}
              </button>
            ))}
          </nav>
        </div>


        {/* Users Tab */}
        {activeTab === 'users' && <UsersManagementTab router={router} queryClient={queryClient} />}

        {/* LLM Providers Tab */}
        {activeTab === 'llm-providers' && <ProvidersManagementTab queryClient={queryClient} />}

        {/* Models Tab */}
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
                  {syncModelsMutation.isPending ? 'Синхронизация...' : 'Синхронизировать модели и цены'}
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

          </div>
        )}

        {/* Pricing Tab */}
        {activeTab === 'pricing' && <PricingManagementTab queryClient={queryClient} />}

                    </div>
                  </div>
  )
}

// Pricing Management Components (moved from pricing/page.tsx)
const EXCHANGE_RATE_USD_TO_RUB = 90.0

const PROVIDERS = ['openrouter', 'gemini'] as const
type Provider = typeof PROVIDERS[number]

function convertUsdToRub(usd: number): number {
  return usd * EXCHANGE_RATE_USD_TO_RUB
}

function convertRubToUsd(rub: number): number {
  return rub / EXCHANGE_RATE_USD_TO_RUB
}

function calculateAverageCost(inputCost: number, outputCost: number): number {
  return (inputCost + outputCost) / 2
}

function calculateUserPrice(
  avgCostUsd: number,
  platformFeePercent: number
): number {
  return avgCostUsd * (1 + platformFeePercent / 100)
}

interface PricingEditorProps {
  model: ModelPricing
  onUpdate: (updates: UpdatePricingRequest) => void
  isUpdating: boolean
}

function PricingEditor({ model, onUpdate, isUpdating }: PricingEditorProps) {
  const [localState, setLocalState] = useState({
    costInputRub: convertUsdToRub(model.cost_per_1k_input_usd).toFixed(6),
    costOutputRub: convertUsdToRub(model.cost_per_1k_output_usd).toFixed(6),
    platformFee: Number(model.platform_fee_percent).toFixed(2),
    priceRub: convertUsdToRub(model.price_per_1k_usd).toFixed(6),
    isActive: model.is_active,
    isVisible: model.is_visible,
  })

  const avgCostUsd = useMemo(() => {
    return calculateAverageCost(
      parseFloat(localState.costInputRub) / EXCHANGE_RATE_USD_TO_RUB,
      parseFloat(localState.costOutputRub) / EXCHANGE_RATE_USD_TO_RUB
    )
  }, [localState.costInputRub, localState.costOutputRub])

  const calculatedPriceUsd = useMemo(() => {
    return calculateUserPrice(avgCostUsd, parseFloat(localState.platformFee))
  }, [avgCostUsd, localState.platformFee])

  const handleSave = () => {
    const updates: UpdatePricingRequest = {
      cost_per_1k_input_usd: convertRubToUsd(parseFloat(localState.costInputRub)),
      cost_per_1k_output_usd: convertRubToUsd(parseFloat(localState.costOutputRub)),
      platform_fee_percent: parseFloat(localState.platformFee),
      price_per_1k_usd: calculatedPriceUsd,
      is_active: localState.isActive,
      is_visible: localState.isVisible,
    }
    onUpdate(updates)
  }

  const handleRecalculatePrice = () => {
    setLocalState((prev) => ({
      ...prev,
      priceRub: convertUsdToRub(calculatedPriceUsd).toFixed(6),
    }))
  }

  const hasChanges =
    Math.abs(parseFloat(localState.costInputRub) - convertUsdToRub(model.cost_per_1k_input_usd)) >
      0.000001 ||
    Math.abs(parseFloat(localState.costOutputRub) - convertUsdToRub(model.cost_per_1k_output_usd)) >
      0.000001 ||
    Math.abs(parseFloat(localState.platformFee) - Number(model.platform_fee_percent)) > 0.01 ||
    Math.abs(parseFloat(localState.priceRub) - convertUsdToRub(model.price_per_1k_usd)) >
      0.000001 ||
    localState.isActive !== model.is_active ||
    localState.isVisible !== model.is_visible

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{model.model_name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Provider: {model.provider}</p>
                    </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
              checked={localState.isActive}
              onChange={(e) =>
                setLocalState((prev) => ({ ...prev, isActive: e.target.checked }))
              }
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Активна</span>
                              </label>
          <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
              checked={localState.isVisible}
                          onChange={(e) =>
                setLocalState((prev) => ({ ...prev, isVisible: e.target.checked }))
                          }
              className="rounded"
                        />
            <span className="text-sm text-gray-700 dark:text-gray-300">Видима</span>
                      </label>
                    </div>
                  </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Стоимость ввода (₽ за 1K)
          </label>
          <input
            type="number"
            step="0.000001"
            value={localState.costInputRub}
            onChange={(e) =>
              setLocalState((prev) => ({ ...prev, costInputRub: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
              </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Стоимость вывода (₽ за 1K)
          </label>
          <input
            type="number"
            step="0.000001"
            value={localState.costOutputRub}
            onChange={(e) =>
              setLocalState((prev) => ({ ...prev, costOutputRub: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
          </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Средняя стоимость (₽ за 1K)
          </label>
          <input
            type="text"
            value={convertUsdToRub(avgCostUsd).toFixed(6)}
            readOnly
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white bg-gray-50 dark:bg-gray-800"
          />
        </div>

                <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Комиссия платформы (%)
                  </label>
                    <input
            type="number"
            step="0.01"
            value={localState.platformFee}
            onChange={(e) =>
              setLocalState((prev) => ({ ...prev, platformFee: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Цена для пользователя (₽ за 1K)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.000001"
              value={localState.priceRub}
              onChange={(e) =>
                setLocalState((prev) => ({ ...prev, priceRub: e.target.value }))
              }
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    />
                    <button
              onClick={handleRecalculatePrice}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
              title="Пересчитать на основе стоимости и комиссии"
            >
              ↻
                    </button>
                  </div>
        </div>
                </div>

      {hasChanges && (
        <div className="mt-4 flex justify-end">
                <button
            onClick={handleSave}
            disabled={isUpdating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
      )}
            </div>
  )
}

interface ProviderPricingTabProps {
  provider: Provider
  models: ModelPricing[]
  onUpdateModel: (modelId: number, updates: UpdatePricingRequest) => void
}

function ProviderPricingTab({
  provider,
  models,
  onUpdateModel,
}: ProviderPricingTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showActiveOnly, setShowActiveOnly] = useState(false)

  const filteredModels = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim()
    
    if (!searchLower) {
      return models.filter((model) => {
        const matchesActive = showActiveOnly ? model.is_active : true
        return matchesActive
      })
    }
    
    return models.filter((model) => {
      let matchesSearch = false
      
      // Normalize search: replace spaces with hyphens for matching (handles "gpt-5 mini" -> "gpt-5-mini")
      const searchNormalized = searchLower.replace(/\s+/g, '-')
      const searchNormalizedSpaces = searchLower.replace(/-/g, ' ')
      
      // Handle "Provider: Model Name" format (e.g., "OpenAI: GPT-5 Mini")
      if (searchLower.includes(':')) {
        const [providerPart, modelPart] = searchLower.split(':').map(s => s.trim())
        const modelPartNormalized = modelPart.replace(/\s+/g, '-')
        const modelPartSpaces = modelPart.replace(/-/g, ' ')
        
        // Search in model_name (e.g., "openai/gpt-5-mini")
        const modelNameLower = model.model_name.toLowerCase()
        // Search in display_name if available (e.g., "GPT-5 Mini")
        const displayNameLower = (model.display_name || '').toLowerCase()
        // Extract model name without provider prefix
        const modelNameOnly = modelNameLower.includes('/') ? modelNameLower.split('/').pop() || '' : modelNameLower
        
        // Check if provider part matches the model name prefix (e.g., "openai" in "openai/gpt-5-mini")
        // OR matches the actual provider field (e.g., "openrouter")
        const providerMatches = modelNameLower.startsWith(providerPart + '/') ||
                               model.provider.toLowerCase().includes(providerPart)
        
        const modelMatches = modelNameLower.includes(modelPart) ||
                            modelNameLower.includes(modelPartNormalized) ||
                            modelNameLower.includes(modelPartSpaces) ||
                            displayNameLower.includes(modelPart) ||
                            displayNameLower.includes(modelPartNormalized) ||
                            displayNameLower.includes(modelPartSpaces) ||
                            modelNameOnly.includes(modelPart) ||
                            modelNameOnly.includes(modelPartNormalized) ||
                            modelNameOnly.includes(modelPartSpaces)
        
        matchesSearch = providerMatches && modelMatches
      } else {
        // Regular search - check all fields with normalized versions
        const modelNameLower = model.model_name.toLowerCase()
        const displayNameLower = (model.display_name || '').toLowerCase()
        const modelNameOnly = modelNameLower.includes('/') ? modelNameLower.split('/').pop() || '' : modelNameLower
        
        matchesSearch = 
          modelNameLower.includes(searchLower) ||
          modelNameLower.includes(searchNormalized) ||
          modelNameLower.includes(searchNormalizedSpaces) ||
          displayNameLower.includes(searchLower) ||
          displayNameLower.includes(searchNormalized) ||
          displayNameLower.includes(searchNormalizedSpaces) ||
          modelNameOnly.includes(searchLower) ||
          modelNameOnly.includes(searchNormalized) ||
          modelNameOnly.includes(searchNormalizedSpaces) ||
          model.provider.toLowerCase().includes(searchLower)
      }
      
      const matchesActive = showActiveOnly ? model.is_active : true
      return matchesSearch && matchesActive
    })
  }, [models, searchQuery, showActiveOnly])

  const updatingModels = new Set<number>()

  return (
                <div>
      <div className="mb-4 flex gap-4 items-center">
                    <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию модели..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
        />
        <label className="flex items-center gap-2 whitespace-nowrap">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={(e) => setShowActiveOnly(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Только активные</span>
        </label>
                  </div>

      <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Найдено моделей: {filteredModels.length} из {models.length}
      </div>

      {filteredModels.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Модели не найдены
        </div>
      ) : (
        <div>
          {filteredModels.map((model) => (
            <PricingEditor
              key={model.id}
              model={model}
              onUpdate={(updates) => onUpdateModel(model.id, updates)}
              isUpdating={updatingModels.has(model.id)}
            />
          ))}
        </div>
                  )}
                </div>
  )
}

function PricingManagementTab({ queryClient }: { queryClient: any }) {
  const [activeProvider, setActiveProvider] = useState<Provider>('openrouter')

  const { data: allPricing = [], isLoading: pricingLoading } = useQuery({
    queryKey: ['admin', 'pricing'],
    queryFn: () => fetchPricing(),
  })

  const pricingByProvider = useMemo(() => {
    const grouped: Record<Provider, ModelPricing[]> = {
      openrouter: [],
      gemini: [],
    }
    allPricing.forEach((model) => {
      const provider = model.provider.toLowerCase() as Provider
      if (PROVIDERS.includes(provider)) {
        grouped[provider].push(model)
      }
    })
    return grouped
  }, [allPricing])

  const updateModelMutation = useMutation({
    mutationFn: ({ modelId, updates }: { modelId: number; updates: UpdatePricingRequest }) =>
      updateModelPricing(modelId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pricing'] })
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Ошибка при обновлении цены')
    },
  })

  const handleUpdateModel = (modelId: number, updates: UpdatePricingRequest) => {
    updateModelMutation.mutate({ modelId, updates })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
        Управление ценами моделей
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Настройка цен для моделей AI по провайдерам
      </p>

      {/* Provider Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex space-x-8 overflow-x-auto">
          {PROVIDERS.map((provider) => (
                <button
              key={provider}
              onClick={() => setActiveProvider(provider)}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeProvider === provider
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {provider === 'openrouter' && 'OpenRouter'}
              {provider === 'gemini' && 'Gemini'}
              ({pricingByProvider[provider].length})
                </button>
          ))}
        </nav>
              </div>

      {/* Tab Content */}
      {pricingLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : (
        <ProviderPricingTab
          provider={activeProvider}
          models={pricingByProvider[activeProvider]}
          onUpdateModel={handleUpdateModel}
        />
      )}
    </div>
  )
}


