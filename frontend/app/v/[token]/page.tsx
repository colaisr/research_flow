'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import apiClient from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import Link from 'next/link'

export default function VerifyEmailShortPage() {
  const router = useRouter()
  const params = useParams()
  const token = params?.token as string
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const verifyMutation = useMutation({
    mutationFn: async (token: string) => {
      // Use GET endpoint for shorter links (/v/{token})
      const { data } = await apiClient.get(
        `${API_BASE_URL}/api/auth/v/${token}`,
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
      setErrorMessage(err.response?.data?.detail || 'Ошибка подтверждения email')
    },
  })

  useEffect(() => {
    if (token) {
      verifyMutation.mutate(token)
    } else {
      setStatus('error')
      setErrorMessage('Токен подтверждения не найден')
    }
  }, [token])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Подтверждение email адреса...</p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Email успешно подтвержден!</h1>
          <p className="text-gray-600 mb-4">Вы будете перенаправлены на главную страницу...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Ошибка подтверждения</h1>
        <p className="text-gray-600 mb-4">{errorMessage}</p>
        <Link
          href="/login"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Перейти на страницу входа
        </Link>
      </div>
    </div>
  )
}

