/**
 * gearDbDiffToast
 *
 * Shared helpers for building Gear DB diff snapshots that can power
 * endpoint-update toasts and other UI surfaces without duplicating logic.
 */
import type { GearDbRawDataset } from './importers/gearDbRawDataset'
import type { ChampionLocation, NormalizedGearArtifact, NormalizedStat } from './importers/gearDbNormalizer'
import type { GearDbRawDeltaCommand, GearDbRawDeltaOperation } from './externalCommands'
import type { TesterPreviewMatch } from '../types/testerPreview'
import { formatLocalDateTime } from './dateDisplay'
import type {
  ArtifactSetId,
  ArtifactTypeId,
  FactionId,
  LevelMilestone,
  RankValue,
} from './types'

/**
 * Lightweight gear snapshot used for diffing and compact UI renderers.
 * Keep it small so we do not retain large payloads in toast state.
 */
export type GearArtifactSnapshot = {
  // Stable artifact id from the Gear DB payload.
  id: number
  // Slot and set power the iconography + labels.
  slot: ArtifactTypeId
  set: ArtifactSetId
  // Rank / rarity / level determine the summary visuals.
  rank: RankValue
  rarity: RankValue
  level: LevelMilestone
  // Exact level is optional but should override the milestone label when present.
  exactLevel?: number | null
  // Accessory faction id (0 for non-accessories).
  faction: FactionId
  // Main stat and substats describe the detailed diff surface.
  mainStat: NormalizedStat | null
  substats: NormalizedStat[]
  // Ascension stat is rendered separately in the compact preview.
  ascension: NormalizedStat | null
  // Reroll count lets the UI show the reroll glyph.
  rerollCount: number
  // Source helps differentiate inbox vs inventory when needed.
  source: NormalizedGearArtifact['source']
  // Champion metadata shows source + avatar context in tester cards.
  equippedToChampionId: number | null
  equippedChampionBaseId: number | null
  equippedChampionRarity: RankValue | null
  equippedChampionName: string | null
  equippedChampionLocation: ChampionLocation | null
  // Note: last-used timestamps are intentionally excluded so timestamp-only updates stay silent.
}

// Diff classification used by the endpoint toast.
export type GearDbDiffKind = 'added' | 'removed' | 'updated'

/**
 * Per-item diff entry emitted by the Gear DB snapshot comparer.
 * `before` or `after` are null for add/remove cases respectively.
 */
export type GearDbDiffEntry = {
  id: number
  kind: GearDbDiffKind
  before: GearArtifactSnapshot | null
  after: GearArtifactSnapshot | null
}

/**
 * Summary wrapper for diff output so callers can show counts or totals.
 */
export type GearDbDiffSummary = {
  entries: GearDbDiffEntry[]
  addedCount: number
  removedCount: number
  updatedCount: number
}

/**
 * Diff entry enriched with preview-match information for toast rendering.
 * Matches are nullable when the item is not present in a given state.
 */
export type GearDbDiffToastEntry = GearDbDiffEntry & {
  beforeMatch: TesterPreviewMatch | null
  afterMatch: TesterPreviewMatch | null
}

/**
 * Payload shape expected by the Gear DB diff toast component.
 */
export type GearDbDiffToastPayload = {
  // Header copy (import summary, diff summary, timestamp) shown above the list.
  headerLines: string[]
  // Optional structured specs so diff lines can render with icon glyphs.
  lineSpecs?: GearDbDiffHistoryLineSpec[]
  // Per-item entries already capped to the UI max.
  entries: GearDbDiffToastEntry[]
  // Count of hidden entries used for the "+X more" footer.
  overflowCount: number
}

/**
 * Structured header lines used to render localized history summaries.
 */
export type GearDbDiffHistoryLineSpec =
  | { kind: 'import'; totalCount: number; inboxCount: number }
  | { kind: 'diff'; addedCount: number; removedCount: number; updatedCount: number }
  | { kind: 'timestamp'; at: number }

/**
 * Session-only history entry for an endpoint update.
 */
