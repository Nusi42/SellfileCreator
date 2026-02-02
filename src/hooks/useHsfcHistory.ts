import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import { computeCrc32 } from '../lib/autosave'
import { compressToBase64, decompressFromBase64 } from '../lib/compression'
import type { MultiEditDraftState } from '../lib/multiEditDraft'
import type { KeepUniqueRule } from '../lib/keepUniques'
import type { HistoryEntryDescriptor } from '../history/historyDescriptorTypes'

export type { HistoryEntryDescriptor }

export type HsfcSnapshot = {
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder: FinalSellRemainderConfig
  keepUniqueRules: KeepUniqueRule[]
  keepUniquesEnabled: boolean
  note: string | null
  selectedCfgIdx: number | null
  selectedCfgIndices: number[]
  selectionAnchor: number | null
  builder: BuilderConfig
  builderNameDraft: string | null
  builderNameDraftKey: number | 'builder' | null
  multiEditDraft: MultiEditDraftState | null
}

export type DescribeNextChangeOptions = {
  force?: boolean
  writeMode?: 'append' | 'replace'
}

export type DescribeNextChangeFn = (descriptor: HistoryEntryDescriptor | null, options?: DescribeNextChangeOptions) => void
export type SuppressNextSnapshotFn = () => void

export type HistoryPreview = {
  descriptor: HistoryEntryDescriptor | null
}

