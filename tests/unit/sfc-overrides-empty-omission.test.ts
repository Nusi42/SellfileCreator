/* eslint import/no-unused-modules: off */

/**
 * Regression: saving a document whose dynamic overrides are all at their DSL defaults
 * must not emit the answer keys at all. An empty-but-present
 * `NoteSafeguardOverridesAnswers: {}` is noise in every saved file and makes an
 * untouched preset look configured.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildSfcPayload } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import {
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  resolveRecipeOverridesTags,
  seedSafeguardAnswersFromRecipeDefaults,
} from '../../src/lib/noteRecipeOverrides.js'
import {
  NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY,
  resolveNoteSafeguardOverridesTags,
} from '../../src/lib/noteSafeguardOverrides.js'

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

// ── Default-equal answers are omitted (against the TRUE effective defaults) ───────────
//
// The shipped preset forces six safeguard sliders from its default account tier via
// cross-domain `setval`. Those forced values ARE the effective defaults, so an untouched
// document was saving a full six-entry answer map. The writer now compares against the
// note's seeded baseline — not each slider's `default=`, which would keep every forced value.

const lategameNote = (): string => {
  const raw = JSON.parse(readFileSync('presets/lategame.sfc', 'utf8')) as { Note: string[] }
  return raw.Note.join('\n')
}

const emit = (
  note: string,
  recipeAnswers: Record<string, string[]>,
  safeguardAnswers: Record<string, string[]>,
): Record<string, unknown> => buildSfcPayload({
  version: 'test-version',
  metasets: [],
  substatTargets: defaultSubstatTargets(),
  recipes: [],
  note,
  noteRecipeOverridesAnswers: recipeAnswers,
  noteSafeguardOverridesAnswers: safeguardAnswers,
}) as Record<string, unknown>

test('an untouched preset emits no safeguard answers at all', () => {
  const note = lategameNote()
  // Exactly the load-time state: no recipe answers (the `*` tier applies) + its seeded forces.
  const seeded = seedSafeguardAnswersFromRecipeDefaults(note)
  assert.ok(Object.keys(seeded).length > 0, 'preset really does seed answers (guards the premise)')
  assert.equal(NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY in emit(note, {}, seeded), false)
})

test('a genuine deviation still persists, and only that entry', () => {
  const note = lategameNote()
  const seeded = seedSafeguardAnswersFromRecipeDefaults(note)
  const questionId = Object.keys(seeded)[0]!
  const payload = emit(note, {}, { ...seeded, [questionId]: ['64'] })
  // The dragged slider survives; its five default-valued siblings are dropped.
  assert.deepEqual(payload[NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY], { [questionId]: ['64'] })
})

test('the baseline tracks the SELECTED tier, not the default one', () => {
  // A non-default tier forces different values; those are ITS defaults and must be omitted —
  // while the same values under the default tier are a real deviation and must be kept.
  const note = lategameNote()
  const acctQ = resolveRecipeOverridesTags(note).questions
    .find((q) => q.options.some((o) => o.token === 'endgame'))!
  const recipeAnswers = { [acctQ.id]: [acctQ.options.find((o) => o.token === 'endgame')!.id] }
  const endgameSeeded = seedSafeguardAnswersFromRecipeDefaults(note, recipeAnswers)

  assert.equal(NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY in emit(note, recipeAnswers, endgameSeeded), false)
  // Same values, default tier selected → no longer defaults, so they are written.
  assert.ok(NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY in emit(note, {}, endgameSeeded))
})

test('omitted defaults are reconstructed by the load path', () => {
  // Omission is only safe because import re-seeds from the note. This is that guarantee:
  // an absent map must resolve to the identical effective instructions.
  const note = lategameNote()
  const seeded = seedSafeguardAnswersFromRecipeDefaults(note)
  const reconstructed = seedSafeguardAnswersFromRecipeDefaults(note, {}, {})
  assert.deepEqual(reconstructed, seeded)
  assert.equal(
    JSON.stringify(resolveNoteSafeguardOverridesTags(note, reconstructed).instructions),
    JSON.stringify(resolveNoteSafeguardOverridesTags(note, seeded).instructions),
  )
})
