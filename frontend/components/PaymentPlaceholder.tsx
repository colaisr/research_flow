'use client'

interface PaymentPlaceholderProps {
  amount: number
  currency?: string
}

export default function PaymentPlaceholder({ amount, currency = 'RUB' }: PaymentPlaceholderProps) {
  const formattedAmount = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: currency === 'RUB' ? 'RUB' : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)

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
            К оплате: {formattedAmount}
          </h3>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <div className="flex items-start">
            <svg
              className="w-6 h-6 text-yellow-600 mr-3 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-left">
              <p className="text-sm font-medium text-yellow-800 mb-2">
                Система оплаты в разработке
              </p>
              <p className="text-sm text-yellow-700 mb-4">
                Для завершения оплаты свяжитесь с отделом продаж
              </p>
              <div className="space-y-2 text-sm text-yellow-700">
                <div className="flex items-center">
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <a
                    href="mailto:sales@researchflow.ru"
                    className="hover:text-yellow-900 underline"
                  >
                    sales@researchflow.ru
                  </a>
                </div>
                <div className="flex items-center">
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  <a
                    href="tel:+79932475277"
                    className="hover:text-yellow-900 underline"
                  >
                    +7 (993) 247-52-77
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <p className="text-xs text-gray-600">
            Этот блок будет заменён на платежный шлюз с QR-кодом и доступными способами оплаты после выбора поставщика платежных услуг
          </p>
        </div>
      </div>
    </div>
  )
}

