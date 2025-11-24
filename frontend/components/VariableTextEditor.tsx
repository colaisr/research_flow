'use client'

import { useState, useRef, useEffect, useImperativeHandle, forwardRef, KeyboardEvent, ClipboardEvent } from 'react'

interface VariableTextEditorProps {
  value: string
  onChange: (value: string) => void
  stepIndex: number
  availableVariables: string[]
}

interface TextSegment {
  type: 'text' | 'variable'
  content: string
}

export interface VariableTextEditorHandle {
  insertVariable: (variable: string) => void
  getCurrentText: () => string
  selectAll: () => void
}

const VariableTextEditor = forwardRef<VariableTextEditorHandle, VariableTextEditorProps>(
  ({ value, onChange, stepIndex, availableVariables }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null)
    const [isFocused, setIsFocused] = useState(false)
    const isUpdatingRef = useRef(false)
    const lastInsertedVariableRef = useRef<string | null>(null)
    const lastInsertedTimestampRef = useRef<number | null>(null)
    const insertTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const savedSelectionRef = useRef<Range | null>(null)

  // Parse text into segments (text and variables)
  const parseText = (text: string): TextSegment[] => {
    const segments: TextSegment[] = []
    let currentIndex = 0
    
    // Match variables: {variable_name}
    const variableRegex = /\{([^}]+)\}/g
    let match
    
    while ((match = variableRegex.exec(text)) !== null) {
      // Add text before variable
      if (match.index > currentIndex) {
        segments.push({
          type: 'text',
          content: text.slice(currentIndex, match.index)
        })
      }
      
      // Add variable
      const fullVariable = `{${match[1]}}`
      // Check if it's a valid variable
      if (availableVariables.includes(fullVariable)) {
        segments.push({
          type: 'variable',
          content: fullVariable
        })
      } else {
        // Invalid variable, treat as text
        segments.push({
          type: 'text',
          content: fullVariable
        })
      }
      
      currentIndex = match.index + match[0].length
    }
    
    // Add remaining text
    if (currentIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.slice(currentIndex)
      })
    }
    
    return segments.length > 0 ? segments : [{ type: 'text', content: text }]
  }

  const segments = parseText(value)

  // Get plain text from editor content
  const getTextFromEditor = (): string => {
    if (!editorRef.current) return value
    
    let text = ''
    const walker = document.createTreeWalker(
      editorRef.current,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            // Skip text nodes that are inside variable pills (they contain the variable name + ×)
            const parent = node.parentElement
            if (parent && parent.dataset.variable) {
              return NodeFilter.FILTER_REJECT // Reject text nodes inside variable pills
            }
            // Also skip text nodes inside delete buttons (× symbols)
            if (parent && parent.classList.contains('cursor-pointer')) {
              return NodeFilter.FILTER_REJECT
            }
            return NodeFilter.FILTER_ACCEPT
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            // Skip delete button elements
            if (el.classList.contains('cursor-pointer') && el.textContent === '×') {
              return NodeFilter.FILTER_REJECT
            }
            if (el.dataset.variable) {
              return NodeFilter.FILTER_ACCEPT
            }
          }
          return NodeFilter.FILTER_SKIP
        }
      }
    )
    
    let node
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const content = node.textContent || ''
        text += content
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.dataset.variable) {
          // Only use dataset.variable, don't read textContent (which includes × button)
          text += el.dataset.variable
        }
      }
    }
    
    return text
  }

  // Update value when content changes
  const handleInput = () => {
    if (isUpdatingRef.current) return
    const newText = getTextFromEditor()
    if (newText !== value) {
      onChange(newText)
    }
  }

  // Handle paste - convert to plain text
  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      range.insertNode(document.createTextNode(text))
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
      handleInput()
    }
  }

  // Handle keydown - prevent editing variables, handle backspace
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const startContainer = range.startContainer
    
    // If cursor is inside a variable pill, prevent editing
    if (startContainer.nodeType === Node.ELEMENT_NODE) {
      const el = startContainer as HTMLElement
      if (el.dataset.variable || el.closest('[data-variable]')) {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          return
        }
      }
    }
    
    // Handle backspace to delete variable pills
    if (e.key === 'Backspace' && range.collapsed) {
      const prevNode = range.startContainer.previousSibling
      if (prevNode && prevNode.nodeType === Node.ELEMENT_NODE) {
        const el = prevNode as HTMLElement
        if (el.dataset.variable && range.startOffset === 0) {
          e.preventDefault()
          el.remove()
          handleInput()
          return
        }
      }
    }
  }

  // Save selection when editor loses focus (e.g., when clicking palette button)
  const handleBlur = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && editorRef.current) {
      const range = selection.getRangeAt(0)
      // Only save if selection is within our editor
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        savedSelectionRef.current = range.cloneRange()
      }
    }
    setIsFocused(false)
  }

  // Insert variable at cursor position
  const insertVariable = (variable: string) => {
    if (!editorRef.current) return

    // Ensure editor has focus and wait a bit for focus to settle
    if (!isFocused) {
      editorRef.current.focus()
      // Small delay to ensure focus is set
      setTimeout(() => {
        insertVariableInternal(variable)
      }, 10)
      return
    }

    insertVariableInternal(variable)
  }

  const insertVariableInternal = (variable: string) => {
    if (!editorRef.current) return

    // Try to get selection - first from current selection, then from saved
    let selection = window.getSelection()
    let range: Range | null = null

    if (selection && selection.rangeCount > 0) {
      const currentRange = selection.getRangeAt(0)
      // Check if selection is within our editor
      if (editorRef.current && editorRef.current.contains(currentRange.commonAncestorContainer)) {
        range = currentRange
      }
    }

    // If no valid selection, try to restore saved selection
    if (!range && savedSelectionRef.current && editorRef.current) {
      try {
        if (editorRef.current.contains(savedSelectionRef.current.commonAncestorContainer)) {
          range = savedSelectionRef.current.cloneRange()
          if (selection) {
            selection.removeAllRanges()
            selection.addRange(range)
          }
        }
      } catch (e) {
        // Failed to restore saved selection, continue to use end of editor
      }
    }

    // If still no range, insert at end
    if (!range && editorRef.current) {
      range = document.createRange()
      range.selectNodeContents(editorRef.current)
      range.collapse(false) // Collapse to end
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }

    if (!range) return

    // Only prevent rapid duplicate insertions (within 500ms) to avoid accidental double-clicks
    // But allow multiple uses of the same variable in different contexts
    if (lastInsertedVariableRef.current === variable && lastInsertedTimestampRef.current !== null) {
      const timeSinceLastInsert = Date.now() - lastInsertedTimestampRef.current
      if (timeSinceLastInsert < 500) {
        return
      }
    }

    // Mark this variable as just inserted (with timestamp for debounce)
    lastInsertedVariableRef.current = variable
    lastInsertedTimestampRef.current = Date.now()
    if (insertTimeoutRef.current) {
      clearTimeout(insertTimeoutRef.current)
    }
    insertTimeoutRef.current = setTimeout(() => {
      lastInsertedVariableRef.current = null
      lastInsertedTimestampRef.current = null
    }, 500)

    range.deleteContents()
    
    // Create variable pill
    const pill = document.createElement('span')
    pill.dataset.variable = variable
    pill.contentEditable = 'false'
    // Determine if it's a standard variable or step output variable
    const isStepOutput = variable.includes('_output')
    pill.className = `inline-flex items-center px-2 py-0.5 mx-0.5 rounded border font-mono text-xs ${
      isStepOutput 
        ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300'
        : 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300'
    }`
    pill.textContent = variable
    
    // Add delete button
    const deleteBtn = document.createElement('span')
    deleteBtn.className = 'ml-1 cursor-pointer hover:text-red-600 dark:hover:text-red-400'
    deleteBtn.textContent = '×'
    deleteBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      pill.remove()
      handleInput()
    }
    pill.appendChild(deleteBtn)
    
    try {
      range.insertNode(pill)
      
      // Move cursor after pill and update selection
      const newRange = document.createRange()
      newRange.setStartAfter(pill)
      newRange.collapse(true)
      
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(newRange)
      }
      
      // Update saved selection
      savedSelectionRef.current = newRange.cloneRange()
      
      handleInput()
    } catch (e) {
      console.error('Error inserting variable:', e)
    }
  }

  // Render content
  useEffect(() => {
    if (!editorRef.current) return
    
    const currentText = getTextFromEditor()
    if (currentText === value) return // Already synced
    
    isUpdatingRef.current = true
    
    // Rebuild content
    const segments = parseText(value)
    const selection = window.getSelection()
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
    
    editorRef.current.innerHTML = ''
    
    segments.forEach((segment) => {
      if (segment.type === 'variable') {
        const pill = document.createElement('span')
        pill.dataset.variable = segment.content
        pill.contentEditable = 'false'
        // Determine if it's a standard variable or step output variable
        const isStepOutput = segment.content.includes('_output')
        pill.className = `inline-flex items-center px-2 py-0.5 mx-0.5 rounded border font-mono text-xs ${
          isStepOutput 
            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-300'
            : 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300'
        }`
        pill.textContent = segment.content
        
        const deleteBtn = document.createElement('span')
        deleteBtn.className = 'ml-1 cursor-pointer hover:text-red-600 dark:hover:text-red-400'
        deleteBtn.textContent = '×'
        deleteBtn.onclick = (e) => {
          e.preventDefault()
          e.stopPropagation()
          pill.remove()
          handleInput()
        }
        pill.appendChild(deleteBtn)
        
        editorRef.current!.appendChild(pill)
      } else {
        const textNode = document.createTextNode(segment.content)
        editorRef.current!.appendChild(textNode)
      }
    })
    
    // Restore selection if possible
    if (range && editorRef.current.contains(range.startContainer)) {
      try {
        selection?.removeAllRanges()
        selection?.addRange(range)
      } catch (e) {
        // Selection restoration failed, ignore
      }
    }
    
    setTimeout(() => {
      isUpdatingRef.current = false
    }, 0)
  }, [value, availableVariables])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (insertTimeoutRef.current) {
        clearTimeout(insertTimeoutRef.current)
      }
    }
  }, [])

  // Select all text in the editor
  const selectAll = () => {
    if (!editorRef.current) return
    
    editorRef.current.focus()
    
    // Wait a bit for focus to settle, then select all
    setTimeout(() => {
      if (!editorRef.current) return
      
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editorRef.current)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }, 10)
  }

  // Expose insertVariable, getCurrentText, and selectAll methods via ref
  useImperativeHandle(ref, () => ({
    insertVariable,
    getCurrentText: getTextFromEditor,
    selectAll
  }), [])

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        className="w-full min-h-[100px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      />
    </div>
  )
})

VariableTextEditor.displayName = 'VariableTextEditor'

export default VariableTextEditor

