import type { GearInspectorItem } from '../gearInspectorSession'
import type { GearInspectorPreviewMatch, GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import { isMatchSold } from '../gearInspectorVerdict'

// Verdict map: one sell/keep match per artifact, keyed by Gear Inspector item id.
// This is the comparison primitive for the gear-diff feature — the baseline and the
// current pipeline output are each projected to this shape, then diffed.
export type VerdictMap = ReadonlyMap<number, GearInspectorPreviewMatch | null>

// Direction of a single sell/keep flip. Reason-only changes are out of scope (v1):
// only items that cross the sell/keep boundary appear in a diff.
export type VerdictDirection = 'newly-sell' | 'newly-keep'

// One artifact whose verdict flipped between baseline and current state.
export type VerdictFlip = {
  itemId: number
  beforeMatch: GearInspectorPreviewMatch | null
  afterMatch: GearInspectorPreviewMatch | null
  direction: VerdictDirection
}

// The full diff: flips bucketed by direction. Counts are derivable via array length.
export type VerdictDiff = {
  // Was kept (or unmatched), now explicitly sold.
  newlySell: VerdictFlip[]
  // Was sold, now kept (explicit keep, safeguard, or unmatched).
  newlyKeep: VerdictFlip[]
}

// Resolve the verdict-map key for a preview row. Intentionally mirrors the live
// `gearInspectorMatchesByItemId` memo in App.tsx (keyed by gearInspectorItem.itemId,
// NOT resolveCanonicalTestItemId) so a captured baseline and the current map use the
// exact same keys — otherwise the diff would mismatch identities. Returns null when
// the row carries no finite item id.
export function resolveRowVerdictItemId(row: GearInspectorPreviewRow): number | null {
  const itemId = Number((row.artifact.gearInspectorItem as GearInspectorItem | undefined)?.itemId ?? NaN)
  return Number.isFinite(itemId) ? itemId : null
}

// Project preview rows into a verdict map. Single definition of the row→map keying so
// App's live memo and the baseline snapshot cannot drift apart.
export function buildVerdictMapFromRows(
  rows: readonly GearInspectorPreviewRow[],
): Map<number, GearInspectorPreviewMatch | null> {
  const map = new Map<number, GearInspectorPreviewMatch | null>()
  for (const row of rows) {
    const itemId = resolveRowVerdictItemId(row)
    if (itemId != null) map.set(itemId, row.match)
  }
  return map
}

// Compute the sell/keep diff between two verdict maps.
//
// Only items present in BOTH maps are considered: the artifact set is stable across
// every gear-diff trigger (an SFC/preset carries rules, not gear), so a key missing
// from one side means a partial/transitional snapshot, not a real add/remove — there
// is deliberately no add/remove axis. An item is reported only when its sell/keep
// verdict actually crosses the boundary; reason-only changes are ignored.
export function diffVerdicts(before: VerdictMap, after: VerdictMap): VerdictDiff {
  const newlySell: VerdictFlip[] = []
  const newlyKeep: VerdictFlip[] = []
  // Iterate the current ("after") map; skip anything not present in the baseline.
  for (const [itemId, afterMatch] of after) {
    if (!before.has(itemId)) continue
    const beforeMatch = before.get(itemId) ?? null
    const beforeSold = isMatchSold(beforeMatch)
    const afterSold = isMatchSold(afterMatch)
    // Unchanged verdict (both sold or both kept) — not part of the diff.
    if (beforeSold === afterSold) continue
    const flip: VerdictFlip = {
      itemId,
      beforeMatch,
      afterMatch: afterMatch ?? null,
      // Direction is defined by the new verdict: now-sold => newly-sell.
      direction: afterSold ? 'newly-sell' : 'newly-keep',
    }
    if (afterSold) newlySell.push(flip)
    else newlyKeep.push(flip)
  }
  return { newlySell, newlyKeep }
}

// Total flipped-item count — the headline number for toasts/badges.
export function countVerdictFlips(diff: VerdictDiff): number {
  return diff.newlySell.length + diff.newlyKeep.length
}

// A preview row annotated with its baseline/current verdicts for rendering in the
// diff surfaces (modal + split-view). The row itself is the CURRENT-state row; the
// before/after matches and direction come from the flip.
export type DiffRow = GearInspectorPreviewRow & {
  beforeMatch: GearInspectorPreviewMatch | null
  afterMatch: GearInspectorPreviewMatch | null
  direction: VerdictDirection
}

// Join flips to current preview rows for rendering. Flips whose item id has no current
// row (should not happen for a stable artifact set, but guard anyway) are dropped.
export function joinFlipsToRows(
  flips: readonly VerdictFlip[],
  rowsByItemId: ReadonlyMap<number, GearInspectorPreviewRow>,
): DiffRow[] {
  const out: DiffRow[] = []
  for (const flip of flips) {
    const row = rowsByItemId.get(flip.itemId)
    if (!row) continue
    out.push({
      ...row,
      beforeMatch: flip.beforeMatch,
      afterMatch: flip.afterMatch,
      direction: flip.direction,
    })
  }
  return out
}

// Index current rows by verdict-map item id for the join above (and the split-view).
export function buildRowsByVerdictItemId(
  rows: readonly GearInspectorPreviewRow[],
): Map<number, GearInspectorPreviewRow> {
  const map = new Map<number, GearInspectorPreviewRow>()
  for (const row of rows) {
    const itemId = resolveRowVerdictItemId(row)
    if (itemId != null) map.set(itemId, row)
  }
  return map
}
