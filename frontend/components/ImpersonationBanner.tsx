'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'
import { useRouter } from 'next/navigation'

async function exitImpersonation() {
  const { data } = await apiClient.post(
    `${API_BASE_URL}/api/admin/exit-impersonation`,
    {},
    { withCredentials: true }
  )
  return data
}

export default function ImpersonationBanner() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const exitMutation = useMutation({
    mutationFn: exitImpersonation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      router.push('/admin/users')
      router.refresh()
    }
  })

  if (!user?.is_impersonated) {
    return null
  }

  return (
    <div className="bg-purple-600 text-white px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-4 text-sm">
        <div className="font-medium">
          ⚠️ Вы вошли как: <strong>{user.email}</strong> {user.full_name && `(${user.full_name})`}
        </div>
        {user.impersonated_by_email && (
          <div className="text-xs opacity-90 border-l border-purple-400 pl-4">
            Админ: {user.impersonated_by_email}
          </div>
        )}
      </div>
      <button
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        className="px-4 py-1.5 bg-white text-purple-600 rounded hover:bg-gray-100 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exitMutation.isPending ? 'Выход...' : 'Выйти из режима'}
      </button>
    </div>
  )
}

