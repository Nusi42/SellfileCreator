// Canonical item-id resolution keeps matcher, cache, and safeguard item keys
// aligned so one artifact always maps to one identity across the app.

// Real artifact ids from the gear DB are positive integers in practice.
// Keep that as the primary identity source when available.
const MIN_REAL_ITEM_ID = 1

// Fallback ids are negative and deterministic by row index.
// This avoids `0` collisions when corrupted payloads miss every id field.
const FALLBACK_INDEX_OFFSET = 1
const FALLBACK_MISSING_ITEM_ID = -1

// Manual ("custom") Gear Inspector pieces are keyed by the same positive-int space
// as real DB artifacts (getSafeguardItemKey / resolveCanonicalArtifactItemId return
// the artifact id when >0). Ascending ids starting at 1 collided with real DB ids
// (observed up to ~264k across example DBs) whenever a session mixed custom + imported
// gear, which quietly folded distinct pieces onto one safeguard item key. To stay
// isolated, custom ids are allocated DESCENDING from INT32_MAX. The floor keeps a
// ~2.1-billion band reserved for customs, far above any realistic DB id.
export const GEAR_INSPECTOR_CUSTOM_ID_SENTINEL = 0x7fffffff // 2_147_483_647 (INT32_MAX)
// Anything at/above this is treated as a synthetic custom id (never a real DB id).
// 2^30 leaves >1 billion of real-id headroom below it and >1 billion of custom range above.
export const GEAR_INSPECTOR_CUSTOM_ID_FLOOR = 0x40000000 // 1_073_741_824 (2^30)

// True when an id sits in the reserved synthetic-custom band (SSOT for the check).
export const isGearInspectorCustomItemId = (value: unknown): boolean => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= GEAR_INSPECTOR_CUSTOM_ID_FLOOR
}

// The descending allocator's "next id" cursor starts one ABOVE the sentinel so the
// first allocation returns the sentinel itself. Consumers seed a ref with this.
export const GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED = GEAR_INSPECTOR_CUSTOM_ID_SENTINEL + 1

// Allocate the next descending custom id below `previousCursor` (the last cursor value;
// the id handed out is previousCursor - 1). Returns null if the band is exhausted (never
// in practice — the range holds ~1e9 ids).
export const nextGearInspectorCustomItemId = (previousCursor: number): number | null => {
  const candidate = Math.floor(previousCursor) - 1
  if (!Number.isFinite(candidate) || candidate < GEAR_INSPECTOR_CUSTOM_ID_FLOOR) return null
  return Math.min(candidate, GEAR_INSPECTOR_CUSTOM_ID_SENTINEL)
}

// Reseed the descending allocator cursor after restoring a set of items so the next
// allocation stays below every custom id already present. `currentCursor` is the ref's
// current value; `items` are the restored pieces. Returns the new cursor (the minimum of
// currentCursor and one below the smallest in-band custom id seen). Ids outside the custom
// band (real DB ids, legacy low ids) are ignored — migration relocates those separately.
export const reseedGearInspectorCustomIdCursor = (
  currentCursor: number,
  items: ReadonlyArray<{ itemId?: unknown }>,
): number => {
  let minInBand = currentCursor
  for (const item of items) {
    const id = Number(item?.itemId)
    if (isGearInspectorCustomItemId(id) && id < minInBand) minInBand = id
  }
  // Cursor must sit at-or-below the smallest custom id so the next alloc goes lower.
  return Math.min(currentCursor, minInBand)
}

type IdentityPreviewExtrasLike = {
  id?: unknown
} | null | undefined

type IdentityGearInspectorItemLike = {
  itemId?: unknown
  previewExtras?: IdentityPreviewExtrasLike
} | null | undefined

export type ArtifactIdentityLike = {
  id?: unknown
  gearInspectorItem?: IdentityGearInspectorItemLike
} | null | undefined

export type TestItemIdentityLike = {
  itemId?: unknown
  previewExtras?: IdentityPreviewExtrasLike
} | null | undefined

// Keep numeric coercion in one helper so every caller enforces the same rules.
const toValidRealItemId = (value: unknown): number | null => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const floored = Math.floor(numeric)
  if (floored < MIN_REAL_ITEM_ID) return null
  return floored
}

// Canonical test-item resolution prefers preview/db identity over runtime ids.
// Why: previewExtras.id tracks the imported artifact id when present.
export const resolveCanonicalTestItemId = (item: TestItemIdentityLike): number | null => {
  const previewId = toValidRealItemId(item?.previewExtras?.id)
  if (previewId != null) return previewId
  const itemId = toValidRealItemId(item?.itemId)
  if (itemId != null) return itemId
  return null
}

// Canonical artifact resolution keeps the same precedence everywhere:
// DB artifact id, then Gear Inspector preview id, then runtime Gear Inspector row id.
export const resolveCanonicalArtifactItemId = (artifact: ArtifactIdentityLike): number | null => {
  const artifactId = toValidRealItemId(artifact?.id)
  if (artifactId != null) return artifactId
  const gearInspectorPreviewId = toValidRealItemId(artifact?.gearInspectorItem?.previewExtras?.id)
  if (gearInspectorPreviewId != null) return gearInspectorPreviewId
  const gearInspectorItemId = toValidRealItemId(artifact?.gearInspectorItem?.itemId)
  if (gearInspectorItemId != null) return gearInspectorItemId
  return null
}

// Worker/cache paths need a numeric id even when payloads are partially broken.
// Use deterministic negative ids by row index so missing ids stay unique enough.
export const resolveArtifactItemIdWithFallback = (
  artifact: ArtifactIdentityLike,
  fallbackIdx?: number,
): number => {
  const canonical = resolveCanonicalArtifactItemId(artifact)
  if (canonical != null) return canonical
  if (typeof fallbackIdx === 'number' && Number.isFinite(fallbackIdx)) {
    const normalizedIdx = Math.max(0, Math.floor(fallbackIdx))
    return -(normalizedIdx + FALLBACK_INDEX_OFFSET)
  }
  return FALLBACK_MISSING_ITEM_ID
}
