'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { fetchConsumptionStats, fetchConsumptionHistory, fetchConsumptionChart } from '@/lib/api/consumption'
import { fetchCurrentSubscription } from '@/lib/api/subscriptions'
import ConsumptionChart from '@/components/ConsumptionChart'
import ConsumptionTable from '@/components/ConsumptionTable'

export default function ConsumptionPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading, isPlatformAdmin, user } = useAuth()
  
  // Show cost column for admins, including when impersonating (only admins can impersonate)
  const showCostColumn = isPlatformAdmin || (user?.is_impersonated === true)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Filters
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [modelName, setModelName] = useState<string>('')
  const [provider, setProvider] = useState<string>('')
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [historyOffset, setHistoryOffset] = useState(0)
  const historyLimit = 50

  // Set default date range (last 30 days)
  useEffect(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    setEndDate(end.toISOString().split('T')[0])
    setStartDate(start.toISOString().split('T')[0])
  }, [])

  // Fetch current subscription
  const { data: subscription } = useQuery({
    queryKey: ['subscription', 'current'],
    queryFn: fetchCurrentSubscription,
    enabled: isAuthenticated,
  })

  // Fetch consumption stats
  const { data: stats } = useQuery({
    queryKey: ['consumption', 'stats', startDate, endDate],
    queryFn: () => fetchConsumptionStats(startDate || undefined, endDate || undefined),
    enabled: isAuthenticated && !!startDate && !!endDate,
  })

  // Fetch consumption history
  const { data: history } = useQuery({
    queryKey: ['consumption', 'history', startDate, endDate, modelName, provider, historyOffset],
    queryFn: () => fetchConsumptionHistory(
      startDate || undefined,
      endDate || undefined,
      modelName || undefined,
      provider || undefined,
      historyLimit,
      historyOffset
    ),
    enabled: isAuthenticated && !!startDate && !!endDate,
  })

  // Fetch chart data
  const { data: chartData } = useQuery({
    queryKey: ['consumption', 'chart', startDate, endDate, groupBy],
    queryFn: () => fetchConsumptionChart(
      startDate,
      endDate,
      groupBy
    ),
    enabled: isAuthenticated && !!startDate && !!endDate,
  })

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Загрузка...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="p-8 space-y-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Потребление токенов</h1>
          {subscription && (
            <>
              {/* Low Token Warning */}
              {subscription.available_tokens > 0 && subscription.tokens_remaining > 0 && 
               (subscription.tokens_remaining / subscription.tokens_allocated) < 0.1 && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-yellow-800 mb-1">
                        Мало токенов в подписке
                      </h3>
                      <p className="text-sm text-yellow-700 mb-3">
                        У вас осталось менее 10% токенов в текущем периоде. 
                        {subscription.token_balance > 0 ? (
                          <> У вас также есть {subscription.token_balance.toLocaleString()} токенов на балансе.</>
                        ) : (
                          <> Рекомендуем приобрести дополнительный пакет токенов.</>
                        )}
                      </p>
                      {subscription.token_balance === 0 && (
                        <button
                          onClick={() => router.push('/billing')}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                        >
                          Купить токены
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* No Tokens Warning (only show if subscription is NOT expired) */}
              {subscription && subscription.status !== 'expired' && subscription.available_tokens === 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-300 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-red-800 mb-1">
                        Токены закончились
                      </h3>
                      <p className="text-sm text-red-700 mb-3">
                        У вас нет доступных токенов. Запросы будут заблокированы до пополнения баланса.
                      </p>
                      <p className="text-xs text-red-600 mb-3">
                        Токены в подписке восстановятся {subscription.period_end_date && new Date(subscription.period_end_date).toLocaleDateString('ru-RU')} или вы можете приобрести дополнительный пакет токенов.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push('/billing')}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                          Купить токены
                        </button>
                        <button
                          onClick={() => router.push('/subscription/plans')}
                          className="px-4 py-2 bg-white text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
                        >
                          Изменить план
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Subscription Expired Warning */}
              {subscription && subscription.status === 'expired' && (
                <div className="mt-4 p-4 bg-red-50 border border-red-300 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-red-800 mb-1">
                        {subscription.is_trial ? 'Ваш пробный период истек' : 'Ваша подписка истекла'}
                      </h3>
                      <p className="text-sm text-red-700 mb-3">
                        {subscription.is_trial 
                          ? 'Выберите тарифный план для продолжения работы с системой'
                          : 'Выберите новый план для продолжения работы'}
                      </p>
                      <button
                        onClick={() => router.push('/subscription/plans')}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                      >
                        Выбрать план
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Subscription Info Card */}
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm text-blue-600 font-medium">
                      {subscription?.plan_display_name || 'N/A'} • {subscription?.status === 'trial' ? 'Пробный период' : 'Активная подписка'}
                    </div>
                    <div className="mt-1 text-2xl font-bold text-blue-900">
                      {subscription?.available_tokens?.toLocaleString() || 0} токенов доступно
                    </div>
                    {subscription?.status === 'trial' && subscription?.trial_days_remaining !== null && (
                      <div className="mt-1 text-sm text-blue-600">
                        Пробный период заканчивается через {subscription.trial_days_remaining} дней
                      </div>
                    )}
                    {subscription?.status !== 'trial' && subscription?.period_end_date && (
                      <div className="mt-1 text-sm text-blue-600">
                        Период заканчивается: {new Date(subscription.period_end_date).toLocaleDateString('ru-RU')}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-blue-600">Использовано в этом периоде</div>
                    <div className="text-xl font-semibold text-blue-900">
                      {subscription?.tokens_used_this_period?.toLocaleString() || 0} / {subscription?.tokens_allocated?.toLocaleString() || 0}
                    </div>
                    <div className="text-sm text-blue-600">
                      ({subscription?.tokens_used_percent?.toFixed(1) || 0}%)
                    </div>
                  </div>
                </div>

                {/* Token Breakdown */}
                <div className="mt-4 pt-4 border-t border-blue-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-blue-600 font-medium mb-1">Токены из подписки</div>
                    <div className="text-lg font-semibold text-blue-900">
                      {subscription?.tokens_remaining?.toLocaleString() || 0} / {subscription?.tokens_allocated?.toLocaleString() || 0}
                    </div>
                    <div className="text-xs text-blue-500 mt-1">
                      Восстановятся {subscription?.period_end_date && new Date(subscription.period_end_date).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-blue-600 font-medium mb-1">Токены на балансе</div>
                    <div className="text-lg font-semibold text-blue-900">
                      {subscription?.token_balance?.toLocaleString() || 0}
                    </div>
                    <div className="text-xs text-blue-500 mt-1">
                      Из приобретённых пакетов
                    </div>
                  </div>
                </div>

                {/* Charging Priority Explanation */}
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <details className="group">
                    <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-700 font-medium">
                      Как списываются токены?
                    </summary>
                    <div className="mt-2 text-xs text-blue-700 space-y-1 pl-4">
                      <p>Токены списываются в следующем порядке:</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Сначала используются токены из подписки (ежемесячное выделение)</li>
                        <li>Затем используются токены с баланса (приобретённые пакеты)</li>
                        <li>Если токенов недостаточно, запрос будет заблокирован</li>
                      </ol>
                      <p className="mt-2 text-blue-600">
                        Токены из подписки восстанавливаются каждый месяц автоматически.
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Всего токенов</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.total_tokens.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.consumption_count} запросов
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Всего доступно</div>
              <div className="text-3xl font-bold text-green-600">
                {subscription?.available_tokens?.toLocaleString() || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {subscription?.tokens_remaining?.toLocaleString() || 0} из подписки + {subscription?.token_balance?.toLocaleString() || 0} на балансе
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Стоимость (₽)</div>
              <div className="text-2xl font-semibold text-gray-700">
                ₽{Number(stats.total_price_rub).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Период: {new Date(stats.period_start).toLocaleDateString('ru-RU')} - {new Date(stats.period_end).toLocaleDateString('ru-RU')}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата начала
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата окончания
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Модель
              </label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => {
                  setModelName(e.target.value)
                  setHistoryOffset(0)
                }}
                placeholder="Все модели"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Провайдер
              </label>
              <input
                type="text"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value)
                  setHistoryOffset(0)
                }}
                placeholder="Все провайдеры"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Группировка
              </label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="day">По дням</option>
                <option value="week">По неделям</option>
                <option value="month">По месяцам</option>
              </select>
            </div>
          </div>
        </div>

        {/* Chart */}
        {chartData && (
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">График потребления</h2>
            <ConsumptionChart data={chartData.data} groupBy={groupBy} />
          </div>
        )}

        {/* History Table */}
        {history && (
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">История потребления</h2>
            <ConsumptionTable
              items={history.items}
              total={history.total}
              limit={history.limit}
              offset={history.offset}
              onPageChange={setHistoryOffset}
              showCost={showCostColumn}
            />
          </div>
        )}
      </div>
    </div>
  )
}

