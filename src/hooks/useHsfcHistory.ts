import { useCallback, useEffect, useRef, useState } from 'react'
import type { BuilderConfig, MinimaTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import { computeCrc32 } from '../lib/autosave'
import { compressToBase64, decompressFromBase64 } from '../lib/compression'

export type HsfcSnapshot = {
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  minima: MinimaTable
  finalSellRemainder: FinalSellRemainderConfig
  note: string | null
  selectedCfgIdx: number | null
}

type HistoryEntry = {
  compressed: string
  signatureCrc: string
  signatureSize: number
}

type HistoryState = {
  entries: HistoryEntry[]
  index: number
  savedIndex: number | null
}

type ResetOptions = { markSaved: boolean }

function makeEntry(payload: string, signatureCrc: string, signatureSize: number): HistoryEntry {
  const { base64 } = compressToBase64(payload)
  return {
    compressed: base64,
    signatureCrc,
    signatureSize,
  }
}

function parseSnapshot(entry: HistoryEntry): HsfcSnapshot | null {
  try {
    const json = decompressFromBase64(entry.compressed)
    const parsed = JSON.parse(json) as Partial<HsfcSnapshot>
    if (!parsed || typeof parsed !== 'object') return null
    const {
      customCfgs,
      metasets,
      minima,
      finalSellRemainder,
      note,
      selectedCfgIdx,
    } = parsed
    if (!Array.isArray(customCfgs) || !Array.isArray(metasets) || !minima || typeof finalSellRemainder !== 'object' || finalSellRemainder === null) {
      return null
    }
    const normalizedNote = typeof note === 'string' ? note : null
    const sel = typeof selectedCfgIdx === 'number' ? selectedCfgIdx : null
    return {
      customCfgs: customCfgs as BuilderConfig[],
      metasets: metasets as Metaset[],
      minima: minima as MinimaTable,
      finalSellRemainder: finalSellRemainder as FinalSellRemainderConfig,
      note: normalizedNote,
      selectedCfgIdx: sel,
    }
  } catch {
    return null
  }
}

export function useHsfcHistory(params: {
  payload: string
  signature: string
  applySnapshot: (snapshot: HsfcSnapshot) => void
}) {
  const { payload, signature, applySnapshot } = params
  const initialEntryRef = useRef<HistoryEntry | null>(null)
  if (!initialEntryRef.current) {
    const crc = computeCrc32(signature)
    initialEntryRef.current = makeEntry(payload, crc, signature.length)
  }

  const [history, setHistory] = useState<HistoryState>(() => ({
    entries: [initialEntryRef.current!],
    index: 0,
    savedIndex: 0,
  }))

  const restoringRef = useRef(false)
  const skipRecordRef = useRef(false)
  const markNextAsSavedRef = useRef(false)
  const previousPayloadRef = useRef(payload)

  /* eslint-disable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */
  useEffect(() => {
    const prevPayload = previousPayloadRef.current
    previousPayloadRef.current = payload
    const crc = computeCrc32(signature)
    if (skipRecordRef.current) {
      skipRecordRef.current = false
      if (markNextAsSavedRef.current) {
        setHistory((prev) => {
          markNextAsSavedRef.current = false
          if (prev.savedIndex === prev.index) return prev
          return { ...prev, savedIndex: prev.index }
        })
      }
      return
    }
    if (restoringRef.current) {
      restoringRef.current = false
      if (markNextAsSavedRef.current) {
        markNextAsSavedRef.current = false
        setHistory((prev) => (prev.savedIndex === prev.index ? prev : { ...prev, savedIndex: prev.index }))
      }
      return
    }
    setHistory((prev) => {
      const current = prev.entries[prev.index]
      if (current && current.signatureCrc === crc && current.signatureSize === signature.length) {
        if (markNextAsSavedRef.current) {
          markNextAsSavedRef.current = false
          if (prev.savedIndex === prev.index) return prev
          return { ...prev, savedIndex: prev.index }
        }
        if (prevPayload !== payload) {
          const updatedEntry = makeEntry(payload, crc, signature.length)
          const nextEntries = prev.entries.slice()
          nextEntries[prev.index] = updatedEntry
          return { ...prev, entries: nextEntries }
        }
        return prev
      }
      const entry = makeEntry(payload, crc, signature.length)
      const nextEntries = prev.entries.slice(0, prev.index + 1)
      nextEntries.push(entry)
      const nextIndex = nextEntries.length - 1
      const nextSaved = markNextAsSavedRef.current ? nextIndex : prev.savedIndex
      markNextAsSavedRef.current = false
      return { entries: nextEntries, index: nextIndex, savedIndex: nextSaved }
    })
  }, [payload, signature])
  /* eslint-enable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */

  const undo = useCallback(() => {
    let snapshotToApply: HsfcSnapshot | null = null
    setHistory((prev) => {
      if (prev.index === 0) return prev
      const nextIndex = prev.index - 1
      const entry = prev.entries[nextIndex]
      if (!entry) return prev
      const parsed = parseSnapshot(entry)
      if (!parsed) return prev
      snapshotToApply = parsed
      return { ...prev, index: nextIndex }
    })
    if (snapshotToApply) {
      restoringRef.current = true
      applySnapshot(snapshotToApply)
    }
  }, [applySnapshot])

  const redo = useCallback(() => {
    let snapshotToApply: HsfcSnapshot | null = null
    setHistory((prev) => {
      if (prev.index >= prev.entries.length - 1) return prev
      const nextIndex = prev.index + 1
      const entry = prev.entries[nextIndex]
      if (!entry) return prev
      const parsed = parseSnapshot(entry)
      if (!parsed) return prev
      snapshotToApply = parsed
      return { ...prev, index: nextIndex }
    })
    if (snapshotToApply) {
      restoringRef.current = true
      applySnapshot(snapshotToApply)
    }
  }, [applySnapshot])

  const markSavedNow = useCallback(() => {
    setHistory((prev) => (prev.savedIndex === prev.index ? prev : { ...prev, savedIndex: prev.index }))
    markNextAsSavedRef.current = false
  }, [])

  const markNextSnapshotAsSaved = useCallback(() => {
    markNextAsSavedRef.current = true
  }, [])

  const resetHistory = useCallback((nextPayload: string, nextSignature: string, options: ResetOptions) => {
    const crc = computeCrc32(nextSignature)
    const entry = makeEntry(nextPayload, crc, nextSignature.length)
    skipRecordRef.current = true
    markNextAsSavedRef.current = false
    initialEntryRef.current = entry
    previousPayloadRef.current = nextPayload
    setHistory({
      entries: [entry],
      index: 0,
      savedIndex: options.markSaved ? 0 : null,
    })
  }, [])

  const canUndo = history.index > 0
  const canRedo = history.index < history.entries.length - 1
  const isDirty = history.savedIndex === null ? history.index > 0 : history.index !== history.savedIndex

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    markNextSnapshotAsSaved,
    resetHistory,
  }
}
