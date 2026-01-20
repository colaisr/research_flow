'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { fetchTokenPackages, fetchPurchaseHistory, TokenPackage, PurchaseHistoryItem } from '@/lib/api/token-packages'
import { fetchCurrentSubscription, fetchSubscriptionPlans } from '@/lib/api/subscriptions'
import { initiatePayment, getPaymentStatus } from '@/lib/api/payments'
import SubscriptionPlansDisplay from '@/components/SubscriptionPlansDisplay'
import TBankPayment from '@/components/TBankPayment'

export default function BillingPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [selectedPackage, setSelectedPackage] = useState<TokenPackage | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentData, setPaymentData] = useState<{
    paymentUrl: string
    paymentId: string
    purchaseId: number
  } | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Handle payment success/failure from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paymentStatus = params.get('payment')
    
    if (paymentStatus === 'success') {
      // Refresh data after successful payment
      queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
      queryClient.invalidateQueries({ queryKey: ['current-subscription'] })
      queryClient.invalidateQueries({ queryKey: ['token-packages'] })
      
      // Clean URL
      router.replace('/billing')
    } else if (paymentStatus === 'failed') {
      // Check latest purchase for error details
      // Refresh purchase history first to get latest status
      queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
      
      // Try to get error from latest purchase
      setTimeout(() => {
        fetchPurchaseHistory(1, 0).then((history) => {
          if (history.purchases.length > 0) {
            const latestPurchase = history.purchases[0]
            if (latestPurchase.payment_status === 'failed' && latestPurchase.payment_error) {
              setPaymentError(latestPurchase.payment_error)
            } else if (latestPurchase.payment_status === 'failed') {
              setPaymentError('Платеж не прошел. Попробуйте еще раз или обратитесь в поддержку.')
            }
          }
        }).catch(() => {
          // Ignore errors
        })
      }, 1000) // Wait a bit for history to refresh
      
      // Clean URL
      router.replace('/billing')
    }
  }, [router, queryClient])

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

  // Payment initiation mutation
  const paymentMutation = useMutation({
    mutationFn: (pkg: TokenPackage) => initiatePayment({
      package_id: pkg.id,
      success_url: `${window.location.origin}/billing?payment=success`,
      fail_url: `${window.location.origin}/billing?payment=failed`,
    }),
    onSuccess: (data) => {
      setPaymentData({
        paymentUrl: data.payment_url,
        paymentId: data.payment_id,
        purchaseId: data.purchase_id,
      })
      setShowPayment(true)
    },
    onError: (error: any) => {
      console.error('Payment initiation failed:', error)
      const errorMessage = error?.response?.data?.detail || error?.message || 'Не удалось инициировать платеж. Попробуйте еще раз.'
      setPaymentError(errorMessage)
      setShowPayment(false)
      setSelectedPackage(null)
      setPaymentData(null)
    },
  })

  const handlePurchase = (pkg: TokenPackage) => {
    setSelectedPackage(pkg)
    paymentMutation.mutate(pkg)
  }

  const handlePaymentSuccess = () => {
    // Refresh data after successful payment
    queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
    queryClient.invalidateQueries({ queryKey: ['current-subscription'] })
    queryClient.invalidateQueries({ queryKey: ['token-packages'] })
    
    // Reset payment state
    setShowPayment(false)
    setPaymentData(null)
    setSelectedPackage(null)
    
    // Show success message or redirect
    router.push('/billing?payment=success')
  }

  const handlePaymentCancel = () => {
    setShowPayment(false)
    setPaymentData(null)
    setSelectedPackage(null)
    setPaymentError(null)
  }
  
  const handleDismissError = () => {
    setPaymentError(null)
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

        {/* Payment Error Message */}
        {paymentError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <div className="flex items-start">
              <svg
                className="w-6 h-6 text-red-600 mr-3 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-900 mb-2">Ошибка платежа</h3>
                <p className="text-red-700 mb-4">{paymentError}</p>
                <button
                  onClick={handleDismissError}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

        {/* T-Bank Payment (shown after payment initiation) */}
        {showPayment && selectedPackage && paymentData && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Оплата</h2>
            <TBankPayment
              paymentUrl={paymentData.paymentUrl}
              paymentId={paymentData.paymentId}
              purchaseId={paymentData.purchaseId}
              amount={Number(selectedPackage.price_rub)}
              onSuccess={handlePaymentSuccess}
              onFailure={handlePaymentCancel}
              onCancel={handlePaymentCancel}
            />
          </div>
        )}
        
        {/* Loading state during payment initiation */}
        {showPayment && selectedPackage && !paymentData && paymentMutation.isPending && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Оплата</h2>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Инициализация платежа...</p>
            </div>
          </div>
        )}

        {/* Token Packages (shown first - quick purchase) */}
        {!showPayment && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Дополнительные пакеты токенов</h2>
            {packagesLoading ? (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
                <p className="text-gray-600">Загрузка пакетов...</p>
              </div>
            ) : packages && packages.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {packages.map((pkg) => (
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
                    disabled={paymentMutation.isPending}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {paymentMutation.isPending ? 'Обработка...' : 'Купить пакет'}
                  </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
                <p className="text-gray-600 mb-2">Пакеты токенов временно недоступны</p>
                <p className="text-sm text-gray-500">Обратитесь к администратору для получения дополнительных токенов</p>
              </div>
            )}
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Статус
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchaseHistory.purchases.map((purchase) => {
                      const getStatusBadge = () => {
                        const status = purchase.payment_status || 'unknown'
                        if (status === 'completed') {
                          return (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Завершено
                            </span>
                          )
                        } else if (status === 'failed') {
                          return (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Ошибка
                            </span>
                          )
                        } else if (status === 'processing') {
                          return (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              В обработке
                            </span>
                          )
                        } else {
                          return (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {status}
                            </span>
                          )
                        }
                      }
                      
                      return (
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {getStatusBadge()}
                            {purchase.payment_error && purchase.payment_status === 'failed' && (
                              <div className="mt-1 text-xs text-red-600 max-w-xs">
                                {purchase.payment_error}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
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
