'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { SidebarProvider } from '@/contexts/SidebarContext'
import { OrganizationProvider } from '@/contexts/OrganizationContext'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        refetchOnWindowFocus: false,
        retry: (failureCount, error: any) => {
          // Don't retry on 401 errors (user is not authenticated)
          if (error?.response?.status === 401) {
            return false
          }
          return failureCount < 3
        },
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <OrganizationProvider>
      {children}
        </OrganizationProvider>
      </SidebarProvider>
    </QueryClientProvider>
  )
}
