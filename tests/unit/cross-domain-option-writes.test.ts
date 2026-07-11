import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRecipeOverridesTags,
  collectCrossDomainOptionWrites,
  seedSafeguardAnswersFromRecipeDefaults,
} from '../../src/lib/noteRecipeOverrides.js'
import {
  resolveNoteSafeguardOverridesTags,
  buildSafeguardOptionTokenMap,
  buildSafeguardSliderTokenMap,
  applySafeguardOptionWrites,
} from '../../src/lib/noteSafeguardOverrides.js'

// Recipe question whose non-default option force-selects a safeguard option (set) and
// whose default option force-selects the safeguard default back (round-trip wiring),
// plus a safeguard card mixing an activation radio with a count slider — the exact
// shape of the utility-card ↔ "finished FW Hard" coupling this bridge was built for.
const NOTE = [
  '<!-- recipe-overrides',
  'q "Finished Faction Wars?" id=q_fw',
  'rb "No" * set util_gaps { @tag=utility { export=active } }',
  'rb "Yes" id=fw_yes set util_off { @tag=utility { export=disabled } }',
  '-->',
  '<!-- safeguard-overrides',
  'q "Protect utility pieces?" id=q_util',
  'rb "None" id=util_off { @tag=utility { activation=off } }',
  'rb "Gaps" id=util_gaps * { @tag=utility { activation=anticipate_gaps } }',
  'slider "" id=min_util min=1 max=8 default=1 { @tag=utility { count=$value } }',
  '-->',
].join('\n')

// Resolve both domains once; individual tests derive ids from these.
const sgQuestions = resolveNoteSafeguardOverridesTags(NOTE).questions
const sgQuestion = sgQuestions[0]!
const utilOff = sgQuestion.options.find((o) => o.token === 'util_off')!
const utilGaps = sgQuestion.options.find((o) => o.token === 'util_gaps')!

test('buildSafeguardOptionTokenMap maps explicit option tokens, skipping sliders', () => {
  const map = buildSafeguardOptionTokenMap(sgQuestions)
  assert.deepEqual(map.get('util_off'), { questionId: sgQuestion.id, optionId: utilOff.id })
  assert.deepEqual(map.get('util_gaps'), { questionId: sgQuestion.id, optionId: utilGaps.id })
  // The slider's id belongs to the slider map, never the option map.
  assert.equal(map.has('min_util'), false)
})

test('collectCrossDomainOptionWrites emits select writes; slider ids keep precedence', () => {
  const recipe = resolveRecipeOverridesTags(NOTE).questions[0]!
  const fwYes = recipe.options.find((o) => o.token === 'fw_yes')!
  // Select the "Yes" option so its `set util_off` directive becomes active.
  const answered = resolveRecipeOverridesTags(NOTE, { [recipe.id]: [fwYes.id] }).questions
  const optionByToken = buildSafeguardOptionTokenMap(sgQuestions)
  const sliderByToken = buildSafeguardSliderTokenMap(sgQuestions)
  const writes = collectCrossDomainOptionWrites(answered, optionByToken, sliderByToken)
  assert.deepEqual(writes, [{ questionId: sgQuestion.id, optionId: utilOff.id, action: 'select' }])
  // A note whose recipe option targets the SLIDER id must not produce an option write.
  const sliderNote = NOTE.replace('set util_off', 'set min_util')
  const sliderRecipe = resolveRecipeOverridesTags(sliderNote).questions[0]!
  const sliderYes = sliderRecipe.options.find((o) => o.token === 'fw_yes')!
  const sliderAnswered = resolveRecipeOverridesTags(sliderNote, { [sliderRecipe.id]: [sliderYes.id] }).questions
  const sgForSliderNote = resolveNoteSafeguardOverridesTags(sliderNote).questions
  assert.deepEqual(
    collectCrossDomainOptionWrites(
      sliderAnswered,
      buildSafeguardOptionTokenMap(sgForSliderNote),
      buildSafeguardSliderTokenMap(sgForSliderNote),
    ),
    [],
  )
})

