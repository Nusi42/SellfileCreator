/**
 * lategame-gearset-scope.test.ts
 *
 * Pins "Optional 5 — Gear-set scope" in presets/lategame.sfc: the catch-all safeguard
 * scope question (q_catchsets) and the two per-rank Chaos Ore set cards (q_ore6sets /
 * q_ore5sets).
 *
 * These blocks are the shipped preset's only consumers of the `metasets=any` /
 * `gearsets=any` clear keywords and the only place an override widens a rule back to
 * "any gear set". The ore cards additionally carry a PARITY guarantee: their default
 * ticks must resolve to exactly the set pool the pre-card recipes had.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadLategameMetasets, loadLategameNote, loadLategameRecipes, loadLategameSafeguardRules } from '../setup/presetFixtures.js'
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
import { artifactSetIdByName } from '../../src/lib/safeguards.js'
import { resolveArtifactSetSelections } from '../../src/lib/gearSets/selection.js'
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
 * buttons force every ore set box, so a hand-made tick only sticks because that click
 * (preferredId, or removedId for an untick) releases the tier option forcing the other
 * answer. Folding clicks into one resolution would let the tier directive win instead.
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

/** Resolve a gear-set display name to its numeric id (throws on a preset typo). */
const setIdByName = (name: string): number => {
  const id = artifactSetIdByName.get(name.trim().toLowerCase())
  assert.ok(id != null, `preset names an unknown gear set: ${name}`)
  return Number(id)
}

/** The preset's metasets in the shape resolveArtifactSetSelections expects. */
const presetMetasets = () => loadLategameMetasets().map((m) => ({
  name: m.name,
  sets: m.setNames.map((n) => setIdByName(n)),
}))

/** The default answer of a question, plus/minus one option token. */
const answerWith = (questionId: string, token: string): string[] => {
  const q = resolveRecipeOverridesTags(note).questions.find((x) => x.id === questionId)!
  return [...q.answer, recipeOptionId(token)]
}
const answerWithout = (questionId: string, token: string): string[] => {
  const q = resolveRecipeOverridesTags(note).questions.find((x) => x.id === questionId)!
  const drop = recipeOptionId(token)
  return q.answer.filter((id) => id !== drop)
}

/** Included (non-excluded) set ids of a resolved recipe. */
const includedSets = (recipe: BuilderRecipe): number[] =>
  (recipe.artifactSets ?? []).filter((e: { excluded?: boolean }) => !e.excluded).map((e: { id: number }) => Number(e.id))

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


// ── Chaos Ore per-rank set cards (recipe domain) ──────────────────────────────
//
// q_ore5sets / q_ore6sets replaced the old scope radio + fine-tune pair. Each card is
// exactly eight set checkboxes, and the DEFAULT ticks must reproduce the
// pre-change recipes exactly — that parity is the point of the whole card, so it is
// asserted on the RESOLVED set list (metasets expanded, exclusions applied), not on the
// raw fields, which can differ while meaning the same thing.

/** Resolve a rank card's effect onto the stored ore recipe for that rank. */
const oreRecipeFor = (rank: 5 | 6, clicks: ReadonlyArray<OverrideClick> = []): BuilderRecipe => {
  const stored = storedOreRecipe(rank)
  return resolveRecipeOverridesEffectiveRecipe(stored, clickSequence(clicks).instructions)
}

/** The shipped stored shape of one rank's Epic ore recipe, straight from the preset. */
const storedOreRecipe = (rank: 5 | 6): BuilderRecipe => {
  const raw = loadLategameRecipes().find((r) => (r.Tags ?? []).includes(`ore${rank}epic`))
  assert.ok(raw, `preset ships an ore${rank}epic recipe`)
  return {
    appearance: raw.appearance,
    keep: true,
    exportMode: 'active',
    rankCode: 0,
    rarityCode: 0,
    factionCode: 0,
    mainStatsV: [],
    minLevel: raw.minLevel,
    maxLevel: raw.maxLevel,
    substatsV: [],
    fixedSubstatsV: [],
    minCount: 1,
    autoMinCount: false,
    autoSubstatFlex: false,
    minRequiredRolls: 0,
    autoMinRequiredRolls: true,
    lockedMinRequiredRolls: 0,
    artifactTypes: [],
    artifactSets: (raw.artifactSetNames ?? []).map((s) => ({ id: setIdByName(typeof s === 'string' ? s : (s.name ?? '')) })),
    artifactMetaSets: raw.artifactMetaSetNames ?? [],
    tags: raw.Tags ?? [],
  } as unknown as BuilderRecipe
}

