/**
 * useFileDragDrop
 *
 * Why: Encapsulate global drag/drop listeners and overlay state so App stays
 * focused on state updates. Behavior matches the inline effect previously in App.
 */
import { useEffect, useRef, useState } from 'react'

export function useFileDragDrop(handlers: {
  onHsfr: (file: File) => void | Promise<void>
  onHsf: (file: File) => void | Promise<void>
  onL10n?: (file: File) => void | Promise<void>
  onDragStart?: () => void
}) {
  const { onHsfr, onHsf, onL10n, onDragStart } = handlers
  const [active, setActive] = useState(false)
  const counterRef = useRef(0)

  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => {
      try { return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files') } catch { return false }
    }
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      try { onDragStart?.() } catch {}
      counterRef.current = Math.max(0, counterRef.current) + 1
      setActive(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (!active) {
        try { onDragStart?.() } catch {}
        setActive(true)
      }
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      counterRef.current = Math.max(0, counterRef.current - 1)
      if (counterRef.current === 0) setActive(false)
    }
    const onDrop = (e: DragEvent) => {
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
            await onHsfr(file)
          } else if (name.endsWith('.hsf')) {
            await onHsf(file)
          } else if (onL10n && (name.endsWith('.l10n.json') || name.endsWith('.i18n.json') || name.endsWith('.l10n'))) {
            await onL10n(file)
          } else {
            // ignore unknown extensions
          }
        } catch {
          // Swallow errors to avoid breaking global listeners
        }
      })()
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [onHsfr, onHsf, onL10n, onDragStart, active])

  return { active } as const
}
