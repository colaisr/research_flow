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
  const [error, setError] = useState<string | null>(null)

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
      setError(err.response?.data?.detail || 'Login failed')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    loginMutation.mutate({ email, password })
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
