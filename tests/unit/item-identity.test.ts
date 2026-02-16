/* eslint-disable import/no-unused-modules */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveArtifactItemIdWithFallback,
  resolveCanonicalArtifactItemId,
  resolveCanonicalTestItemId,
} from '../../src/lib/itemIdentity.js'
import { getKeepUniqueItemKey } from '../../src/lib/keepUniques.js'

test('resolveCanonicalArtifactItemId prefers artifact.id over tester ids', () => {
  // Artifact `id` is the DB identity and should always win.
  const resolved = resolveCanonicalArtifactItemId({
    id: 9001,
    // Keep conflicting tester ids to prove precedence is strict.
    testerItem: {
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

test('getKeepUniqueItemKey follows db-first precedence', () => {
  // Full payload with all ids proves DB id wins over tester ids.
  const withAllIds = {
    id: 4200,
    testerItem: {
      itemId: 42,
      previewExtras: { id: 777 },
    },
  } as unknown as Parameters<typeof getKeepUniqueItemKey>[0]
  assert.equal(getKeepUniqueItemKey(withAllIds), 4200)

  // Without artifact id, tester preview id should become the key.
  const withPreviewOnly = {
    testerItem: {
      itemId: 42,
      previewExtras: { id: 777 },
    },
  } as unknown as Parameters<typeof getKeepUniqueItemKey>[0]
  assert.equal(getKeepUniqueItemKey(withPreviewOnly), 777)

  // Legacy tester-only payloads still work as the third fallback.
  const withTesterOnly = {
    testerItem: {
      itemId: 42,
    },
  } as unknown as Parameters<typeof getKeepUniqueItemKey>[0]
  assert.equal(getKeepUniqueItemKey(withTesterOnly), 42)

  // Missing every id should keep the historical zero sentinel.
  const withNoIds = {} as unknown as Parameters<typeof getKeepUniqueItemKey>[0]
  assert.equal(getKeepUniqueItemKey(withNoIds), 0)
})