export type GearDbDiffHistoryEntry = {
  // Monotonic id used for stable list rendering.
  id: number
  // Local timestamp captured when the update was queued.
  createdAt: number
  // Structured header specs so language switches re-render correctly.
  lineSpecs: GearDbDiffHistoryLineSpec[]
  // Full diff entries with match metadata (not capped).
  entries: GearDbDiffToastEntry[]
}

// Minimal translator signature for history line formatting helpers.
export type GearDbDiffHistoryLineTranslator = (key: string, params?: Record<string, string | number>) => string

/**
 * Convert structured history line specs into localized, trimmed header lines.
 */
export const formatGearDbDiffHistoryLineText = (
  spec: GearDbDiffHistoryLineSpec,
  t: GearDbDiffHistoryLineTranslator,
): string | null => {
  // Import lines summarize how many items landed and inbox inclusion.
  if (spec.kind === 'import') {
    const totalCount = Math.max(0, Math.floor(spec.totalCount))
    const inboxCount = Math.max(0, Math.floor(spec.inboxCount))
    const inventoryCount = Math.max(0, totalCount - inboxCount)
    return inboxCount > 0
      ? t('toastGearDbImportedShortWithInbox', { count: inventoryCount, inboxCount })
      : t('toastGearDbImportedShort', { count: totalCount })
  }
  // Diff lines highlight added vs removed vs updated counts for quick scanning.
  if (spec.kind === 'diff') {
    return t('toastGearDbDiffSummary', {
      added: spec.addedCount,
      removed: spec.removedCount,
      updated: spec.updatedCount,
    })
  }
  // Timestamp lines show when the payload was received.
  if (spec.kind === 'timestamp') {
    const timestamp = formatLocalDateTime(spec.at, { dateStyle: 'medium', timeStyle: 'medium' })
    return timestamp ? t('toastGearDbReceivedAt', { timestamp }) : null
  }
  // Unknown specs are ignored to keep the UI stable.
  return null
}

export const formatGearDbDiffHistoryLines = (
  lineSpecs: GearDbDiffHistoryLineSpec[],
  t: GearDbDiffHistoryLineTranslator,
): string[] => {
  // Map each spec to its localized line so ordering stays deterministic.
  const lines = lineSpecs.map((spec) => formatGearDbDiffHistoryLineText(spec, t))
  // Trim and drop empty lines so tooltips stay compact.
  return lines.map((line) => (line ?? '').trim()).filter((line) => line.length > 0)
}

/**
 * Clone a NormalizedStat so later dataset mutations cannot affect snapshots.
 */
const cloneNormalizedStat = (stat: NormalizedStat): NormalizedStat => ({
  // Preserve source so main/sub/ascension stats remain distinct.
  source: stat.source,
  // Keep identifying fields so we can detect real stat swaps.
  statId: stat.statId,
  isFlat: stat.isFlat,
  variant: stat.variant,
  // Copy value fields verbatim for accurate diffing.
  baseValue: stat.baseValue,
  glyphValue: stat.glyphValue,
  mythValue: stat.mythValue,
  totalValue: stat.totalValue,
  // Optional fields default to undefined when omitted upstream.
  ...(stat.rolls !== undefined ? { rolls: stat.rolls } : {}),
  ...(stat.position !== undefined ? { position: stat.position } : {}),
})

/**
 * Normalize numbers so undefined / NaN comparisons stay stable.
 */
const normalizeNumber = (value: unknown): number => {
  // Coerce to number once so NaN handling is consistent.
  const num = Number(value)
  // Treat non-finite values as zero so optional fields compare cleanly.
  return Number.isFinite(num) ? num : 0
}

/**
 * Compare two NormalizedStat values for meaningful equality.
 */
const areNormalizedStatsEqual = (left: NormalizedStat | null, right: NormalizedStat | null): boolean => {
  // Fast path for identical references.
  if (left === right) return true
  // Missing stats are never equal to present stats.
  if (!left || !right) return false
  // Source and identifiers must match before value comparisons.
  if (left.source !== right.source) return false
  if (left.statId !== right.statId) return false
  if (left.isFlat !== right.isFlat) return false
  if (left.variant !== right.variant) return false
  // Compare value fields so upgrades and glyphs are detected.
  if (normalizeNumber(left.baseValue) !== normalizeNumber(right.baseValue)) return false
  if (normalizeNumber(left.glyphValue) !== normalizeNumber(right.glyphValue)) return false
  if (normalizeNumber(left.mythValue) !== normalizeNumber(right.mythValue)) return false
  if (normalizeNumber(left.totalValue) !== normalizeNumber(right.totalValue)) return false
  // Roll metadata differentiates leveling and rerolling changes.
  if (normalizeNumber(left.rolls) !== normalizeNumber(right.rolls)) return false
  if (normalizeNumber(left.position) !== normalizeNumber(right.position)) return false
  // All comparable fields align.
  return true
}

