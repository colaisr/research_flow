'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

// Public routes where we don't check auth
const PUBLIC_ROUTES = ['/', '/login', '/register']

interface User {
  id: number
  email: string
  full_name: string | null
  is_admin: boolean  // Deprecated, use role instead
  role: string  // 'admin' (platform admin) or 'user' (regular user)
  created_at: string
  is_impersonated?: boolean
  impersonated_by?: number
  impersonated_by_email?: string
}

// Simple function to get current user - just make the request
async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await apiClient.get<User>(`${API_BASE_URL}/api/auth/me`, {
      withCredentials: true,
      validateStatus: (status) => status === 200 || status === 401, // Don't throw on 401
    })
    
    if (response.status === 401) {
      return null // Not authenticated
    }
    
    return response.data
  } catch {
    return null
  }
}

async function logout() {
  await apiClient.post(`${API_BASE_URL}/api/auth/logout`, {}, {
    withCredentials: true
  })
}

export function useAuth() {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  
  // Only check auth on protected routes
  // Wait for pathname to be available before deciding
  // Check if pathname matches any public route or starts with /rags/public
  const isPublicRoute = pathname ? (
    PUBLIC_ROUTES.includes(pathname) || 
    pathname.startsWith('/rags/public/')
  ) : false
  const shouldCheckAuth = pathname !== null && !isPublicRoute

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getCurrentUser,
    enabled: shouldCheckAuth, // Only run when pathname is known and route is protected
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Always refetch on mount (important for page reload)
  })

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null)
      router.push('/login')
    },
  })

  return {
    user: user || null,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || user?.role === 'admin' || false,
    isPlatformAdmin: user?.role === 'admin' || false,
    isOrgAdmin: user?.role === 'admin' || false, // Platform admins are always org admins. For regular users, check organization membership.
    role: user?.role || null,
    logout: () => logoutMutation.mutate(),
  }
}

export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Only redirect if we're done loading and not authenticated
    // This prevents redirect during the initial auth check on page reload
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  return { isAuthenticated, isLoading }
}
