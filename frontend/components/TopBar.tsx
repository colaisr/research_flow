'use client'

import { usePathname } from 'next/navigation'
import { useSidebar } from '@/contexts/SidebarContext'

export default function TopBar() {
  const pathname = usePathname()
  const { isCollapsed } = useSidebar()

  // Don't show top bar on landing page, login, or register pages
  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    return null
  }

  // TODO: Add organization selector here when Phase 0.2 is implemented
  // For now, just show a placeholder or user info

  return (
    <header className={`fixed top-0 right-0 h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-30 transition-all duration-300 ${
      isCollapsed ? 'left-20' : 'left-72'
    }`}>
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex-1">
          {/* Page title or breadcrumbs can go here */}
        </div>
        <div className="flex items-center gap-4">
          {/* Organization selector placeholder - will be implemented in Phase 0.2 */}
        </div>
      </div>
    </header>
  )
}

