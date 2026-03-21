/* eslint-disable import/no-unused-modules */ // node:test runner picks this up via scripts/run-tests, so the module isn't imported elsewhere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRecipeOverridesTags,
  resolveRecipeOverridesEffectiveRecipe,
  NOTE_RECIPE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT,
  type RecipeOverridesOperation,
} from '../../src/lib/noteRecipeOverrides.js'
import { createFactoryBuilderDefaults } from '../../src/lib/builderDefaults.js'

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

export {}
