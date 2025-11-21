'use client'

import { usePathname } from 'next/navigation'
import { useSidebar } from '@/contexts/SidebarContext'

// Map pathnames to page titles
const getPageTitle = (pathname: string): string => {
  // Exact matches
  const exactMatches: Record<string, string> = {
    '/dashboard': 'Дашборд',
    '/analyses': 'Анализы',
    '/runs': 'Запуски',
    '/schedules': 'Расписания',
    '/user-settings': 'Настройки пользователя',
    '/admin/settings': 'Настройки администратора',
  }

  if (exactMatches[pathname]) {
    return exactMatches[pathname]
  }

  // Pattern matches
  if (pathname.startsWith('/analyses/')) {
    return 'Детали анализа'
  }
  if (pathname.startsWith('/runs/')) {
    return 'Детали запуска'
  }
  if (pathname.startsWith('/pipelines/')) {
    return 'Конвейер'
  }
  if (pathname.startsWith('/organizations/')) {
    return 'Управление организацией'
  }
  if (pathname.startsWith('/settings')) {
    return 'Настройки'
  }

  // Default
  return 'Research Flow'
}

export default function TopBar() {
  const pathname = usePathname()
  const { isCollapsed } = useSidebar()

  // Don't show top bar on landing page, login, or register pages
  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    return null
  }

  const pageTitle = getPageTitle(pathname)

  return (
    <header className={`fixed top-0 right-0 h-16 bg-white border-b border-gray-200 z-30 transition-all duration-300 ${
      isCollapsed ? 'left-20' : 'left-72'
    }`}>
      <div className="h-full px-6 flex items-center">
        <h1 className="text-xl font-semibold text-gray-900">
          {pageTitle}
        </h1>
      </div>
    </header>
  )
}

