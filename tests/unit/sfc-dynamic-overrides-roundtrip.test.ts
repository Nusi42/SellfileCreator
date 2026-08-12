/* eslint import/no-unused-modules: off */

/**
 * Dynamic-overrides answers are DOCUMENT state: they only mean anything against the Note
 * that declares the questions, so they now ride inside the SFC payload right after it.
 * These tests pin the round trip (write → read), the "absent key" back-compat contract that
 * lets pre-existing files load unchanged, and the empty-map omission that keeps
 * override-free documents byte-identical to what earlier versions wrote.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSfcPayload, parseSfcObject } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import {
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY,
} from '../../src/lib/noteRecipeOverrides.js'
import { NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY } from '../../src/lib/noteSafeguardOverrides.js'

const buildRecipe = (name: string): BuilderRecipe => ({
  ...(name ? { appearance: { name } } : {}),
  keep: true,
  exportMode: 'active',
  rankCode: 0,
  rarityCode: 0,
  factionCode: 0,
  mainStatsV: [],
  minLevel: 0,
  maxLevel: 16,
  substatsV: [],
  fixedSubstatsV: [],
  minCount: 0,
  autoMinCount: true,
  autoSubstatFlex: false,
  minRequiredRolls: 0,
  autoMinRequiredRolls: true,
  lockedMinRequiredRolls: 0,
  artifactTypes: [],
  artifactSets: [],
  artifactMetaSets: [],
})

// Shared writer args so each test varies only the override fields under test.
const baseArgs = () => ({
  version: 'test-version',
  metasets: [],
  substatTargets: defaultSubstatTargets(),
  recipes: [buildRecipe('Overrides Demo')],
  note: '<!-- recipe-overrides\n  q "Mode"\n  rb "Fast" id=fast *\n-->',
})

const prev = () => ({ metasets: [], substatTargets: defaultSubstatTargets() })

test('override answers survive a write → read round trip', () => {
  const recipeAnswers = { q_mode: ['fast'] }
  const safeguardAnswers = { q_spd: ['12'] }
  const payload = buildSfcPayload({
    ...baseArgs(),
    noteRecipeOverridesAnswers: recipeAnswers,
    noteSafeguardOverridesAnswers: safeguardAnswers,
    noteOverridesDisabled: true,
  })
  // Written keys land beside the Note, under the same names autosave already used.
  assert.deepEqual(payload[NOTE_RECIPE_OVERRIDES_ANSWERS_KEY], recipeAnswers)
  assert.deepEqual(payload[NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY], safeguardAnswers)
  assert.equal(payload[NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY], true)

  // Round trip through JSON so the test exercises the real on-disk representation.
  const parsed = parseSfcObject(JSON.parse(JSON.stringify(payload)), prev())
  assert.deepEqual(parsed.noteRecipeOverridesAnswers, recipeAnswers)
  assert.deepEqual(parsed.noteSafeguardOverridesAnswers, safeguardAnswers)
  assert.equal(parsed.noteOverridesDisabled, true)
})

test('empty answer maps emit no keys, so override-free files stay unchanged', () => {
  const payload = buildSfcPayload({
    ...baseArgs(),
    noteRecipeOverridesAnswers: {},
    noteSafeguardOverridesAnswers: {},
    noteOverridesDisabled: false,
  })
  // Absent rather than present-but-empty: writing `{}` would dirty every saved file.
  assert.equal(NOTE_RECIPE_OVERRIDES_ANSWERS_KEY in payload, false)
  assert.equal(NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY in payload, false)
  assert.equal(NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY in payload, false)
})

test('a legacy file without the keys reads as "absent", not as empty answers', () => {
  // Exactly what an older app version wrote: a Note, and no override keys at all.
  const legacy = buildSfcPayload(baseArgs())
  const parsed = parseSfcObject(JSON.parse(JSON.stringify(legacy)), prev())
  // null distinguishes "the file never stored these" from "the file stores none",
  // which is what lets the loader fall back to seeding the note's authored defaults.
  assert.equal(parsed.noteRecipeOverridesAnswers, null)
  assert.equal(parsed.noteSafeguardOverridesAnswers, null)
  // Absent disabled flag means overrides stay enabled.
  assert.equal(parsed.noteOverridesDisabled, false)
})

test('a v1.0.40-style autosave payload still restores its override answers', () => {
  // Before the consolidation, App.tsx built the SFC body WITHOUT override args and then
  // spread the three keys on top by hand. The key NAMES are unchanged, so the new reader
  // must recover such a payload with no migration step — this is the regression guard for
  // "existing users do not lose their in-progress override answers on upgrade".
  const legacyAutosave = {
    ...buildSfcPayload(baseArgs()),
    [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: { q_mode: ['fast'] },
    [NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY]: { q_spd: ['7'] },
    [NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY]: true,
  }
  const parsed = parseSfcObject(JSON.parse(JSON.stringify(legacyAutosave)), prev())
  assert.deepEqual(parsed.noteRecipeOverridesAnswers, { q_mode: ['fast'] })
  assert.deepEqual(parsed.noteSafeguardOverridesAnswers, { q_spd: ['7'] })
  assert.equal(parsed.noteOverridesDisabled, true)
})

test('malformed override payloads are sanitized rather than rejected', () => {
  // A hand-edited file can carry junk; the canonical normalizers must scrub it.
  const parsed = parseSfcObject({
    ...buildSfcPayload(baseArgs()),
    [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: { q_mode: 'fast', q_junk: '   ', q_drop: [] },
    [NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY]: 'not-an-object',
  }, prev())
  // A bare string answer is promoted to a list; whitespace-only entries are dropped.
  assert.deepEqual(parsed.noteRecipeOverridesAnswers?.['q_mode'], ['fast'])
  assert.equal(parsed.noteRecipeOverridesAnswers?.['q_junk'], undefined)
  // An explicit empty array is preserved — it means "the user cleared this question".
  assert.deepEqual(parsed.noteRecipeOverridesAnswers?.['q_drop'], [])
  // A non-object payload is rejected wholesale rather than throwing.
  assert.equal(parsed.noteSafeguardOverridesAnswers, null)
})

test('a copied document round-trips its disabled flag for paste to apply', () => {
  // "Copy All Recipes" writes the kill switch through the shared writer; paste reads it back
  // via parseSfcObject and applies it when it adopts the note (adoptPastedNote). Without that
  // last step a document copied with overrides switched OFF pasted them back ON.
  const copied = buildSfcPayload({ ...baseArgs(), noteOverridesDisabled: true })
  const parsed = parseSfcObject(JSON.parse(JSON.stringify(copied)), prev())
  assert.equal(parsed.noteOverridesDisabled, true)
  // The default direction must survive too — an enabled document must not paste as disabled.
  const enabled = parseSfcObject(JSON.parse(JSON.stringify(buildSfcPayload(baseArgs()))), prev())
  assert.equal(enabled.noteOverridesDisabled, false)
})
