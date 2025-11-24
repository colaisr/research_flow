'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import apiClient from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import Link from 'next/link'

export default function RegisterSuccessPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const { data } = await apiClient.post(
        `${API_BASE_URL}/api/auth/verify-email`,
        { token: code },
        { withCredentials: true }
      )
      return data
    },
    onSuccess: (data) => {
      setStatus('success')
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    },
    onError: (err: any) => {
      setStatus('error')
      setErrorMessage(err.response?.data?.detail || 'Неверный код подтверждения')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length === 3 && /^\d{3}$/.test(code)) {
      setStatus('loading')
      verifyMutation.mutate(code)
    } else {
      setStatus('error')
      setErrorMessage('Пожалуйста, введите 3-значный код')
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 3)
    setCode(value)
    if (status === 'error') {
      setStatus('idle')
      setErrorMessage('')
    }
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg
                className="h-6 w-6 text-green-600"
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
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Email подтвержден!
            </h1>
            <p className="text-gray-600 mb-4">
              Ваш email адрес успешно подтвержден. Вы будете перенаправлены на главную страницу...
            </p>
            <Link
              href="/dashboard"
              className="inline-block text-blue-600 hover:text-blue-700 font-medium"
            >
              Перейти сейчас →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
              <svg
                className="h-6 w-6 text-blue-600"
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
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Проверьте вашу почту
            </h1>
            <p className="text-gray-600 mb-6">
              Мы отправили письмо с 3-значным кодом подтверждения на ваш email адрес.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 mb-6">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2 text-center">
                Введите код подтверждения
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={handleCodeChange}
                maxLength={3}
                placeholder="000"
                className="w-full text-center text-4xl font-bold tracking-widest py-4 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                style={{ letterSpacing: '0.5em' }}
                autoFocus
              />
            </div>

            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{errorMessage}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={code.length !== 3 || status === 'loading'}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Проверка...' : 'Подтвердить email'}
            </button>
          </form>

          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              <p className="mb-2">Не получили письмо?</p>
              <ul className="list-disc list-inside space-y-1 text-gray-500">
                <li>Проверьте папку "Спам"</li>
                <li>Убедитесь, что вы указали правильный email адрес</li>
                <li>Попробуйте запросить повторную отправку</li>
              </ul>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <Link
                href="/login"
                className="block w-full text-center text-blue-600 hover:text-blue-700 font-medium"
              >
                Вернуться к входу
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

