// Canonical item-id resolution keeps matcher, cache, and keep-unique item keys
// aligned so one artifact always maps to one identity across the app.

// Real artifact ids from the gear DB are positive integers in practice.
// Keep that as the primary identity source when available.
const MIN_REAL_ITEM_ID = 1

// Fallback ids are negative and deterministic by row index.
// This avoids `0` collisions when corrupted payloads miss every id field.
const FALLBACK_INDEX_OFFSET = 1
const FALLBACK_MISSING_ITEM_ID = -1

type IdentityPreviewExtrasLike = {
  id?: unknown
} | null | undefined

type IdentityTesterItemLike = {
  itemId?: unknown
  previewExtras?: IdentityPreviewExtrasLike
} | null | undefined

export type ArtifactIdentityLike = {
  id?: unknown
  testerItem?: IdentityTesterItemLike
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
// DB artifact id, then tester preview id, then runtime tester row id.
export const resolveCanonicalArtifactItemId = (artifact: ArtifactIdentityLike): number | null => {
  const artifactId = toValidRealItemId(artifact?.id)
  if (artifactId != null) return artifactId
  const testerPreviewId = toValidRealItemId(artifact?.testerItem?.previewExtras?.id)
  if (testerPreviewId != null) return testerPreviewId
  const testerItemId = toValidRealItemId(artifact?.testerItem?.itemId)
  if (testerItemId != null) return testerItemId
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
