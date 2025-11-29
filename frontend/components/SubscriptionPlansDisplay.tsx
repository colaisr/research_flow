'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SubscriptionPlan } from '@/lib/api/subscriptions'
import PaymentPlaceholder from './PaymentPlaceholder'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { changeSubscriptionPlan } from '@/lib/api/subscriptions'

interface SubscriptionPlansDisplayProps {
  plans: SubscriptionPlan[]
  currentPlanId?: number | null
  currentPlanPrice?: number | null // Current plan's monthly price (for upgrade/downgrade detection)
  currentPlanIsPaid?: boolean // If true, user is on a paid plan and cannot switch to trial
  showCurrentPlanBadge?: boolean
  onPlanSelect?: (plan: SubscriptionPlan) => void
  showPaymentPlaceholder?: boolean
  isPublic?: boolean // If true, don't show change plan functionality
  className?: string
}

export default function SubscriptionPlansDisplay({
  plans,
  currentPlanId,
  currentPlanPrice = null,
  currentPlanIsPaid = false,
  showCurrentPlanBadge = true,
  onPlanSelect,
  showPaymentPlaceholder = true,
  isPublic = false,
  className = '',
}: SubscriptionPlansDisplayProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [showPayment, setShowPayment] = useState(false)

  // Change plan mutation (only for authenticated users)
  // This is called AFTER payment is confirmed
  const changePlanMutation = useMutation({
    mutationFn: (planId: number) => changeSubscriptionPlan({ plan_id: planId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['current-subscription'] })
      // After plan change, redirect to settings
      router.push('/user-settings?tab=subscription')
    },
  })

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (isPublic) {
      // Public view - redirect to register
      router.push(`/register?plan=${plan.id}`)
      return
    }

    if (currentPlanId === plan.id) {
      // Already on this plan
      return
    }

    // Prevent switching to trial if user is on a paid plan
    if (plan.is_trial && currentPlanIsPaid) {
      // This should be disabled in UI, but add safety check
      return
    }

    if (onPlanSelect) {
      // Custom handler provided
      onPlanSelect(plan)
    } else {
      // Determine if this is an upgrade or downgrade
      const newPlanPrice = plan.price_monthly ? Number(plan.price_monthly) : 0
      const currentPrice = currentPlanPrice ? Number(currentPlanPrice) : 0
      const isUpgrade = newPlanPrice > currentPrice
      const isDowngrade = newPlanPrice < currentPrice && currentPrice > 0
      const hasPrice = newPlanPrice > 0
      
      if (isUpgrade && hasPrice && showPaymentPlaceholder) {
        // Upgrade to paid plan: Show payment placeholder first, don't change plan yet
        // Plan will be changed after payment is confirmed (via payment gateway callback)
        setSelectedPlan(plan)
        setShowPayment(true)
      } else if (isDowngrade) {
        // Downgrade: Ask for confirmation before changing plan
        const currentPlan = plans.find((p) => p.id === currentPlanId)
        const currentPlanName = currentPlan?.display_name || 'текущий план'
        const newPlanName = plan.display_name
        
        if (
          confirm(
            `Вы уверены, что хотите перейти с плана "${currentPlanName}" на план "${newPlanName}"?\n\n` +
            `Это приведет к снижению доступных функций и токенов. Изменение вступит в силу немедленно.\n\n` +
            `Продолжить?`
          )
        ) {
          changePlanMutation.mutate(plan.id)
        }
      } else {
        // Free plan or trial: Change immediately (no payment required)
        changePlanMutation.mutate(plan.id)
      }
    }
  }

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`
    } else if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(0)}K`
    }
    return tokens.toString()
  }

  // If showing payment placeholder, render that
  if (showPayment && selectedPlan && selectedPlan.price_monthly && showPaymentPlaceholder) {
    return (
      <div className={className}>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Оплата</h2>
        <PaymentPlaceholder amount={Number(selectedPlan.price_monthly)} />
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setShowPayment(false)
              setSelectedPlan(null)
            }}
            className="text-gray-600 hover:text-gray-900 text-sm font-medium"
          >
            Отменить
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlanId === plan.id
          const isTrial = plan.is_trial
          const hasPrice = plan.price_monthly && plan.price_monthly > 0
          // Disable trial plan if user is on a paid plan
          const isTrialDisabled = isTrial && currentPlanIsPaid && !isCurrentPlan

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-lg border-2 shadow-sm p-6 ${
                isCurrentPlan && showCurrentPlanBadge
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:shadow-md transition-shadow'
              }`}
            >
              {isCurrentPlan && showCurrentPlanBadge && (
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                    Текущий план
                  </span>
                </div>
              )}

              <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.display_name}</h3>
              {plan.description && (
                <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
              )}

              <div className="mb-6">
                <div className="flex items-baseline mb-2">
                  {hasPrice ? (
                    <>
                      <span className="text-4xl font-bold text-gray-900">
                        ₽{Number(plan.price_monthly).toFixed(0)}
                      </span>
                      <span className="text-gray-600 ml-2">/месяц</span>
                    </>
                  ) : (
                    <span className="text-4xl font-bold text-gray-900">Бесплатно</span>
                  )}
                </div>
                {isTrial && plan.trial_duration_days && (
                  <p className="text-sm text-blue-600 font-medium">
                    {plan.trial_duration_days} дней пробного периода
                  </p>
                )}
              </div>

              <div className="mb-6">
                <p className="text-lg font-semibold text-gray-900 mb-1">
                  {formatTokens(plan.monthly_tokens)} токенов
                </p>
                <p className="text-sm text-gray-500">в месяц</p>
              </div>

              {plan.included_features && plan.included_features.length > 0 && (
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-2">Включено:</p>
                  <ul className="space-y-1">
                    {plan.included_features.map((feature, idx) => (
                      <li key={idx} className="flex items-start text-sm text-gray-600">
                        <svg
                          className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!isPublic && (
                <>
                  {isTrialDisabled && (
                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      Недоступно: нельзя перейти на пробный период с платного плана
                    </div>
                  )}
                  <button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isCurrentPlan || changePlanMutation.isPending || isTrialDisabled}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                      isCurrentPlan || isTrialDisabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isCurrentPlan
                      ? 'Текущий план'
                      : isTrialDisabled
                      ? 'Недоступно'
                      : changePlanMutation.isPending
                      ? 'Обработка...'
                      : hasPrice
                      ? 'Выбрать план'
                      : 'Активировать'}
                  </button>
                </>
              )}

              {isPublic && (
                <button
                  onClick={() => handleSelectPlan(plan)}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  {isTrial ? 'Начать пробный период' : 'Выбрать план'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

