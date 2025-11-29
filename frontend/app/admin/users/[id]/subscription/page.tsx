'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
import { fetchConsumptionStats } from '@/lib/api/consumption'

interface UserDetails {
  id: number
  email: string
  full_name: string | null
}

async function fetchUserDetails(userId: number) {
  const { data } = await apiClient.get<UserDetails>(
    `${API_BASE_URL}/api/admin/users/${userId}`,
    { withCredentials: true }
  )
  return data
}

export default function UserSubscriptionPage() {
  const router = useRouter()
  const params = useParams()
  const userId = parseInt(params.id as string)
  const queryClient = useQueryClient()
  useRequireAuth()

  const [newPlanId, setNewPlanId] = useState<number | null>(null)
  const [addTokensAmount, setAddTokensAmount] = useState<string>('')
  const [extendTrialDays, setExtendTrialDays] = useState<string>('')
  const [isUpdating, setIsUpdating] = useState(false)

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => fetchUserDetails(userId),
  })

  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ['admin', 'user', userId, 'subscription'],
    queryFn: () => fetchUserSubscription(userId),
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['admin', 'subscription-plans'],
    queryFn: fetchSubscriptionPlans,
  })

  const { data: consumptionStats } = useQuery({
    queryKey: ['admin', 'user', userId, 'consumption-stats'],
    queryFn: () =>
      fetchConsumptionStats(
        subscription?.period_start_date
          ? new Date(subscription.period_start_date).toISOString()
          : undefined,
        subscription?.period_end_date
          ? new Date(subscription.period_end_date).toISOString()
          : undefined
      ),
    enabled: !!subscription,
  })

  const updateMutation = useMutation({
    mutationFn: (updates: {
      plan_id?: number
      add_tokens?: number
      reset_period?: boolean
      extend_trial_days?: number
    }) => updateUserSubscription(userId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId, 'subscription'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId, 'consumption-stats'] })
      setNewPlanId(null)
      setAddTokensAmount('')
      setExtendTrialDays('')
      setIsUpdating(false)
    },
    onError: (error: any) => {
      alert(error.response?.data?.detail || 'Ошибка при обновлении подписки')
      setIsUpdating(false)
    },
  })

  const handleChangePlan = () => {
    if (!newPlanId || newPlanId === subscription?.plan_id) return
    setIsUpdating(true)
    updateMutation.mutate({ plan_id: newPlanId })
  }

  const handleAddTokens = () => {
    const amount = parseInt(addTokensAmount)
    if (!amount || amount <= 0) {
      alert('Введите корректное количество токенов')
      return
    }
    setIsUpdating(true)
    updateMutation.mutate({ add_tokens: amount })
  }

  const handleResetPeriod = () => {
    if (!confirm('Сбросить период подписки? Это обновит даты начала и конца периода.')) return
    setIsUpdating(true)
    updateMutation.mutate({ reset_period: true })
  }

  const handleExtendTrial = () => {
    const days = parseInt(extendTrialDays)
    if (!days || days <= 0) {
      alert('Введите корректное количество дней')
      return
    }
    if (subscription?.status !== 'trial') {
      alert('Можно продлить только пробный период')
      return
    }
    setIsUpdating(true)
    updateMutation.mutate({ extend_trial_days: days })
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'trial':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'expired':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
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

  if (userLoading || subscriptionLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
      </div>
    )
  }

  if (!subscription) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <button
          onClick={() => router.push(`/admin/users/${userId}`)}
          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mb-4"
        >
          ← Назад к пользователю
        </button>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <p className="text-gray-600 dark:text-gray-400">
            Подписка не найдена для пользователя {user?.email}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <button
        onClick={() => router.push(`/admin/users/${userId}`)}
        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mb-4"
      >
        ← Назад к пользователю
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Управление подпиской
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {user?.full_name || user?.email} ({user?.email})
        </p>
      </div>

      {/* Subscription Details Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Текущая подписка
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              План
            </label>
            <p className="text-gray-900 dark:text-white font-medium">
              {subscription.plan_display_name}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{subscription.plan_name}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Токены выделено
            </label>
            <p className="text-gray-900 dark:text-white font-medium">
              {formatNumber(subscription.tokens_allocated)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Токены использовано
            </label>
            <p className="text-gray-900 dark:text-white font-medium">
              {formatNumber(subscription.tokens_used_this_period)} (
              {subscription.tokens_used_percent.toFixed(1)}%)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Токены осталось
            </label>
            <p className="text-gray-900 dark:text-white font-medium">
              {formatNumber(subscription.tokens_remaining)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Баланс токенов
            </label>
            <p className="text-gray-900 dark:text-white font-medium">
              {formatNumber(subscription.token_balance)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Период
            </label>
            <p className="text-gray-900 dark:text-white">
              {formatDate(subscription.period_start_date)} -{' '}
              {formatDate(subscription.period_end_date)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Осталось дней: {subscription.days_remaining_in_period}
            </p>
          </div>

          {subscription.is_trial && subscription.trial_days_remaining !== null && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Пробный период
              </label>
              <p className="text-gray-900 dark:text-white">
                Осталось дней: {subscription.trial_days_remaining}
              </p>
              {subscription.trial_ends_at && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  До: {formatDate(subscription.trial_ends_at)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Действия</h2>

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
                disabled={isUpdating}
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
                disabled={isUpdating || newPlanId === subscription.plan_id}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Изменить
              </button>
            </div>
          </div>

          {/* Add Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Добавить токены в баланс
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={addTokensAmount}
                onChange={(e) => setAddTokensAmount(e.target.value)}
                placeholder="Количество токенов"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                disabled={isUpdating}
                min="1"
              />
              <button
                onClick={handleAddTokens}
                disabled={isUpdating || !addTokensAmount}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Добавить
              </button>
            </div>
          </div>

          {/* Reset Period */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Сбросить период
            </label>
            <button
              onClick={handleResetPeriod}
              disabled={isUpdating}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Сбросить период подписки
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Обновит даты начала и конца периода, сбросит счетчик использованных токенов
            </p>
          </div>

          {/* Extend Trial */}
          {subscription.status === 'trial' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Продлить пробный период
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={extendTrialDays}
                  onChange={(e) => setExtendTrialDays(e.target.value)}
                  placeholder="Количество дней"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  disabled={isUpdating}
                  min="1"
                />
                <button
                  onClick={handleExtendTrial}
                  disabled={isUpdating || !extendTrialDays}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Продлить
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Consumption Statistics */}
      {consumptionStats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Статистика потребления (текущий период)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Всего токенов
              </label>
              <p className="text-gray-900 dark:text-white font-medium">
                {formatNumber(consumptionStats.total_tokens)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Всего запросов
              </label>
              <p className="text-gray-900 dark:text-white font-medium">
                {formatNumber(consumptionStats.consumption_count)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Стоимость (₽)
              </label>
              <p className="text-gray-900 dark:text-white font-medium">
                ₽{Number(consumptionStats.total_price_rub).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

