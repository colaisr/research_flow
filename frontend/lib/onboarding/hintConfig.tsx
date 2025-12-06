/**
 * Hint Configuration Types
 * 
 * TypeScript interfaces and types for hint configuration
 */

export type HintPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'
export type HintType = 'tooltip' | 'beacon' | 'spotlight' | 'info'
export type HintTrigger = 'auto' | 'hover' | 'click' | 'focus'
export type HintPriority = 'low' | 'medium' | 'high'

export interface HintAction {
  label: string
  action: () => void | Promise<void>
}

export interface HintContent {
  title?: string
  body: string
  actions?: {
    primary?: HintAction
    secondary?: HintAction
  }
}

export interface HintConditions {
  page?: string
  hasData?: boolean
  userAction?: string
  userRole?: string
  organizationMembers?: number
  [key: string]: any // Allow custom conditions
}

export interface HintConfig {
  id: string                    // Unique hint ID (format: "flow-number.hint-number")
  flow: string                  // Flow identifier (e.g., "dashboard", "analyses", "pipeline-editor")
  target: string                // CSS selector or ref identifier
  content: HintContent
  placement?: HintPlacement      // Default: 'bottom'
  type?: HintType               // Default: 'tooltip'
  trigger?: HintTrigger         // Default: 'auto'
  conditions?: HintConditions
  dismissible?: boolean          // Default: true
  priority?: HintPriority        // Default: 'medium'
  delay?: number                 // Delay in ms before showing (for auto triggers)
}

/**
 * Convert HintConfig to React Joyride step format
 * React Joyride accepts string or ReactNode for content
 */
export function hintConfigToJoyrideStep(config: HintConfig): any {
  // Build content string
  let content = config.content.body
  
  // For hints with complex formatting (like 6.6), format with proper line breaks
  // React Joyride will preserve line breaks in strings
  if (config.id === '6.6') {
    // Keep the formatted string with line breaks - React Joyride should preserve them
    content = config.content.body
  } else {
    // For other hints, use string with title if present
    if (config.content.title) {
      content = `${config.content.title}\n\n${content}`
    }
  }
  
  return {
    target: config.target,
    content: content,
    placement: config.placement || 'bottom',
    disableBeacon: config.type !== 'beacon',
    disableOverlayClose: !config.dismissible,
    spotlightClicks: config.type === 'spotlight',
    // Store original config for action handling
    _hintConfig: config,
  }
}

