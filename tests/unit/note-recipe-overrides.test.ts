import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRecipeOverridesTags,
  resolveRecipeOverridesEffectiveRecipe,
  applyRecipeOverridesAnswerChange,
  applyQuestionSelectionRules,
  collectRecipeOverridesDiagnostics,
  applyAllRecipeOverrides,
  NOTE_RECIPE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT,
  type RecipeOverridesOperation,
  type RecipeOverridesSelector,
} from '../../src/lib/noteRecipeOverrides.js'
// Canonical (round-trip) emitters + the editor's single-term parsers — the read side of
// the same grammar, so a term can be pinned as emit→parse identity rather than by text.
import { serializeRecipeOperation, serializeRecipeSelector } from '../../src/lib/overridesSerializer.js'
import { parseOperationText, parseSelectorText } from '../../src/lib/overridesEditorModel.js'
import { createFactoryBuilderDefaults } from '../../src/lib/builderDefaults.js'
// Rework-gate wire tokens, so assertions compare against the SSOT rather than re-spelling.
import { REWORK_GATE_NOT_REWORKED, REWORK_GATE_REWORKED } from '../../src/lib/generated/domainConstants.js'
import type { SubstatTargetTable } from '../../src/lib/hsfBuilder/types.js'
import { variantFromLabel } from '../../src/lib/types.js'

