import type { GearInspectorItem } from '../gearInspectorSession'
import type { GearInspectorPreviewMatch, GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import { resolveVerdictTriState } from '../gearInspectorVerdict'

// Verdict map: one sell/keep match per artifact, keyed by Gear Inspector item id.
// This is the comparison primitive for the gear-diff feature — the baseline and the
// current pipeline output are each projected to this shape, then diffed.
export type VerdictMap = ReadonlyMap<number, GearInspectorPreviewMatch | null>

// One artifact whose verdict changed between baseline and current state. "Changed" spans the
// full tri-state space (sell ↔ keep ↔ safeguard) — including same-keep reason changes, e.g.
// a piece a rule was keeping that is now only held by a safeguard.
export type VerdictFlip = {
  itemId: number
  beforeMatch: GearInspectorPreviewMatch | null
  afterMatch: GearInspectorPreviewMatch | null
}

// The full diff: a flat list of changed items (no directional buckets — the diff surface
// sorts/groups/filters them like the normal Gear Inspector). Count = array length.
export type VerdictDiff = VerdictFlip[]

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

// Compute the verdict diff between two verdict maps.
//
// Only items present in BOTH maps are considered: the artifact set is stable across
// every gear-diff trigger (an SFC/preset carries rules, not gear), so a key missing
// from one side means a partial/transitional snapshot, not a real add/remove — there
// is deliberately no add/remove axis. An item is reported when its TRI-STATE verdict
// changes anywhere among sell / keep / safeguard (so a recipe-keep that becomes a
// safeguard-keep is a diff too).
export function diffVerdicts(before: VerdictMap, after: VerdictMap): VerdictDiff {
  const changed: VerdictFlip[] = []
  // Iterate the current ("after") map; skip anything not present in the baseline.
  for (const [itemId, afterMatch] of after) {
    if (!before.has(itemId)) continue
    const beforeMatch = before.get(itemId) ?? null
    // Unchanged tri-state verdict — not part of the diff.
    if (resolveVerdictTriState(beforeMatch) === resolveVerdictTriState(afterMatch ?? null)) continue
    changed.push({ itemId, beforeMatch, afterMatch: afterMatch ?? null })
  }
  return changed
}

// Total changed-item count — the headline number for toasts/badges.
export function countVerdictFlips(diff: VerdictDiff): number {
  return diff.length
}

// A preview row annotated with its baseline/current verdicts for rendering in the diff
// surface. The row itself is the CURRENT-state row; the diff surface swaps in beforeMatch
// or afterMatch per pane so each side shows the right verdict.
export type DiffRow = GearInspectorPreviewRow & {
  beforeMatch: GearInspectorPreviewMatch | null
  afterMatch: GearInspectorPreviewMatch | null
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
