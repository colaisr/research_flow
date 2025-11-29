'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { fetchSubscriptionPlans } from '@/lib/api/subscriptions'
import { fetchCurrentSubscription } from '@/lib/api/subscriptions'
import SubscriptionPlansDisplay from '@/components/SubscriptionPlansDisplay'

export default function SubscriptionPlansPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Fetch subscription plans
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: fetchSubscriptionPlans,
    enabled: isAuthenticated,
  })

  // Fetch current subscription
  const { data: currentSubscription } = useQuery({
    queryKey: ['current-subscription'],
    queryFn: fetchCurrentSubscription,
    enabled: isAuthenticated,
  })

  if (authLoading || plansLoading) {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Выбор тарифного плана</h1>
          <p className="text-gray-600">Выберите подходящий план для ваших потребностей</p>
        </div>

        {/* Current Plan Info */}
        {currentSubscription && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              Текущий план: <span className="font-semibold">{currentSubscription.plan_display_name}</span>
            </p>
          </div>
        )}

        {/* Plans Display */}
        {plans && (
          <SubscriptionPlansDisplay
            plans={plans}
            currentPlanId={currentSubscription?.plan_id}
            currentPlanPrice={(() => {
              if (!currentSubscription) return null
              // Get current plan price from plans list
              const currentPlan = plans?.find(p => p.id === currentSubscription.plan_id)
              return currentPlan?.price_monthly ? Number(currentPlan.price_monthly) : null
            })()}
            currentPlanIsPaid={(() => {
              if (!currentSubscription) return false
              // Check if current plan is paid by looking it up in plans list
              const currentPlan = plans?.find(p => p.id === currentSubscription.plan_id)
              if (currentPlan) {
                // Paid plan = has price and is not trial
                return !currentPlan.is_trial && currentPlan.price_monthly && currentPlan.price_monthly > 0
              }
              // Fallback: if status is active and not trial, assume paid
              return currentSubscription.status === 'active' && currentSubscription.plan_name !== 'trial'
            })()}
            showCurrentPlanBadge={true}
            showPaymentPlaceholder={true}
            isPublic={false}
          />
        )}
      </div>
    </div>
  )
}

