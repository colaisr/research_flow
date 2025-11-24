'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showResendVerification, setShowResendVerification] = useState(false)
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { data } = await apiClient.post(
        `${API_BASE_URL}/api/auth/login`,
        credentials,
        { withCredentials: true }
      )
      return data
    },
    onSuccess: (data) => {
      // Set user data in cache (cookie is already set by backend)
      queryClient.setQueryData(['auth', 'me'], data.user)
      // Redirect to dashboard
      router.push('/dashboard')
    },
    onError: (err: any) => {
      const errorDetail = err.response?.data?.detail || 'Login failed'
      setError(errorDetail)
      // Show resend verification option and code input if email not verified
      if (errorDetail.includes('Email address not verified') || errorDetail.includes('не подтвержден')) {
        setShowResendVerification(true)
        setShowCodeInput(true)
      } else {
        setShowResendVerification(false)
        setShowCodeInput(false)
      }
    },
  })

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
      setVerifyStatus('success')
      // Set user data in cache
      queryClient.setQueryData(['auth', 'me'], data.user)
      // Clear error and code input
      setError(null)
      setCode('')
      // Redirect to dashboard after 1 second
      setTimeout(() => {
        router.push('/dashboard')
      }, 1000)
    },
    onError: (err: any) => {
      setVerifyStatus('error')
      setError(err.response?.data?.detail || 'Неверный код подтверждения')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setShowCodeInput(false)
    loginMutation.mutate({ email, password })
  }

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length === 3 && /^\d{3}$/.test(code)) {
      setVerifyStatus('loading')
      setError(null)
      verifyMutation.mutate(code)
    } else {
      setError('Пожалуйста, введите 3-значный код')
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 3)
    setCode(value)
    if (verifyStatus === 'error') {
      setVerifyStatus('idle')
      setError(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header - matching index page */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <img src="/rf_logo.png" alt="Research Flow" className="h-8 w-auto" />
              <span className="ml-3 text-lg font-semibold text-gray-900">Research Flow</span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link
                href="/register"
                className="px-5 py-2.5 text-gray-700 hover:text-gray-900 text-sm font-medium rounded-lg transition-all"
              >
                Регистрация
              </Link>
              <Link
                href="/login"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-md"
              >
                Войти в систему
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md mx-auto">
          {/* Login Form */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">
              Добро пожаловать
            </h1>
            <p className="text-gray-600 mb-8 text-center">
              Войдите в систему для управления исследованиями
            </p>

            {!showCodeInput ? (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    Пароль
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-sm">{error}</p>
                    {showResendVerification && (
                      <div className="mt-3 pt-3 border-t border-red-200">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { data } = await apiClient.post(
                                `${API_BASE_URL}/api/auth/resend-verification`,
                                { email },
                                { withCredentials: true }
                              )
                              setResendMessage('Письмо с подтверждением отправлено на ваш email')
                            } catch (err: any) {
                              setResendMessage(err.response?.data?.detail || 'Ошибка отправки письма')
                            }
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Отправить письмо повторно
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {resendMessage && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-blue-700 text-sm">{resendMessage}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {loginMutation.isPending ? 'Вход...' : 'Войти'}
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                  <div>
                    <p className="text-blue-800 text-sm mb-3">
                      Введите 3-значный код подтверждения из письма:
                    </p>
                    <form onSubmit={handleCodeSubmit} className="space-y-3">
                      <input
                        type="text"
                        value={code}
                        onChange={handleCodeChange}
                        maxLength={3}
                        placeholder="000"
                        className="w-full text-center text-3xl font-bold tracking-widest py-3 px-4 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        style={{ letterSpacing: '0.5em' }}
                        autoFocus
                      />
                      {verifyStatus === 'error' && (
                        <p className="text-red-700 text-sm text-center">{error}</p>
                      )}
                      {verifyStatus === 'success' && (
                        <p className="text-green-700 text-sm text-center">Email подтвержден! Перенаправление...</p>
                      )}
                      <button
                        type="submit"
                        disabled={code.length !== 3 || verifyStatus === 'loading' || verifyStatus === 'success'}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {verifyStatus === 'loading' ? 'Проверка...' : verifyStatus === 'success' ? 'Успешно!' : 'Подтвердить email'}
                      </button>
                    </form>
                  </div>
                  <div className="pt-3 border-t border-blue-200">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { data } = await apiClient.post(
                            `${API_BASE_URL}/api/auth/resend-verification`,
                            { email },
                            { withCredentials: true }
                          )
                          setResendMessage('Письмо с подтверждением отправлено на ваш email')
                        } catch (err: any) {
                          setResendMessage(err.response?.data?.detail || 'Ошибка отправки письма')
                        }
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Отправить письмо повторно
                    </button>
                  </div>
                </div>
                {resendMessage && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-green-700 text-sm">{resendMessage}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowCodeInput(false)
                    setCode('')
                    setError(null)
                    setVerifyStatus('idle')
                  }}
                  className="w-full py-2 px-4 text-gray-600 hover:text-gray-800 font-medium"
                >
                  ← Вернуться к входу
                </button>
              </div>
            )}

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Нет аккаунта?{' '}
                <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">
                  Зарегистрироваться
                </Link>
              </p>
            </div>
          </div>

          {/* Back to home link */}
          <div className="mt-6 text-center">
            <Link 
              href="/" 
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Вернуться на главную
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
