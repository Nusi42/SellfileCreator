import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRecipeOverridesTags,
  applyRecipeOverridesAnswerChange,
  buildRecipeOptionTokenMap,
  collectCrossDomainRecipeOptionWrites,
  applyRecipeOptionWrites,
} from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags } from '../../src/lib/noteSafeguardOverrides.js'

// ── Why this test exists ──────────────────────────────────────────────────────
// The REVERSE cross-domain bridge: a safeguard option's set/unset/excl tokens naming
// RECIPE option ids. Its flagship semantic is the CONDITIONAL REPLACE — `excl X set Y`
// on one source option fires only while X is selected, so a "downgrade" (FW-Hard
// `Yes!` → `Yes` when utility protection is re-enabled) never touches players who
// answered `No`. The fixture mirrors that exact wiring.

const NOTE = [
  '<!-- recipe-overrides',
  'q "Finished Faction Wars?" id=q_fw',
  // First option deliberately id-less: its implicit numeric token must never enter the
  // cross-domain token map (question-local by contract) — and it doubles as the radio's
  // fallback-to-first hazard the replace shape must dodge.
  'rb "No" { @all { export=active } }',
  'rb "Yes" id=fw_yes16 { @all { export=active } }',
  'rb "Yes!" id=fw_yes { @all { export=disabled } }',
  '-->',
  '<!-- recipe-overrides',
  'q "Extras?" id=q_x',
  'cb "Extra keeps" id=rx_on * { @all { export=active } }',
  '-->',
  '<!-- safeguard-overrides',
  'q "Protect utility?" id=q_util',
  'rb "None" id=util_off { @tag=utility { activation=off } }',
  // The downgrade pair: replace `Yes!` with `Yes` — but only while `Yes!` holds.
  'rb "Own" id=util_own excl fw_yes set fw_yes16 { @tag=utility { activation=protect_existing } }',
  // A bare select (no excl partner): a hard cross-domain radio pick.
  'rb "Gaps" id=util_gaps * set fw_yes16 { @tag=utility { activation=anticipate_gaps } }',
  // A bare deselect: unchecks the recipe checkbox when this option turns on.
  'rb "Upgrades" id=util_upg unset rx_on { @tag=utility { activation=anticipate_improvements } }',
  '-->',
].join('\n')

// Resolve both domains once; individual tests derive ids from these.
const recipeQuestions = resolveRecipeOverridesTags(NOTE).questions
const fwQ = recipeQuestions.find((q) => q.id === 'q_fw')!
const fwNo = fwQ.options[0]!
const fwYes16 = fwQ.options.find((o) => o.token === 'fw_yes16')!
const fwYes = fwQ.options.find((o) => o.token === 'fw_yes')!
const xQ = recipeQuestions.find((q) => q.id === 'q_x')!
const rxOn = xQ.options.find((o) => o.token === 'rx_on')!
const sgQuestions = resolveNoteSafeguardOverridesTags(NOTE).questions
const sgQ = sgQuestions[0]!
const utilOwn = sgQ.options.find((o) => o.token === 'util_own')!
const utilGaps = sgQ.options.find((o) => o.token === 'util_gaps')!
const utilUpg = sgQ.options.find((o) => o.token === 'util_upg')!

// Simulate a real user click on a recipe radio (the dialog's storage path), so the
// stored answers used below are exactly what the app would have persisted.
const clickRecipe = (optionId: string) =>
  applyRecipeOverridesAnswerChange(NOTE, {}, fwQ, [optionId], optionId)

test('buildRecipeOptionTokenMap maps explicit tokens only', () => {
  const map = buildRecipeOptionTokenMap(recipeQuestions)
  assert.deepEqual(map.get('fw_yes'), { questionId: fwQ.id, optionId: fwYes.id })
  assert.deepEqual(map.get('fw_yes16'), { questionId: fwQ.id, optionId: fwYes16.id })
  assert.deepEqual(map.get('rx_on'), { questionId: xQ.id, optionId: rxOn.id })
  // The id-less option's implicit numeric token stays question-local.
  assert.equal(map.has('1'), false)
})

