'use client'

/**
 * HintDisplay Component
 * 
 * Displays hints using React Joyride for a specific flow
 * This component should be used on individual pages that need hints
 */

import React, { useState, useCallback, useEffect } from 'react'
import Joyride, { CallBackProps, STATUS, EVENTS, ACTIONS } from 'react-joyride'
import { useOnboarding } from '@/contexts/OnboardingContext'
import { hintConfigToJoyrideStep } from '@/lib/onboarding/hintConfig'
import type { HintConfig } from '@/lib/onboarding/hintConfig'

// Force beacon styles using MutationObserver to catch React Joyride's dynamic rendering
if (typeof window !== 'undefined') {
  const styleId = 'joyride-beacon-custom-styles'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      .react-joyride__beacon__inner,
      [class*="beacon__inner"] {
        background-color: #f97316 !important;
        border: 4px solid #ffffff !important;
        width: 36px !important;
        height: 36px !important;
        border-radius: 50% !important;
        box-shadow: 0 0 0 3px #f97316, 0 0 20px rgba(249, 115, 22, 0.8), 0 0 40px rgba(249, 115, 22, 0.4) !important;
      }
      .react-joyride__beacon__outer,
      [class*="beacon__outer"] {
        border: 4px solid #f97316 !important;
        width: 72px !important;
        height: 72px !important;
        border-radius: 50% !important;
        background-color: rgba(249, 115, 22, 0.15) !important;
      }
    `
    document.head.appendChild(style)
  }

  // Use MutationObserver to force styles after React Joyride renders
  const observer = new MutationObserver(() => {
    const beacons = document.querySelectorAll('[class*="beacon"]')
    beacons.forEach((beacon: any) => {
      if (beacon.className?.includes('beacon__inner')) {
        beacon.style.setProperty('background-color', '#f97316', 'important')
        beacon.style.setProperty('border', '4px solid #ffffff', 'important')
        beacon.style.setProperty('width', '36px', 'important')
        beacon.style.setProperty('height', '36px', 'important')
        beacon.style.setProperty('border-radius', '50%', 'important')
        beacon.style.setProperty('box-shadow', '0 0 0 3px #f97316, 0 0 20px rgba(249, 115, 22, 0.8), 0 0 40px rgba(249, 115, 22, 0.4)', 'important')
      }
      if (beacon.className?.includes('beacon__outer')) {
        beacon.style.setProperty('border', '4px solid #f97316', 'important')
        beacon.style.setProperty('width', '72px', 'important')
        beacon.style.setProperty('height', '72px', 'important')
        beacon.style.setProperty('border-radius', '50%', 'important')
        beacon.style.setProperty('background-color', 'rgba(249, 115, 22, 0.15)', 'important')
      }
    })
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  })
}

interface HintDisplayProps {
  steps: HintConfig[]
  flowId: string
  autoStart?: boolean
}

export default function HintDisplay({
  steps,
  flowId,
  autoStart = false
}: HintDisplayProps) {
  const { skipFlow, completeFlow, shouldShowHint, disableAllHints, dismissHint, hintState, isReady } = useOnboarding()
  const [run, setRun] = useState(false)
  
  // Reset run state when autoStart becomes false (e.g., when switching away from a tab)
  // This ensures hints can re-trigger when switching back
  useEffect(() => {
    if (!autoStart) {
      setRun(false)
    }
  }, [autoStart])

  // Filter steps that should be shown (only after context is ready)
  // Note: We don't check for target existence here - let the useEffect retry logic handle it
  // This allows hints to appear even if targets aren't ready yet (e.g., after tab switches)
  const visibleSteps = isReady ? steps.filter(step => {
    try {
      const shouldShow = shouldShowHint(step.id, step.flow)
      if (!shouldShow) {
        // Debug: log why hint is not showing
        console.debug(`[Onboarding] Hint ${step.id} (${step.flow}) not showing:`, {
          hintState,
          dismissed: hintState.dismissedHints.includes(step.id),
          flowSkipped: hintState.skippedFlows.includes(step.flow),
          hintsDisabled: hintState.hintsDisabled
        })
        return false
      }
      
      // Don't check target existence here - let useEffect handle it with retries
      // This allows hints to work even when DOM is still updating (e.g., tab switches)
      
      return true
    } catch (e) {
      // If context not ready, don't show hint
      console.error('[Onboarding] Error checking hint:', e)
      return false
    }
  }) : []
  
  // Convert to Joyride format
  const joyrideSteps = visibleSteps.map(step => {
    const joyrideStep = hintConfigToJoyrideStep(step)
    // Note: Beacon styling is handled via CSS in globals.css and MutationObserver
    // We don't set styles.beacon here as React Joyride doesn't support nested beacon styles
    // Add custom formatting for hint 6.6 to preserve line breaks and make mode names bold
    if (step.id === '6.6' && typeof joyrideStep.content === 'string') {
      const contentString = joyrideStep.content
      const lines = contentString.split('\n')
      joyrideStep.content = (
        <div style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
          {lines.map((line: string, index: number) => {
            // Make mode names bold
            if (line.trim() === 'Полный редактор' || line.trim() === 'Только файлы') {
              return (
                <React.Fragment key={index}>
                  <strong>{line.trim()}</strong>
                  {index < lines.length - 1 && '\n'}
                </React.Fragment>
              )
            }
            // Regular lines
            return (
              <React.Fragment key={index}>
                {line}
                {index < lines.length - 1 && '\n'}
              </React.Fragment>
            )
          })}
        </div>
      )
    }
    return joyrideStep
  })
  
  // Debug: log what we're passing to Joyride
  useEffect(() => {
    if (run && joyrideSteps.length > 0) {
      console.debug('[Onboarding] Passing to Joyride:', {
        run,
        stepsCount: joyrideSteps.length,
        steps: joyrideSteps.map(s => ({
          target: s.target,
          content: s.content?.body?.substring(0, 50) + '...',
          targetExists: typeof window !== 'undefined' ? !!document.querySelector(s.target as string) : false
        }))
      })
    }
  }, [run, joyrideSteps.length, joyrideSteps])

  // Force beacon styles after React Joyride renders - AGGRESSIVE APPROACH
  useEffect(() => {
    if (run) {
      const forceBeaconStyles = () => {
        // Find all possible beacon elements
        const selectors = [
          '[class*="beacon"]',
          '[class*="Beacon"]',
          '.react-joyride__beacon',
          '.react-joyride__beacon__inner',
          '.react-joyride__beacon__outer',
        ]
        
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector)
          elements.forEach((element: any) => {
            const className = element.className || ''
            
            // Force orange color on inner beacon
            if (className.includes('beacon__inner') || className.includes('Beacon__inner') || 
                (element.children.length === 0 && element.offsetWidth < 50)) {
              element.style.setProperty('background-color', '#f97316', 'important')
              element.style.setProperty('border', '4px solid #ffffff', 'important')
              element.style.setProperty('width', '36px', 'important')
              element.style.setProperty('height', '36px', 'important')
              element.style.setProperty('border-radius', '50%', 'important')
              element.style.setProperty('box-shadow', '0 0 0 3px #f97316, 0 0 20px rgba(249, 115, 22, 0.8), 0 0 40px rgba(249, 115, 22, 0.4)', 'important')
            }
            
            // Force orange color on outer beacon
            if (className.includes('beacon__outer') || className.includes('Beacon__outer') ||
                (element.children.length > 0 && element.offsetWidth > 50)) {
              element.style.setProperty('border', '4px solid #f97316', 'important')
              element.style.setProperty('width', '72px', 'important')
              element.style.setProperty('height', '72px', 'important')
              element.style.setProperty('border-radius', '50%', 'important')
              element.style.setProperty('background-color', 'rgba(249, 115, 22, 0.15)', 'important')
            }
          })
        })
      }

      // Force immediately and then very frequently to catch React Joyride's updates
      forceBeaconStyles()
      const interval = setInterval(forceBeaconStyles, 100) // Check every 100ms
      return () => clearInterval(interval)
    }
  }, [run])

  // Auto-start if enabled and there are visible steps
  // Reset run when autoStart changes to allow re-triggering on tab switches
  useEffect(() => {
    if (!autoStart) {
      setRun(false)
      return
    }
    
    console.debug(`[Onboarding] HintDisplay effect:`, {
      autoStart,
      visibleStepsCount: visibleSteps.length,
      run,
      flowId,
      stepIds: visibleSteps.map(s => s.id)
    })
    
    if (autoStart && visibleSteps.length > 0 && !run) {
      // Check if at least one target element exists in DOM
      // React Joyride will automatically skip steps with missing targets
      const checkTargetsExist = () => {
        return visibleSteps.some(step => {
          try {
            const element = document.querySelector(step.target)
            return element !== null
          } catch (e) {
            // Invalid selector, skip this step
            return false
          }
        })
      }

      // Check if any step has a delay
      const maxDelay = Math.max(...visibleSteps.map(s => s.delay || 0), 0)
      const baseDelay = Math.max(maxDelay, 500) // Minimum 500ms to ensure DOM is ready
      
      const timer = setTimeout(() => {
        // Double-check targets exist before starting
        if (checkTargetsExist()) {
          setRun(true)
        } else {
          // If targets don't exist, try again after a short delay (retry up to 5 times)
          // Increased retries to handle tab switches and dynamic content loading
          let retryCount = 0
          const maxRetries = 5
          const retryDelay = 600
          
          const retryCheck = () => {
            retryCount++
            if (checkTargetsExist()) {
              setRun(true)
            } else if (retryCount < maxRetries) {
              setTimeout(retryCheck, retryDelay)
            } else {
              // Final attempt failed - log which targets are missing
                const missingTargets = visibleSteps
                  .map(s => ({
                    id: s.id,
                    target: s.target,
                    exists: !!document.querySelector(s.target)
                  }))
                .filter(s => !s.exists)
              if (missingTargets.length > 0) {
                console.warn('[Onboarding] Some hint targets not found after retries:', missingTargets)
              }
                console.debug('[Onboarding] All hint targets status:',
                  visibleSteps.map(s => ({
                    id: s.id,
                    target: s.target,
                    exists: !!document.querySelector(s.target),
                    selector: s.target
                  }))
                )
            }
          }
          
          setTimeout(retryCheck, retryDelay)
        }
      }, baseDelay)
      
      return () => clearTimeout(timer)
    }
  }, [autoStart, visibleSteps.length, run, visibleSteps])

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { status, action, index, type, step } = data
    const hintId = (step as any)?._hintConfig?.id

    // Handle skip button - only skip flow if user explicitly clicks "Skip tutorial"
    if (action === ACTIONS.SKIP || status === STATUS.SKIPPED) {
      skipFlow(flowId)
      setRun(false)
      return
    }

    // Handle close button - dismiss the current hint
    if (action === ACTIONS.CLOSE) {
      if (hintId) {
        dismissHint(hintId)
      }
      setRun(false)
      return
    }

    // Handle completion - dismiss the current hint and mark flow as complete
    if (status === STATUS.FINISHED) {
      if (hintId) {
        dismissHint(hintId)
      }
      completeFlow(flowId)
      setRun(false)
      return
    }

    // Handle step navigation - dismiss hint when moving to next step or finishing
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      // Dismiss current hint when moving to next step
      if (hintId) {
        dismissHint(hintId)
      }
      // Continue to next step or stop if target not found
      if (index === joyrideSteps.length - 1) {
        completeFlow(flowId)
        setRun(false)
      }
    }

    // Handle action buttons if present
    if ((step as any)?._hintConfig?.content?.actions) {
      // Actions will be handled by custom content rendering (if needed)
    }
  }, [flowId, skipFlow, completeFlow, dismissHint, joyrideSteps.length])

  // Don't render if no visible steps (but allow rendering if run is true to let Joyride handle missing targets)
  if (visibleSteps.length === 0) {
    return null
  }

  return (
    <Joyride
      steps={joyrideSteps}
      run={run}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#f97316', // BRIGHT ORANGE instead of blue
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 8,
        },
        buttonNext: {
          backgroundColor: '#3b82f6',
          fontSize: '14px',
          padding: '8px 16px',
        },
        buttonBack: {
          color: '#6b7280',
          fontSize: '14px',
          marginRight: '8px',
        },
        buttonSkip: {
          color: '#6b7280',
          fontSize: '14px',
        },
        // Beacon styling is handled via CSS in globals.css and MutationObserver
        // React Joyride doesn't support nested beacon styles in the styles prop
      }}
      locale={{
        back: 'Назад',
        close: 'Закрыть',
        last: 'Завершить',
        next: 'Далее',
        skip: 'Пропустить обучение',
      }}
    />
  )
}

