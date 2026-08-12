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
import { buildDocumentOverridesView } from '../../src/lib/documentOverrides.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import {
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  dropDefaultSafeguardOverridesAnswers,
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

// ── The lean-write contract holds for EVERY consumer, not just the app ────────────────
//
// Omitting default-equal answers is only safe if every consumer re-derives the baseline.
// The background account push (lib/backgroundAccountPush.ts) feeds a parsed document
// straight into buildDocumentOverridesView with no seeding of its own, so the seeding
// lives inside that builder — one definition, not a contract each call site must recall.
// Without it an untouched Lategame preset resolved count=16/32 in the background push
// while the app showed 12/24, i.e. the pushed sellfile kept materially more gear.

// These drive the REAL buildDocumentOverridesView rather than replaying its prologue: a test
// that re-implements the seeding would still pass if the seeding were deleted from the seam,
// which is exactly the regression being guarded. It needs the WASM rule engine because the
// builder resolves safeguard rules through it.
const overridesSignature = async (
  note: string,
  safeguardOverridesAnswers: Record<string, string[]>,
): Promise<string> => {
  await warmupWasmRuleEngine()
  const view = buildDocumentOverridesView({
    note,
    noteOverridesDisabled: false,
    recipeOverridesAnswers: {},
    safeguardOverridesAnswers,
    recipes: [],
    substatTargets: defaultSubstatTargets(),
    safeguardRules: [],
    metasets: [],
    recipesEnabled: true,
  })
  return JSON.stringify(view.effectiveSafeguardInstructions)
}

test('a lean-written document resolves identically with and without pre-seeding', async () => {
  const note = lategameNote()
  const live = seedSafeguardAnswersFromRecipeDefaults(note)
  const persisted = dropDefaultSafeguardOverridesAnswers(note, {}, live)
  assert.equal(Object.keys(persisted).length, 0, 'the preset really is written lean (guards the premise)')

  // Background-push input (lean, unseeded) must match the app's in-memory state. Before the
  // seam seeded internally these differed: count=16/32 here vs 12/24 in the app.
  assert.equal(await overridesSignature(note, persisted), await overridesSignature(note, live))
  // Seeding an already-seeded map is a fixed point, so the pre-seeded app path is unaffected.
  assert.equal(
    await overridesSignature(note, live),
    await overridesSignature(note, seedSafeguardAnswersFromRecipeDefaults(note, {}, live)),
  )
})

test('seam seeding never overrides a genuine deviation', async () => {
  const note = lategameNote()
  const live = seedSafeguardAnswersFromRecipeDefaults(note)
  const questionId = Object.keys(live)[0]!
  // A stored deviation differs from the baseline and survives seeding intact.
  assert.notEqual(await overridesSignature(note, { [questionId]: ['64'] }), await overridesSignature(note, live))
  assert.equal(
    await overridesSignature(note, { [questionId]: ['64'] }),
    await overridesSignature(note, { ...live, [questionId]: ['64'] }),
  )
})
