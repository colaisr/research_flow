'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import apiClient from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import Link from 'next/link'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  // Get plan_id from query parameter
  const planIdParam = searchParams.get('plan')
  const planId = planIdParam ? parseInt(planIdParam, 10) : null

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; full_name?: string; plan_id?: number }) => {
      const { data: response } = await apiClient.post(
        `${API_BASE_URL}/api/auth/register`,
        data,
        { withCredentials: true }
      )
      return response
    },
    onSuccess: (data) => {
      // User is not auto-logged in - must verify email first
      // Redirect to verification message page
      router.push('/register/success')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Registration failed')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!email || !password) {
      setError('Email and password are required')
      return
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }
    
    registerMutation.mutate({ 
      email, 
      password, 
      full_name: fullName || undefined,
      plan_id: planId || undefined
    })
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
          {/* Register Form */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">
              Создать аккаунт
            </h1>
            <p className="text-gray-600 mb-8 text-center">
              Зарегистрируйтесь для начала работы
            </p>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="full-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Полное имя <span className="text-gray-400 text-xs">(необязательно)</span>
                </label>
                <input
                  id="full-name"
                  name="full-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="Иван Иванов"
                />
              </div>

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
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="Минимум 8 символов"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={registerMutation.isPending}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {registerMutation.isPending ? 'Создание аккаунта...' : 'Создать аккаунт'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Уже есть аккаунт?{' '}
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                  Войти
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

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  )
}

