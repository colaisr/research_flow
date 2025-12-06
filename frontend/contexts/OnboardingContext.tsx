'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  getHintState,
  saveHintState,
  shouldShowHint,
  dismissHint as dismissHintState,
  skipFlow as skipFlowState,
  disableAllHints as disableAllHintsState,
  completeFlow as completeFlowState,
  type HintState
} from '@/lib/onboarding/hintState'

interface OnboardingContextType {
  hintState: HintState
  shouldShowHint: (hintId: string, flowId: string) => boolean
  dismissHint: (hintId: string) => void
  skipFlow: (flowId: string) => void
  disableAllHints: () => void
  completeFlow: (flowId: string) => void
  refreshState: () => void
  isReady: boolean
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider')
  }
  return context
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hintState, setHintState] = useState<HintState>(getHintState())
  const [isReady, setIsReady] = useState(false)

  // Refresh state from localStorage
  const refreshState = useCallback(() => {
    setHintState(getHintState())
  }, [])

  // Dismiss hint
  const dismissHint = useCallback((hintId: string) => {
    dismissHintState(hintId)
    refreshState()
  }, [refreshState])

  // Skip flow
  const skipFlow = useCallback((flowId: string) => {
    skipFlowState(flowId)
    refreshState()
  }, [refreshState])

  // Disable all hints
  const disableAllHints = useCallback(() => {
    disableAllHintsState()
    refreshState()
  }, [refreshState])

  // Complete flow
  const completeFlow = useCallback((flowId: string) => {
    completeFlowState(flowId)
    refreshState()
  }, [refreshState])

  // Check if hint should show
  const checkShouldShowHint = useCallback((hintId: string, flowId: string) => {
    return shouldShowHint(hintId, flowId)
  }, [])

  // Load state on mount and ensure it's initialized
  useEffect(() => {
    refreshState()
    // Force a re-check after a brief delay to ensure localStorage is ready
    const timer = setTimeout(() => {
      refreshState()
      setIsReady(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [refreshState])

  const value: OnboardingContextType = {
    hintState,
    shouldShowHint: checkShouldShowHint,
    dismissHint,
    skipFlow,
    disableAllHints,
    completeFlow,
    refreshState,
    isReady
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}

