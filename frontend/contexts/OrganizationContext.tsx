'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface OrganizationContextType {
  currentOrganizationId: number | null
  setCurrentOrganizationId: (id: number | null) => void
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [currentOrganizationId, setCurrentOrganizationIdState] = useState<number | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('currentOrganizationId')
      if (stored) {
        setCurrentOrganizationIdState(parseInt(stored, 10))
      }
    }
  }, [])

  const setCurrentOrganizationId = (id: number | null) => {
    setCurrentOrganizationIdState(id)
    if (typeof window !== 'undefined') {
      if (id !== null) {
        localStorage.setItem('currentOrganizationId', id.toString())
      } else {
        localStorage.removeItem('currentOrganizationId')
      }
    }
  }

  return (
    <OrganizationContext.Provider value={{ currentOrganizationId, setCurrentOrganizationId }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganizationContext() {
  const context = useContext(OrganizationContext)
  if (context === undefined) {
    throw new Error('useOrganizationContext must be used within an OrganizationProvider')
  }
  return context
}

