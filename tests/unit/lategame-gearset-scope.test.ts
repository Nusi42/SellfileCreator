/**
 * lategame-gearset-scope.test.ts
 *
 * Pins "Optional 5 — which gear sets the wide-net rules use" in presets/lategame.sfc:
 * the catch-all safeguard scope question (q_catchsets) and the any-set Chaos Ore scope
 * question (q_orescope) with its four per-set fine-tune checkboxes (q_orefine).
 *
 * These blocks are the shipped preset's only consumers of the `metasets=any` clear
 * keyword and the only place an override widens a rule back to "any gear set", so they
 * get effect-level coverage rather than riding on the id/diagnostic sweeps next door.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadLategameMetasets, loadLategameNote, loadLategameSafeguardRules } from '../setup/presetFixtures.js'
import {
  findRecipeOptionByToken,
  resolveRecipeOverridesTags,
  resolveRecipeOverridesEffectiveRecipe,
} from '../../src/lib/noteRecipeOverrides.js'
import {
  applySafeguardOverrides,
  resolveNoteSafeguardOverridesTags,
} from '../../src/lib/noteSafeguardOverrides.js'
import { ArtifactSet } from '../../src/lib/artifactSets.js'
import type { BuilderRecipe } from '../../src/lib/hsfBuilder/types.js'

const note = loadLategameNote()
const safeguardRules = loadLategameSafeguardRules()

// ── Answer plumbing ───────────────────────────────────────────────────────────
// Question ids are content hashes in principle but pinned via `id=` in this preset;
// options are addressed by their DSL token, exactly as the sibling suite does.

/** Resolve one recipe-overrides option's id from its DSL token. */
const recipeOptionId = (token: string): string => {
  const found = findRecipeOptionByToken(resolveRecipeOverridesTags(note).questions, token)
  assert.ok(found, `recipe option ${token} missing from the preset note`)
  return found.option.id
}

/** The question owning a recipe option token (needed to address the answer map). */
const recipeQuestionIdFor = (token: string): string => {
  const found = findRecipeOptionByToken(resolveRecipeOverridesTags(note).questions, token)
  assert.ok(found, `recipe option ${token} missing from the preset note`)
  return found.question.id
}

/**
 * Replay a sequence of clicks against the note, starting from the shipped defaults.
 *
 * One resolution per click is what the dialog does, and it matters here: the account-level
 * buttons carry `+orescope_all`, so picking the farmable-skip radio only sticks because that
 * click (preferredId) releases the account option that forces the other answer. Folding both
 * clicks into one resolution would let the account directive win and silently revert the scope.
 */
type OverrideClick = { token: string; answer: string[]; removed?: boolean }
const clickSequence = (clicks: ReadonlyArray<OverrideClick>) => {
  let resolved = resolveRecipeOverridesTags(note)
  for (const click of clicks) {
    const answers: Record<string, string[]> = {}
    for (const q of resolved.questions) answers[q.id] = [...q.answer]
    answers[recipeQuestionIdFor(click.token)] = click.answer
    const id = recipeOptionId(click.token)
    // Unticking is signalled as removedId, not preferredId: preferredId re-adds the option.
    resolved = click.removed
      ? resolveRecipeOverridesTags(note, answers, undefined, id)
      : resolveRecipeOverridesTags(note, answers, id)
  }
  return resolved
}

/** The stored shape of the any-set Chaos Ore recipe: no set filter at all. */
const anySetOreRecipe = (): BuilderRecipe => ({
  appearance: { name: 'Chaos Ore' },
  keep: true,
  exportMode: 'active',
  rankCode: 0,
  rarityCode: 0,
  factionCode: 0,
  mainStatsV: [],
  minLevel: 16,
  maxLevel: 16,
  substatsV: [],
  fixedSubstatsV: [],
  minCount: 1,
  autoMinCount: false,
  autoSubstatFlex: false,
  minRequiredRolls: 0,
  autoMinRequiredRolls: true,
  lockedMinRequiredRolls: 0,
  artifactTypes: [],
  artifactSets: [],
  artifactMetaSets: [],
  // The tag the Optional 5 blocks select on.
  tags: ['if_not_reworked', 'ignore_by_safeguards', 'ore6legendary_allsets'],
})

/** Apply the overrides resolved from a click sequence to a stand-in any-set Chaos Ore recipe. */
const oreRecipeAfter = (clicks: ReadonlyArray<OverrideClick>): BuilderRecipe =>
  resolveRecipeOverridesEffectiveRecipe(anySetOreRecipe(), clickSequence(clicks).instructions)

/** Included (non-excluded) / excluded set ids of a resolved recipe. */
const includedSets = (recipe: BuilderRecipe): number[] =>
  (recipe.artifactSets ?? []).filter((e: { excluded?: boolean }) => !e.excluded).map((e: { id: number }) => Number(e.id))
const excludedSets = (recipe: BuilderRecipe): number[] =>
  (recipe.artifactSets ?? []).filter((e: { excluded?: boolean }) => e.excluded).map((e: { id: number }) => Number(e.id))

// ── Catch-all scope (safeguard domain, `metasets=any`) ────────────────────────

