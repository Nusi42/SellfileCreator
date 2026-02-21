/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SAFEGUARD_IGNORE_TAG,
  hasIgnoreSafeguardTag,
  normalizeTagList,
} from '../../src/lib/tagHelpers.js'

test('normalizeTagList rewrites legacy safeguard-ignore aliases to canonical tag', () => {
  // Mixed alias inputs should collapse into one canonical safeguard-ignore tag.
  const normalized = normalizeTagList([
    'ignore_keep_unique',
    'ignore_safeguard',
    'ignore_by_safeguards',
  ])
  // Export/write paths should always emit the new canonical token only.
  assert.deepEqual(normalized, [SAFEGUARD_IGNORE_TAG])
})

test('hasIgnoreSafeguardTag accepts legacy and canonical safeguard-ignore tags', () => {
  // Legacy files may still carry the old keep-unique wording.
  assert.equal(hasIgnoreSafeguardTag(['ignore_keep_unique']), true)
  // Transitional snapshots may carry the intermediate safeguard wording.
  assert.equal(hasIgnoreSafeguardTag(['ignore_safeguard']), true)
  // New files should use the canonical tag.
  assert.equal(hasIgnoreSafeguardTag([SAFEGUARD_IGNORE_TAG]), true)
})

test('normalizeTagList keeps unrelated tags while canonicalizing safeguard-ignore aliases', () => {
  // Preserve insertion order for non-special tags.
  const normalized = normalizeTagList([
    'speed',
    'ignore_keep_unique',
    'faction_wars',
  ])
  // Only the special alias should be rewritten.
  assert.deepEqual(normalized, ['speed', SAFEGUARD_IGNORE_TAG, 'faction_wars'])
})
