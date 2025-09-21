/**
 * useFileDragDrop
 *
 * Why: Encapsulate global drag/drop listeners and overlay state so App stays
 * focused on state updates. Behavior matches the inline effect previously in App.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useFileDragDrop(handlers: {
  onHsfr: (file: File) => void | Promise<void>
  onHsf: (file: File) => void | Promise<void>
  onL10n?: (file: File) => void | Promise<void>
  onDragStart?: () => void
}) {
  const { onHsfr, onHsf, onL10n, onDragStart } = handlers
  const [active, setActive] = useState(false)
  const counterRef = useRef(0)

  const handlersRef = useRef({ onHsfr, onHsf, onL10n, onDragStart })
  handlersRef.current = { onHsfr, onHsf, onL10n, onDragStart }

  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])

  const hasFiles = useCallback((e: DragEvent): boolean => {
    try { return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files') } catch { return false }
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

  const handleDrop = useCallback((e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    counterRef.current = 0
    setActive(false)
    const dt = e.dataTransfer
    const file = dt && dt.files && dt.files[0]
    if (!file) return
    const name = String(file.name || '').toLowerCase()
    ;(async () => {
      try {
        if (name.endsWith('.hsfr')) {
          await handlersRef.current.onHsfr(file)
        } else if (name.endsWith('.hsf')) {
          await handlersRef.current.onHsf(file)
        } else if (handlersRef.current.onL10n && (name.endsWith('.l10n.json') || name.endsWith('.i18n.json') || name.endsWith('.l10n'))) {
          await handlersRef.current.onL10n(file)
        }
      } catch {
        // Swallow errors to avoid breaking global listeners
      }
    })()
  }, [hasFiles])

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