/** The four `Protect: Catch-All` rules after resolving q_catchsets to one option. */
const catchAllUnder = (token: string) => {
  // Safeguard answers are seeded from the recipe defaults, then the scope question is set.
  const resolved = resolveNoteSafeguardOverridesTags(note)
  const question = resolved.questions.find((q) => q.options.some((o) => o.token === token))
  assert.ok(question, `safeguard question owning ${token} missing from the preset note`)
  const optionId = question.options.find((o) => o.token === token)!.id
  const answers: Record<string, string[]> = {}
  for (const q of resolved.questions) answers[q.id] = [...q.answer]
  answers[question.id] = [optionId]
  const withScope = resolveNoteSafeguardOverridesTags(note, answers, optionId)
  const applied = applySafeguardOverrides(safeguardRules, withScope.instructions)
  return applied.filter((rule) => (rule.tags ?? []).includes('catchrest'))
}

test('the default catch-all scope keeps the curated metaset filter', () => {
  const rules = catchAllUnder('catchsets_useful')
  assert.ok(rules.length > 0, 'the preset ships catch-all rules')
  for (const rule of rules) {
    // The curated option writes nothing, so the stored eight-metaset filter survives.
    assert.ok(rule.combination.metaSetNames.includes('Damage'), 'curated scope leaves the stored filter alone')
    assert.equal(rule.combination.sets.length, 0, 'curated scope introduces no explicit set')
  }
})

test('`metasets=any` widens the catch-all to every gear set', () => {
  const rules = catchAllUnder('catchsets_all')
  assert.ok(rules.length > 0, 'the preset ships catch-all rules')
  for (const rule of rules) {
    // Empty metasets AND empty sets is exactly how HSF spells "any gear set".
    assert.deepEqual(rule.combination.metaSetNames, [], 'the clear keyword empties the metaset filter')
    assert.deepEqual(rule.combination.sets, [], 'clearing must not leave an explicit set list behind')
  }
})

test('the limited-sets scope narrows the catch-all to the three scarce metasets', () => {
  const rules = catchAllUnder('catchsets_limited')
  for (const rule of rules) {
    assert.deepEqual(
      [...rule.combination.metaSetNames].sort(),
      ['Damage - Limited Sets', 'Debuffer - Limited Sets', 'Support - Limited Sets'],
      'quoted multi-word metaset names replace the filter',
    )
  }
})

// ── Chaos Ore any-set scope (recipe domain) ───────────────────────────────────

test('the default ore scope leaves the any-set rule genuinely any-set', () => {
  const recipe = oreRecipeAfter([{ token: 'orescope_all', answer: [recipeOptionId('orescope_all')] }])
  assert.deepEqual(recipe.artifactMetaSets ?? [], [], 'no metaset filter under the every-set scope')
  // `orescope_all` unsets all four fine-tune boxes, so their `else` branches run and stage bare
  // exclusions. On an implicit-any selection those resolve to "any set" (they delete out of an
  // empty union), which is harmless — but an INCLUDE would silently narrow the rule to one set.
  assert.deepEqual(includedSets(recipe), [], 'the every-set scope never narrows to a single set')
})

test('the farmable-skip scope swaps in the Not Farmable metaset', () => {
  const recipe = oreRecipeAfter([{ token: 'orescope_notfarm', answer: [recipeOptionId('orescope_notfarm')] }])
  assert.deepEqual(recipe.artifactMetaSets ?? [], ['Not Farmable'], 'the scope option replaces the metaset filter')
})

test('a ticked fine-tune box adds its farmable set back', () => {
  // Speed is farmable (Dragon's Lair) so it is NOT in Not Farmable — ticking must add it back.
  const recipe = oreRecipeAfter([
    { token: 'orescope_notfarm', answer: [recipeOptionId('orescope_notfarm')] },
    { token: 'orescope_speed', answer: [recipeOptionId('orescope_speed')] },
  ])
  assert.ok(includedSets(recipe).includes(ArtifactSet.Speed), 'ticked Speed is added back as an include')
  // Composition check: Savage stays unticked in the same question, and its `else` exclusion must
  // survive alongside the Speed include rather than being dropped by a last-writer-wins fold.
  assert.ok(excludedSets(recipe).includes(ArtifactSet.Savage), 'sibling boxes compose on one recipe')
})

test('an unticked fine-tune box excludes a set the metaset would otherwise supply', () => {
  // Pinpoint IS inside Not Farmable, so unticking has to actively EXCLUDE it: a bare remove
  // would not reach an entry the metaset supplies. Answer the fine-tune question with nothing.
  const recipe = oreRecipeAfter([
    { token: 'orescope_notfarm', answer: [recipeOptionId('orescope_notfarm')] },
    { token: 'orescope_pinpoint', answer: [], removed: true },
  ])
  assert.ok(excludedSets(recipe).includes(ArtifactSet.Pinpoint), 'unticked Pinpoint is excluded from the metaset')
})

// ── The metaset the ore scope depends on ──────────────────────────────────────

test('Not Farmable excludes exactly the three farmable dungeons', () => {
  const notFarmable = loadLategameMetasets().find((m) => m.name === 'Not Farmable')
  assert.ok(notFarmable, 'the preset ships the Not Farmable metaset')
  // Spot-check both directions: one set per farmable dungeon is out, scarce sets are in.
  for (const name of ['Speed', 'Savage', 'Life', 'Daze']) {
    assert.ok(!notFarmable.setNames.includes(name), `farmable set ${name} stays out of Not Farmable`)
  }
  for (const name of ['Merciless', 'Pinpoint', 'Chronophage', 'Mercurial']) {
    assert.ok(notFarmable.setNames.includes(name), `scarce set ${name} is part of Not Farmable`)
  }
})
