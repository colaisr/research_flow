'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import PaymentPlaceholder from '@/components/PaymentPlaceholder'
import { fetchTokenPackages, purchaseTokenPackage, fetchPurchaseHistory, TokenPackage, PurchaseHistoryItem } from '@/lib/api/token-packages'
import { fetchCurrentSubscription, fetchSubscriptionPlans } from '@/lib/api/subscriptions'
import SubscriptionPlansDisplay from '@/components/SubscriptionPlansDisplay'

export default function BillingPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [selectedPackage, setSelectedPackage] = useState<TokenPackage | null>(null)
  const [showPayment, setShowPayment] = useState(false)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Fetch token packages
  const { data: packages, isLoading: packagesLoading } = useQuery({
    queryKey: ['token-packages'],
    queryFn: fetchTokenPackages,
    enabled: isAuthenticated,
  })

  // Fetch current subscription for balance display
  const { data: subscription } = useQuery({
    queryKey: ['current-subscription'],
    queryFn: fetchCurrentSubscription,
    enabled: isAuthenticated,
  })

  // Fetch subscription plans for upgrade option
  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: fetchSubscriptionPlans,
    enabled: isAuthenticated,
  })

  // Fetch purchase history
  const { data: purchaseHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['purchase-history'],
    queryFn: () => fetchPurchaseHistory(20, 0),
    enabled: isAuthenticated,
  })

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: (pkg: TokenPackage) => purchaseTokenPackage(pkg.id, { package_id: pkg.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
      queryClient.invalidateQueries({ queryKey: ['current-subscription'] })
      setShowPayment(true)
    },
  })

  const handlePurchase = (pkg: TokenPackage) => {
    setSelectedPackage(pkg)
    purchaseMutation.mutate(pkg)
  }

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`
    } else if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(0)}K`
    }
    return tokens.toString()
  }

  if (authLoading || packagesLoading) {
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
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Биллинг</h1>
          <p className="text-gray-600">Управление подпиской и покупка дополнительных токенов</p>
        </div>

        {/* Current Balance */}
        {subscription && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Текущий баланс</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Токены подписки</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatTokens(subscription.tokens_remaining)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  из {formatTokens(subscription.tokens_allocated)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Купленные токены</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatTokens(subscription.token_balance)}
                </p>
                <p className="text-xs text-gray-500 mt-1">не сбрасываются</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Всего доступно</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatTokens(subscription.available_tokens)}
                </p>
                <p className="text-xs text-gray-500 mt-1">подписка + баланс</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Link
                href="/consumption"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Посмотреть историю потребления →
              </Link>
            </div>
          </div>
        )}

        {/* Payment Placeholder (shown after purchase) */}
        {showPayment && selectedPackage && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Оплата</h2>
            <PaymentPlaceholder amount={Number(selectedPackage.price_rub)} />
            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  setShowPayment(false)
                  setSelectedPackage(null)
                }}
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                Отменить
              </button>
            </div>
          </div>
        )}

        {/* Token Packages (shown first - quick purchase) */}
        {!showPayment && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Дополнительные пакеты токенов</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {packages?.map((pkg) => (
                <div
                  key={pkg.id}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{pkg.display_name}</h3>
                  {pkg.description && (
                    <p className="text-sm text-gray-600 mb-4">{pkg.description}</p>
                  )}
                  <div className="mb-4">
                    <p className="text-3xl font-bold text-gray-900 mb-1">
                      {formatTokens(pkg.token_amount)}
                    </p>
                    <p className="text-sm text-gray-500">токенов</p>
                  </div>
                  <div className="mb-6">
                    <p className="text-2xl font-bold text-blue-600">
                      ₽{Number(pkg.price_rub).toFixed(0)}
                    </p>
                  </div>
                  <button
                    onClick={() => handlePurchase(pkg)}
                    disabled={purchaseMutation.isPending}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {purchaseMutation.isPending ? 'Обработка...' : 'Купить пакет'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subscription Plans (Upgrade/Downgrade) */}
        {!showPayment && plans && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Тарифные планы</h2>
            <SubscriptionPlansDisplay
              plans={plans}
              currentPlanId={subscription?.plan_id}
              currentPlanPrice={(() => {
                if (!subscription) return null
                // Get current plan price from plans list
                const currentPlan = plans?.find(p => p.id === subscription.plan_id)
                return currentPlan?.price_monthly ? Number(currentPlan.price_monthly) : null
              })()}
              currentPlanIsPaid={(() => {
                if (!subscription) return false
                // Check if current plan is paid by looking it up in plans list
                const currentPlan = plans?.find(p => p.id === subscription.plan_id)
                if (currentPlan) {
                  // Paid plan = has price and is not trial
                  return !!(currentPlan.is_trial === false && currentPlan.price_monthly && currentPlan.price_monthly > 0)
                }
                // Fallback: if status is active and not trial, assume paid
                return !!(subscription.status === 'active' && subscription.plan_name !== 'trial')
              })()}
              showCurrentPlanBadge={true}
              showPaymentPlaceholder={true}
              isPublic={false}
            />
          </div>
        )}

        {/* Purchase History */}
        {!showPayment && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">История покупок</h2>
            {historyLoading ? (
              <p className="text-gray-600">Загрузка...</p>
            ) : purchaseHistory && purchaseHistory.purchases.length > 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Дата
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Пакет
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Токены
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Стоимость
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchaseHistory.purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(purchase.purchased_at).toLocaleDateString('ru-RU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {purchase.package_display_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatTokens(purchase.token_amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ₽{Number(purchase.price_rub).toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
                <p className="text-gray-600">История покупок пуста</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