export type HistoryTimelineEntry = {
  index: number
  descriptor: HistoryEntryDescriptor | null
  isCurrent: boolean
  isSaved: boolean
  isInitial: boolean
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
      substatTargets,
      finalSellRemainder,
      note,
      selectedCfgIdx,
      selectedCfgIndices,
      selectionAnchor,
      builder,
      builderNameDraft,
      builderNameDraftKey,
      multiEditDraft,
      keepUniqueRules,
      keepUniquesEnabled,
    } = parsed
    if (!Array.isArray(customCfgs) || !Array.isArray(metasets) || !substatTargets || typeof finalSellRemainder !== 'object' || finalSellRemainder === null) {
      return null
    }
    const normalizedNote = typeof note === 'string' ? note : null
    const sel = typeof selectedCfgIdx === 'number' ? selectedCfgIdx : null
    const normalizedSelectedIndices = Array.isArray(selectedCfgIndices) ? selectedCfgIndices.filter((value): value is number => Number.isInteger(value)) : []
    const normalizedSelectionAnchor = typeof selectionAnchor === 'number' ? selectionAnchor : null
    const normalizedBuilder = (builder && typeof builder === 'object')
      ? builder as BuilderConfig
      : (() => {
        if (sel !== null && sel >= 0 && sel < customCfgs.length && customCfgs[sel]) return customCfgs[sel]!
        if (customCfgs.length > 0 && customCfgs[0]) return customCfgs[0]!
        const fallback: BuilderConfig = {
          name: '',
          keep: true,
          exportMode: 'active',
          rankCode: 0,
          rarityCode: 0,
          rarityMode: 'auto',
          autoRaritySupplementsThreshold: 'rare',
          factionCode: 0,
          mainStatsV: [],
          minLevel: 0,
          maxLevel: 16,
          earlyKeepMode: 'early',
          substatsV: [],
          fixedSubstatsV: [],
          minCount: 0,
          autoMinCount: true,
          autoSubstatFlex: false,
          minRequiredRolls: 0,
          autoMinRequiredRolls: true,
        }
        return fallback
      })()
    const normalizedNameDraft = typeof builderNameDraft === 'string' ? builderNameDraft : null
    const normalizedNameDraftKey = typeof builderNameDraftKey === 'number' || builderNameDraftKey === 'builder'
      ? builderNameDraftKey
      : null
    const normalizedMultiEditDraft = (multiEditDraft && typeof multiEditDraft === 'object' && Array.isArray((multiEditDraft as MultiEditDraftState).selection))
      ? multiEditDraft as MultiEditDraftState
      : null
    return {
      customCfgs: customCfgs as BuilderConfig[],
      metasets: metasets as Metaset[],
      substatTargets: substatTargets as SubstatTargetTable,
      finalSellRemainder: finalSellRemainder as FinalSellRemainderConfig,
      keepUniqueRules: Array.isArray(keepUniqueRules) ? keepUniqueRules as KeepUniqueRule[] : [],
      keepUniquesEnabled: keepUniquesEnabled === true,
      note: normalizedNote,
      selectedCfgIdx: sel,
      selectedCfgIndices: normalizedSelectedIndices,
      selectionAnchor: normalizedSelectionAnchor,
      builder: normalizedBuilder,
      builderNameDraft: normalizedNameDraft,
      builderNameDraftKey: normalizedNameDraftKey,
      multiEditDraft: normalizedMultiEditDraft,
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
  const forceAppendRef = useRef(false)

  // Snapshot history whenever the serialized HSFC payload or signature changes; we intentionally
  // adjust internal state in this effect so history updates stay in sync with the latest inputs.
  /* eslint-disable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */
  useEffect(() => {
    const prevPayload = previousPayloadRef.current
    previousPayloadRef.current = payload
    const crc = computeCrc32(signature)
    // Capture the pending data descriptor as-is; it already contains cloned snapshots.
    const descriptorForAppend = pendingDescriptorRef.current
    const writeMode = pendingWriteModeRef.current
    pendingWriteModeRef.current = 'append'
    if (skipRecordRef.current) {
      skipRecordRef.current = false
      pendingDescriptorRef.current = null
      pendingDescriptorStateRef.current = 'idle'
      forceAppendRef.current = false
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
      forceAppendRef.current = false
      if (markNextAsSavedRef.current) {
        markNextAsSavedRef.current = false
        setHistory((prev) => (prev.savedIndex === prev.index ? prev : { ...prev, savedIndex: prev.index }))
      }
      return
    }
    setHistory((prev) => {
      const current = prev.entries[prev.index]
      if (!forceAppendRef.current && current && current.signatureCrc === crc && current.signatureSize === signature.length) {
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
      const canReplace = !forceAppendRef.current && writeMode === 'replace' && baseEntries.length > 0 && prev.index === baseEntries.length - 1
      let nextEntries: HistoryEntry[]
      let nextIndex: number
      if (forceAppendRef.current) {
        nextEntries = baseEntries.slice()
        nextEntries.push(entry)
        nextIndex = nextEntries.length - 1
      } else if (canReplace) {
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
      forceAppendRef.current = false
      return { entries: nextEntries, index: nextIndex, savedIndex: nextSaved }
    })
    pendingDescriptorRef.current = null
    pendingDescriptorStateRef.current = 'idle'
    forceAppendRef.current = false
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
      const forced = options?.force === true
      if (pendingDescriptorStateRef.current === 'pending' && !forced) {
        return
      }
      pendingDescriptorRef.current = null
      pendingDescriptorStateRef.current = 'idle'
      pendingWriteModeRef.current = 'append'
      return
    }
    pendingDescriptorStateRef.current = 'pending'
    pendingWriteModeRef.current = options?.writeMode === 'replace' ? 'replace' : 'append'
    if (options?.force === true) {
      forceAppendRef.current = true
    }
    // Persist the data descriptor so localization can happen at render time.
    pendingDescriptorRef.current = descriptor
  }, [])
  const suppressNextSnapshot = useCallback(() => {
    // Treat the next payload change as external so no history entry is recorded.
    skipRecordRef.current = true
    // Clear any queued descriptor so suppressed changes stay unlabeled.
    pendingDescriptorRef.current = null
    // Reset descriptor state so follow-up edits can register normally.
    pendingDescriptorStateRef.current = 'idle'
    // Reset write mode so suppression never overrides the next valid entry.
    pendingWriteModeRef.current = 'append'
    // Drop any forced append so we skip cleanly.
    forceAppendRef.current = false
    // Cancel saved markers so suppressed changes do not re-anchor dirty state.
    markNextAsSavedRef.current = false
  }, [])

  const resetHistory = useCallback((nextPayload: string, nextSignature: string, options: ResetOptions) => {
    const crc = computeCrc32(nextSignature)
    const entry = makeEntry(nextPayload, crc, nextSignature.length, options.descriptor ?? null)
    skipRecordRef.current = true
    markNextAsSavedRef.current = false
    forceAppendRef.current = false
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

  const captureSnapshotNow = useCallback((descriptor: HistoryEntryDescriptor | null, options?: { markSaved?: boolean; forceAppend?: boolean }) => {
    const crc = computeCrc32(signature)
    const entry = makeEntry(payload, crc, signature.length, descriptor ?? null)
    pendingDescriptorRef.current = null
    pendingDescriptorStateRef.current = 'idle'
    // Optionally force the *next* payload update to append instead of replacing this snapshot.
    // Why: selection changes after a draft snapshot should not overwrite the draft entry.
    forceAppendRef.current = options?.forceAppend === true
    skipRecordRef.current = false
    markNextAsSavedRef.current = false
    setHistory((prev) => {
      const baseEntries = prev.entries.slice(0, prev.index + 1)
      const nextEntries = [...baseEntries, entry]
      const nextIndex = nextEntries.length - 1
      const trimmedSaved = prev.savedIndex !== null && prev.savedIndex <= prev.index ? prev.savedIndex : null
      const nextSaved = options?.markSaved === true ? nextIndex : trimmedSaved
      return {
        entries: nextEntries,
        index: nextIndex,
        savedIndex: nextSaved,
      }
    })
    previousPayloadRef.current = payload
  }, [payload, signature])

  const canUndo = history.index > 0
  const canRedo = history.index < history.entries.length - 1
  const isDirty = history.savedIndex === null ? history.index > 0 : history.index !== history.savedIndex
  const undoDescriptor = canUndo ? history.entries[history.index]?.descriptor ?? null : null
  const redoDescriptor = canRedo ? history.entries[history.index + 1]?.descriptor ?? null : null
  const undoPreview = useMemo<HistoryPreview>(() => ({ descriptor: undoDescriptor }), [undoDescriptor])
  const redoPreview = useMemo<HistoryPreview>(() => ({ descriptor: redoDescriptor }), [redoDescriptor])
  const historyTimeline = useMemo<HistoryTimelineEntry[]>(() => history.entries.map((entry, idx) => ({
    index: idx,
    descriptor: entry.descriptor ?? null,
    isCurrent: idx === history.index,
    isSaved: history.savedIndex === idx,
    isInitial: idx === 0,
  })), [history.entries, history.index, history.savedIndex])
  const jumpToHistoryIndex = useCallback((targetIndex: number) => {
    if (!Number.isInteger(targetIndex)) return false
    let snapshotToApply: HsfcSnapshot | null = null
    let applied = false
    setHistory((prev) => {
      if (targetIndex < 0 || targetIndex >= prev.entries.length || targetIndex === prev.index) {
        return prev
      }
      const entry = prev.entries[targetIndex]
      if (!entry) return prev
      const parsed = parseSnapshot(entry)
      if (!parsed) return prev
      snapshotToApply = parsed
      applied = true
      return { ...prev, index: targetIndex }
    })
    if (snapshotToApply) {
      restoringRef.current = true
      applySnapshot(snapshotToApply)
    }
    return applied
  }, [applySnapshot])
  const clearHistory = useCallback(() => {
    const crc = computeCrc32(signature)
    const entry = makeEntry(payload, crc, signature.length, null)
    skipRecordRef.current = false
    markNextAsSavedRef.current = false
    pendingDescriptorRef.current = null
    pendingDescriptorStateRef.current = 'idle'
    initialEntryRef.current = entry
    previousPayloadRef.current = payload
    setHistory((prev) => {
      const wasSaved = prev.savedIndex === prev.index
      return {
        entries: [entry],
        index: 0,
        savedIndex: wasSaved ? 0 : null,
      }
    })
  }, [payload, signature])

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    markNextSnapshotAsSaved,
    describeNextChange,
    suppressNextSnapshot,
    resetHistory,
    captureSnapshotNow,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  }
}
