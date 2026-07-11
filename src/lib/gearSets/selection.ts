import type { ArtifactSetId } from '../types'
import type { Metaset } from '../metasets'
import { resolveMetasets } from '../metasets'
import { ACCESSORY_NO_SET_ID } from '../constants'

export type ArtifactSetSelectionEntry = {
  // Numeric set ID (artifact/accessory set)
  id: ArtifactSetId
  // When true, explicitly exclude this set (even if selected by metasets).
  excluded?: boolean
}

export type ArtifactSetSelectionSplit = {
  // Explicit includes (non-excluded entries).
  included: ArtifactSetId[]
  // Explicit excludes (entries flagged excluded).
  excluded: ArtifactSetId[]
}

const coerceSelectionEntry = (value: unknown): ArtifactSetSelectionEntry | null => {
  // Accept legacy numeric IDs alongside the new object payload.
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Legacy array of numbers -> include entry.
    return { id: Math.floor(value) as ArtifactSetId }
  }
  // Accept stringified numbers from JSON or loose inputs.
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      // String numbers should mirror the numeric legacy format.
      return { id: Math.floor(numeric) as ArtifactSetId }
    }
  }
  // Ignore non-objects after handling primitive cases.
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  // Support both { id } and { setId } to keep call sites flexible.
  const rawId = rec.id ?? rec.setId
  if (rawId == null) return null
  const numeric = Number(rawId)
  if (!Number.isFinite(numeric)) return null
  // Only a literal true should mark the entry excluded.
  const excluded = rec.excluded === true
  return excluded
    ? { id: Math.floor(numeric) as ArtifactSetId, excluded: true }
    : { id: Math.floor(numeric) as ArtifactSetId }
}

export const normalizeArtifactSetSelections = (value: unknown): ArtifactSetSelectionEntry[] => {
  if (!Array.isArray(value)) return []
  // Map by ID so we can merge duplicates deterministically.
  const byId = new Map<number, ArtifactSetSelectionEntry>()
  for (const entry of value) {
    const normalized = coerceSelectionEntry(entry)
    if (!normalized) continue
    const idNum = Number(normalized.id)
    const prev = byId.get(idNum)
    // Exclusions always win so the result never includes + excludes the same set.
    if (normalized.excluded) {
      byId.set(idNum, { id: normalized.id, excluded: true })
      continue
    }
    // Preserve exclusions over includes if the same ID appears twice.
    if (prev && prev.excluded) continue
    byId.set(idNum, { id: normalized.id })
  }
  // Sort to keep snapshots, exports, and UI deterministic.
  const sorted = Array.from(byId.values())
    .sort((a, b) => Number(a.id) - Number(b.id))
  return sorted
}

// buildArtifactSetSelectionKey returns a stable string for equality checks.
export const buildArtifactSetSelectionKey = (
  selections: readonly ArtifactSetSelectionEntry[] | null | undefined,
): string => (
  // Normalize first so legacy payloads collapse deterministically.
  normalizeArtifactSetSelections(selections ?? [])
    // Encode both id + exclusion so comparisons remain lossless.
    .map((entry) => `${Number(entry.id)}:${entry.excluded ? 1 : 0}`)
    .join('|')
)

// Human-readable label for a sets+metasets selection (override-badge tooltips in the
// recipe AND safeguard builders — one formatter so the two badges can never diverge).
// Metaset names come first verbatim; set entries follow, excluded ones prefixed with
// "–" to mirror the exclusion UX convention. Falls back to anyLabel when empty.
export const formatArtifactSetSelectionLabel = (
  sets: readonly ArtifactSetSelectionEntry[] | null | undefined,
  metaSetNames: readonly string[] | null | undefined,
  getSetName: (id: ArtifactSetId) => string,
  anyLabel: string,
): string => {
  const parts: string[] = [
    ...(metaSetNames ?? []),
    ...(sets ?? []).map((e) => (e.excluded ? '–' : '') + getSetName(e.id)),
  ]
  return parts.length > 0 ? parts.join(', ') : anyLabel
}