test('global explicit ids exclude options across questions', () => {
  // Build a note with two recipe-overrides markers.
  const note = [
    '<!-- recipe-overrides',
    'q "Question One"',
    'check "Option A" id=a { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Question Two"',
    'check "Option B" !a { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveRecipeOverridesTags(note)
  const [first, second] = seed.questions
  // Ensure the marker ordering is intact before asserting.
  assert.ok(first, 'expected a first recipe overrides question')
  assert.ok(second, 'expected a second recipe overrides question')
  // Select both options so exclusions have to resolve.
  const answers = {
    [first.id]: [first.options[0]!.id],
    [second.id]: [second.options[0]!.id],
  }
  // Re-resolve answers so global exclusions apply.
  const resolved = resolveRecipeOverridesTags(note, answers).questions
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

test('legacy marker aliases stay supported silently', () => {
  // Build a note using the legacy marker keyword.
  const legacyNote = [
    '<!-- config-options',
    'q "Legacy Marker"',
    'radio "On" * { @all { export=active } }',
    'radio "Off" { @all { export=disabled } }',
    '-->',
  ].join('\n')
  // Resolve the note to ensure legacy markers still parse for compatibility.
  const { questions, instructions } = resolveRecipeOverridesTags(legacyNote)
  // Legacy marker should resolve one question with the expected prompt.
  assert.equal(questions.length, 1)
  assert.equal(questions[0]?.prompt, 'Legacy Marker')
  // Single-select defaults should activate exactly one selector block.
  assert.equal(instructions.length, 1)
})

test('implicit numeric tokens remain question-scoped', () => {
  // Build a note with a numeric exclusion in the second question.
  const note = [
    '<!-- recipe-overrides',
    'q "First Question"',
    'check "First Option" { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Second Question"',
    'check "Second Option 1" { @all { export=active } }',
    'check "Second Option 2" !1 { @all { export=active } }',
    '-->',
  ].join('\n')
  // Resolve the parsed questions to inspect exclusions.
  const { questions } = resolveRecipeOverridesTags(note)
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
    '<!-- recipe-overrides',
    'q "Defaults"',
    'radio "Lategame" id=lategame ^q1 ^q3 { @all { export=active } }',
    'radio "Endgame" id=endgame { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "AAA"',
    'radio "Option 1" id=q1 * { @all { export=active } }',
    'radio "Option 2" id=q2 { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "BBB"',
    'radio "Option 3" id=q3 * { @all { export=active } }',
    'radio "Option 4" id=q4 { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "CCC"',
    'check "Option 5" id=q5 * { @all { export=active } }',
    'check "Option 6" id=q6 { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveRecipeOverridesTags(note)
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
  const resolved = resolveRecipeOverridesTags(note, answers, lategameId).questions
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
    '<!-- recipe-overrides',
    'q "Local Only"',
    'check "Local A" ^1 { @all { export=active } }',
    'check "Local B" { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Global Explicit"',
    'check "Global A" id=globalA { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveRecipeOverridesTags(note)
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
  const resolved = resolveRecipeOverridesTags(note, answers, localAId).questions
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
    '<!-- recipe-overrides',
    'q "Defaults"',
    'cb "Lategame" * id=lategame ^marius_open ^fwh_no { @all { export=active } }',
    'cb "Endgame" id=endgame ^marius_finished ^fwh_yes16 { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Marius?"',
    'rb "No" * id=marius_open { @all { export=active } }',
    'rb "Yes" id=marius_finished { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Faction Wars?"',
    'rb "No" * id=fwh_no { @all { export=active } }',
    'rb "Yes" id=fwh_yes16 { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveRecipeOverridesTags(note)
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
  const resolved = resolveRecipeOverridesTags(note, answers, lategameId).questions
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

test('set constraints can switch single-select answers across questions', () => {
  // Build a note where one option presets two radio questions.
  const note = [
    '<!-- recipe-overrides',
    'q "Preset"',
    'check "Endgame preset" id=preset +marius_yes +fwh_yes { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Marius"',
    'radio "No" * id=marius_no { @all { export=active } }',
    'radio "Yes" id=marius_yes { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Faction Wars"',
    'radio "No" * id=fwh_no { @all { export=active } }',
    'radio "Yes" id=fwh_yes { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse scoped ids.
  const seed = resolveRecipeOverridesTags(note)
  const [preset, marius, fwh] = seed.questions
  assert.ok(preset, 'expected preset question')
  assert.ok(marius, 'expected Marius question')
  assert.ok(fwh, 'expected Faction Wars question')
  const presetId = preset.options[0]!.id
  const mariusNoId = marius.options[0]!.id
  const mariusYesId = marius.options[1]!.id
  const fwhNoId = fwh.options[0]!.id
  const fwhYesId = fwh.options[1]!.id
  // Select only the preset and let directives propagate.
  const answers = { [preset.id]: [presetId] }
  const resolved = resolveRecipeOverridesTags(note, answers, presetId).questions
  const resolvedMarius = resolved.find((entry) => entry.id === marius.id)
  const resolvedFwh = resolved.find((entry) => entry.id === fwh.id)
  // The preset should switch both radio questions to "Yes".
  assert.equal(resolvedMarius?.answer.includes(mariusNoId), false)
  assert.ok(resolvedMarius?.answer.includes(mariusYesId))
  assert.equal(resolvedFwh?.answer.includes(fwhNoId), false)
  assert.ok(resolvedFwh?.answer.includes(fwhYesId))
})

test('preferred single-select overrides clear conflicting set presets', () => {
  // Build a note with a checkbox preset that sets a radio answer.
  const note = [
    '<!-- recipe-overrides',
    'q "Account Level"',
    'check "Lategame" id=lategame +fwh_no { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Faction Wars"',
    'radio "No" * id=fwh_no { @all { export=active } }',
    'radio "Yes" id=fwh_yes16 { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse stable scoped IDs.
  const seed = resolveRecipeOverridesTags(note)
  const [presetQuestion, fwhQuestion] = seed.questions
  assert.ok(presetQuestion, 'expected preset question')
  assert.ok(fwhQuestion, 'expected Faction Wars question')
  const lategameId = presetQuestion.options[0]!.id
  const fwhNoId = fwhQuestion.options[0]!.id
  const fwhYesId = fwhQuestion.options[1]!.id
  // Start with the preset selected, then prefer the conflicting radio answer.
  const answers = {
    [presetQuestion.id]: [lategameId],
    [fwhQuestion.id]: [fwhYesId],
  }
  const preferredResolution = resolveRecipeOverridesTags(note, answers, fwhYesId).questions
  const preferredPreset = preferredResolution.find((entry) => entry.id === presetQuestion.id)
  const preferredFwh = preferredResolution.find((entry) => entry.id === fwhQuestion.id)
  // The preferred radio answer should stay, and the preset should clear itself.
  assert.equal(preferredPreset?.answer.includes(lategameId), false)
  assert.equal(preferredFwh?.answer.includes(fwhNoId), false)
  assert.ok(preferredFwh?.answer.includes(fwhYesId))
  // Persist only non-default answers, matching the dialog normalization step.
  const normalizedAnswers: Record<string, string[]> = {}
  preferredResolution.forEach((question) => {
    const defaultSet = new Set(question.defaultAnswer)
    const answerSet = new Set(question.answer)
    const matchesDefault = defaultSet.size === answerSet.size
      && Array.from(defaultSet).every((id) => answerSet.has(id))
    if (matchesDefault) return
    normalizedAnswers[question.id] = question.answer.slice()
  })
  // Re-resolving without a preferred ID should keep the user override stable.
  const stableResolution = resolveRecipeOverridesTags(note, normalizedAnswers).questions
  const stablePreset = stableResolution.find((entry) => entry.id === presetQuestion.id)
  const stableFwh = stableResolution.find((entry) => entry.id === fwhQuestion.id)
  assert.equal(stablePreset?.answer.includes(lategameId), false)
  assert.equal(stableFwh?.answer.includes(fwhNoId), false)
  assert.ok(stableFwh?.answer.includes(fwhYesId))
})

test('explicit checkbox uncheck releases presets that force it on', () => {
  // A multi-select "account level" preset force-sets a checkbox in another question.
  // Unchecking that checkbox must release the preset instead of snapping back on.
  const note = [
    '<!-- recipe-overrides',
    'q "Account Level"',
    'cb "Lategame" * id=lategame +keep_nbr { @all { export=active } }',
    'cb "Endgame" id=endgame +keep_nbr { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Chaos Ore"',
    'cb "Ignore gauntlets" id=keep_nbr { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once to capture stable scoped IDs.
  const seed = resolveRecipeOverridesTags(note)
  const [account, chaos] = seed.questions
  assert.ok(account, 'expected account-level question')
  assert.ok(chaos, 'expected Chaos Ore question')
  const lategameId = account.options[0]!.id
  const endgameId = account.options[1]!.id
  const keepNbrId = chaos.options[0]!.id
  // Selecting Endgame should force the checkbox on (the desired default).
  const forced = resolveRecipeOverridesTags(note, { [account.id]: [endgameId] }).questions
  const forcedChaos = forced.find((entry) => entry.id === chaos.id)
  assert.ok(forcedChaos?.answer.includes(keepNbrId), 'Endgame should force the checkbox on')
  // Now the user unchecks the checkbox: the dialog stores an explicit empty chaos
  // answer and re-resolves with the removed id (4th arg).
  const afterUncheck = resolveRecipeOverridesTags(
    note,
    { [account.id]: [endgameId], [chaos.id]: [] },
    undefined,
    keepNbrId,
  ).questions
  const uncheckedAccount = afterUncheck.find((entry) => entry.id === account.id)
  const uncheckedChaos = afterUncheck.find((entry) => entry.id === chaos.id)
  // The checkbox stays off and the forcing preset is released (no account level).
  assert.equal(uncheckedChaos?.answer.includes(keepNbrId), false)
  assert.equal(uncheckedAccount?.answer.includes(endgameId), false)
  // The default profile must NOT auto-fill — none-selected is a valid state.
  assert.equal(uncheckedAccount?.answer.includes(lategameId), false)
  assert.equal(uncheckedAccount?.answer.length, 0)
  // Persist only non-default answers, matching the dialog normalization step.
  const normalizedAnswers: Record<string, string[]> = {}
  afterUncheck.forEach((question) => {
    const defaultSet = new Set(question.defaultAnswer)
    const answerSet = new Set(question.answer)
    const matchesDefault = defaultSet.size === answerSet.size
      && Array.from(defaultSet).every((id) => answerSet.has(id))
    if (matchesDefault) return
    normalizedAnswers[question.id] = question.answer.slice()
  })
  // Re-resolving without the removed id must keep the unchecked state stable.
  const stable = resolveRecipeOverridesTags(note, normalizedAnswers).questions
  const stableAccount = stable.find((entry) => entry.id === account.id)
  const stableChaos = stable.find((entry) => entry.id === chaos.id)
  assert.equal(stableChaos?.answer.includes(keepNbrId), false)
  assert.equal(stableAccount?.answer.includes(endgameId), false)
  assert.equal(stableAccount?.answer.includes(lategameId), false)
})

test('needs constraint resolves to requiresOptionIds (UI enable-gate)', () => {
  // A "level cap" checkbox depends on at least one rarity being kept.
  const note = [
    '<!-- recipe-overrides',
    'q "Chaos Ore"',
    'cb "Keep Epic" id=epic { @all { export=active } }',
    'cb "Keep Legendary" id=leg { @all { export=active } }',
    'cb "Level cap" id=cap needs epic leg { @all { lvl=12-16 } }',
    '-->',
  ].join('\n')
  const res = resolveRecipeOverridesTags(note)
  const q = res.questions[0]!
  const epic = q.options.find((o) => o.token === 'epic')!
  const leg = q.options.find((o) => o.token === 'leg')!
  const cap = q.options.find((o) => o.token === 'cap')!
  // The gated option records both referenced ids; the rarities have no gate.
  assert.deepEqual(new Set(cap.requiresOptionIds), new Set([epic.id, leg.id]))
  assert.equal(epic.requiresOptionIds.length, 0)
  assert.equal(leg.requiresOptionIds.length, 0)
  // `needs` is a UI gate only — it must NOT alter selection or emit instructions.
  assert.equal(cap.blocks.length, 1)
  // Without `=state`, the disabled display state is unspecified (keep current).
  assert.equal(cap.requiresDisabledState, null)
})

test('id=<reserved keyword> is flagged as a diagnostic', () => {
  const diag = (line: string) => {
    const block = `<!-- recipe-overrides\nq "Q"\n${line}\n-->`
    const diags: { from: number; to: number; message: string }[] = []
    collectRecipeOverridesDiagnostics(block, 0, diags)
    return diags
  }
  // Bare reserved words (constraint keyword + group-type keyword) are flagged.
  for (const kw of ['set', 'unset', 'only', 'excl', 'needs', 'cb', 'q']) {
    const diags = diag(`cb "X" id=${kw} { @all { export=active } }`)
    assert.equal(diags.length, 1, `id=${kw} should be flagged`)
    assert.match(diags[0]!.message, /reserved keyword/)
  }
  // A quoted reserved id stays referenceable (via quotes) → not flagged.
  assert.equal(diag('cb "X" id="set" { @all { export=active } }').length, 0)
  // An ordinary id is fine.
  assert.equal(diag('cb "X" id=keep_epic { @all { export=active } }').length, 0)
})

test('invalid enumerated assignment values are flagged instead of silently dropped', () => {
  const diag = (line: string) => {
    const block = `<!-- recipe-overrides\nq "Q"\n${line}\n-->`
    const diags: { from: number; to: number; message: string }[] = []
    collectRecipeOverridesDiagnostics(block, 0, diags)
    return diags
  }
  // export= / keep= / autolate= / flex= each accept a closed value set; a typo must be flagged.
  const cases: { line: string; needle: RegExp }[] = [
    { line: 'cb "X" id=a { @all { export=activ } }',     needle: /'activ' is not a valid export value/ },
    { line: 'cb "X" id=a { @all { keep=middle } }',      needle: /'middle' is not a valid keep value/ },
    { line: 'cb "X" id=a { @all { autolate=legendary } }', needle: /'legendary' is not a valid autolate value/ },
    { line: 'cb "X" id=a { @all { flex=maybe } }',       needle: /'maybe' is not a valid flex value/ },
  ]
  for (const { line, needle } of cases) {
    const diags = diag(line)
    assert.equal(diags.length, 1, `${line} should produce exactly one diagnostic`)
    assert.match(diags[0]!.message, needle)
  }
  // Control: well-formed values produce no diagnostics.
  assert.equal(diag('cb "X" id=a { @all { export=toggle keep=early autolate=rare flex=on } }').length, 0)
})

test('needs= with an invalid on/off state is flagged', () => {
  const block = '<!-- recipe-overrides\nq "Q"\ncb "Epic" id=epic { @all { export=active } }\ncb "Cap" id=cap needs=maybe epic { @all { lvl=12-16 } }\n-->'
  const diags: { from: number; to: number; message: string }[] = []
  collectRecipeOverridesDiagnostics(block, 0, diags)
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /'maybe' is not a valid needs value/)
})

test('needs=on|off captures the displayed-while-disabled state', () => {
  const note = [
    '<!-- recipe-overrides',
    'q "Chaos Ore"',
    'cb "Keep Epic" id=epic { @all { export=active } }',
    'cb "Level cap" id=cap needs=off epic { @all { lvl=12-16 } }',
    'cb "Slots" id=slots needs=on epic { @all { export=active } }',
    '-->',
  ].join('\n')
  const q = resolveRecipeOverridesTags(note).questions[0]!
  const cap = q.options.find((o) => o.token === 'cap')!
  const slots = q.options.find((o) => o.token === 'slots')!
  const epic = q.options.find((o) => o.token === 'epic')!
  assert.equal(cap.requiresDisabledState, 'off')
  assert.equal(slots.requiresDisabledState, 'on')
  // The `=state` does not consume the id list that follows it.
  assert.deepEqual(new Set(cap.requiresOptionIds), new Set([epic.id]))
  assert.deepEqual(new Set(slots.requiresOptionIds), new Set([epic.id]))
})

test('unchecking a tier-forced box keeps the tier\'s other options (no cascade)', () => {
  // A tier force-sets three options in another question. Unchecking ONE must release the
  // tier (so the box stays off) WITHOUT dropping the tier's other forced options.
  const note = [
    '<!-- recipe-overrides',
    'q "Tier"',
    'cb "TierA" * id=tiera +ox +oy +oz {}',
    'cb "TierB" id=tierb {}',
    '-->',
    '<!-- recipe-overrides',
    'q "Options"',
    'cb "X" id=ox { @all { export=active } }',
    'cb "Y" id=oy { @all { export=active } }',
    'cb "Z" id=oz { @all { export=active } }',
    '-->',
  ].join('\n')
  const base = resolveRecipeOverridesTags(note)
  const tierQ = base.questions[0]!
  const optsQ = base.questions[1]!
  const tierA = tierQ.options.find((o) => o.token === 'tiera')!
  const ox = optsQ.options.find((o) => o.token === 'ox')!
  const oy = optsQ.options.find((o) => o.token === 'oy')!
  const oz = optsQ.options.find((o) => o.token === 'oz')!
  // Default: TierA selected forces ox/oy/oz on.
  assert.deepEqual(new Set(optsQ.answer), new Set([ox.id, oy.id, oz.id]))
  // User unchecks X (the dialog runs the within-question rules first, then persists).
  const ordered = applyQuestionSelectionRules(
    optsQ.answer.filter((id) => id !== ox.id), optsQ, undefined, ox.id,
  )
  const stored = applyRecipeOverridesAnswerChange(note, {}, optsQ, ordered, undefined, ox.id)
  const after = resolveRecipeOverridesTags(note, stored)
  const afterOpts = new Set(after.questions[1]!.answer)
  const afterTier = new Set(after.questions[0]!.answer)
  // X stays off; Y and Z are preserved (the bug dropped them); the tier is released.
  assert.equal(afterOpts.has(ox.id), false, 'X stays off')
  assert.ok(afterOpts.has(oy.id), 'Y preserved')
  assert.ok(afterOpts.has(oz.id), 'Z preserved')
  assert.equal(afterTier.has(tierA.id), false, 'tier released so X does not snap back')
})

test('full lategame/endgame/endgame+ block releases lategame on conflicting yes selections', () => {
  // Build the real preset block text plus dependent override questions.
  const note = [
    '<!-- recipe-overrides [columns=4]',
    '  q "Which account level do you think you have?"',
    '  cb "`Lategame`" "I can finish all **Normal** game modes and a lot of the stages in any **Hard** mode.',
    'Different than accessories, **5★** and **6★ Rare** gear is usually sold!"',
    ' * id=lategame ^lategame  +marius_open +fwh_no +la_no +eg_no +o5s_late4 +o6s_late4 +o6c_yes16 !o5_lvlcap !o6_lvlcap {}',
    '  cb "`Endgame`" "I can finish all **Hard** game modes including **Cursed City** / **Soulcross** and **Faction Wars,** and **all my used champs are already equipped properly.**',
    'Different than accessories, **5★** and **6★ Rare** gear is usually sold!" id=endgame ^endgame +marius_finished +fwh_yes16 +la_yes16 +eg_yes16 +o5s_early +o6s_early +o6c_yes16 +o5_lvlcap +o6_lvlcap {}',
    '  cb "`Endgame+`" "I can finish everything easily and want to only keep the best of the best gear.',
    'Different than accessories, **5★** and **6★ Rare** gear is usually sold!" id=kraken ^kraken +marius_finished +fwh_yes +la_yes +eg_yes +o5s_early +o6s_early +o6c_yes16 +o5_lvlcap +o6_lvlcap {}',
    '-->',
    '<!-- recipe-overrides',
    '  q "Did you finish Faction Wars in Hard mode?',
    '  This question targets utility gear sets like **Stun**, **Provoke**, **Toxic**, etc...',
    'Regardless of your answer, exceptionally good pieces are always protected."',
    '  rb "`No`" "Protect utility drops at any level (0-16)" * id=fwh_no { @tag=fwhard { export=active lvl=0-16 } }',
    '  rb "`Yes`" "Protect only level 16 utility pieces" id=fwh_yes16 { @tag=fwhard { export=active lvl=16 } }',
    '  rb "`Yes!`" "Treat this gear like normal drops (no extra protection)" id=fwh_yes { @tag=fwhard { export=disabled } }',
    '-->',
    '<!-- recipe-overrides',
    '  q "Do you play and win Live Arena and Siege a lot?',
    '  This question targets mediocre **Feral**, **Stonecleaver**, **Rebirth** gear.',
    'Regardless of your answer, exceptionally good pieces are always protected."',
    '  rb "`No`" "Protect Live Arena and Siege drops" * id=la_no { @tag=pvpgear { export=active lvl=0-16 } }',
    '  rb "`Yes`" "But still protect existing level 16 mediocre pieces" id=la_yes16 { @tag=pvpgear { export=active lvl=16 } }',
    '  rb "`Yes!`" "Treat this gear like normal limited-set drops (no extra protection)" id=la_yes { @tag=pvpgear { export=disabled } }',
    '-->',
    '<!-- recipe-overrides',
    '  q "Do you safely farm all dungeon hard stages 10 **and** finish all 101 stages of Cursed City (hard) always completely **and** have enough great gear to equip your useful champs completely?',
    '  This question targets all gear sets except utility and Live Arena sets.',
    'Regardless of your answer, exceptionally good pieces are always protected."',
    '  rb "`No`" "Protect less-optimal drops" * id=eg_no { @tag=mediocre { export=active lvl=0-16 } }',
    '  rb  "`Yes`" "But still protect existing level 16 mediocre pieces" id=eg_yes16 { @tag=mediocre { export=active lvl=16 } }',
    '  rb "`Yes!`" "Allow auto-sell for mediocre drops (unless protected elsewhere)" id=eg_yes { @tag=mediocre { export=disabled } }',
    '-->',
  ].join('\n')
  // Parse once so we can lookup scoped option ids by explicit token.
  const seed = resolveRecipeOverridesTags(note)
  // Find a scoped option id from its explicit token.
  const findOptionId = (token: string): string => {
    const question = seed.questions.find((entry) => entry.options.some((option) => option.token === token))
    assert.ok(question, `expected a question for token ${token}`)
    const option = question.options.find((entry) => entry.token === token)
    assert.ok(option, `expected an option for token ${token}`)
    return option.id
  }
  // Find the owning question id for a given explicit token.
  const findQuestionId = (token: string): string => {
    const question = seed.questions.find((entry) => entry.options.some((option) => option.token === token))
    assert.ok(question, `expected a question id for token ${token}`)
    return question.id
  }
  // Capture the preset id and the account-level question id.
  const lategameId = findOptionId('lategame')
  const presetQuestionId = findQuestionId('lategame')
  // Build conflict targets that used to fail to override lategame.
  const conflictTokens = ['fwh_yes16', 'fwh_yes', 'la_yes16', 'la_yes', 'eg_yes16', 'eg_yes']
  conflictTokens.forEach((token) => {
    // Resolve scoped ids for this conflict target.
    const targetId = findOptionId(token)
    const targetQuestionId = findQuestionId(token)
    // Start with lategame selected, then prefer a conflicting yes/yes! answer.
    const answers = {
      [presetQuestionId]: [lategameId],
      [targetQuestionId]: [targetId],
    }
    const preferredResolution = resolveRecipeOverridesTags(note, answers, targetId).questions
    const resolvedPreset = preferredResolution.find((entry) => entry.id === presetQuestionId)
    const resolvedTarget = preferredResolution.find((entry) => entry.id === targetQuestionId)
    assert.ok(resolvedPreset, `expected preset resolution for ${token}`)
    assert.ok(resolvedTarget, `expected target resolution for ${token}`)
    // Preferred target stays selected and lategame is released.
    assert.equal(resolvedPreset.answer.includes(lategameId), false)
    assert.ok(resolvedTarget.answer.includes(targetId))
    // Persist only non-default answers, matching dialog storage behavior.
    const normalizedAnswers: Record<string, string[]> = {}
    preferredResolution.forEach((question) => {
      const defaultSet = new Set(question.defaultAnswer)
      const answerSet = new Set(question.answer)
      const matchesDefault = defaultSet.size === answerSet.size
        && Array.from(defaultSet).every((id) => answerSet.has(id))
      if (matchesDefault) return
      normalizedAnswers[question.id] = question.answer.slice()
    })
    // Re-resolving without preferred id should keep lategame unset.
    const stableResolution = resolveRecipeOverridesTags(note, normalizedAnswers).questions
    const stablePreset = stableResolution.find((entry) => entry.id === presetQuestionId)
    const stableTarget = stableResolution.find((entry) => entry.id === targetQuestionId)
    assert.ok(stablePreset, `expected stable preset resolution for ${token}`)
    assert.ok(stableTarget, `expected stable target resolution for ${token}`)
    assert.equal(stablePreset.answer.includes(lategameId), false)
    assert.ok(stableTarget.answer.includes(targetId))
  })
})

test('unset constraints can remove selected options across questions', () => {
  // Build a note where one option disables another selected checkbox.
  const note = [
    '<!-- recipe-overrides',
    'q "Parent"',
    'check "Disable child" id=parent -child { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Child"',
    'check "Child option" * id=child { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse scoped ids.
  const seed = resolveRecipeOverridesTags(note)
  const [parent, child] = seed.questions
  assert.ok(parent, 'expected parent question')
  assert.ok(child, 'expected child question')
  const parentId = parent.options[0]!.id
  const childId = child.options[0]!.id
  // Start with both options selected.
  const answers = {
    [parent.id]: [parentId],
    [child.id]: [childId],
  }
  const resolved = resolveRecipeOverridesTags(note, answers, parentId).questions
  const resolvedParent = resolved.find((entry) => entry.id === parent.id)
  const resolvedChild = resolved.find((entry) => entry.id === child.id)
  // Parent stays selected while the child is explicitly unset.
  assert.ok(resolvedParent?.answer.includes(parentId))
  assert.equal(resolvedChild?.answer.includes(childId), false)
})

test('plus constraints no longer enforce only semantics', () => {
  // Build a note where "+1" should behave like set, not allow-list exclusion.
  const note = [
    '<!-- recipe-overrides',
    'q "Local"',
    'check "A" +1 { @all { export=active } }',
    'check "B" { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse scoped ids.
  const seed = resolveRecipeOverridesTags(note)
  const [local] = seed.questions
  assert.ok(local, 'expected local question')
  const aId = local.options[0]!.id
  const bId = local.options[1]!.id
  // Select both options and keep A preferred.
  const answers = { [local.id]: [aId, bId] }
  const resolved = resolveRecipeOverridesTags(note, answers, aId).questions
  const resolvedLocal = resolved.find((entry) => entry.id === local.id)
  // Both answers should remain selected because "+" now means set.
  assert.ok(resolvedLocal?.answer.includes(aId))
  assert.ok(resolvedLocal?.answer.includes(bId))
})

test('single-select groups pick a compatible fallback when excluded', () => {
  // Build a note where a second question excludes a radio option.
  const note = [
    '<!-- recipe-overrides',
    'q "First Question"',
    'radio "Choice A" id=a { @all { export=active } }',
    'radio "Choice B" id=b { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Second Question"',
    'check "Block A" !a { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveRecipeOverridesTags(note)
  const [first, second] = seed.questions
  // Ensure the marker ordering is intact before asserting.
  assert.ok(first, 'expected a first recipe overrides question')
  assert.ok(second, 'expected a second recipe overrides question')
  // Select the excluded radio option plus the blocker.
  const answers = {
    [first.id]: [first.options[0]!.id],
    [second.id]: [second.options[0]!.id],
  }
  // Re-resolve answers so exclusions and fallbacks apply.
  const resolved = resolveRecipeOverridesTags(note, answers).questions
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
    '<!-- recipe-overrides',
    'q "Early Question"',
    'radio "`No`" id=midgame !lategame1 { @all { export=active } }',
    'radio "`Yes`" * { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Late Question"',
    'radio "`Yes`" id=lategame1 !midgame { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveRecipeOverridesTags(note)
  const [first, second] = seed.questions
  // Ensure the marker ordering is intact before asserting.
  assert.ok(first, 'expected a first recipe overrides question')
  assert.ok(second, 'expected a second recipe overrides question')
  const midgameId = first.options[0]!.id
  const earlyDefaultId = first.options[1]!.id
  const lategameId = second.options[0]!.id
  // Select mutually exclusive answers, preferring the late option.
  const answers = {
    [first.id]: [midgameId],
    [second.id]: [lategameId],
  }
  // Re-resolve answers so the preferred option wins.
  const resolved = resolveRecipeOverridesTags(note, answers, lategameId).questions
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
    '<!-- recipe-overrides',
    'q "Early Question"',
    'radio "`No`" id=midgame !lategame1 { @all { export=active } }',
    'radio "`Yes`" * { @all { export=active } }',
    '-->',
    '<!-- recipe-overrides',
    'q "Late Question"',
    'radio "`No`" * { @all { export=active } }',
    'radio "`Yes`" id=lategame1 !midgame { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse once so we can reuse the generated IDs.
  const seed = resolveRecipeOverridesTags(note)
  const [first, second] = seed.questions
  // Ensure the marker ordering is intact before asserting.
  assert.ok(first, 'expected a first recipe overrides question')
  assert.ok(second, 'expected a second recipe overrides question')
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
  const resolved = resolveRecipeOverridesTags(note, answers, lategameId).questions
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

test('columns marker option enables horizontal layout and sets card-width multiplier', () => {
  // Build a note with a columns marker option before the question header.
  const note = [
    '<!-- recipe-overrides [columns=3]',
    'q "Wide Question"',
    'radio "Yes" * { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse the note so we can inspect the layout metadata.
  const { questions } = resolveRecipeOverridesTags(note)
  const question = questions[0]
  // Guard against missing parsed content.
  assert.ok(question, 'expected the question to be parsed')
  // Confirm the column multiplier was captured.
  assert.equal(question?.layoutColumns, 3)
})

test('omitting the columns marker defaults to vertical layout', () => {
  // Build a note without any marker options.
  const note = [
    '<!-- recipe-overrides',
    'q "Standard Question"',
    'radio "Yes" * { @all { export=active } }',
    '-->',
  ].join('\n')
  // Parse the note so we can inspect defaults.
  const { questions } = resolveRecipeOverridesTags(note)
  const question = questions[0]
  // Guard against missing parsed content.
  assert.ok(question, 'expected the question to be parsed')
  // Confirm the default column value means vertical layout.
  assert.equal(question?.layoutColumns, NOTE_RECIPE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT)
})

test('gearsets=+-Name parses as addExcluded mutate operation', () => {
  // `+` is tokenized as a symbol; the parser must peek past it to form `+-Name`.
  // This is the mechanism for explicitly excluding a set that a metaset would include.
  const note = [
    '<!-- recipe-overrides',
    'q "Set override"',
    'radio "Exclude Daze" * { @all { gearsets=+-Daze } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  // One instruction block must have been parsed from the default option.
  assert.equal(instructions.length, 1, 'expected one instruction block')
  const op = instructions[0]!.operations.find(
    (o): o is Extract<RecipeOverridesOperation, { kind: 'artifactSets' }> => o.kind === 'artifactSets',
  )
  // The operation must have been parsed and be a mutate.
  assert.ok(op, 'expected an artifactSets operation')
  assert.equal(op.mode, 'mutate', 'expected mutate mode from +-prefix')
  // The add list must contain exactly one excluded entry (Daze).
  assert.equal(op.add.length, 1, 'expected one add entry')
  assert.equal(op.add[0]!.excluded, true, 'expected the entry to be excluded')
  assert.equal(op.remove.length, 0, 'expected no remove entries')
})

test('gearsets=+Name parses as plain add mutate operation', () => {
  // `+Name` should produce a non-excluded add entry in mutate mode.
  const note = [
    '<!-- recipe-overrides',
    'q "Set override"',
    'radio "Add Speed" * { @all { gearsets=+Speed } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  assert.equal(instructions.length, 1, 'expected one instruction block')
  const op = instructions[0]!.operations.find(
    (o): o is Extract<RecipeOverridesOperation, { kind: 'artifactSets' }> => o.kind === 'artifactSets',
  )
  assert.ok(op, 'expected an artifactSets operation')
  assert.equal(op.mode, 'mutate', 'expected mutate mode from + prefix')
  assert.equal(op.add.length, 1, 'expected one add entry')
  assert.equal(op.add[0]!.excluded, undefined, 'expected entry to not be excluded')
  assert.equal(op.remove.length, 0, 'expected no remove entries')
})

test('gearsets=+-Name applied to a metaset recipe adds excluded entry', () => {
  // Recipes whose sets come exclusively from a metaset have an empty explicit
  // artifactSets list.  A gearsets=+-Name override must add an excluded entry
  // so the set is suppressed even though the metaset would normally include it.
  const note = [
    '<!-- recipe-overrides',
    'q "Set override"',
    'radio "Exclude Daze" * { @all { gearsets=+-Daze } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  // Base recipe: uses the Utility metaset, no explicit artifactSets.
  const recipe = { ...createFactoryBuilderDefaults(), artifactMetaSets: ['Utility'], artifactSets: [] }
  const resolved = resolveRecipeOverridesEffectiveRecipe(recipe, instructions)
  // The resolved recipe must have Daze as an excluded entry.
  const excluded = (resolved.artifactSets ?? []).filter((e) => e.excluded === true)
  assert.equal(excluded.length, 1, 'expected exactly one excluded entry')
  // The metaset reference itself must be untouched.
  assert.deepEqual(resolved.artifactMetaSets, ['Utility'])
})

test('gearsets=+-Name works inside a tag-scoped selector block', () => {
  // Regression: the fix must apply when gearsets=+-Name appears inside a nested
  // @tag=X { ... } block, not just a top-level @all { ... } block.
  const note = [
    '<!-- recipe-overrides',
    'q "Faction Wars complete?"',
    'rb "Yes" * { @tag=utility { export=active lvl=16 gearsets=+-Daze } }',
    'rb "No"  { @tag=utility { export=active lvl=0-16 } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  // The default option ("Yes") must produce one selector block.
  assert.equal(instructions.length, 1, 'expected one instruction block from the default option')
  // The block must target a tag=utility selector.
  assert.equal(instructions[0]!.selector.kind, 'tag', 'expected a tag selector')
  // The block must contain an artifactSets mutate with an excluded Daze entry.
  const op = instructions[0]!.operations.find(
    (o): o is Extract<RecipeOverridesOperation, { kind: 'artifactSets' }> => o.kind === 'artifactSets',
  )
  assert.ok(op, 'expected an artifactSets operation')
  assert.equal(op.mode, 'mutate')
  assert.equal(op.add.length, 1)
  assert.equal(op.add[0]!.excluded, true)
})

test('substatmin plain term parses to substatMin selector', () => {
  // Parser must produce a substatMin AST node from @substatmin>=N.
  const note = [
    '<!-- recipe-overrides',
    'q "test"',
    'radio "opt" * { @substatmin>=2 { export=active } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  assert.equal(instructions.length, 1, 'expected one instruction block')
  const sel = instructions[0]!.selector as RecipeOverridesSelector
  assert.equal(sel.kind, 'substatMin', 'expected substatMin selector kind')
  if (sel.kind !== 'substatMin') return
  assert.equal(sel.op, 'gte', 'expected gte operator')
  assert.equal(sel.value, 2, 'expected value 2')
})

test('substatmin dotted term parses to substatMinField selector', () => {
  // Parser must produce a substatMinField AST node from @substatmin.SPD<=N.
  const note = [
    '<!-- recipe-overrides',
    'q "test"',
    'radio "opt" * { @substatmin.SPD<=3 { export=active } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  assert.equal(instructions.length, 1)
  const sel = instructions[0]!.selector as RecipeOverridesSelector
  assert.equal(sel.kind, 'substatMinField', 'expected substatMinField selector kind')
  if (sel.kind !== 'substatMinField') return
  assert.equal(sel.op, 'lte', 'expected lte operator')
  assert.equal(sel.value, 3, 'expected value 3')
  // Variant must resolve to the canonical SPD stat variant.
  assert.equal(sel.variant, variantFromLabel('SPD'), 'expected SPD variant')
})

test('minima.any term parses to minimaAny selector', () => {
  // Parser must produce a minimaAny AST node from @minima.any=N.
  const note = [
    '<!-- recipe-overrides',
    'q "test"',
    'radio "opt" * { @minima.any=5 { export=active } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  assert.equal(instructions.length, 1)
  const sel = instructions[0]!.selector as RecipeOverridesSelector
  assert.equal(sel.kind, 'minimaAny', 'expected minimaAny selector kind')
  if (sel.kind !== 'minimaAny') return
  assert.equal(sel.op, 'eq', 'expected eq operator')
  assert.equal(sel.value, 5, 'expected value 5')
})

test('minima dotted term parses to minimaField selector', () => {
  // Parser must produce a minimaField AST node from @minima.5.SPD>=N.
  const note = [
    '<!-- recipe-overrides',
    'q "test"',
    'radio "opt" * { @minima.5.SPD>=100 { export=active } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  assert.equal(instructions.length, 1)
  const sel = instructions[0]!.selector as RecipeOverridesSelector
  assert.equal(sel.kind, 'minimaField', 'expected minimaField selector kind')
  if (sel.kind !== 'minimaField') return
  assert.equal(sel.op, 'gte', 'expected gte operator')
  assert.equal(sel.star, 5, 'expected star 5')
  assert.equal(sel.value, 100, 'expected value 100')
  assert.equal(sel.variant, variantFromLabel('SPD'), 'expected SPD variant')
})

test('substatMin selector matches recipe when all active substats meet threshold', () => {
  // @substatmin>=2 must activate when at least one active substat bound satisfies the condition.
  const note = [
    '<!-- recipe-overrides',
    'q "test"',
    'radio "opt" * { @substatmin>=2 { export=active } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  const spdVariant = variantFromLabel('SPD')!
  const atkVariant = variantFromLabel('ATK')!
  // Only SPD has min=3 — condition satisfied because at least one qualifies.
  const matching = {
    ...createFactoryBuilderDefaults(),
    exportMode: 'disabled' as const,
    substatsV: [spdVariant, atkVariant],
    substatRollBoundsV: { [spdVariant]: { min: 3 }, [atkVariant]: { min: 1 } },
  }
  assert.equal(resolveRecipeOverridesEffectiveRecipe(matching, instructions).exportMode, 'active')
  // Neither substat meets the threshold.
  const unmatched = {
    ...createFactoryBuilderDefaults(),
    exportMode: 'disabled' as const,
    substatsV: [spdVariant, atkVariant],
    substatRollBoundsV: { [spdVariant]: { min: 1 }, [atkVariant]: { min: 1 } },
  }
  assert.equal(resolveRecipeOverridesEffectiveRecipe(unmatched, instructions).exportMode, 'disabled')
})

test('substatMinField selector matches one specific substat variant', () => {
  // @substatmin.SPD>=2 must check only the SPD variant bound, ignoring others.
  const note = [
    '<!-- recipe-overrides',
    'q "test"',
    'radio "opt" * { @substatmin.SPD>=2 { export=active } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  const spdVariant = variantFromLabel('SPD')!
  const atkVariant = variantFromLabel('ATK')!
  // SPD min=3 satisfies >=2 even though ATK min=1 does not.
  const matching = {
    ...createFactoryBuilderDefaults(),
    exportMode: 'disabled' as const,
    substatsV: [spdVariant, atkVariant],
    substatRollBoundsV: { [spdVariant]: { min: 3 }, [atkVariant]: { min: 1 } },
  }
  assert.equal(resolveRecipeOverridesEffectiveRecipe(matching, instructions).exportMode, 'active')
  // SPD min=1 does not satisfy >=2.
  const unmatched = {
    ...createFactoryBuilderDefaults(),
    exportMode: 'disabled' as const,
    substatsV: [spdVariant],
    substatRollBoundsV: { [spdVariant]: { min: 1 } },
  }
  assert.equal(resolveRecipeOverridesEffectiveRecipe(unmatched, instructions).exportMode, 'disabled')
})

test('minimaAny selector gates per-recipe operations via SubstatTargetTable', () => {
  // @minima.any=5 must activate only when SubstatTargetTable.anyRankDefaultsTo equals 5.
  const note = [
    '<!-- recipe-overrides',
    'q "test"',
    'radio "opt" * { @minima.any=5 { export=active } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  const recipe = { ...createFactoryBuilderDefaults(), exportMode: 'disabled' as const }
  const matching: SubstatTargetTable = { one: {}, two: {}, three: {}, four: {}, five: {}, six: {}, anyRankDefaultsTo: 5 }
  const { recipes: matched } = applyAllRecipeOverrides([recipe], matching, instructions)
  assert.equal(matched[0]!.exportMode, 'active', 'expected export=active when anyRankDefaultsTo=5')
  const unmatched: SubstatTargetTable = { one: {}, two: {}, three: {}, four: {}, five: {}, six: {}, anyRankDefaultsTo: 4 }
  const { recipes: notMatched } = applyAllRecipeOverrides([recipe], unmatched, instructions)
  assert.equal(notMatched[0]!.exportMode, 'disabled', 'expected export=disabled when anyRankDefaultsTo=4')
})

test('minimaField selector gates per-recipe operations via star-keyed SubstatTargetTable cell', () => {
  // @minima.5.SPD>=100 must activate only when targets.five[SPD]>=100.
  const note = [
    '<!-- recipe-overrides',
    'q "test"',
    'radio "opt" * { @minima.5.SPD>=100 { export=active } }',
    '-->',
  ].join('\n')
  const { instructions } = resolveRecipeOverridesTags(note)
  const recipe = { ...createFactoryBuilderDefaults(), exportMode: 'disabled' as const }
  const spdVariant = variantFromLabel('SPD')!
  const matching: SubstatTargetTable = { one: {}, two: {}, three: {}, four: {}, five: { [spdVariant]: 100 }, six: {}, anyRankDefaultsTo: 6 }
  const { recipes: matched } = applyAllRecipeOverrides([recipe], matching, instructions)
  assert.equal(matched[0]!.exportMode, 'active', 'expected active when five.SPD=100 satisfies >=100')
  const unmatched: SubstatTargetTable = { one: {}, two: {}, three: {}, four: {}, five: { [spdVariant]: 50 }, six: {}, anyRankDefaultsTo: 6 }
  const { recipes: notMatched } = applyAllRecipeOverrides([recipe], unmatched, instructions)
  assert.equal(notMatched[0]!.exportMode, 'disabled', 'expected disabled when five.SPD=50 does not satisfy >=100')
})

// ── action= op (Keep/Sell flag) ─────────────────────────────────────────────

test('action=sell flips recipe.keep to false on a matching recipe', () => {
  const note = [
    '<!-- recipe-overrides',
    'q "Sell chaos?"',
    'cb "Keep" * id=mk {}',
    'cb "Sell" id=ms { @tag=chaos { action=sell } }',
    '-->',
  ].join('\n')
  const q = resolveRecipeOverridesTags(note).questions[0]!
  const sellId = q.options.find((o) => o.token === 'ms')!.id
  const { instructions } = resolveRecipeOverridesTags(note, { [q.id]: [sellId] }, sellId)
  // rarityMode:'code' keeps the resolver off the WASM auto-rarity path.
  const chaos = { ...createFactoryBuilderDefaults(), rarityMode: 'code' as const, keep: true, tags: ['chaos'] }
  assert.equal(resolveRecipeOverridesEffectiveRecipe(chaos, instructions).keep, false)
  // A recipe without the tag is untouched.
  const other = { ...createFactoryBuilderDefaults(), rarityMode: 'code' as const, keep: true, tags: ['other'] }
  assert.equal(resolveRecipeOverridesEffectiveRecipe(other, instructions).keep, true)
})

test('action=keep / action=toggle behave like the export-mode toggle shape', () => {
  const mk = (action: string) => {
    const note = [
      '<!-- recipe-overrides', 'q "q"',
      `cb "o" * id=o { @all { action=${action} } }`, '-->',
    ].join('\n')
    const q = resolveRecipeOverridesTags(note).questions[0]!
    const oid = q.options[0]!.id
    return resolveRecipeOverridesTags(note, { [q.id]: [oid] }, oid).instructions
  }
  const base = (keep: boolean) => ({ ...createFactoryBuilderDefaults(), rarityMode: 'code' as const, keep })
  // action=keep forces keep regardless of starting value.
  assert.equal(resolveRecipeOverridesEffectiveRecipe(base(false), mk('keep')).keep, true)
  // action=toggle inverts the current value.
  assert.equal(resolveRecipeOverridesEffectiveRecipe(base(true), mk('toggle')).keep, false)
  assert.equal(resolveRecipeOverridesEffectiveRecipe(base(false), mk('toggle')).keep, true)
})

test('action=<bogus> emits a diagnostic', () => {
  const note = '<!-- recipe-overrides q "q" cb "o" id=o { @all { action=maybe } } -->'
  const ds: { from: number; to: number; message: string }[] = []
  collectRecipeOverridesDiagnostics(note, 0, ds)
  assert.ok(ds.some((d) => /action/.test(d.message)), 'expected an action= enum diagnostic')
})

// ── Inline DSL localization ([[xx]] segments) ───────────────────────────────

test('[[de]] localizes display text while identity stays language-invariant', () => {
  const note = [
    '<!-- recipe-overrides',
    'q "Keep it?[[de]]Behalten?"',
    'cb "Yes[[de]]Ja" "Detail.[[de]]Detail DE." * id=y {}',
    '-->',
  ].join('\n')
  const en = resolveRecipeOverridesTags(note, {}, undefined, undefined, 'en-US').questions[0]!
  const de = resolveRecipeOverridesTags(note, {}, undefined, undefined, 'de-DE').questions[0]!
  // Identity (question + option ids) must match across languages.
  assert.equal(en.id, de.id)
  assert.equal(en.options[0]!.id, de.options[0]!.id)
  // Display localizes per active language.
  assert.equal(en.prompt, 'Keep it?')
  assert.equal(de.prompt, 'Behalten?')
  assert.equal(de.options[0]!.label, 'Ja')
  assert.equal(de.options[0]!.detail, 'Detail DE.')
  // A language with no segment falls back to the English base (id unchanged).
  const fr = resolveRecipeOverridesTags(note, {}, undefined, undefined, 'fr-FR').questions[0]!
  assert.equal(fr.prompt, 'Keep it?')
  assert.equal(fr.id, en.id)
})

test('a single (radio) keep/sell question with needs= gates the keep option', () => {
  // Two mutually-exclusive radios; Keep is the default but UI-gated on a prior keep
  // (needs=off): when the gate is unmet the keep option displays off, so the radio
  // surfaces Sell — matching gear that would fall through to final-sell anyway.
  const note = [
    '<!-- recipe-overrides',
    'q "Master?"',
    'single "Keep" id=mk * needs=off prior_keep {}',
    'single "Sell" id=ms { @tag=t { action=sell } }',
    'cb "Prior keep" id=prior_keep { @tag=t { export=active } }',
    '-->',
  ].join('\n')
  const q = resolveRecipeOverridesTags(note).questions[0]!
  // Mutually exclusive (single group), not independent checkboxes.
  assert.equal(q.groups[0]!.type, 'single')
  const keep = q.options.find((o) => o.token === 'mk')!
  // Keep is the stored default and carries the UI gate + off display state.
  assert.equal(keep.isDefault, true)
  assert.equal(keep.requiresOptionIds.length, 1)
  assert.equal(keep.requiresDisabledState, 'off')
})

// ── Behaviour flags: ignoredbysafeguards= / reworkgate= ─────────────────────
// The two flags that used to be "magic" tags are first-class recipe FIELDS, and the
// DSL registers each as both a condition and an assignment. These pin the four
// couplings the compiler cannot: matching, applying, the omit-when-cleared write, and
// the canonical round-trip — plus the legacy tag spelling still folding onto the flag.

// Build the instruction list for a one-option note, with that option selected.
const flagInstructions = (body: string) => {
  const note = ['<!-- recipe-overrides', 'q "q"', `cb "o" * id=o { ${body} }`, '-->'].join('\n')
  const q = resolveRecipeOverridesTags(note).questions[0]!
  const oid = q.options[0]!.id
  return resolveRecipeOverridesTags(note, { [q.id]: [oid] }, oid).instructions
}
// rarityMode:'code' keeps the resolver off the WASM auto-rarity path, as elsewhere here.
const flagRecipe = (fields: Partial<{ ignoredBySafeguards: boolean; reworkGate: 'reworked' | 'notReworked' }>) => (
  { ...createFactoryBuilderDefaults(), rarityMode: 'code' as const, keep: true, ...fields }
)

test('ignoredbysafeguards= selects on the flag and applies as an omit-when-false write', () => {
  const instructions = flagInstructions('@ignoredbysafeguards=on { action=sell }')
  // A flagged recipe matches; an unflagged one (field absent) does not.
  assert.equal(resolveRecipeOverridesEffectiveRecipe(flagRecipe({ ignoredBySafeguards: true }), instructions).keep, false)
  assert.equal(resolveRecipeOverridesEffectiveRecipe(flagRecipe({}), instructions).keep, true)
  // Setting the flag writes `true`; the recipe had no field at all before.
  const set = resolveRecipeOverridesEffectiveRecipe(flagRecipe({}), flagInstructions('@all { ignoredbysafeguards=on }'))
  assert.equal(set.ignoredBySafeguards, true)
  // Clearing DELETES the key rather than storing false, so an untouched recipe stays
  // byte-identical on save — `in` is the assertion that distinguishes the two.
  const cleared = resolveRecipeOverridesEffectiveRecipe(flagRecipe({ ignoredBySafeguards: true }), flagInstructions('@all { ignoredbysafeguards=off }'))
  assert.equal('ignoredBySafeguards' in cleared, false, 'clearing must omit the field, not store false')
})

test('reworkgate= is tri-state: two gates plus any, which selects and clears "no gate"', () => {
  const reworked = flagInstructions('@reworkgate=reworked { action=sell }')
  // Each gate value matches only its own state.
  assert.equal(resolveRecipeOverridesEffectiveRecipe(flagRecipe({ reworkGate: 'reworked' }), reworked).keep, false)
  assert.equal(resolveRecipeOverridesEffectiveRecipe(flagRecipe({ reworkGate: 'notReworked' }), reworked).keep, true)
  assert.equal(resolveRecipeOverridesEffectiveRecipe(flagRecipe({}), reworked).keep, true)
  // `any` is the "has no gate" condition — the third value the tri-state field needs.
  const ungated = flagInstructions('@reworkgate=any { action=sell }')
  assert.equal(resolveRecipeOverridesEffectiveRecipe(flagRecipe({}), ungated).keep, false)
  assert.equal(resolveRecipeOverridesEffectiveRecipe(flagRecipe({ reworkGate: 'reworked' }), ungated).keep, true)
  // Assignment sets the named gate…
  const set = resolveRecipeOverridesEffectiveRecipe(flagRecipe({}), flagInstructions('@all { reworkgate=notReworked }'))
  assert.equal(set.reworkGate, 'notReworked')
  // …and `any` CLEARS it by deleting the key (same omit contract as the boolean).
  const cleared = resolveRecipeOverridesEffectiveRecipe(flagRecipe({ reworkGate: 'reworked' }), flagInstructions('@all { reworkgate=any }'))
  assert.equal('reworkGate' in cleared, false, 'reworkgate=any must omit the field, not store a value')
})

test('behaviour-flag conditions and assignments round-trip through the canonical serializer', () => {
  // Both directions of every flag value, emitted and re-parsed through the real grammar.
  const selectors: RecipeOverridesSelector[] = [
    { kind: 'ignoredBySafeguards', value: true },
    { kind: 'ignoredBySafeguards', value: false },
    { kind: 'reworkGate', value: 'reworked' },
    { kind: 'reworkGate', value: 'notReworked' },
    { kind: 'reworkGate', value: 'any' },
  ]
  for (const selector of selectors) {
    const text = serializeRecipeSelector(selector)
    // The emitted term must parse back to an identical AST (no lossy display sugar).
    assert.deepEqual(parseSelectorText('recipe', 'recipe', text), selector, `${text} must round-trip`)
  }
  const operations: RecipeOverridesOperation[] = [
    { kind: 'ignoredBySafeguards', value: true },
    { kind: 'ignoredBySafeguards', value: false },
    { kind: 'reworkGate', value: 'reworked' },
    { kind: 'reworkGate', value: 'notReworked' },
    { kind: 'reworkGate', value: 'any' },
  ]
  for (const op of operations) {
    const text = serializeRecipeOperation(op)
    assert.deepEqual(parseOperationText('recipe', 'recipe', text), op, `${text} must round-trip`)
  }
})

test('legacy behaviour tags still fold onto the flag, silently', () => {
  // Every shipped legacy spelling, and the flag condition it must fold onto.
  const cases: Array<[string, RecipeOverridesSelector]> = [
    ['ignore_by_safeguards', { kind: 'ignoredBySafeguards', value: true }],
    ['ignore_keep_unique', { kind: 'ignoredBySafeguards', value: true }],
    ['if_reworked', { kind: 'reworkGate', value: 'reworked' }],
    ['only_for_chaos_ored', { kind: 'reworkGate', value: 'reworked' }],
    ['if_not_reworked', { kind: 'reworkGate', value: 'notReworked' }],
    ['ignore_for_chaos_ored', { kind: 'reworkGate', value: 'notReworked' }],
  ]
  for (const [tag, expected] of cases) {
    // The old `tag=` spelling parses into the NEW selector kind, not a tag selector.
    assert.deepEqual(flagInstructions(`@tag=${tag} { action=sell }`)[0]?.selector, expected, `tag=${tag} must fold onto the flag`)
    // …and it does so WITHOUT a diagnostic. Legacy spellings are converted at SFC load, so
    // text still using one here was typed by hand and means exactly what the fold makes it
    // mean — there is nothing left to warn about, and a warning would only make the block
    // uneditable in the visual editor for no benefit.
    const ds: { from: number; to: number; message: string }[] = []
    collectRecipeOverridesDiagnostics(`<!-- recipe-overrides q "q" cb "o" id=o { @tag=${tag} { action=sell } } -->`, 0, ds)
    assert.deepEqual(ds, [], `tag=${tag} must fold without emitting a diagnostic`)
  }
  // A plain label is untouched — only the behaviour spellings fold.
  assert.deepEqual(parseSelectorText('recipe', 'recipe', 'tag=chaos'), { kind: 'tag', mode: 'eq', values: ['chaos'] })
})

test('a legacy behaviour tag stays editable in the visual editor', () => {
  // The visual editor drops an option to verbatim raw DSL whenever a diagnostic lands
  // inside it, because a diagnostic means "we did not understand this". A legacy behaviour
  // tag produces none: the parser understands it and folds it onto the current spelling, so
  // the structured model represents it exactly and re-serializes it canonically on save.
  // This is what keeps a legacy block — including one in a shipped preset — editable as
  // rows rather than an uneditable blob of text purely because it uses an old tag name.
  for (const [text, expected] of [
    ['tag=ignore_by_safeguards', { kind: 'ignoredBySafeguards', value: true }],
    ['tag=if_reworked', { kind: 'reworkGate', value: REWORK_GATE_REWORKED }],
    ['tag=if_not_reworked', { kind: 'reworkGate', value: REWORK_GATE_NOT_REWORKED }],
    // Pre-rename spelling folds the same way.
    ['tag=only_for_chaos_ored', { kind: 'reworkGate', value: REWORK_GATE_REWORKED }],
  ] as const) {
    assert.deepEqual(parseSelectorText('recipe', 'recipe', text), expected, `${text} must stay editable`)
  }
  // The fold is narrow: genuinely unparseable DSL is still rejected outright, so a
  // typo cannot silently become an editable row that re-serializes to something else.
  assert.equal(parseSelectorText('recipe', 'recipe', 'nonsensefield=7'), null)
  assert.equal(parseSelectorText('recipe', 'recipe', 'reworkgate=someday'), null)
})

test('a bogus behaviour-flag value emits an enum diagnostic on the assignment side', () => {
  for (const [body, field] of [['ignoredbysafeguards=maybe', 'ignoredbysafeguards'], ['reworkgate=someday', 'reworkgate']] as const) {
    const ds: { from: number; to: number; message: string }[] = []
    collectRecipeOverridesDiagnostics(`<!-- recipe-overrides q "q" cb "o" id=o { @all { ${body} } } -->`, 0, ds)
    assert.ok(ds.some((d) => d.message.includes(field)), `expected a ${field}= enum diagnostic`)
  }
})

export {}
