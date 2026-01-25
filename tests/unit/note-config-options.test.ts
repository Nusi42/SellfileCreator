/* eslint-disable import/no-unused-modules */ // node:test runner picks this up via scripts/run-tests, so the module isn't imported elsewhere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveConfigOptionsTags,
  NOTE_CONFIG_OPTIONS_LAYOUT_WHOLELINE,
  NOTE_CONFIG_OPTIONS_LAYOUT_COLUMNS_DEFAULT,
} from '../../src/lib/noteConfigOptions.js'

test('global explicit ids exclude options across questions', () => {
  // Build a note with two config-options markers.
  const note = [
    '<!-- config-options',
    'q "Question One"',
    'check "Option A" id=a { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "Question Two"',
    'check "Option B" !a { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveConfigOptionsTags(note)
  const [first, second] = seed.questions
  // Ensure the marker ordering is intact before asserting.
  assert.ok(first, 'expected a first config options question')
  assert.ok(second, 'expected a second config options question')
  // Select both options so exclusions have to resolve.
  const answers = {
    [first.id]: [first.options[0]!.id],
    [second.id]: [second.options[0]!.id],
  }
  // Re-resolve answers so global exclusions apply.
  const resolved = resolveConfigOptionsTags(note, answers).questions
  const resolvedFirst = resolved.find((entry) => entry.id === first.id)
  const resolvedSecond = resolved.find((entry) => entry.id === second.id)
  // Verify both questions resolved as expected.
  assert.ok(resolvedFirst, 'expected the first question to be resolved')
  assert.ok(resolvedSecond, 'expected the second question to be resolved')
  // The explicit id exclusion should remove Option A.
  assert.equal(resolvedFirst?.answer.includes(first.options[0]!.id), false)
  // The Option B selection should remain active.
  assert.equal(resolvedSecond?.answer.includes(second.options[0]!.id), true)
})

test('implicit numeric tokens remain question-scoped', () => {
  // Build a note with a numeric exclusion in the second question.
  const note = [
    '<!-- config-options',
    'q "First Question"',
    'check "First Option" { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "Second Question"',
    'check "Second Option 1" { @all { export=active } }',
    'check "Second Option 2" !1 { @all { export=active } }',
    '-->',
  ].join('\n')
  // Resolve the parsed questions to inspect exclusions.
  const { questions } = resolveConfigOptionsTags(note)
  const first = questions[0]
  const second = questions[1]
  // Guard against missing parsed content.
  assert.ok(first, 'expected the first question to be parsed')
  assert.ok(second, 'expected the second question to be parsed')
  // Pull the excluded ids for the second option in question two.
  const excluded = second.options[1]!.excludedOptionIds
  // The numeric token should map to the first option in question two.
  assert.ok(excluded.includes(second.options[0]!.id))
  // The numeric token should not point at the first question.
  assert.equal(excluded.includes(first.options[0]!.id), false)
})

test('only constraints keep the preferred option and prune explicit ids within referenced questions', () => {
  // Build a note with a defaults question that references explicit tokens elsewhere.
  const note = [
    '<!-- config-options',
    'q "Defaults"',
    'radio "Lategame" id=lategame +q1 +q3 { @all { export=active } }',
    'radio "Endgame" id=endgame { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "AAA"',
    'radio "Option 1" id=q1 * { @all { export=active } }',
    'radio "Option 2" id=q2 { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "BBB"',
    'radio "Option 3" id=q3 * { @all { export=active } }',
    'radio "Option 4" id=q4 { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "CCC"',
    'check "Option 5" id=q5 * { @all { export=active } }',
    'check "Option 6" id=q6 { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveConfigOptionsTags(note)
  const [defaults, first, second, third] = seed.questions
  // Guard against missing parsed content.
  assert.ok(defaults, 'expected a defaults question')
  assert.ok(first, 'expected a first dependent question')
  assert.ok(second, 'expected a second dependent question')
  assert.ok(third, 'expected a third independent question')
  const lategameId = defaults.options[0]!.id
  const endgameId = defaults.options[1]!.id
  const q1Id = first.options[0]!.id
  const q2Id = first.options[1]!.id
  const q3Id = second.options[0]!.id
  const q4Id = second.options[1]!.id
  const q5Id = third.options[0]!.id
  // Select the non-allowlisted answers to see if they get cleared.
  const answers = {
    [defaults.id]: [lategameId],
    [first.id]: [q2Id],
    [second.id]: [q4Id],
    [third.id]: [q5Id],
  }
  // Re-resolve answers so the "only" constraint can prune selections.
  const resolved = resolveConfigOptionsTags(note, answers, lategameId).questions
  const resolvedDefaults = resolved.find((entry) => entry.id === defaults.id)
  const resolvedFirst = resolved.find((entry) => entry.id === first.id)
  const resolvedSecond = resolved.find((entry) => entry.id === second.id)
  const resolvedThird = resolved.find((entry) => entry.id === third.id)
  // Ensure the preferred default remains selected.
  assert.ok(resolvedDefaults?.answer.includes(lategameId))
  // Confirm the sibling default stays excluded.
  assert.equal(resolvedDefaults?.answer.includes(endgameId), false)
  // The allow-listed defaults should remain.
  assert.ok(resolvedFirst?.answer.includes(q1Id))
  assert.ok(resolvedSecond?.answer.includes(q3Id))
  // The non-allow-listed answers should be removed.
  assert.equal(resolvedFirst?.answer.includes(q2Id), false)
  assert.equal(resolvedSecond?.answer.includes(q4Id), false)
  // Unrelated questions should remain untouched.
  assert.ok(resolvedThird?.answer.includes(q5Id))
})

test('only numeric constraints stay scoped to the current question', () => {
  // Build a note with a numeric-only constraint in the first question.
  const note = [
    '<!-- config-options',
    'q "Local Only"',
    'check "Local A" +1 { @all { export=active } }',
    'check "Local B" { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "Global Explicit"',
    'check "Global A" id=globalA { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveConfigOptionsTags(note)
  const [local, global] = seed.questions
  // Guard against missing parsed content.
  assert.ok(local, 'expected a local-only question')
  assert.ok(global, 'expected a global question')
  const localAId = local.options[0]!.id
  const localBId = local.options[1]!.id
  const globalAId = global.options[0]!.id
  // Select both local options plus the global explicit option.
  const answers = {
    [local.id]: [localAId, localBId],
    [global.id]: [globalAId],
  }
  // Re-resolve answers so the numeric-only constraint can prune selections.
  const resolved = resolveConfigOptionsTags(note, answers, localAId).questions
  const resolvedLocal = resolved.find((entry) => entry.id === local.id)
  const resolvedGlobal = resolved.find((entry) => entry.id === global.id)
  // The "only 1" constraint should remove the second local option.
  assert.ok(resolvedLocal?.answer.includes(localAId))
  assert.equal(resolvedLocal?.answer.includes(localBId), false)
  // The explicit option in the other question should remain unaffected.
  assert.ok(resolvedGlobal?.answer.includes(globalAId))
})

test('only constraints resolve when id appears after the default marker', () => {
  // Build a note where ids are declared after the default marker.
  const note = [
    '<!-- config-options',
    'q "Defaults"',
    'cb "Lategame" * id=lategame +marius_open +fwh_no { @all { export=active } }',
    'cb "Endgame" id=endgame +marius_finished +fwh_yes16 { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "Marius?"',
    'rb "No" * id=marius_open { @all { export=active } }',
    'rb "Yes" id=marius_finished { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "Faction Wars?"',
    'rb "No" * id=fwh_no { @all { export=active } }',
    'rb "Yes" id=fwh_yes16 { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveConfigOptionsTags(note)
  const [defaults, marius, fwh] = seed.questions
  // Guard against missing parsed content.
  assert.ok(defaults, 'expected defaults question')
  assert.ok(marius, 'expected Marius question')
  assert.ok(fwh, 'expected Faction Wars question')
  // Capture the scoped ids for both defaults and dependent questions.
  const lategameId = defaults.options[0]!.id
  const endgameId = defaults.options[1]!.id
  const mariusOpenId = marius.options[0]!.id
  const mariusFinishedId = marius.options[1]!.id
  const fwhNoId = fwh.options[0]!.id
  const fwhYesId = fwh.options[1]!.id
  // Start from Lategame in the defaults question with endgame-style answers elsewhere.
  const answers = {
    [defaults.id]: [lategameId],
    [marius.id]: [mariusFinishedId],
    [fwh.id]: [fwhYesId],
  }
  // Re-resolve with the Lategame preference so allow-lists can apply.
  const resolved = resolveConfigOptionsTags(note, answers, lategameId).questions
  const resolvedDefaults = resolved.find((entry) => entry.id === defaults.id)
  const resolvedMarius = resolved.find((entry) => entry.id === marius.id)
  const resolvedFwh = resolved.find((entry) => entry.id === fwh.id)
  // Ensure the preferred default stays selected.
  assert.ok(resolvedDefaults?.answer.includes(lategameId))
  assert.equal(resolvedDefaults?.answer.includes(endgameId), false)
  // Confirm the allow-listed Marius choice is selected.
  assert.ok(resolvedMarius?.answer.includes(mariusOpenId))
  assert.equal(resolvedMarius?.answer.includes(mariusFinishedId), false)
  // Confirm the allow-listed Faction Wars choice is selected.
  assert.ok(resolvedFwh?.answer.includes(fwhNoId))
  assert.equal(resolvedFwh?.answer.includes(fwhYesId), false)
})

test('single-select groups pick a compatible fallback when excluded', () => {
  // Build a note where a second question excludes a radio option.
  const note = [
    '<!-- config-options',
    'q "First Question"',
    'radio "Choice A" id=a { @all { export=active } }',
    'radio "Choice B" id=b { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "Second Question"',
    'check "Block A" !a { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveConfigOptionsTags(note)
  const [first, second] = seed.questions
  // Ensure the marker ordering is intact before asserting.
  assert.ok(first, 'expected a first config options question')
  assert.ok(second, 'expected a second config options question')
  // Select the excluded radio option plus the blocker.
  const answers = {
    [first.id]: [first.options[0]!.id],
    [second.id]: [second.options[0]!.id],
  }
  // Re-resolve answers so exclusions and fallbacks apply.
  const resolved = resolveConfigOptionsTags(note, answers).questions
  const resolvedFirst = resolved.find((entry) => entry.id === first.id)
  const resolvedSecond = resolved.find((entry) => entry.id === second.id)
  // Verify both questions resolved as expected.
  assert.ok(resolvedFirst, 'expected the first question to be resolved')
  assert.ok(resolvedSecond, 'expected the second question to be resolved')
  // The excluded option should be removed.
  assert.equal(resolvedFirst?.answer.includes(first.options[0]!.id), false)
  // The alternate radio option should be selected instead.
  assert.equal(resolvedFirst?.answer.includes(first.options[1]!.id), true)
  // The blocker selection should remain active.
  assert.equal(resolvedSecond?.answer.includes(second.options[0]!.id), true)
})

test('preferred selections displace excluded answers across questions', () => {
  // Build a note with cross-question radio exclusions.
  const note = [
    '<!-- config-options',
    'q "Early Question"',
    'radio "`No`" id=midgame !lategame1 { @all { export=active } }',
    'radio "`Yes`" * { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "Late Question"',
    'radio "`Yes`" id=lategame1 !midgame { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveConfigOptionsTags(note)
  const [first, second] = seed.questions
  // Ensure the marker ordering is intact before asserting.
  assert.ok(first, 'expected a first config options question')
  assert.ok(second, 'expected a second config options question')
  const midgameId = first.options[0]!.id
  const earlyDefaultId = first.options[1]!.id
  const lategameId = second.options[0]!.id
  // Select mutually exclusive answers, preferring the late option.
  const answers = {
    [first.id]: [midgameId],
    [second.id]: [lategameId],
  }
  // Re-resolve answers so the preferred option wins.
  const resolved = resolveConfigOptionsTags(note, answers, lategameId).questions
  const resolvedFirst = resolved.find((entry) => entry.id === first.id)
  const resolvedSecond = resolved.find((entry) => entry.id === second.id)
  // Verify the late option remains selected.
  assert.ok(resolvedSecond?.answer.includes(lategameId))
  // Verify the early choice is displaced and the default is selected.
  assert.equal(resolvedFirst?.answer.includes(midgameId), false)
  assert.ok(resolvedFirst?.answer.includes(earlyDefaultId))
})

test('preferred selections survive when labels repeat across questions', () => {
  // Build a note where identical labels would collide without scoped ids.
  const note = [
    '<!-- config-options',
    'q "Early Question"',
    'radio "`No`" id=midgame !lategame1 { @all { export=active } }',
    'radio "`Yes`" * { @all { export=active } }',
    '-->',
    '<!-- config-options',
    'q "Late Question"',
    'radio "`No`" * { @all { export=active } }',
    'radio "`Yes`" id=lategame1 !midgame { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveConfigOptionsTags(note)
  const [first, second] = seed.questions
  // Ensure the marker ordering is intact before asserting.
  assert.ok(first, 'expected a first config options question')
  assert.ok(second, 'expected a second config options question')
  const midgameId = first.options[0]!.id
  const earlyDefaultId = first.options[1]!.id
  const lateDefaultId = second.options[0]!.id
  const lategameId = second.options[1]!.id
  // Select mutually exclusive answers, preferring the late option.
  const answers = {
    [first.id]: [midgameId],
    [second.id]: [lategameId],
  }
  // Re-resolve answers so the preferred option wins.
  const resolved = resolveConfigOptionsTags(note, answers, lategameId).questions
  const resolvedFirst = resolved.find((entry) => entry.id === first.id)
  const resolvedSecond = resolved.find((entry) => entry.id === second.id)
  // Verify the early conflicting choice is displaced.
  assert.equal(resolvedFirst?.answer.includes(midgameId), false)
  assert.ok(resolvedFirst?.answer.includes(earlyDefaultId))
  // Verify the late preferred choice stays selected.
  assert.ok(resolvedSecond?.answer.includes(lategameId))
  // Ensure the late default is no longer selected.
  assert.equal(resolvedSecond?.answer.includes(lateDefaultId), false)
})

test('marker options can request wholeline layout and column overrides', () => {
  // Build a note with marker options before the question header.
  const note = [
    '<!-- config-options [wholeline columns=3]',
    'q "Wide Question"',
    'radio "Yes" * { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse the note so we can inspect the layout metadata.
  const { questions } = resolveConfigOptionsTags(note)
  const question = questions[0]
  // Guard against missing parsed content.
  assert.ok(question, 'expected the question to be parsed')
  // Confirm the marker layout option was captured.
  assert.equal(question?.layout, NOTE_CONFIG_OPTIONS_LAYOUT_WHOLELINE)
  // Confirm the column override was captured.
  assert.equal(question?.layoutColumns, 3)
})

test('marker options default columns to auto-fit', () => {
  // Build a note without column overrides.
  const note = [
    '<!-- config-options [wholeline]',
    'q "Wide Question"',
    'radio "Yes" * { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse the note so we can inspect defaults.
  const { questions } = resolveConfigOptionsTags(note)
  const question = questions[0]
  // Guard against missing parsed content.
  assert.ok(question, 'expected the question to be parsed')
  // Confirm the default column count remains auto-fit.
  assert.equal(question?.layoutColumns, NOTE_CONFIG_OPTIONS_LAYOUT_COLUMNS_DEFAULT)
})

export {}
