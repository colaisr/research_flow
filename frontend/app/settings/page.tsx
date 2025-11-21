'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function SettingsPage() {
  const router = useRouter()
  const { isPlatformAdmin } = useAuth()

  useEffect(() => {
    // Redirect to admin settings if admin, otherwise to user settings
    if (isPlatformAdmin) {
      router.replace('/admin/settings')
    } else {
      router.replace('/user-settings')
    }
  }, [isPlatformAdmin, router])

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-600 dark:text-gray-400">Перенаправление...</p>
      </div>
    </div>
  )
}
