/* eslint import/no-unused-modules: off */

/**
 * Regression: saving a document whose dynamic overrides are all at their DSL defaults
 * must not emit the answer keys at all. An empty-but-present
 * `NoteSafeguardOverridesAnswers: {}` is noise in every saved file and makes an
 * untouched preset look configured.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSfcPayload } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import { NOTE_RECIPE_OVERRIDES_ANSWERS_KEY } from '../../src/lib/noteRecipeOverrides.js'
import { NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY } from '../../src/lib/noteSafeguardOverrides.js'

const baseArgs = () => ({
  version: 'test-version',
  metasets: [],
  substatTargets: defaultSubstatTargets(),
  recipes: [],
  note: '<!-- recipe-overrides\n  q "Mode"\n  rb "Fast" id=fast *\n-->',
})

test('an empty safeguard answer map emits no key', () => {
  // The seed pass returns `{}` for a note whose defaults force nothing, and that empty
  // object flowed straight into the payload before the omission guard covered it.
  const payload = buildSfcPayload({
    ...baseArgs(),
    noteRecipeOverridesAnswers: {},
    noteSafeguardOverridesAnswers: {},
  })
  assert.equal(NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY in payload, false)
  assert.equal(NOTE_RECIPE_OVERRIDES_ANSWERS_KEY in payload, false)
})

test('one populated map does not drag the other empty one into the file', () => {
  // The common real case: a recipe answer is set, safeguards are all still default.
  const payload = buildSfcPayload({
    ...baseArgs(),
    noteRecipeOverridesAnswers: { q_mode: ['fast'] },
    noteSafeguardOverridesAnswers: {},
  })
  assert.deepEqual(payload[NOTE_RECIPE_OVERRIDES_ANSWERS_KEY], { q_mode: ['fast'] })
  assert.equal(NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY in payload, false)
})

test('answer maps holding only empty selections still count as content', () => {
  // An explicit `[]` means "the user cleared this multi-select", which the normalizers
  // deliberately preserve — so it is NOT the same as an absent answer and must persist.
  const payload = buildSfcPayload({
    ...baseArgs(),
    noteSafeguardOverridesAnswers: { q_cleared: [] },
  })
  assert.deepEqual(payload[NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY], { q_cleared: [] })
})
