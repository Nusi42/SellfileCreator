import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveRecipeOverridesTags } from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags, SLIDER_TOGGLE_OFF } from '../../src/lib/noteSafeguardOverrides.js'
import {
  buildDynamicOverridesPresetSummary,
  resolveDynamicOverridesPresetApply,
  snapshotDynamicOverridesFullSelection,
} from '../../src/lib/dynamicOverridesPresetSummary.js'

// Load the real shipped preset note so we validate the actual authored markup.
const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))
const note: string = (sfc.Note as string[]).join('\n')

const seed = resolveRecipeOverridesTags(note)
const acctQ = seed.questions.find((q) => q.options.some((o) => o.token === 'lategame'))!
const lategameOpt = acctQ.options.find((o) => o.token === 'lategame')!
const midgameOpt = acctQ.options.find((o) => o.token === 'midgame')!

test('summary preserves option-label markdown verbatim (backticks render, not leak)', () => {
  const { lines } = buildDynamicOverridesPresetSummary(note, { [acctQ.id]: [midgameOpt.id] }, {})
  const line = lines.find((l) => l.answers.some((a) => a.label.includes('Midgame')))
  assert.ok(line, 'the tier question should produce a summary line')
  // The label is authored as "`Midgame`" — backticks must be preserved for the renderer.
  assert.ok(line!.answers.some((a) => a.label === '`Midgame`'), `expected verbatim backtick label, got ${JSON.stringify(line!.answers)}`)
})

test('summary title is the first prompt line only (subtext dropped)', () => {
  const multiline = seed.questions.find((q) => q.prompt.includes('\n') && q.options.length > 0)!
  const { lines } = buildDynamicOverridesPresetSummary(note, {}, {})
  const line = lines.find((l) => l.title === multiline.prompt.split('\n')[0]!.trimEnd())
  assert.ok(line, 'a question with a multi-line prompt should appear with its title only')
  assert.ok(!line!.title.includes('\n'), 'title must be single-line')
})

test('default-derived answers are included and flagged isDefault', () => {
  // With an empty stored map, the tier question still resolves to its default ("Lategame", the *-marked option).
  const { lines } = buildDynamicOverridesPresetSummary(note, {}, {})
  const line = lines.find((l) => l.answers.some((a) => a.label === '`Lategame`'))
  assert.ok(line, 'the default tier answer should appear even with an empty stored map')
  const lategameAnswer = line!.answers.find((a) => a.label === '`Lategame`')!
  assert.equal(lategameAnswer.isDefault, true, 'an answer equal to the default must be flagged isDefault')
})

test('a user-chosen non-default answer is NOT flagged isDefault', () => {
  // Midgame is not the default tier, so picking it is an active choice.
  const { lines } = buildDynamicOverridesPresetSummary(note, { [acctQ.id]: [midgameOpt.id] }, {})
  const midgameAnswer = lines.flatMap((l) => l.answers).find((a) => a.label === '`Midgame`')!
  assert.equal(midgameAnswer.isDefault, false, 'a non-default choice must not be flagged isDefault')
})

test('slider safeguard questions surface their numeric value', () => {
  const sg = resolveNoteSafeguardOverridesTags(note)
  const sliderQ = sg.questions.find((q) => q.groups.some((g) => g.type === 'slider'))
  assert.ok(sliderQ, 'preset should contain at least one slider safeguard question')
  const { lines } = buildDynamicOverridesPresetSummary(note, {}, { [sliderQ!.id]: ['7'] })
  const line = lines.find((l) => l.answers.some((a) => a.label === '7'))
  assert.ok(line, `slider value should appear as an answer, got ${JSON.stringify(lines)}`)
})

test('mixed radio+slider safeguard: radio answer resolves to its LABEL, not the raw option id (regression)', () => {
  // The safeguard count cards carry BOTH a `single` activation radio group AND a `slider`
  // count group. The summary used to treat any question containing a slider as slider-only,
  // dumping the radio's raw option id (e.g. "q_xxx:plus missing slots#2") verbatim instead of
  // resolving it to "Plus missing slots". Assert both group answers surface correctly.
  const sg = resolveNoteSafeguardOverridesTags(note)
  const mixedQ = sg.questions.find(
    (q) => q.groups.some((g) => g.type === 'single') && q.groups.some((g) => g.type === 'slider'),
  )
  assert.ok(mixedQ, 'preset should contain a mixed radio+slider safeguard question')
  // Pick a concrete radio option to store alongside a slider value.
  const radioGroup = mixedQ!.groups.find((g) => g.type === 'single')!
  const radioOpt = radioGroup.options[0]!
  const { lines } = buildDynamicOverridesPresetSummary(note, {}, { [mixedQ!.id]: [radioOpt.id, '21'] })
  const line = lines.find((l) => l.answers.some((a) => a.label === radioOpt.label))
  assert.ok(line, `radio answer should resolve to its label "${radioOpt.label}", got ${JSON.stringify(lines.flatMap((l) => l.answers))}`)
  // The raw option id must never leak into an answer label.
  const allLabels = lines.flatMap((l) => l.answers.map((a) => a.label))
  assert.ok(!allLabels.includes(radioOpt.id), `raw option id "${radioOpt.id}" must not appear as a label`)
  // The slider value from the same question still surfaces alongside the radio label.
  assert.ok(line!.answers.some((a) => a.label === '21'), `slider value should appear on the same line, got ${JSON.stringify(line!.answers)}`)
})

