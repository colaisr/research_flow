'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import apiClient from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; full_name?: string }) => {
      const { data: response } = await apiClient.post(
        `${API_BASE_URL}/api/auth/register`,
        data,
        { withCredentials: true }
      )
      return response
    },
    onSuccess: (data) => {
      // User is auto-logged in after registration
      // Redirect to dashboard
      router.push('/dashboard')
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
      full_name: fullName || undefined 
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 px-4 py-8">
      <div className="w-full max-w-md mx-auto">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center mb-6">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mr-3">
              <img src="/rf_logo.png" alt="Research Flow" className="h-8 w-auto" />
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-gray-900 dark:text-white leading-tight">
                Research <span className="text-blue-600 dark:text-blue-400">Flow</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                Research Platform
              </div>
            </div>
          </Link>
        </div>

        {/* Register Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1 text-center">
            Создать аккаунт
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center">
            Зарегистрируйтесь для начала работы
          </p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="full-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Полное имя <span className="text-gray-400 dark:text-gray-500 text-xs">(необязательно)</span>
              </label>
              <input
                id="full-name"
                name="full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Иван Иванов"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Минимум 8 символов"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {registerMutation.isPending ? 'Создание аккаунта...' : 'Создать аккаунт'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Уже есть аккаунт?{' '}
              <Link href="/login" className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                Войти
              </Link>
            </p>
          </div>
        </div>

        {/* Back to home link */}
        <div className="mt-6 text-center">
          <Link 
            href="/" 
            className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Вернуться на главную
          </Link>
        </div>
      </div>
    </div>
  )
}