test('applySafeguardOptionWrites selects with radio replacement and persists the answer', () => {
  const next = applySafeguardOptionWrites(sgQuestions, {}, [
    { questionId: sgQuestion.id, optionId: utilOff.id, action: 'select' },
  ])
  const stored = next[sgQuestion.id]
  assert.ok(stored, 'expected a stored answer for the safeguard question')
  // Radio semantics: the default option is replaced, not joined.
  assert.ok(stored.includes(utilOff.id))
  assert.equal(stored.includes(utilGaps.id), false)
})

test('applySafeguardOptionWrites drops answers that match the default and keeps slider values', () => {
  // Selecting the default option back removes the stored key (defaults stay implicit)…
  const cleared = applySafeguardOptionWrites(
    sgQuestions,
    { [sgQuestion.id]: [utilOff.id] },
    [{ questionId: sgQuestion.id, optionId: utilGaps.id, action: 'select' }],
  )
  assert.equal(cleared[sgQuestion.id], undefined)
  // …unless a non-default slider value rides in the same answer — that must survive.
  const withSlider = applySafeguardOptionWrites(
    sgQuestions,
    { [sgQuestion.id]: [utilOff.id, '5'] },
    [{ questionId: sgQuestion.id, optionId: utilGaps.id, action: 'select' }],
  )
  assert.deepEqual(withSlider[sgQuestion.id], [utilGaps.id, '5'])
})

test('applySafeguardOptionWrites honors the skip predicate (seed contract)', () => {
  const existing = { [sgQuestion.id]: [utilGaps.id] }
  const next = applySafeguardOptionWrites(
    sgQuestions,
    existing,
    [{ questionId: sgQuestion.id, optionId: utilOff.id, action: 'select' }],
    () => true,
  )
  // Untouched: the caller's stored answer wins, and the same reference comes back.
  assert.equal(next, existing)
})

test('seedSafeguardAnswersFromRecipeDefaults applies the default option’s cross-domain set', () => {
  // The default recipe option carries `set util_gaps` — the safeguard default — so a fresh
  // load seeds nothing (default answers stay implicit).
  assert.deepEqual(seedSafeguardAnswersFromRecipeDefaults(NOTE), {})
  // A stored recipe answer selecting "Yes" (set util_off) seeds the safeguard card to None.
  const recipe = resolveRecipeOverridesTags(NOTE).questions[0]!
  const fwYes = recipe.options.find((o) => o.token === 'fw_yes')!
  const seeded = seedSafeguardAnswersFromRecipeDefaults(NOTE, { [recipe.id]: [fwYes.id] })
  assert.ok(seeded[sgQuestion.id]?.includes(utilOff.id))
  // Never overwrite an answer the user (or a restore) already has.
  const preserved = seedSafeguardAnswersFromRecipeDefaults(
    NOTE,
    { [recipe.id]: [fwYes.id] },
    { [sgQuestion.id]: [utilGaps.id] },
  )
  assert.deepEqual(preserved[sgQuestion.id], [utilGaps.id])
})

test('unset/excl deselect a checkbox option cross-domain', () => {
  // Checkbox variant: the safeguard option is default-on; the recipe option unchecks it.
  const note = [
    '<!-- recipe-overrides',
    'q "Mode?" id=q_mode',
    'rb "A" * { @all { export=active } }',
    'rb "B" id=mode_b unset sg_extra { @all { export=active } }',
    '-->',
    '<!-- safeguard-overrides',
    'q "Extras?" id=q_extra',
    'cb "Extra protection" id=sg_extra * { @tag=utility { activation=anticipate_gaps } }',
    '-->',
  ].join('\n')
  const sg = resolveNoteSafeguardOverridesTags(note).questions[0]!
  const extra = sg.options.find((o) => o.token === 'sg_extra')!
  const recipe = resolveRecipeOverridesTags(note).questions[0]!
  const modeB = recipe.options.find((o) => o.token === 'mode_b')!
  const answered = resolveRecipeOverridesTags(note, { [recipe.id]: [modeB.id] }).questions
  const writes = collectCrossDomainOptionWrites(
    answered,
    buildSafeguardOptionTokenMap([sg]),
    buildSafeguardSliderTokenMap([sg]),
  )
  assert.deepEqual(writes, [{ questionId: sg.id, optionId: extra.id, action: 'deselect' }])
  const next = applySafeguardOptionWrites([sg], {}, writes)
  // The checkbox was default-on; the write persists an explicit empty selection.
  assert.deepEqual(next[sg.id], [])
})
