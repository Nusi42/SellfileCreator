import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

type UseSfcDialogsParams = {
  customRecipeCount: number
  // Used alongside customRecipeCount to un-silence autosave when safeguards exist but no recipes do.
  safeguardRuleCount: number
  onConfirmClearAll: () => void
  onConfirmDeleteSingle: (targetIdx: number) => void
  onConfirmDeleteMulti: (targets: number[] | null) => void
  // Safeguard delete confirm callbacks — mirror the recipe pair so the
  // SafeguardChipsPanel can route through the centralized ConfirmDialogs.
  onConfirmDeleteSafeguardSingle: (targetIdx: number) => void
  onConfirmDeleteSafeguardMulti: (targets: number[] | null) => void
}

export type UseSfcDialogsResult = {
  confirmClearOpen: boolean
  setConfirmClearOpen: Dispatch<SetStateAction<boolean>>
  confirmDeleteIdx: number | null
  setConfirmDeleteIdx: Dispatch<SetStateAction<number | null>>
  confirmDeleteTargets: number[] | null
  setConfirmDeleteTargets: Dispatch<SetStateAction<number[] | null>>
  // Safeguard counterparts — separate state so safeguard and recipe delete
  // confirmations stay independent (mirrors the recipe pair).
  confirmDeleteSafeguardIdx: number | null
  setConfirmDeleteSafeguardIdx: Dispatch<SetStateAction<number | null>>
  confirmDeleteSafeguardTargets: number[] | null
  setConfirmDeleteSafeguardTargets: Dispatch<SetStateAction<number[] | null>>
  requestClearAll: () => void
  requestDeleteSingle: (idx: number) => void
  requestDeleteMulti: (targets: number[]) => void
  requestDeleteSafeguardSingle: (idx: number) => void
  requestDeleteSafeguardMulti: (targets: number[]) => void
  handleConfirmClear: () => void
  handleConfirmDelete: () => void
  handleConfirmDeleteMulti: () => void
  handleConfirmDeleteSafeguard: () => void
  handleConfirmDeleteSafeguardMulti: () => void
  autosaveSilencedByClear: boolean
  noteOpen: boolean
  noteMode: 'view' | 'edit'
  openNoteEditor: () => void
  openNoteViewer: () => void
  closeNote: () => void
  setNoteMode: Dispatch<SetStateAction<'view' | 'edit'>>
  pasteDlgOpen: boolean
  setPasteDlgOpen: Dispatch<SetStateAction<boolean>>
  pasteText: string
  setPasteText: Dispatch<SetStateAction<string>>
  pasteErr: string | null
  setPasteErr: Dispatch<SetStateAction<string | null>>
  pasteSelectOnEmpty: boolean
  setPasteSelectOnEmpty: Dispatch<SetStateAction<boolean>>
  pasteAfterIdx: number | null
  setPasteAfterIdx: Dispatch<SetStateAction<number | null>>
  copyDlgOpen: boolean
  setCopyDlgOpen: Dispatch<SetStateAction<boolean>>
  copyText: string
  setCopyText: Dispatch<SetStateAction<string>>
  copyInputRef: MutableRefObject<HTMLTextAreaElement | HTMLInputElement | null>
}

/**
 * Centralizes SFC dialog state so App wires the callbacks without juggling local `useState`.
 * - Tracks confirmation dialogs and re-applies the autosave suppressor when "Delete All" is confirmed.
 * - Keeps the Note dialog mode (`view` vs `edit`) aligned with the action that opened it.
 * - Exposes clipboard dialog state so `useSfcClipboard` can drive the same fallback UI.
 */
