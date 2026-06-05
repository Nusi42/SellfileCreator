import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import { isMatchKeptBySafeguard, isMatchSold } from '../lib/gearInspectorVerdict'
import {
  buildRowsByVerdictItemId,
  buildVerdictMapFromRows,
  diffVerdicts,
  joinFlipsToRows,
  type DiffRow,
  type VerdictDiff,
  type VerdictMap,
} from '../lib/gearDiff/verdictDiff'

// A pinned "before" snapshot the live state is diffed against. Deliberately compact: just
// the verdict map (no second copy of the preview rows, no stored summary). Both the flip
// diff and the delta are computed over the INTERSECTION of this map and the live verdicts,
// so inventory changes (a gear-DB push adding/removing items) never show as a diff — only
// rule-driven verdict flips do.
export type GearDiffBaseline = {
  verdicts: VerdictMap
  // Human-readable description of what was pinned (e.g. "Before loading lategame.sfc").
  label: string
  // Capture timestamp; only used for display/debug, never for diff logic.
  capturedAt: number
}

// Changed rows joined to the CURRENT-state rows for rendering. A flat list — the diff
// surface sorts/groups/filters them exactly like the normal Gear Inspector grid.
export type GearDiffRows = DiffRow[]

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
  // True when the split-view is open. Gates the heavy per-commit work (flip diff + row
  // index + joined rows) to when it is actually rendered; the cheap delta for the header
  // chip is computed regardless so the chip stays live with the view closed.
  active: boolean
}): GearDiffCompare {
  const { currentRows, currentVerdicts, active } = args

  const [baseline, setBaseline] = useState<GearDiffBaseline | null>(null)

  // Keep the latest rows in a ref so pinBaseline() stays referentially stable and can
  // capture "now" without re-creating on every pipeline commit. Synced in an effect
  // (never during render). Pinning is user-triggered after a commit, so the one-render
  // lag is irrelevant — the ref always holds the latest committed rows by then.
  const currentRowsRef = useRef(currentRows)
  useEffect(() => { currentRowsRef.current = currentRows }, [currentRows])

  const pinBaselineFromRows = useCallback(
    (rows: readonly GearInspectorPreviewRow[], label: string) => {
      // Capture only the verdict map — the split-view renders the CURRENT rows with the
      // baseline match swapped in, and the delta is derived from this map vs the live one,
      // so the old rows are never needed.
      setBaseline({
        verdicts: buildVerdictMapFromRows(rows),
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

  // Verdict-level flip diff — only needed to render the split-view, so gated on `active`.
  const diff = useMemo(
    () => (baseline && active ? diffVerdicts(baseline.verdicts, currentVerdicts) : null),
    [baseline, active, currentVerdicts],
  )

  const flipCount = diff ? diff.length : 0

  // Index current rows for the join — also only when the split-view is open.
  const currentRowsByItemId = useMemo(
    () => (baseline && active ? buildRowsByVerdictItemId(currentRows) : null),
    [baseline, active, currentRows],
  )

  const diffRows = useMemo<GearDiffRows | null>(() => {
    if (!diff || !currentRowsByItemId) return null
    return joinFlipsToRows(diff, currentRowsByItemId)
  }, [diff, currentRowsByItemId])

  // Signed before→after deltas for the header chip, over the INTERSECTION of the baseline
  // and live verdict maps: count sold / safeguard-kept on each side for items present in
  // BOTH, so a gear-DB push adding/removing items shifts neither side. One pass over the
  // live map (O(1) baseline lookups); cheap enough to keep live every commit, view closed.
  const delta = useMemo<GearDiffDelta | null>(() => {
    if (!baseline) return null
    let inBoth = 0, beforeSold = 0, afterSold = 0, beforeSafe = 0, afterSafe = 0
    for (const [itemId, afterMatch] of currentVerdicts) {
      if (!baseline.verdicts.has(itemId)) continue
      const beforeMatch = baseline.verdicts.get(itemId) ?? null
      inBoth += 1
      if (isMatchSold(beforeMatch)) beforeSold += 1
      if (isMatchSold(afterMatch)) afterSold += 1
      if (isMatchKeptBySafeguard(beforeMatch)) beforeSafe += 1
      if (isMatchKeptBySafeguard(afterMatch)) afterSafe += 1
    }
    return {
      sold: afterSold - beforeSold,
      // Kept = (in both) − sold on each side; over a fixed set this is just −sold delta.
      kept: (inBoth - afterSold) - (inBoth - beforeSold),
      keptBySafeguards: afterSafe - beforeSafe,
    }
  }, [baseline, currentVerdicts])

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
