'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface TBankPaymentProps {
  paymentUrl: string
  paymentId: string
  purchaseId: number
  amount: number
  onSuccess?: () => void
  onFailure?: () => void
  onCancel?: () => void
}

declare global {
  interface Window {
    PaymentIntegration?: {
      init: (config: any) => Promise<any>
      payment: {
        open: (config: any) => Promise<any>
      }
    }
  }
}

export default function TBankPayment({
  paymentUrl,
  paymentId,
  purchaseId,
  amount,
  onSuccess,
  onFailure,
  onCancel,
}: TBankPaymentProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const paymentInitialized = useRef(false)

  useEffect(() => {
    // Load T-Bank integration script
    const script = document.createElement('script')
    script.src = 'https://integrationjs.tbank.ru/integration.js'
    script.async = true
    script.onload = () => {
      initializePayment()
    }
    script.onerror = () => {
      setError('Не удалось загрузить платежный виджет')
      setIsLoading(false)
    }
    document.body.appendChild(script)

    return () => {
      // Cleanup script if component unmounts
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [])

  const initializePayment = () => {
    if (paymentInitialized.current) return
    paymentInitialized.current = true

    try {
      if (!window.PaymentIntegration) {
        setError('Платежный виджет не загружен')
        setIsLoading(false)
        return
      }

      // Initialize T-Bank payment integration
      // Note: TerminalKey should be configured on backend
      // For now, we'll use the payment URL directly
      setIsLoading(false)

      // Open payment in new window or redirect
      // T-Bank provides payment_url that can be opened directly
      window.location.href = paymentUrl
    } catch (err) {
      setError(`Ошибка инициализации платежа: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setIsLoading(false)
    }
  }

  const handlePaymentButton = () => {
    if (paymentUrl) {
      // Open payment URL in new window
      const paymentWindow = window.open(
        paymentUrl,
        'TBankPayment',
        'width=800,height=600,scrollbars=yes,resizable=yes'
      )

      // Monitor payment window
      if (paymentWindow) {
        const checkClosed = setInterval(() => {
          if (paymentWindow.closed) {
            clearInterval(checkClosed)
            // Check payment status after window closes
            // This will be handled by webhook, but we can also poll
            setTimeout(() => {
              // Refresh page or check status
              if (onSuccess) {
                onSuccess()
              } else {
                router.refresh()
              }
            }, 2000)
          }
        }, 1000)
      }
    }
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
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
          <div>
            <h3 className="text-lg font-semibold text-red-900 mb-2">Ошибка платежа</h3>
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => {
                setError(null)
                setIsLoading(true)
                paymentInitialized.current = false
                initializePayment()
              }}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600">Инициализация платежа...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
      <div className="text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            К оплате: ₽{amount.toFixed(0)}
          </h3>
          <p className="text-sm text-gray-600">ID платежа: {paymentId}</p>
        </div>

        <button
          onClick={handlePaymentButton}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg mb-4"
        >
          Перейти к оплате
        </button>

        <p className="text-xs text-gray-500">
          Вы будете перенаправлены на страницу оплаты Т-Банка
        </p>

        {(onCancel || onFailure) && (
          <button
            onClick={() => {
              if (onCancel) onCancel()
              else if (onFailure) onFailure()
            }}
            className="mt-4 text-gray-600 hover:text-gray-900 text-sm font-medium"
          >
            Отменить
          </button>
        )}
      </div>
    </div>
  )
}
