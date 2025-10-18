import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

export type HistoryEntryDescriptor = {
  title: string
  detailLines?: string[]
}

export type DescribeNextChangeOptions = {
  force?: boolean
  writeMode?: 'append' | 'replace'
}

export type DescribeNextChangeFn = (descriptor: HistoryEntryDescriptor | null, options?: DescribeNextChangeOptions) => void

export type HistoryPreview = {
  descriptor: HistoryEntryDescriptor | null
}

type HistoryEntry = {
  compressed: string
  signatureCrc: string
  signatureSize: number
  descriptor: HistoryEntryDescriptor | null
}

type HistoryState = {
  entries: HistoryEntry[]
  index: number
  savedIndex: number | null
}

type ResetOptions = { markSaved: boolean; descriptor?: HistoryEntryDescriptor | null }

function makeEntry(payload: string, signatureCrc: string, signatureSize: number, descriptor: HistoryEntryDescriptor | null = null): HistoryEntry {
  const { base64 } = compressToBase64(payload)
  return {
    compressed: base64,
    signatureCrc,
    signatureSize,
    descriptor,
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
  const pendingDescriptorRef = useRef<HistoryEntryDescriptor | null>(null)
  const pendingDescriptorStateRef = useRef<'idle' | 'pending'>('idle')
  const pendingWriteModeRef = useRef<'append' | 'replace'>('append')

  // Snapshot history whenever the serialized HSFC payload or signature changes; we intentionally
  // adjust internal state in this effect so history updates stay in sync with the latest inputs.
  /* eslint-disable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */
  useEffect(() => {
    const prevPayload = previousPayloadRef.current
    previousPayloadRef.current = payload
    const crc = computeCrc32(signature)
    const descriptorForAppend = pendingDescriptorRef.current
      ? (pendingDescriptorRef.current.detailLines
        ? { title: pendingDescriptorRef.current.title, detailLines: pendingDescriptorRef.current.detailLines.slice() }
        : { title: pendingDescriptorRef.current.title })
      : null
    const writeMode = pendingWriteModeRef.current
    pendingWriteModeRef.current = 'append'
    if (skipRecordRef.current) {
      skipRecordRef.current = false
      pendingDescriptorRef.current = null
      pendingDescriptorStateRef.current = 'idle'
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
      pendingDescriptorRef.current = null
      pendingDescriptorStateRef.current = 'idle'
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
          const updatedEntry = makeEntry(payload, crc, signature.length, current.descriptor)
          const nextEntries = prev.entries.slice()
          nextEntries[prev.index] = updatedEntry
          return { ...prev, entries: nextEntries }
        }
        return prev
      }
      const entry = makeEntry(payload, crc, signature.length, descriptorForAppend)
      const baseEntries = prev.entries.slice(0, prev.index + 1)
      const canReplace = writeMode === 'replace' && baseEntries.length > 0 && prev.index === baseEntries.length - 1
      let nextEntries: HistoryEntry[]
      let nextIndex: number
      if (canReplace) {
        nextEntries = baseEntries.slice()
        nextEntries[nextEntries.length - 1] = entry
        nextIndex = nextEntries.length - 1
      } else {
        nextEntries = baseEntries.slice()
        nextEntries.push(entry)
        nextIndex = nextEntries.length - 1
      }
      let nextSaved = prev.savedIndex
      if (markNextAsSavedRef.current) {
        nextSaved = nextIndex
      } else if (canReplace && prev.savedIndex === prev.index) {
        nextSaved = nextIndex
      }
      markNextAsSavedRef.current = false
      return { entries: nextEntries, index: nextIndex, savedIndex: nextSaved }
    })
    pendingDescriptorRef.current = null
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

  const describeNextChange = useCallback<DescribeNextChangeFn>((descriptor, options) => {
    if (!descriptor) {
      if (pendingDescriptorStateRef.current === 'pending' && options?.force !== true) {
        return
      }
      pendingDescriptorRef.current = null
      pendingDescriptorStateRef.current = 'idle'
      pendingWriteModeRef.current = 'append'
      return
    }
    pendingDescriptorStateRef.current = 'pending'
    pendingWriteModeRef.current = options?.writeMode === 'replace' ? 'replace' : 'append'
    if (descriptor.detailLines !== undefined) {
      pendingDescriptorRef.current = {
        title: descriptor.title,
        detailLines: descriptor.detailLines.slice(),
      }
      return
    }
    pendingDescriptorRef.current = { title: descriptor.title }
  }, [])

  const resetHistory = useCallback((nextPayload: string, nextSignature: string, options: ResetOptions) => {
    const crc = computeCrc32(nextSignature)
    const entry = makeEntry(nextPayload, crc, nextSignature.length, options.descriptor ?? null)
    skipRecordRef.current = true
    markNextAsSavedRef.current = false
    pendingDescriptorRef.current = null
    pendingDescriptorStateRef.current = 'idle'
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
  const undoDescriptor = canUndo ? history.entries[history.index]?.descriptor ?? null : null
  const redoDescriptor = canRedo ? history.entries[history.index + 1]?.descriptor ?? null : null
  const undoPreview = useMemo<HistoryPreview>(() => ({ descriptor: undoDescriptor }), [undoDescriptor])
  const redoPreview = useMemo<HistoryPreview>(() => ({ descriptor: redoDescriptor }), [redoDescriptor])

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    markNextSnapshotAsSaved,
    describeNextChange,
    resetHistory,
    undoPreview,
    redoPreview,
  }
}
