/**
 * useFileDragDrop
 *
 * Why: Encapsulate global drag/drop listeners and overlay state so App stays
 * focused on state updates. Behavior matches the inline effect previously in App.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useFileDragDrop(handlers: {
  onHsfc: (file: File) => void | Promise<void>
  onHsf: (file: File) => void | Promise<void>
  onL10n?: (file: File) => void | Promise<void>
  onDragStart?: () => void
}) {
  const { onHsfc, onHsf, onL10n, onDragStart } = handlers
  const [active, setActive] = useState(false)
  const counterRef = useRef(0)

  const handlersRef = useRef({ onHsfc, onHsf, onL10n, onDragStart })
  handlersRef.current = { onHsfc, onHsf, onL10n, onDragStart }

  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])

  const hasFiles = useCallback((e: DragEvent): boolean => {
    try {
      const dt = e.dataTransfer
      if (!dt) return false
      if (dt.files && dt.files.length > 0) return true
      if (dt.items && Array.from(dt.items).some(item => item.kind === 'file')) return true
      // Allow drag sources (VS Code explorer, test fixture lists, etc.) that omit the "Files" type but still provide file handles.
      return Array.from(dt.types || []).includes('Files')
    } catch {
      return false
    }
  }, [])

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    try { handlersRef.current.onDragStart?.() } catch {}
    counterRef.current = Math.max(0, counterRef.current) + 1
    setActive(true)
  }, [hasFiles])

  const handleDragOver = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (!activeRef.current) {
      try { handlersRef.current.onDragStart?.() } catch {}
      setActive(true)
    }
  }, [hasFiles])

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    counterRef.current = Math.max(0, counterRef.current - 1)
    counterRef.current === 0 && setActive(false)
  }, [hasFiles])

  const routeFile = useCallback(async (file: File) => {
    // Route based on extension so dev/test fixtures behave exactly like full exports.
    const name = String(file.name || '').toLowerCase()
    if (name.endsWith('.hsfc')) {
      await handlersRef.current.onHsfc(file)
    } else if (name.endsWith('.hsf')) {
      await handlersRef.current.onHsf(file)
    } else if (
      handlersRef.current.onL10n &&
      (name.endsWith('.l10n.json') || name.endsWith('.i18n.json') || name.endsWith('.l10n'))
    ) {
      await handlersRef.current.onL10n(file)
    }
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    counterRef.current = 0
    setActive(false)
    const dt = e.dataTransfer
    if (!dt) return
    const file = dt.files && dt.files[0]
    if (!file) {
      const entryFile = (() => {
        const items = dt.items ? Array.from(dt.items) : []
        for (const item of items) {
          if (item.kind !== 'file') continue
          if (typeof item.getAsFile === 'function') {
            const f = item.getAsFile()
            if (f) return f
          }
        }
        return null
      })()
      if (!entryFile) return
      ;(async () => {
        try { await routeFile(entryFile) } catch {}
      })()
      return
    }
    ;(async () => {
      try { await routeFile(file) } catch {}
    })()
  }, [hasFiles, routeFile])

  // Attach window-level drag/drop listeners while the hook is active so the overlay and routing stay synchronized.
  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop])

  return { active } as const
}