test('saving snapshots the FULL resolved selection (defaults included)', () => {
  // Save from an empty live map — the snapshot must still record the resolved defaults.
  const full = snapshotDynamicOverridesFullSelection(note, {}, {})
  assert.ok(acctQ.id in full.recipeAnswers, 'every question is recorded in the full snapshot')
  assert.deepEqual(full.recipeAnswers[acctQ.id], [lategameOpt.id], 'the default tier is captured explicitly')
})

test('apply intersects to valid selections and drops unknown ids', () => {
  const applied = resolveDynamicOverridesPresetApply(
    note,
    { [acctQ.id]: [lategameOpt.id, 'bogus-id'], 'gone-question': ['y'] },
    {},
  )
  assert.deepEqual(applied.recipeAnswers[acctQ.id], [lategameOpt.id], 'keeps valid, drops bogus option id')
  assert.ok(!('gone-question' in applied.recipeAnswers), 'drops question ids absent from the note')
})

test('saving a set round-trips slider value + toggle-off (regression: not filtered as a non-option-id)', () => {
  // The improvchance blocks are slider+toggle; a slider answer is a raw numeric value (or the
  // toggle-off sentinel), NOT an option id — apply must keep it instead of resetting the slider.
  const sliderQ = resolveNoteSafeguardOverridesTags(note)
    .questions.find((q) => q.groups.some((g) => g.type === 'slider' && g.options[0]?.sliderToggle))
  assert.ok(sliderQ, 'preset should contain an improvchance slider+toggle question')

  const savedValue = snapshotDynamicOverridesFullSelection(note, {}, { [sliderQ!.id]: ['51'] })
  const loadedValue = resolveDynamicOverridesPresetApply(note, savedValue.recipeAnswers, savedValue.safeguardAnswers)
  assert.deepEqual(loadedValue.safeguardAnswers[sliderQ!.id], ['51'], 'a chosen slider value must survive save → load')

  const savedOff = snapshotDynamicOverridesFullSelection(note, {}, { [sliderQ!.id]: [SLIDER_TOGGLE_OFF] })
  const loadedOff = resolveDynamicOverridesPresetApply(note, savedOff.recipeAnswers, savedOff.safeguardAnswers)
  assert.deepEqual(loadedOff.safeguardAnswers[sliderQ!.id], [SLIDER_TOGGLE_OFF], 'toggle-off must survive save → load')
})

test('slider+toggle summary shows toggle wording + value when on, and omits the question when off', () => {
  const sg = resolveNoteSafeguardOverridesTags(note)
  const sliderQs = sg.questions.filter((q) => q.groups.some((g) => g.type === 'slider' && g.options[0]?.sliderToggle))
  assert.ok(sliderQs.length > 0, 'preset should contain improvchance slider+toggle questions')
  const toggleLabel = sliderQs[0]!.options[0]!.sliderToggle!.label
  // Toggle on: "<toggle> — <value>" (em dash).
  const { lines: onLines } = buildDynamicOverridesPresetSummary(note, {}, { [sliderQs[0]!.id]: ['25'] })
  assert.ok(
    onLines.some((l) => l.answers.some((a) => a.label === `${toggleLabel} — 25`)),
    `expected "${toggleLabel} — 25", got ${JSON.stringify(onLines.flatMap((l) => l.answers))}`,
  )
  // Toggle off behaves like an unchecked checkbox: the question contributes no line (no
  // "off" placeholder, no "<toggle> — …" answer). Set every toggle slider off to check.
  const allOff = Object.fromEntries(sliderQs.map((q) => [q.id, [SLIDER_TOGGLE_OFF]]))
  const offLabels = buildDynamicOverridesPresetSummary(note, {}, allOff).lines.flatMap((l) => l.answers).map((a) => a.label)
  assert.ok(
    !offLabels.includes('off') && !offLabels.some((l) => l.startsWith(`${toggleLabel} —`)),
    `a disabled (toggle-off) slider should be omitted, got ${JSON.stringify(offLabels)}`,
  )
})