// pruneAccessoryNoSetSelections drops the no-set sentinel when accessories are out of scope.
export const pruneAccessoryNoSetSelections = (
  selections: readonly ArtifactSetSelectionEntry[] | null | undefined,
  allowNoSet: boolean,
): ArtifactSetSelectionEntry[] => {
  // Normalize to keep ordering and exclusion semantics stable.
  const normalized = normalizeArtifactSetSelections(selections ?? [])
  // Keep the sentinel when accessories are allowed.
  if (allowNoSet) return normalized
  // Otherwise, remove it from both include and exclude buckets.
  return normalized.filter((entry) => Number(entry.id) !== ACCESSORY_NO_SET_ID)
}

export const splitArtifactSetSelections = (
  selections: readonly ArtifactSetSelectionEntry[] | null | undefined,
): ArtifactSetSelectionSplit => {
  const included: ArtifactSetId[] = []
  const excluded: ArtifactSetId[] = []
  // Fast exit for empty selections so callers can skip extra work.
  if (!selections || selections.length === 0) return { included, excluded }
  for (const entry of selections) {
    const idNum = Number(entry.id)
    if (!Number.isFinite(idNum)) continue
    // Route each entry into the appropriate bucket.
    if (entry.excluded) {
      excluded.push(idNum as ArtifactSetId)
    } else {
      included.push(idNum as ArtifactSetId)
    }
  }
  return { included, excluded }
}

export const mergeArtifactSetSelections = (
  selections: readonly ArtifactSetSelectionEntry[] | null | undefined,
): ArtifactSetSelectionEntry[] => normalizeArtifactSetSelections(selections ?? [])

/**
 * pruneImplicitAnyExclusions — SSOT for the "can't NOT an implicit-any set" rule.
 *
 * When a recipe/safeguard lists no explicit set AND no metaset, it implicitly
 * means "any gear-set" (the HSF format expresses this by listing nothing). HSF
 * cannot represent "all gear-sets except Xyz", so a bare exclusion on an
 * otherwise-empty selection is meaningless — we drop it rather than unroll
 * implicit-any into "all minus the excluded one".
 *
 * An exclusion is only kept when something narrows the pool: at least one
 * explicit included set, or at least one active metaset (`hasMetaset`). This is
 * enforced centrally so it holds for right-click, import, and every other path.
 */
export const pruneImplicitAnyExclusions = (
  selections: readonly ArtifactSetSelectionEntry[] | null | undefined,
  hasMetaset: boolean,
): ArtifactSetSelectionEntry[] => {
  // Normalize first so exclusion-wins + ordering are already settled.
  const normalized = normalizeArtifactSetSelections(selections ?? [])
  const { included } = splitArtifactSetSelections(normalized)
  // A metaset or any explicit include means the pool is constrained — keep excludes.
  if (hasMetaset || included.length > 0) return normalized
  // Implicit-any: strip every exclusion, leaving the empty (= any) selection.
  return normalized.filter((entry) => !entry.excluded)
}

export type ArtifactSetResolution = {
  // Explicit include set IDs (ignores excluded entries).
  included: ArtifactSetId[]
  // Explicit exclude set IDs.
  excluded: ArtifactSetId[]
  // Final set IDs after metaset expansion and exclusion.
  resolved: ArtifactSetId[]
}

export const resolveArtifactSetSelections = (params: {
  selections: readonly ArtifactSetSelectionEntry[] | null | undefined
  metasetIds: readonly string[] | null | undefined
  metasets: readonly Metaset[]
}): ArtifactSetResolution => {
  const { selections, metasetIds, metasets } = params
  // Normalize and split so callers never worry about legacy payloads.
  const normalized = normalizeArtifactSetSelections(selections ?? [])
  const { included, excluded } = splitArtifactSetSelections(normalized)
  // Expand metasets into set IDs before applying exclusions.
  const fromMetas = resolveMetasets(metasetIds ? Array.from(metasetIds) : undefined, metasets as Metaset[])
  const union = new Set<number>()
  for (const id of included) union.add(Number(id))
  for (const id of fromMetas) union.add(Number(id))
  // Apply exclusions last so explicit removes always win.
  for (const id of excluded) union.delete(Number(id))
  const resolved = Array.from(union).sort((a, b) => a - b) as ArtifactSetId[]
  return { included, excluded, resolved }
}
