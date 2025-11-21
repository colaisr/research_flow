'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const navigation = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Analyses', href: '/analyses' },
  { name: 'Runs', href: '/runs' },
  { name: 'Schedules', href: '/schedules' },
  { name: 'Settings', href: '/settings' },
]

const getRoleLabel = (role: string | null | undefined) => {
  if (!role) return null
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'org_admin':
      return 'Org Admin'
    case 'org_user':
      return 'User'
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
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/dashboard" className="text-xl font-bold text-gray-900 dark:text-white">
                <span className="text-gray-900 dark:text-white">Max Sig</span><span className="text-2xl text-blue-600 dark:text-blue-400 font-bold">N</span><span className="text-gray-900 dark:text-white">al bot</span>
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
                          ? 'border-blue-500 text-gray-900 dark:text-white'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
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
                className="text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                {user.email}
                {role && (
                  <span className={`ml-2 px-2 py-1 text-xs rounded ${
                    role === 'admin' 
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                      : role === 'org_admin'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                  }`}>
                    {getRoleLabel(role)}
                  </span>
                )}
              </Link>
              {isPlatformAdmin && (
                <Link
                  href="/admin/settings"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Admin Settings
                </Link>
              )}
              <button
                onClick={() => logout()}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

