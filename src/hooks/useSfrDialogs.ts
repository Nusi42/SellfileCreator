import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

type UseSfrDialogsParams = {
  customRecipeCount: number
  onConfirmClearAll: () => void
  onConfirmDeleteSingle: (targetIdx: number) => void
  onConfirmDeleteMulti: (targets: number[] | null) => void
}

export type UseSfrDialogsResult = {
  confirmClearOpen: boolean
  setConfirmClearOpen: Dispatch<SetStateAction<boolean>>
  confirmDeleteIdx: number | null
  setConfirmDeleteIdx: Dispatch<SetStateAction<number | null>>
  confirmDeleteTargets: number[] | null
  setConfirmDeleteTargets: Dispatch<SetStateAction<number[] | null>>
  requestClearAll: () => void
  requestDeleteSingle: (idx: number) => void
  requestDeleteMulti: (targets: number[]) => void
  handleConfirmClear: () => void
  handleConfirmDelete: () => void
  handleConfirmDeleteMulti: () => void
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
 * Centralizes SFR dialog state so App wires the callbacks without juggling local `useState`.
 * - Tracks confirmation dialogs and re-applies the autosave suppressor when "Delete All" is confirmed.
 * - Keeps the Note dialog mode (`view` vs `edit`) aligned with the action that opened it.
 * - Exposes clipboard dialog state so `useSfrClipboard` can drive the same fallback UI.
 */
export function useSfrDialogs({
  customRecipeCount,
  onConfirmClearAll,
  onConfirmDeleteSingle,
  onConfirmDeleteMulti,
}: UseSfrDialogsParams): UseSfrDialogsResult {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)
  const [confirmDeleteTargets, setConfirmDeleteTargets] = useState<number[] | null>(null)
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

  // Render-time state adjustment: un-silence autosave once recipes exist again.
  if (autosaveSilencedByClear && customRecipeCount > 0) {
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

  const handleConfirmClear = useCallback(() => {
    setConfirmClearOpen(false)
    setAutosaveSilencedByClear(true)
    onConfirmClearAll()
  }, [onConfirmClearAll])

  const handleConfirmDelete = useCallback(() => {
    setConfirmDeleteIdx((current) => {
      if (current == null) return current
      onConfirmDeleteSingle(current)
      return null
    })
  }, [onConfirmDeleteSingle])

  const handleConfirmDeleteMulti = useCallback(() => {
    setConfirmDeleteTargets((targets) => {
      onConfirmDeleteMulti(targets ?? null)
      return null
    })
  }, [onConfirmDeleteMulti])

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

  return useMemo<UseSfrDialogsResult>(() => ({
    confirmClearOpen,
    setConfirmClearOpen,
    confirmDeleteIdx,
    setConfirmDeleteIdx,
    confirmDeleteTargets,
    setConfirmDeleteTargets,
    requestClearAll,
    requestDeleteSingle,
    requestDeleteMulti,
    handleConfirmClear,
    handleConfirmDelete,
    handleConfirmDeleteMulti,
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
    requestClearAll,
    requestDeleteSingle,
    requestDeleteMulti,
    handleConfirmClear,
    handleConfirmDelete,
    handleConfirmDeleteMulti,
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
