import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// Warm the WASM rule engine — parseSfcObject normalizes safeguards through it.
import '../setup/wasm-warmup.js'
import { parseSfcObject } from '../../src/lib/sfcIO.js'
import {
  resolveRecipeOverridesTags,
  applyAllRecipeOverrides,
  seedSafeguardAnswersFromRecipeDefaults,
} from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags, applySafeguardOverrides } from '../../src/lib/noteSafeguardOverrides.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'

// The invariant this whole re-baseline establishes: with the default `* Lategame` tier selected
// (a fresh load), the dynamic overrides must be a TOTAL no-op over the stored recipes/safeguards.
// That is what makes "disable overrides" land the user on native Lategame — the stored rules ARE
// Lategame, so the override layer changes nothing until the user picks a different tier/answer.
// If a future preset edit reintroduces drift (base ≠ resolved-Lategame), this test fails loudly.

const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))
const note: string = (sfc.Note as string[]).join('\n')

// Parse the shipped preset into the builder model exactly like a file import.
const parsed = parseSfcObject(sfc, { metasets: [], substatTargets: defaultSubstatTargets() })

// Resolve + apply the DEFAULT (Lategame) overrides across both domains.
const applyDefaultLategame = () => {
  const recTags = resolveRecipeOverridesTags(note) // empty answers → the `*` Lategame default
  const recipes = applyAllRecipeOverrides(parsed.recipes, parsed.substatTargets, recTags.instructions)
  const seeded = seedSafeguardAnswersFromRecipeDefaults(note)
  const sgRes = resolveNoteSafeguardOverridesTags(note, seeded)
  const safeguards = applySafeguardOverrides(parsed.safeguardRules ?? [], sgRes.instructions)
  return { recipes: recipes.recipes, substatTargets: recipes.substatTargets, safeguards, seeded }
}

test('default Lategame overrides are a total no-op over the stored recipes', () => {
  const { recipes } = applyDefaultLategame()
  assert.equal(recipes.length, parsed.recipes.length, 'recipe count is unchanged')
  // Deep-equal every recipe: the applied recipe must byte-match the stored base (no field moved).
  for (let i = 0; i < parsed.recipes.length; i++) {
    assert.deepEqual(recipes[i], parsed.recipes[i], `recipe #${i} is untouched by default Lategame`)
  }
})

test('default Lategame overrides are a total no-op over the stored safeguards', () => {
  const { safeguards } = applyDefaultLategame()
  assert.equal(safeguards.length, (parsed.safeguardRules ?? []).length, 'safeguard count is unchanged')
  for (let i = 0; i < (parsed.safeguardRules ?? []).length; i++) {
    assert.deepEqual(safeguards[i], parsed.safeguardRules![i], `safeguard #${i} is untouched by default Lategame`)
  }
})

test('the default seed writes no slider answers (sliders resolve from re-baselined default=)', () => {
  // With Lategame forcing nothing, the load-time seed must produce an empty answer map — the sliders
  // then resolve via their own `default=`, which was re-baselined to the Lategame values.
  const { seeded } = applyDefaultLategame()
  assert.deepEqual(seeded, {}, 'a fresh Lategame load seeds no slider answers')
})

test('a non-default tier (Endgame) still changes recipes — the override machinery is live', () => {
  // Guard against the invariant passing trivially because overrides became dead. Endgame diffs
  // against the (now Lategame) base and MUST still mutate rules.
  const acctQ = resolveRecipeOverridesTags(note).questions.find((q) => q.options.some((o) => o.token === 'endgame'))!
  const egId = acctQ.options.find((o) => o.token === 'endgame')!.id
  const egTags = resolveRecipeOverridesTags(note, { [acctQ.id]: [egId] }, egId)
  const eg = applyAllRecipeOverrides(parsed.recipes, parsed.substatTargets, egTags.instructions)
  let changed = 0
  for (let i = 0; i < parsed.recipes.length; i++) {
    if (JSON.stringify(eg.recipes[i]) !== JSON.stringify(parsed.recipes[i])) changed++
  }
  assert.ok(changed > 0, `Endgame must still change some recipes (changed ${changed})`)
})
