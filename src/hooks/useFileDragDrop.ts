/**
 * useFileDragDrop
 *
 * Why: Encapsulate global drag/drop listeners and overlay state so App stays
 * focused on state updates. Behavior matches the inline effect previously in App.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { GEAR_DB_FILE_EXTENSIONS } from '../lib/constants'

export type FileRouteHandlers = {
  onSfc: (file: File, context?: FileRouteContext) => void | Promise<void>
  onHsf: (file: File, context?: FileRouteContext) => void | Promise<void>
  onL10n?: (file: File, context?: FileRouteContext) => void | Promise<void>
  onGearDb?: (file: File, context?: FileRouteContext) => void | Promise<void>
  onGearSets?: (file: File, context?: FileRouteContext) => void | Promise<void>
  onUnknownFile?: (file: File, context?: FileRouteContext) => void | Promise<void>
}

// Route context carries transient key modifiers from entry points.
// Why: Shift-triggered SFC imports open the selective import dialog.
export type FileRouteContext = {
  shiftKey?: boolean
  source?: 'manual' | 'command'
}

export async function routeFileByExtension(file: File, handlers: FileRouteHandlers, context?: FileRouteContext): Promise<void> {
  // Central router shared by drag/drop and manual file pickers.
  // Why: all supported file types should behave identically regardless of entry point.
  const name = String(file.name || '').toLowerCase()
  // `.sfc` (and legacy `.sfr`/`.hsfc`) = app recipe bundle.
  if (name.endsWith('.sfc') || name.endsWith('.sfr') || name.endsWith('.hsfc')) {
    await handlers.onSfc(file, context)
    return
  }
  // `.hsf` = RSL Helper sellfile.
  if (name.endsWith('.hsf')) {
    await handlers.onHsf(file, context)
    return
  }
  // Gear DB diffs/snapshots share multiple extensions.
  if (handlers.onGearDb && GEAR_DB_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    await handlers.onGearDb(file, context)
    return
  }
  // Runtime gear-set patch files (`.gearsets.json` / `.gearsets`).
  if (handlers.onGearSets && (name.endsWith('.gearsets.json') || name.endsWith('.gearsets'))) {
    await handlers.onGearSets(file, context)
    return
  }
  // Runtime localization patches (`.l10n.json` / `.i18n.json` / `.l10n`).
  if (
    handlers.onL10n
    && (name.endsWith('.l10n.json') || name.endsWith('.i18n.json') || name.endsWith('.l10n'))
  ) {
    await handlers.onL10n(file, context)
    return
  }
  // Anything else is rejected with a toast/dialog.
  if (handlers.onUnknownFile) {
    await handlers.onUnknownFile(file, context)
  }
}

export function useFileDragDrop(handlers: FileRouteHandlers & { onDragStart?: () => void }) {
  const { onDragStart, ...routeHandlers } = handlers
  const [active, setActive] = useState(false)
  const counterRef = useRef(0)

  const handlersRef = useRef({ ...routeHandlers, onDragStart })
  // Sync the ref in an effect so we never write during render.
  useEffect(() => {
    handlersRef.current = { ...routeHandlers, onDragStart }
  })

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

  const routeFile = useCallback(async (file: File, context?: FileRouteContext) => {
    await routeFileByExtension(file, handlersRef.current, context)
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
        try { await routeFile(entryFile, { source: 'manual', shiftKey: Boolean(e.shiftKey) }) } catch {}
      })()
      return
    }
    ;(async () => {
      try { await routeFile(file, { source: 'manual', shiftKey: Boolean(e.shiftKey) }) } catch {}
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