/** Fully resolved gear-set ids of a recipe: metasets expanded, exclusions subtracted. */
const resolvedSetIds = (recipe: BuilderRecipe): Set<number> => new Set(
  resolveArtifactSetSelections({
    selections: recipe.artifactSets as never,
    metasetIds: recipe.artifactMetaSets as never,
    metasets: presetMetasets(),
  }).resolved.map(Number),
)

test('each rank card ships exactly the eight set checkboxes', () => {
  for (const rank of [5, 6] as const) {
    const q = resolveRecipeOverridesTags(note).questions.find((x) => x.id === `q_ore${rank}sets`)
    assert.ok(q, `q_ore${rank}sets is present`)
    // No "any set" escape: unticking everything falls back to the recipe's stored metaset
    // pool minus the unticked sets, so there is no all-sets state for an option to express.
    assert.equal(q.options.length, 8, `${rank}★ card is eight sets, nothing else`)
    assert.ok(!q.options.some((o) => o.token.endsWith('_any')), 'the any-set escape is gone')
  }
})

test('the ore cards come before the catch-all card, 5★ first', () => {
  // Authored order is the display order, and it runs cheapest-decision-first: the two
  // per-rank Chaos Ore cards (5★ then 6★), then the catch-all safety net.
  const ids = resolveRecipeOverridesTags(note).questions.map((q) => q.id).filter((id) => /^q_ore\dsets$/.test(id))
  assert.deepEqual(ids, ['q_ore5sets', 'q_ore6sets'], '5★ card precedes the 6★ card')
})

test('default ticks reproduce the pre-change ore scope exactly (both ranks)', () => {
  // The old 6★ rules carried 5 metasets + an explicit Savage; the 5★ rules carried 4
  // metasets. Ticking must land on the SAME resolved set pool — nothing added, nothing
  // lost — or existing users silently start keeping/selling different gear.
  for (const rank of [5, 6] as const) {
    const stored = resolvedSetIds(storedOreRecipe(rank))
    const effective = resolvedSetIds(oreRecipeFor(rank))
    const added = [...effective].filter((id) => !stored.has(id))
    const lost = [...stored].filter((id) => !effective.has(id))
    assert.deepEqual(added, [], `${rank}★ defaults add no set to the stored scope`)
    assert.deepEqual(lost, [], `${rank}★ defaults drop no set from the stored scope`)
  }
})

test('the 6★ card leaves the separate any-set rule untouched', () => {
  // ore6legendary_allsets is the "6★ from ANY gear set" keep with its own question. It is
  // deliberately absent from the card's selector: writing set includes onto an unfiltered
  // rule would narrow it to the eight listed sets.
  const raw = loadLategameRecipes().find((r) => (r.Tags ?? []).includes('ore6legendary_allsets'))
  assert.ok(raw, 'preset ships the any-set ore recipe')
  const recipe = { ...storedOreRecipe(6), tags: raw.Tags, artifactMetaSets: [], artifactSets: [] } as unknown as BuilderRecipe
  const effective = resolveRecipeOverridesEffectiveRecipe(recipe, clickSequence([]).instructions)
  assert.deepEqual(effective.artifactMetaSets ?? [], [], 'no metaset filter is written onto it')
  assert.deepEqual(includedSets(effective), [], 'no set include narrows it')
})

