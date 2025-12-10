'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const navigation = [
  { name: 'Дашборд', href: '/dashboard' },
  { name: 'Анализы', href: '/analyses' },
  { name: 'Запуски', href: '/runs' },
  { name: 'Расписания', href: '/schedules' },
  { name: 'Настройки', href: '/settings' },
]

const getRoleLabel = (role: string | null | undefined) => {
  if (!role) return null
  switch (role) {
    case 'admin':
      return 'Администратор платформы'
    case 'user':
      return 'Пользователь'
    default:
      return role
  }
}

export default function Navigation() {
  // Don't show navigation on landing page
  if (typeof window !== 'undefined' && window.location.pathname === '/') {
    return null
  }
  const pathname = usePathname()

  // Don't show nav on login page or landing page
  if (pathname === '/login' || pathname === '/') {
    return null
  }

  // Only load auth state when navigation is visible
  const { user, logout, isAuthenticated, role, isPlatformAdmin } = useAuth()

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/dashboard" className="text-xl font-bold text-gray-900">
                <span className="text-gray-900">Max Sig</span><span className="text-2xl text-blue-600 font-bold">N</span><span className="text-gray-900">al bot</span>
              </Link>
            </div>
            {isAuthenticated && (
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                        isActive
                          ? 'border-blue-500 text-gray-900'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
          {isAuthenticated && user && (
            <div className="flex items-center gap-4">
              <Link
                href="/user-settings"
                className="text-sm text-gray-700 hover:text-gray-900"
              >
                {user.email}
                {role && (
                  <span className={`ml-2 px-2 py-1 text-xs rounded ${
                    role === 'admin' 
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {getRoleLabel(role)}
                  </span>
                )}
              </Link>
              {isPlatformAdmin && (
                <Link
                  href="/admin/settings"
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Настройки администратора
                </Link>
              )}
              <button
                onClick={() => logout()}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

