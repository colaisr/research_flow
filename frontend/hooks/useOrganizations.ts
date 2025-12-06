'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import apiClient from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import { useRouter, usePathname } from 'next/navigation'
import { useOrganizationContext } from '@/contexts/OrganizationContext'
import { useAuth } from '@/hooks/useAuth'

export interface Organization {
  id: number
  name: string
  slug: string | null
  is_personal: boolean
  role: string | null  // User's role in this organization
  owner_id: number | null  // Organization owner user ID
  member_count: number
  created_at: string
}

async function fetchOrganizations(): Promise<Organization[]> {
  try {
    const response = await apiClient.get<Organization[]>(`${API_BASE_URL}/api/organizations`, {
      withCredentials: true,
      validateStatus: (status) => status === 200 || status === 401, // Don't throw on 401
    })
    
    if (response.status === 401) {
      return [] // Not authenticated, return empty array
    }
    
    return response.data
  } catch {
    return [] // Return empty array on any error
  }
}

async function switchOrganization(organizationId: number): Promise<Organization> {
  const { data } = await apiClient.post<Organization>(
    `${API_BASE_URL}/api/organizations/switch`,
    { organization_id: organizationId },
    { withCredentials: true }
  )
  return data
}

async function createOrganization(name: string): Promise<Organization> {
  const { data } = await apiClient.post<Organization>(
    `${API_BASE_URL}/api/organizations`,
    { name },
    { withCredentials: true }
  )
  return data
}

async function leaveOrganization(organizationId: number): Promise<void> {
  await apiClient.delete(
    `${API_BASE_URL}/api/organizations/${organizationId}/leave`,
    { withCredentials: true }
  )
}

export function useOrganizations() {
  const queryClient = useQueryClient()
  const { setCurrentOrganizationId } = useOrganizationContext()
  const pathname = usePathname()
  const { isAuthenticated } = useAuth()
  const isPublicRAGPage = pathname?.startsWith('/rags/public/')
  
  const { data: organizations = [], isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
    enabled: isAuthenticated && !isPublicRAGPage, // Only fetch if authenticated and not on public RAG pages
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Initialize current organization from localStorage or default to personal org
  useEffect(() => {
    if (organizations.length > 0 && typeof window !== 'undefined') {
      const stored = localStorage.getItem('currentOrganizationId')
      if (stored) {
        const storedId = parseInt(stored, 10)
        // Verify the stored org still exists in the list
        if (organizations.find(org => org.id === storedId)) {
          setCurrentOrganizationId(storedId)
        } else {
          // Fallback to personal org
          const personalOrg = organizations.find(org => org.is_personal)
          if (personalOrg) {
            setCurrentOrganizationId(personalOrg.id)
          }
        }
      } else {
        // Default to personal org
        const personalOrg = organizations.find(org => org.is_personal)
        if (personalOrg) {
          setCurrentOrganizationId(personalOrg.id)
        }
      }
    }
  }, [organizations, setCurrentOrganizationId])

  const switchMutation = useMutation({
    mutationFn: switchOrganization,
    onSuccess: (newOrg) => {
      // Update context
      setCurrentOrganizationId(newOrg.id)
      // Invalidate all queries to refetch with new organization context
      queryClient.invalidateQueries()
      // Update organizations list
      queryClient.setQueryData(['organizations'], (old: Organization[] | undefined) => {
        if (!old) return [newOrg]
        return old.map(org => org.id === newOrg.id ? newOrg : org)
      })
    },
  })

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: (newOrg) => {
      // Invalidate organizations list to refetch
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      // Optionally switch to the new organization
      setCurrentOrganizationId(newOrg.id)
    },
  })

  const leaveMutation = useMutation({
    mutationFn: leaveOrganization,
    onSuccess: () => {
      // Invalidate organizations list to refetch
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      // Switch to personal org if leaving current org
      const personalOrg = organizations.find(org => org.is_personal)
      if (personalOrg) {
        setCurrentOrganizationId(personalOrg.id)
      }
    },
  })

  return {
    organizations,
    isLoading,
    switchOrganization: (organizationId: number) => switchMutation.mutate(organizationId),
    isSwitching: switchMutation.isPending,
    createOrganization: (name: string) => createMutation.mutate(name),
    isCreating: createMutation.isPending,
    leaveOrganization: (organizationId: number) => leaveMutation.mutate(organizationId),
    isLeaving: leaveMutation.isPending,
  }
}

