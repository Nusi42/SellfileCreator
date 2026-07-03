import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveArtifactItemIdWithFallback,
  resolveCanonicalArtifactItemId,
  resolveCanonicalTestItemId,
  GEAR_INSPECTOR_CUSTOM_ID_SENTINEL,
  GEAR_INSPECTOR_CUSTOM_ID_FLOOR,
  GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED,
  isGearInspectorCustomItemId,
  nextGearInspectorCustomItemId,
  reseedGearInspectorCustomIdCursor,
} from '../../src/lib/itemIdentity.js'
import { getSafeguardItemKey } from '../../src/lib/safeguards.js'

test('resolveCanonicalArtifactItemId prefers artifact.id over tester ids', () => {
  // Artifact `id` is the DB identity and should always win.
  const resolved = resolveCanonicalArtifactItemId({
    id: 9001,
    // Keep conflicting tester ids to prove precedence is strict.
    gearInspectorItem: {
      itemId: 1337,
      previewExtras: { id: 7331 },
    },
  })
  assert.equal(resolved, 9001)
})

test('resolveCanonicalTestItemId prefers previewExtras.id over itemId', () => {
  // Preview extras id carries the imported DB identity for tester rows.
  const resolved = resolveCanonicalTestItemId({
    itemId: 4444,
    previewExtras: { id: 5555 },
  })
  assert.equal(resolved, 5555)
})

test('resolveArtifactItemIdWithFallback emits deterministic negative ids', () => {
  // Broken payloads should still map to deterministic fallback ids.
  const resolvedFirst = resolveArtifactItemIdWithFallback({}, 0)
  const resolvedLater = resolveArtifactItemIdWithFallback({}, 9)
  const resolvedMissing = resolveArtifactItemIdWithFallback({})
  assert.equal(resolvedFirst, -1)
  // Row index drives fallback uniqueness when no real ids exist.
  assert.equal(resolvedLater, -10)
  // Missing index falls back to the shared sentinel.
  assert.equal(resolvedMissing, -1)
})

test('getSafeguardItemKey follows db-first precedence', () => {
  // Full payload with all ids proves DB id wins over tester ids.
  const withAllIds = {
    id: 4200,
    gearInspectorItem: {
      itemId: 42,
      previewExtras: { id: 777 },
    },
  } as unknown as Parameters<typeof getSafeguardItemKey>[0]
  assert.equal(getSafeguardItemKey(withAllIds), 4200)

  // Without artifact id, tester preview id should become the key.
  const withPreviewOnly = {
    gearInspectorItem: {
      itemId: 42,
      previewExtras: { id: 777 },
    },
  } as unknown as Parameters<typeof getSafeguardItemKey>[0]
  assert.equal(getSafeguardItemKey(withPreviewOnly), 777)

  // Legacy tester-only payloads still work as the third fallback.
  const withTesterOnly = {
    gearInspectorItem: {
      itemId: 42,
    },
  } as unknown as Parameters<typeof getSafeguardItemKey>[0]
  assert.equal(getSafeguardItemKey(withTesterOnly), 42)

  // Missing every id should keep the historical zero sentinel.
  const withNoIds = {} as unknown as Parameters<typeof getSafeguardItemKey>[0]
  assert.equal(getSafeguardItemKey(withNoIds), 0)
})

test('isGearInspectorCustomItemId only accepts the reserved high band', () => {
  // Real DB ids (small positives, observed up to ~264k) must never be custom.
  assert.equal(isGearInspectorCustomItemId(1), false)
  assert.equal(isGearInspectorCustomItemId(264_000), false)
  assert.equal(isGearInspectorCustomItemId(0), false)
  assert.equal(isGearInspectorCustomItemId(-5), false)
  assert.equal(isGearInspectorCustomItemId(Number.NaN), false)
  // Floor and sentinel are inclusive; everything between is custom.
  assert.equal(isGearInspectorCustomItemId(GEAR_INSPECTOR_CUSTOM_ID_FLOOR), true)
  assert.equal(isGearInspectorCustomItemId(GEAR_INSPECTOR_CUSTOM_ID_SENTINEL), true)
  // Just below the floor stays out of band.
  assert.equal(isGearInspectorCustomItemId(GEAR_INSPECTOR_CUSTOM_ID_FLOOR - 1), false)
})

test('nextGearInspectorCustomItemId allocates descending from the sentinel', () => {
  // Seeded cursor yields the sentinel first, then decrements.
  const first = nextGearInspectorCustomItemId(GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED)
  assert.equal(first, GEAR_INSPECTOR_CUSTOM_ID_SENTINEL)
  const second = nextGearInspectorCustomItemId(first!)
  assert.equal(second, GEAR_INSPECTOR_CUSTOM_ID_SENTINEL - 1)
  // Exhaustion returns null at the floor boundary.
  assert.equal(nextGearInspectorCustomItemId(GEAR_INSPECTOR_CUSTOM_ID_FLOOR), null)
})

test('reseedGearInspectorCustomIdCursor tracks the minimum in-band id', () => {
  const seed = GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED
  // Restoring items with high custom ids pushes the cursor below the smallest one.
  const cursor = reseedGearInspectorCustomIdCursor(seed, [
    { itemId: GEAR_INSPECTOR_CUSTOM_ID_SENTINEL },
    { itemId: GEAR_INSPECTOR_CUSTOM_ID_SENTINEL - 5 },
  ])
  assert.equal(cursor, GEAR_INSPECTOR_CUSTOM_ID_SENTINEL - 5)
  // Legacy low ids (out of band) are ignored — the cursor stays at the seed.
  const unchanged = reseedGearInspectorCustomIdCursor(seed, [{ itemId: 1 }, { itemId: 2 }])
  assert.equal(unchanged, seed)
})
