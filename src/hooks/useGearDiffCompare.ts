import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import { buildGearInspectorOutcomeSummary } from '../lib/gearInspectorOutcomeSummary'
import {
  buildRowsByVerdictItemId,
  buildVerdictMapFromRows,
  diffVerdicts,
  joinFlipsToRows,
  type DiffRow,
  type VerdictDiff,
  type VerdictMap,
} from '../lib/gearDiff/verdictDiff'

// A pinned "before" snapshot the live state is diffed against. Holds the frozen rows
// (for the split-view's baseline pane) plus their derived verdict map and id index.
// The rows array is a reference to the snapshot taken at pin time — the pipeline
// replaces `gearInspectorPreviewRows` wholesale, so the old array stays valid as the
// immutable baseline without any deep copy.
export type GearDiffBaseline = {
  rows: readonly GearInspectorPreviewRow[]
  verdicts: VerdictMap
  rowsByItemId: ReadonlyMap<number, GearInspectorPreviewRow>
  // Human-readable description of what was pinned (e.g. "Before loading lategame.sfc").
  label: string
  // Capture timestamp; only used for display/debug, never for diff logic.
  capturedAt: number
}

// Diff rows grouped by direction, joined to the CURRENT-state rows for rendering.
export type GearDiffRows = {
  newlySell: DiffRow[]
  newlyKeep: DiffRow[]
}

// Signed before→after deltas of the outcome summary, for the diff header chip.
// Positive `sold` means more pieces are now sold than at the baseline, etc.
export type GearDiffDelta = {
  sold: number
  kept: number
  keptBySafeguards: number
}

export type GearDiffCompare = {
  // The pinned baseline, or null when not comparing.
  baseline: GearDiffBaseline | null
  // True iff a baseline is pinned (compare mode active).
  isComparing: boolean
  // Verdict-level diff (baseline vs live). Null when not comparing.
  diff: VerdictDiff | null
  // Total flipped item count — headline for badges/toasts. 0 when not comparing.
  flipCount: number
  // Diff rows joined to current rows, ready to render. Null when not comparing.
  diffRows: GearDiffRows | null
  // Signed before→after outcome deltas (sold / kept / safeguarded). Null when not comparing.
  delta: GearDiffDelta | null
  // Pin the CURRENT live rows as the baseline (the >> / "compare from here" action).
  pinBaseline: (label?: string) => void
  // Pin an EXPLICIT rows snapshot as the baseline — used by the SFC/preset load flow,
  // which must capture the pre-load state synchronously before applySfcLoadResult runs.
  pinBaselineFromRows: (rows: readonly GearInspectorPreviewRow[], label: string) => void
  // Clear the baseline and leave compare mode.
  exitCompare: () => void
}

// Compare-mode controller for the gear-diff feature.
//
// Design note: the "after" side of every diff is simply the live pipeline output. The
// resolved UX tentatively applies SFC/preset loads and tunes them in place, and override
// toggles already flow through the live pipeline — so there is no need for a separate
// non-committing evaluation. We freeze a "before" snapshot and diff it against live
// state, which keeps this entirely on the existing pipeline (one source of verdicts).
export function useGearDiffCompare(args: {
  // Live Gear Inspector preview rows (the current "after" state).
  currentRows: readonly GearInspectorPreviewRow[]
  // Live verdict map derived from currentRows (passed in to reuse App's memo).
  currentVerdicts: VerdictMap
}): GearDiffCompare {
  const { currentRows, currentVerdicts } = args

  const [baseline, setBaseline] = useState<GearDiffBaseline | null>(null)

  // Keep the latest rows in a ref so pinBaseline() stays referentially stable and can
  // capture "now" without re-creating on every pipeline commit. Synced in an effect
  // (never during render). Pinning is user-triggered after a commit, so the one-render
  // lag is irrelevant — the ref always holds the latest committed rows by then.
  const currentRowsRef = useRef(currentRows)
  useEffect(() => { currentRowsRef.current = currentRows }, [currentRows])

  const pinBaselineFromRows = useCallback(
    (rows: readonly GearInspectorPreviewRow[], label: string) => {
      setBaseline({
        rows,
        verdicts: buildVerdictMapFromRows(rows),
        rowsByItemId: buildRowsByVerdictItemId(rows),
        label,
        capturedAt: Date.now(),
      })
    },
    [],
  )

  const pinBaseline = useCallback(
    (label = 'Pinned state') => {
      pinBaselineFromRows(currentRowsRef.current, label)
    },
    [pinBaselineFromRows],
  )

  const exitCompare = useCallback(() => setBaseline(null), [])

  // Verdict-level diff: cheap O(n) map walk, recomputed whenever the baseline or the
  // live verdicts change (i.e. on each committed pipeline run).
  const diff = useMemo(
    () => (baseline ? diffVerdicts(baseline.verdicts, currentVerdicts) : null),
    [baseline, currentVerdicts],
  )

  const flipCount = diff ? diff.newlySell.length + diff.newlyKeep.length : 0

  // Index current rows once so both buckets can join without re-scanning.
  const currentRowsByItemId = useMemo(
    () => (baseline ? buildRowsByVerdictItemId(currentRows) : null),
    [baseline, currentRows],
  )

  const diffRows = useMemo<GearDiffRows | null>(() => {
    if (!diff || !currentRowsByItemId) return null
    return {
      newlySell: joinFlipsToRows(diff.newlySell, currentRowsByItemId),
      newlyKeep: joinFlipsToRows(diff.newlyKeep, currentRowsByItemId),
    }
  }, [diff, currentRowsByItemId])

  // Signed before→after deltas via the shared outcome summary (one definition of the
  // sold/kept/safeguarded counts) applied to the baseline rows vs the live rows.
  const delta = useMemo<GearDiffDelta | null>(() => {
    if (!baseline) return null
    const before = buildGearInspectorOutcomeSummary(baseline.rows)
    const after = buildGearInspectorOutcomeSummary(currentRows)
    return {
      sold: after.sold - before.sold,
      kept: after.kept - before.kept,
      keptBySafeguards: after.keptBySafeguards - before.keptBySafeguards,
    }
  }, [baseline, currentRows])

  return {
    baseline,
    isComparing: baseline != null,
    diff,
    flipCount,
    diffRows,
    delta,
    pinBaseline,
    pinBaselineFromRows,
    exitCompare,
  }
}
