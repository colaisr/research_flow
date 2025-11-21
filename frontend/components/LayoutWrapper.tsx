'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { useSidebar } from '@/contexts/SidebarContext'

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { isCollapsed } = useSidebar()
  
  // Pages that should not have sidebar/topbar
  const isAuthPage = pathname === '/' || pathname === '/login' || pathname === '/register'

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <TopBar />
      <main className={`pt-16 transition-all duration-300 ${
        isCollapsed ? 'lg:ml-20' : 'lg:ml-72'
      }`}>
        {children}
      </main>
    </div>
  )
}

