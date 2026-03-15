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