/**
 * Compare substat arrays by stat variant so ordering differences do not
 * trigger false-positive updates.
 */
const areSubstatListsEqual = (left: NormalizedStat[], right: NormalizedStat[]): boolean => {
  // Shortcut for shared references.
  if (left === right) return true
  // Length mismatches mean something changed.
  if (left.length !== right.length) return false
  // Build a lookup by variant so ordering changes do not count as diffs.
  const rightByVariant = new Map<number, NormalizedStat>()
  for (const stat of right) {
    rightByVariant.set(Number(stat.variant), stat)
  }
  // Compare each stat from the left list to the matching variant.
  for (const stat of left) {
    const variant = Number(stat.variant)
    const match = rightByVariant.get(variant)
    if (!match) return false
    if (!areNormalizedStatsEqual(stat, match)) return false
  }
  // Every stat matched by variant and value.
  return true
}

/**
 * Compare two artifact snapshots for meaningful differences.
 */
const areGearSnapshotsEqual = (left: GearArtifactSnapshot, right: GearArtifactSnapshot): boolean => {
  // Shortcut for shared references.
  if (left === right) return true
  // Slot/set/rank/rarity/level determine core gear identity.
  if (left.slot !== right.slot) return false
  if (left.set !== right.set) return false
  if (left.rank !== right.rank) return false
  if (left.rarity !== right.rarity) return false
  if (left.level !== right.level) return false
  // Exact level can change without shifting the milestone bucket.
  if (normalizeNumber(left.exactLevel) !== normalizeNumber(right.exactLevel)) return false
  // Accessory faction and rerolls are meaningful to the tester view.
  if (left.faction !== right.faction) return false
  if (left.rerollCount !== right.rerollCount) return false
  // Source changes (inventory vs inbox) should surface as updates.
  if (left.source !== right.source) return false
  // Champion metadata changes should surface in endpoint updates.
  if (left.equippedToChampionId !== right.equippedToChampionId) return false
  if (left.equippedChampionBaseId !== right.equippedChampionBaseId) return false
  if (left.equippedChampionRarity !== right.equippedChampionRarity) return false
  if (left.equippedChampionName !== right.equippedChampionName) return false
  if (left.equippedChampionLocation !== right.equippedChampionLocation) return false
  // Main stat + ascension + substats must all match.
  if (!areNormalizedStatsEqual(left.mainStat, right.mainStat)) return false
  if (!areNormalizedStatsEqual(left.ascension, right.ascension)) return false
  if (!areSubstatListsEqual(left.substats, right.substats)) return false
  // All tracked fields align.
  return true
}

/**
 * Snapshot a gear artifact so diff comparisons are stable across mutations.
 */
const snapshotGearArtifact = (artifact: NormalizedGearArtifact): GearArtifactSnapshot => ({
  // Track the stable identifier for matching.
  id: artifact.id,
  // Copy layout-critical fields for the preview renderer.
  slot: artifact.slot,
  set: artifact.set,
  rank: artifact.rank,
  rarity: artifact.rarity,
  level: artifact.level,
  // Preserve exact level so small upgrades are still visible.
  exactLevel: artifact.exactLevel ?? null,
  faction: artifact.faction,
  // Clone stat arrays so future mutations cannot leak into the snapshot.
  mainStat: artifact.mainStat ? cloneNormalizedStat(artifact.mainStat) : null,
  substats: artifact.substats.map((stat) => cloneNormalizedStat(stat)),
  ascension: artifact.ascension ? cloneNormalizedStat(artifact.ascension) : null,
  // Mirror reroll + source metadata for UI badges.
  rerollCount: artifact.rerollCount,
  source: artifact.source,
  // Copy champion metadata so equip/source changes show up in diffs.
  equippedToChampionId: artifact.equippedToChampionId ?? null,
  equippedChampionBaseId: artifact.equippedChampionBaseId ?? null,
  equippedChampionRarity: artifact.equippedChampionRarity ?? null,
  equippedChampionName: artifact.equippedChampionName ?? null,
  equippedChampionLocation: artifact.equippedChampionLocation ?? null,
})