export function useSfcDialogs({
  customRecipeCount,
  safeguardRuleCount,
  onConfirmClearAll,
  onConfirmDeleteSingle,
  onConfirmDeleteMulti,
  onConfirmDeleteSafeguardSingle,
  onConfirmDeleteSafeguardMulti,
}: UseSfcDialogsParams): UseSfcDialogsResult {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)
  const [confirmDeleteTargets, setConfirmDeleteTargets] = useState<number[] | null>(null)
  // Safeguard delete state — parallel to the recipe pair so confirmations
  // stay independent across builder modes.
  const [confirmDeleteSafeguardIdx, setConfirmDeleteSafeguardIdx] = useState<number | null>(null)
  const [confirmDeleteSafeguardTargets, setConfirmDeleteSafeguardTargets] = useState<number[] | null>(null)
  const [autosaveSilencedByClear, setAutosaveSilencedByClear] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteMode, setNoteMode] = useState<'view' | 'edit'>('edit')
  const [pasteDlgOpen, setPasteDlgOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteErr, setPasteErr] = useState<string | null>(null)
  const [pasteSelectOnEmpty, setPasteSelectOnEmpty] = useState(false)
  const [pasteAfterIdx, setPasteAfterIdx] = useState<number | null>(null)
  const [copyDlgOpen, setCopyDlgOpen] = useState(false)
  const [copyText, setCopyText] = useState('')
  const copyInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const copySelectTimerRef = useRef<number | null>(null)
  const noteCloseSignalRef = useRef<string | null>(null)

  const cancelPendingNoteClose = useCallback(() => {
    noteCloseSignalRef.current = null
  }, [])

  useEffect(() => () => {
    cancelPendingNoteClose()
  }, [cancelPendingNoteClose])

  // Render-time state adjustment: un-silence autosave once any meaningful content exists again.
  // Safeguards-only sessions must also un-silence — "Clear All" only removes recipes, not safeguards.
  if (autosaveSilencedByClear && (customRecipeCount > 0 || safeguardRuleCount > 0)) {
    setAutosaveSilencedByClear(false)
  }

  const requestClearAll = useCallback(() => {
    setConfirmClearOpen(true)
  }, [])

  const requestDeleteSingle = useCallback((idx: number) => {
    setConfirmDeleteIdx(idx)
  }, [])

  const requestDeleteMulti = useCallback((targets: number[]) => {
    if (!targets.length) {
      setConfirmDeleteTargets(null)
      return
    }
    setConfirmDeleteTargets(targets.slice())
  }, [])

  // Safeguard request helpers — symmetric with the recipe pair above so
  // useItemListManager.handleItemDelete can route safeguard chip deletes
  // through the centralized ConfirmDialogs instead of direct-filtering.
  const requestDeleteSafeguardSingle = useCallback((idx: number) => {
    setConfirmDeleteSafeguardIdx(idx)
  }, [])

  const requestDeleteSafeguardMulti = useCallback((targets: number[]) => {
    if (!targets.length) {
      setConfirmDeleteSafeguardTargets(null)
      return
    }
    setConfirmDeleteSafeguardTargets(targets.slice())
  }, [])

  const handleConfirmClear = useCallback(() => {
    setConfirmClearOpen(false)
    setAutosaveSilencedByClear(true)
    onConfirmClearAll()
  }, [onConfirmClearAll])

  const handleConfirmDelete = useCallback(() => {
    // Read confirmDeleteIdx directly — state updaters must be pure (no side effects)
    // because React Strict Mode double-invokes them, which would trigger the delete twice.
    if (confirmDeleteIdx == null) return
    onConfirmDeleteSingle(confirmDeleteIdx)
    setConfirmDeleteIdx(null)
  }, [confirmDeleteIdx, onConfirmDeleteSingle])

  const handleConfirmDeleteMulti = useCallback(() => {
    // Same pattern: call the side effect outside the state setter so Strict Mode
    // double-invocation of the updater cannot run the deletion twice.
    onConfirmDeleteMulti(confirmDeleteTargets ?? null)
    setConfirmDeleteTargets(null)
  }, [confirmDeleteTargets, onConfirmDeleteMulti])

  // Safeguard confirm handlers — read state outside the setters to keep the
  // delete side-effect immune to Strict Mode double-invocation (mirrors the
  // recipe handlers above).
  const handleConfirmDeleteSafeguard = useCallback(() => {
    if (confirmDeleteSafeguardIdx == null) return
    onConfirmDeleteSafeguardSingle(confirmDeleteSafeguardIdx)
    setConfirmDeleteSafeguardIdx(null)
  }, [confirmDeleteSafeguardIdx, onConfirmDeleteSafeguardSingle])

  const handleConfirmDeleteSafeguardMulti = useCallback(() => {
    onConfirmDeleteSafeguardMulti(confirmDeleteSafeguardTargets ?? null)
    setConfirmDeleteSafeguardTargets(null)
  }, [confirmDeleteSafeguardTargets, onConfirmDeleteSafeguardMulti])

  const openNoteEditor = useCallback(() => {
    cancelPendingNoteClose()
    setNoteMode('edit')
    setNoteOpen(true)
  }, [cancelPendingNoteClose])

  const openNoteViewer = useCallback(() => {
    cancelPendingNoteClose()
    setNoteMode('view')
    setNoteOpen(true)
  }, [cancelPendingNoteClose])

  const closeNote = useCallback(() => {
    const signal = (() => {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID()
        }
      } catch {}
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`
    })()
    noteCloseSignalRef.current = signal
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      if (noteCloseSignalRef.current === signal) {
        noteCloseSignalRef.current = null
        setNoteOpen(false)
      }
      return
    }
    window.requestAnimationFrame(() => {
      if (noteCloseSignalRef.current !== signal) return
      noteCloseSignalRef.current = null
      setNoteOpen(false)
    })
  }, [])

  const scheduleCopyDialogSelection = useCallback(() => {
    if (typeof window === 'undefined') return
    if (copySelectTimerRef.current !== null) {
      window.clearTimeout(copySelectTimerRef.current)
      copySelectTimerRef.current = null
    }
    copySelectTimerRef.current = window.setTimeout(() => {
      try {
        const el = copyInputRef.current
        if (el && typeof (el as HTMLInputElement).select === 'function') {
          (el as HTMLInputElement).select()
        }
      } catch {
        // ignore selection failures; fallback dialog still renders
      } finally {
        if (copySelectTimerRef.current !== null) {
          window.clearTimeout(copySelectTimerRef.current)
          copySelectTimerRef.current = null
        }
      }
    }, 0)
  }, [])

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return
      if (copySelectTimerRef.current !== null) {
        window.clearTimeout(copySelectTimerRef.current)
        copySelectTimerRef.current = null
      }
    }
  }, [])

  const updateCopyDlgOpen = useCallback<Dispatch<SetStateAction<boolean>>>((next) => {
    setCopyDlgOpen((prev) => {
      const resolved = typeof next === 'function' ? (next as (value: boolean) => boolean)(prev) : next
      if (resolved && !prev) {
        scheduleCopyDialogSelection()
      }
      if (!resolved && prev && typeof window !== 'undefined' && copySelectTimerRef.current !== null) {
        window.clearTimeout(copySelectTimerRef.current)
        copySelectTimerRef.current = null
      }
      return resolved
    })
  }, [scheduleCopyDialogSelection])

  return useMemo<UseSfcDialogsResult>(() => ({
    confirmClearOpen,
    setConfirmClearOpen,
    confirmDeleteIdx,
    setConfirmDeleteIdx,
    confirmDeleteTargets,
    setConfirmDeleteTargets,
    confirmDeleteSafeguardIdx,
    setConfirmDeleteSafeguardIdx,
    confirmDeleteSafeguardTargets,
    setConfirmDeleteSafeguardTargets,
    requestClearAll,
    requestDeleteSingle,
    requestDeleteMulti,
    requestDeleteSafeguardSingle,
    requestDeleteSafeguardMulti,
    handleConfirmClear,
    handleConfirmDelete,
    handleConfirmDeleteMulti,
    handleConfirmDeleteSafeguard,
    handleConfirmDeleteSafeguardMulti,
    autosaveSilencedByClear,
    noteOpen,
    noteMode,
    openNoteEditor,
    openNoteViewer,
    closeNote,
    setNoteMode,
    pasteDlgOpen,
    setPasteDlgOpen,
    pasteText,
    setPasteText,
    pasteErr,
    setPasteErr,
    pasteSelectOnEmpty,
    setPasteSelectOnEmpty,
    pasteAfterIdx,
    setPasteAfterIdx,
    copyDlgOpen,
    setCopyDlgOpen: updateCopyDlgOpen,
    copyText,
    setCopyText,
    copyInputRef,
  }), [
    confirmClearOpen,
    confirmDeleteIdx,
    confirmDeleteTargets,
    confirmDeleteSafeguardIdx,
    confirmDeleteSafeguardTargets,
    requestClearAll,
    requestDeleteSingle,
    requestDeleteMulti,
    requestDeleteSafeguardSingle,
    requestDeleteSafeguardMulti,
    handleConfirmClear,
    handleConfirmDelete,
    handleConfirmDeleteMulti,
    handleConfirmDeleteSafeguard,
    handleConfirmDeleteSafeguardMulti,
    autosaveSilencedByClear,
    noteOpen,
    noteMode,
    openNoteEditor,
    openNoteViewer,
    closeNote,
    pasteDlgOpen,
    pasteText,
    pasteErr,
    pasteSelectOnEmpty,
    pasteAfterIdx,
    copyDlgOpen,
    updateCopyDlgOpen,
    copyText,
  ])
}
