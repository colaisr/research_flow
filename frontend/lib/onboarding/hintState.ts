/**
 * Hint State Management
 * 
 * Manages hint state in localStorage (permanent dismissals, skipped flows, global disable)
 * Hints are one-time only for first-time users - once dismissed, they stay off permanently.
 */

export interface HintState {
  // Global disable (permanent)
  hintsDisabled: boolean
  
  // Dismissed hints (permanent)
  dismissedHints: string[]
  
  // Skipped flows (permanent)
  skippedFlows: string[]
  
  // Completed flows (for tracking, but hints won't show again)
  completedFlows: string[]
}

const STORAGE_KEY = 'researchflow_hints'

/**
 * Get hint state from localStorage
 */
export function getHintState(): HintState {
  if (typeof window === 'undefined') {
    // SSR: return default state
    return getDefaultState()
  }
  
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (e) {
      console.error('Failed to parse hint state:', e)
      return getDefaultState()
    }
  }
  
  return getDefaultState()
}

/**
 * Get default hint state (hints enabled for everyone)
 */
function getDefaultState(): HintState {
  return {
    hintsDisabled: false,
    dismissedHints: [],
    skippedFlows: [],
    completedFlows: []
  }
}

/**
 * Save hint state to localStorage
 */
export function saveHintState(state: HintState): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.error('Failed to save hint state:', e)
  }
}

/**
 * Check if hint should be shown
 */
export function shouldShowHint(hintId: string, flowId: string): boolean {
  const state = getHintState()
  
  // Global disable check
  if (state.hintsDisabled) return false
  
  // Check if hint was dismissed
  if (state.dismissedHints.includes(hintId)) return false
  
  // Check if flow was skipped
  if (state.skippedFlows.includes(flowId)) return false
  
  return true
}

/**
 * Dismiss a hint (permanent)
 */
export function dismissHint(hintId: string): void {
  const state = getHintState()
  if (!state.dismissedHints.includes(hintId)) {
    state.dismissedHints.push(hintId)
    saveHintState(state)
  }
}

/**
 * Skip an entire flow (permanent)
 */
export function skipFlow(flowId: string): void {
  const state = getHintState()
  if (!state.skippedFlows.includes(flowId)) {
    state.skippedFlows.push(flowId)
    saveHintState(state)
  }
}

/**
 * Disable all hints globally (permanent)
 */
export function disableAllHints(): void {
  const state = getHintState()
  state.hintsDisabled = true
  saveHintState(state)
}

/**
 * Mark flow as completed (for tracking)
 */
export function completeFlow(flowId: string): void {
  const state = getHintState()
  if (!state.completedFlows.includes(flowId)) {
    state.completedFlows.push(flowId)
    saveHintState(state)
  }
}

/**
 * Reset hint state (for testing/debugging)
 * This will clear all hint state and allow hints to show again
 */
export function resetHintState(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Reset a specific flow (for testing/debugging)
 * This will remove the flow from skipped flows, allowing hints to show again
 */
export function resetFlow(flowId: string): void {
  const state = getHintState()
  state.skippedFlows = state.skippedFlows.filter(id => id !== flowId)
  state.dismissedHints = state.dismissedHints.filter(id => id.startsWith(flowId.split('.')[0] + '.'))
  saveHintState(state)
}