/**
 * Build a snapshot map from the Gear DB dataset.
 * Optionally filter by a set of ids for delta-based diffs.
 */
export const snapshotGearDbDataset = (
  dataset: GearDbRawDataset,
  ids?: ReadonlySet<number> | null,
): Map<number, GearArtifactSnapshot> => {
  // Build a new map so callers can mutate safely.
  const map = new Map<number, GearArtifactSnapshot>()
  // Allow full snapshots when no id filter is provided.
  const shouldInclude = (id: number): boolean => (!ids || ids.size === 0 || ids.has(id))
  // Snapshot inventory artifacts first for stable ordering.
  dataset.artifacts.forEach((artifact) => {
    if (!shouldInclude(artifact.id)) return
    map.set(artifact.id, snapshotGearArtifact(artifact))
  })
  // Snapshot inbox artifacts next; ids should still remain unique.
  dataset.inboxArtifacts.forEach((artifact) => {
    if (!shouldInclude(artifact.id)) return
    map.set(artifact.id, snapshotGearArtifact(artifact))
  })
  return map
}

/**
 * Build a diff summary between two snapshot maps.
 */
export const buildGearDbDiffSummary = (
  previous: Map<number, GearArtifactSnapshot>,
  next: Map<number, GearArtifactSnapshot>,
): GearDbDiffSummary => {
  // Accumulate diff entries as we compare the two snapshot maps.
  const entries: GearDbDiffEntry[] = []
  // Gather the union of ids so add/remove/updates are all included.
  const ids = new Set<number>()
  previous.forEach((_, id) => { ids.add(id) })
  next.forEach((_, id) => { ids.add(id) })
  // Walk each id and classify the change type.
  for (const id of ids) {
    const before = previous.get(id) ?? null
    const after = next.get(id) ?? null
    // Items only in the next map are additions.
    if (!before && after) {
      entries.push({ id, kind: 'added', before: null, after })
      continue
    }
    // Items only in the previous map are removals.
    if (before && !after) {
      entries.push({ id, kind: 'removed', before, after: null })
      continue
    }
    // Items in both maps are updates only if their snapshots differ.
    if (before && after && !areGearSnapshotsEqual(before, after)) {
      entries.push({ id, kind: 'updated', before, after })
    }
  }
  // Sort by id to keep the toast deterministic.
  entries.sort((a, b) => a.id - b.id)
  // Summaries help callers build header lines if needed.
  const addedCount = entries.filter((entry) => entry.kind === 'added').length
  const removedCount = entries.filter((entry) => entry.kind === 'removed').length
  const updatedCount = entries.filter((entry) => entry.kind === 'updated').length
  return { entries, addedCount, removedCount, updatedCount }
}

/**
 * Extract artifact ids touched by a Gear DB delta so diffing stays scoped.
 */
export const collectGearDbDeltaArtifactIds = (delta: GearDbRawDeltaCommand): Set<number> => {
  // Only artifact table ops affect the tester grid diff.
  const ids = new Set<number>()
  for (const op of delta.ops) {
    const nextId = extractDeltaArtifactId(op)
    if (nextId == null) continue
    ids.add(nextId)
  }
  return ids
}

/**
 * Pull the artifact id from a delta op when the operation targets gear rows.
 */
const extractDeltaArtifactId = (op: GearDbRawDeltaOperation): number | null => {
  // Ignore champion/last-used updates since they do not alter stats.
  if (op.table !== 'Artifacts' && op.table !== 'InboxArtifacts') return null
  // Normalize ids from remove or upsert operations.
  const rawId = op.op === 'remove' ? op.id : Number(op.row.ID)
  // Guard against malformed payloads.
  if (!Number.isFinite(rawId)) return null
  if (rawId <= 0) return null
  return rawId
}
