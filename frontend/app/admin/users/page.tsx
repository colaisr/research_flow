'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import React from 'react'
import { useRequireAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'
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

export default function UsersPage() {
  useRequireAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [roleFilter, setRoleFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [organizationFilter, setOrganizationFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set())

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: organizations = [] } = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: fetchOrganizations
  })

  const { data: users = [], isLoading, refetch } = useQuery({
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Управление пользователями</h1>
        <p className="text-gray-600 dark:text-gray-400">Просмотр и управление всеми пользователями платформы</p>
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
}

function UserCard({
  user,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  onChangeRole,
  onImpersonate,
  getRoleBadgeColor,
}: UserCardProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  
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

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, updates }: { userId: number; updates: any }) => updateUser(userId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', user.id, 'subscription'] })
    },
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
  const [editingName, setEditingName] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  useEffect(() => {
    if (subscription) {
      setNewSubscriptionTokens(subscription.tokens_used_this_period.toString())
      setNewBalanceTokens(subscription.token_balance.toString())
      setNewPlanId(subscription.plan_id)
    }
  }, [subscription])

  useEffect(() => {
    setNewName(user.full_name || '')
    setNewEmail(user.email)
  }, [user])

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
              {/* User Profile Editing */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Профиль пользователя</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
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
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            updateUserMutation.mutate({
                              userId: user.id,
                              updates: { full_name: newName || null }
                            })
                            setEditingName(false)
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={() => {
                            setEditingName(false)
                            setNewName(user.full_name || '')
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-white">{user.full_name || 'Не указано'}</span>
                        <button
                          onClick={() => setEditingName(true)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm"
                        >
                          Изменить
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Email */}
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
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            updateUserMutation.mutate({
                              userId: user.id,
                              updates: { email: newEmail }
                            })
                            setEditingEmail(false)
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={() => {
                            setEditingEmail(false)
                            setNewEmail(user.email)
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-white">{user.email}</span>
                        <button
                          onClick={() => setEditingEmail(true)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm"
                        >
                          Изменить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

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
              </div>

              {/* Subscription Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">План</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {subscription.plan_display_name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {subscription.status === 'trial' ? 'Пробный период' : 'Активная подписка'}
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
                    {(subscription.status === 'trial' || subscription.is_trial) && 
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
                          {(subscription.status === 'trial' || subscription.is_trial) && 
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