test('collector merges a set+excl pair into one replace-shaped write', () => {
  const answered = resolveNoteSafeguardOverridesTags(NOTE, { [sgQ.id]: [utilOwn.id] }).questions
  const writes = collectCrossDomainRecipeOptionWrites(answered, buildRecipeOptionTokenMap(recipeQuestions))
  // util_own is selected → exactly one write, pairing select and deselect for q_fw.
  assert.deepEqual(writes, [{ questionId: fwQ.id, selectId: fwYes16.id, deselectId: fwYes.id }])
  // The shouldApply gate filters source options (the "newly selected" contract).
  assert.deepEqual(
    collectCrossDomainRecipeOptionWrites(answered, buildRecipeOptionTokenMap(recipeQuestions), () => false),
    [],
  )
})

test('replace write downgrades the selected target — and never falls back to first', () => {
  const stored = clickRecipe(fwYes.id)
  const next = applyRecipeOptionWrites(NOTE, stored, [
    { questionId: fwQ.id, selectId: fwYes16.id, deselectId: fwYes.id },
  ])
  const answer = resolveRecipeOverridesTags(NOTE, next).questions.find((q) => q.id === fwQ.id)!.answer
  // `Yes!` became `Yes` — not the group's first option (`No`), which a bare deselect
  // with single-group fallback would have produced.
  assert.deepEqual(answer, [fwYes16.id])
})

test('replace write is gated: it no-ops while the deselect target is not selected', () => {
  const stored = clickRecipe(fwNo.id)
  const next = applyRecipeOptionWrites(NOTE, stored, [
    { questionId: fwQ.id, selectId: fwYes16.id, deselectId: fwYes.id },
  ])
  // Untouched: same reference proves the write never fired.
  assert.equal(next, stored)
})

test('bare select is a hard radio pick; a no-op when already selected', () => {
  // util_gaps’ `set fw_yes16` fires regardless of the current selection…
  const fromNo = applyRecipeOptionWrites(NOTE, clickRecipe(fwNo.id), [
    { questionId: fwQ.id, selectId: fwYes16.id, deselectId: null },
  ])
  assert.deepEqual(
    resolveRecipeOverridesTags(NOTE, fromNo).questions.find((q) => q.id === fwQ.id)!.answer,
    [fwYes16.id],
  )
  // …except when the target is already selected (reference equality = nothing moved).
  const already = clickRecipe(fwYes16.id)
  assert.equal(applyRecipeOptionWrites(NOTE, already, [
    { questionId: fwQ.id, selectId: fwYes16.id, deselectId: null },
  ]), already)
})

test('bare deselect unchecks a recipe checkbox; a no-op when already unchecked', () => {
  // The checkbox is default-on; the write persists an explicit uncheck.
  const unchecked = applyRecipeOptionWrites(NOTE, {}, [
    { questionId: xQ.id, selectId: null, deselectId: rxOn.id },
  ])
  assert.deepEqual(
    resolveRecipeOverridesTags(NOTE, unchecked).questions.find((q) => q.id === xQ.id)!.answer,
    [],
  )
  // Applying it again finds nothing selected → same reference back.
  assert.equal(applyRecipeOptionWrites(NOTE, unchecked, [
    { questionId: xQ.id, selectId: null, deselectId: rxOn.id },
  ]), unchecked)
})

test('collector resolves bare select/deselect sources too', () => {
  const gaps = collectCrossDomainRecipeOptionWrites(
    resolveNoteSafeguardOverridesTags(NOTE, { [sgQ.id]: [utilGaps.id] }).questions,
    buildRecipeOptionTokenMap(recipeQuestions),
  )
  assert.deepEqual(gaps, [{ questionId: fwQ.id, selectId: fwYes16.id, deselectId: null }])
  const upg = collectCrossDomainRecipeOptionWrites(
    resolveNoteSafeguardOverridesTags(NOTE, { [sgQ.id]: [utilUpg.id] }).questions,
    buildRecipeOptionTokenMap(recipeQuestions),
  )
  assert.deepEqual(upg, [{ questionId: xQ.id, selectId: null, deselectId: rxOn.id }])
})
