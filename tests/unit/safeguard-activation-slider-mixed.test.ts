import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveNoteSafeguardOverridesTags,
  collectSafeguardOverridesDiagnostics,
  buildSafeguardAnswerParts,
  safeguardAnswerMatchesDefault,
} from '../../src/lib/noteSafeguardOverrides.js'
import { SafeguardRuleActivation } from '../../src/lib/safeguards.js'
import { loadLategameNote } from '../setup/presetFixtures.js'

// ── Why this test exists ──────────────────────────────────────────────────────
// Each safeguard-overrides card in lategame.sfc now combines an ACTIVATION RADIO group
// (Off / Protect owned / Reserve gaps / Reserve + upgrade) with a COUNT slider. The stored
// answer for such a question is a MIX of one option id and one slider value string. The
// NoteDialog answer handler previously assumed a question was slider-XOR-options and
// collapsed mixed answers to the slider value only — so radio clicks did nothing and the
// slider mis-read a leading option id as its value. These tests pin the contract the fixed
// handler depends on: the resolver honours both parts, and the two SSOT split/compare
// helpers classify tokens correctly.

const note: string = loadLategameNote()

// The first safeguard card is the SPD-banner mode+count question.
const resolveQ = (answers?: Record<string, string[]>) =>
  resolveNoteSafeguardOverridesTags(note, answers).questions
const spdQuestion = resolveQ().find((q) =>
  q.groups.some((g) => g.type === 'single') && q.groups.some((g) => g.type === 'slider'))!

test('safeguard-overrides markers parse with no diagnostics', () => {
  let count = 0
  const re = /<!--\s*safeguard-overrides[\s\S]*?-->/g
  let m: RegExpExecArray | null
  while ((m = re.exec(note))) {
    const ds: { from: number; to: number; message: string }[] = []
    collectSafeguardOverridesDiagnostics(m[0], m.index, ds)
    count += ds.length
  }
  assert.equal(count, 0, 'safeguard-overrides markers must have no syntax diagnostics')
})

test('each mode card is a mixed radio+slider question with a Reserve-gaps default', () => {
  // Every card with an activation radio must also carry the count slider (the mixed shape).
  const mixed = resolveQ().filter((q) => q.groups.some((g) => g.type === 'single'))
  assert.ok(mixed.length >= 5, 'all five mode cards should carry an activation radio')
  for (const q of mixed) {
    assert.ok(q.groups.some((g) => g.type === 'slider'), `${q.id} must also have a count slider`)
    const radio = q.groups.find((g) => g.type === 'single')!
    assert.equal(radio.options.length, 4, 'four activation modes')
    const def = radio.options.find((o) => o.isDefault)
    assert.ok(def, 'a default mode is marked')
    // The default option writes activation=anticipate_gaps.
    const writesGap = def!.blocks.some((b) =>
      b.operations.some((op) => op.kind === 'activation' && op.value === SafeguardRuleActivation.AnticipateGaps))
    assert.ok(writesGap, 'the default radio option sets activation=anticipate_gaps')
  }
})

test('buildSafeguardAnswerParts splits option ids from the slider value', () => {
  // A mixed answer: one radio id + one numeric slider value, in either order.
  const radioId = spdQuestion.groups.find((g) => g.type === 'single')!.options[1]!.id // "Protect owned"
  const parts = buildSafeguardAnswerParts([radioId, '24'])
  assert.deepEqual(parts.optionIds, [radioId])
  assert.equal(parts.sliderValue, '24')
  // Order-independent: the numeric may come first.
  const parts2 = buildSafeguardAnswerParts(['24', radioId])
  assert.deepEqual(parts2.optionIds, [radioId])
  assert.equal(parts2.sliderValue, '24')
  // The toggle-off sentinel is treated as the slider value, not an option id.
  const parts3 = buildSafeguardAnswerParts([radioId, 'off'])
  assert.deepEqual(parts3.optionIds, [radioId])
  assert.equal(parts3.sliderValue, 'off')
  // Hashed radio ids (e.g. "protect owned#1") never parse as a finite number → never a slider value.
  assert.equal(Number.isFinite(Number.parseFloat(radioId)), false)
})

test('a clicked activation radio resolves to the chosen mode alongside the slider', () => {
  const radio = spdQuestion.groups.find((g) => g.type === 'single')!
  const slider = spdQuestion.groups.find((g) => g.type === 'slider')!
  // Pick a NON-default mode ("Reserve + upgrade" = anticipate_improvements).
  const chosen = radio.options.find((o) =>
    o.blocks.some((b) => b.operations.some((op) => op.kind === 'activation'
      && op.value === SafeguardRuleActivation.AnticipateImprovements)))!
  const sliderDefault = String(slider.options[0]!.sliderDefault ?? slider.options[0]!.sliderMin ?? 1)
  // Simulate the stored answer a radio click produces: chosen mode + the current slider value.
  const answered = resolveQ({ [spdQuestion.id]: [chosen.id, sliderDefault] })
    .find((q) => q.id === spdQuestion.id)!
  const { optionIds, sliderValue } = buildSafeguardAnswerParts(answered.answer)
  assert.deepEqual(optionIds, [chosen.id], 'the chosen radio survives resolution')
  assert.equal(sliderValue, sliderDefault, 'the slider value is preserved next to the radio')
})

test('a changed slider value is preserved when a non-default mode is selected', () => {
  const radio = spdQuestion.groups.find((g) => g.type === 'single')!
  const off = radio.options.find((o) =>
    o.blocks.some((b) => b.operations.some((op) => op.kind === 'activation'
      && op.value === SafeguardRuleActivation.Off)))!
  const answered = resolveQ({ [spdQuestion.id]: [off.id, '40'] })
    .find((q) => q.id === spdQuestion.id)!
  const parts = buildSafeguardAnswerParts(answered.answer)
  assert.deepEqual(parts.optionIds, [off.id])
  assert.equal(parts.sliderValue, '40', 'a dragged slider value round-trips with the radio')
})

test('safeguardAnswerMatchesDefault requires BOTH parts to match the default', () => {
  const radio = spdQuestion.groups.find((g) => g.type === 'single')!
  const slider = spdQuestion.groups.find((g) => g.type === 'slider')!
  const sliderDefault = String(slider.options[0]!.sliderDefault ?? slider.options[0]!.sliderMin ?? 1)
  const defaultMode = radio.options.find((o) => o.isDefault)!
  const otherMode = radio.options.find((o) => !o.isDefault)!
  // Default mode + default slider = matches default (answer would be omitted from storage).
  assert.equal(safeguardAnswerMatchesDefault(spdQuestion, [defaultMode.id, sliderDefault]), true)
  // Same default mode but a moved slider = NOT default (must persist).
  assert.equal(safeguardAnswerMatchesDefault(spdQuestion, [defaultMode.id, '40']), false)
  // A non-default mode at the default slider = NOT default (must persist).
  assert.equal(safeguardAnswerMatchesDefault(spdQuestion, [otherMode.id, sliderDefault]), false)
})
