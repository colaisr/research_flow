'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import React from 'react'
import { useRequireAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'

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
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', 'users', roleFilter, statusFilter, debouncedSearch],
    queryFn: () => fetchUsers({
      role: roleFilter || undefined,
      status: statusFilter || undefined,
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Управление пользователями</h1>
        <p className="text-gray-600 dark:text-gray-400">Просмотр и управление всеми пользователями платформы</p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
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
                          title="Изменить роль"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
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