test('unticking a set excludes it, so a metaset-supplied set really drops out', () => {
  // Cruel arrives via the metaset pool, so removing it needs an EXCLUSION — a bare remove
  // cannot reach an entry a metaset supplies. This is what the per-option `else` is for.
  const before = resolvedSetIds(oreRecipeFor(6))
  assert.ok(before.has(ArtifactSet.Cruel), 'Cruel is in the default 6★ pool')
  const after = resolvedSetIds(oreRecipeFor(6, [
    { token: 'ore6set_cruel', answer: answerWithout('q_ore6sets', 'ore6set_cruel'), removed: true },
  ]))
  assert.ok(!after.has(ArtifactSet.Cruel), 'unticked Cruel leaves the resolved pool')
})

test('ticking a set the pool lacks adds it (5★ Speed)', () => {
  // Speed sits outside the 5★ metasets (it arrives via Need 4 Speed, a 6★-only metaset),
  // so ticking it on the 5★ card must ADD it rather than merely un-exclude it.
  const before = resolvedSetIds(oreRecipeFor(5))
  assert.ok(!before.has(ArtifactSet.Speed), 'Speed is outside the default 5★ pool')
  const after = resolvedSetIds(oreRecipeFor(5, [
    { token: 'ore5set_speed', answer: answerWith('q_ore5sets', 'ore5set_speed') },
  ]))
  assert.ok(after.has(ArtifactSet.Speed), 'ticked Speed joins the 5★ pool')
})


test('the Chaos Ore section names the metaset pool and points at the table', () => {
  // The pool is stated ONCE in the Optional 2 section prose rather than repeated on each
  // rank card — the two pools differ by a single metaset, so a per-card list was noise.
  // Asserted against the raw note: this is prose, not part of any parsed question.
  const POOLS = ['Damage - Limited Sets', 'Support - Limited Sets', 'Accessory Specific', 'Debuffer - Limited Sets']
  const intro = note.split('\n').find((l) => l.startsWith('This applies to the scarce sets'))
  assert.ok(intro, 'the Chaos Ore section carries the pool statement')
  for (const pool of POOLS) assert.ok(intro.includes(pool), `the intro names ${pool}`)
  // Deliberately NOT naming the 6★-only metaset here: the one-metaset rank difference is
  // noise in a sentence nobody reads to make a decision, and the metaset table carries the
  // exact membership anyway.
  assert.ok(!intro.includes('Need 4 Speed'), 'the intro does not spell out the rank difference')
  assert.ok(/metaset table/i.test(intro), 'the intro points at the metaset table')
})

test('the catch-all prompt spells out what its default scope leaves out', () => {
  // Measured against the shipped preset: the eight curated metasets cover 41 of the 64
  // artifact-capable sets. The other 23 are not a random remainder — they fall into exactly
  // three buckets, and a user deciding whether to widen the net needs to know which:
  //   *Useless*  — Life, Offense, Defense, Resistance, Divine Offense
  //   *Utility*  — Stun, Provoke, Toxic, Daze, Cursed, Frost, Destroy, Retaliation, …
  //   no metaset — Critical Rate, Fury, Frenzy, Avenging, Stalwart, Curing, Fatal, …
  // The third bucket is the one that is impossible to discover from the metaset table alone,
  // so the prompt naming it is the whole point of this assertion.
  const q = resolveNoteSafeguardOverridesTags(note).questions
    .find((x) => x.options.some((o) => o.token === 'catchsets_useful'))
  assert.ok(q, 'the catch-all question is present')
  assert.ok(/Useless/.test(q.prompt), 'the prompt names the Useless metaset as excluded')
  assert.ok(/Utility/.test(q.prompt), 'the prompt names the Utility metaset as excluded')
  assert.ok(/no metaset/i.test(q.prompt), 'the prompt mentions sets in no metaset at all')
  assert.ok(/metaset table/i.test(q.prompt), 'the prompt points at the metaset table')

  // And the widening option promises exactly those three buckets back.
  const all = q.options.find((o) => o.token === 'catchsets_all')
  assert.ok(all, 'the every-gear-set option is present')
  const detail = `${all.label} ${all.detail ?? ''}`
  assert.ok(/Useless/.test(detail) && /Utility/.test(detail) && /no metaset/i.test(detail),
    'the every-gear-set option says which groups it adds')
})
