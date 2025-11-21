'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { useSidebar } from '@/contexts/SidebarContext'
import { useAuth } from '@/hooks/useAuth'

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

  const { user } = useAuth()
  const hasBanner = user?.is_impersonated

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="fixed top-0 left-0 right-0 z-50">
        <ImpersonationBanner />
      </div>
      <Sidebar />
      <TopBar />
      <main className={`transition-all duration-300 ${
        hasBanner ? 'pt-24' : 'pt-16'
      } ${isCollapsed ? 'lg:ml-20' : 'lg:ml-72'}`}>
        {children}
      </main>
    </div>
  )
}

