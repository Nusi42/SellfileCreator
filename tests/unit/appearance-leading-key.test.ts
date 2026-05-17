/* eslint import/no-unused-modules: off */

// Locks in the SSOT "spread FIRST" contract from appearancePersistField:
// the `appearance` record must lead the serialized entry for both recipes
// and safeguard rules. Without this guard, a future reorder of the entry
// literals could silently demote the field below other keys.

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSfcPayload } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { createFactorySafeguardBuilderDefaults } from '../../src/lib/safeguards.js'
import { readAppearanceFromRecord } from '../../src/lib/nameAppearance.js'

// Minimal BuilderRecipe shaped like the other sfc-io unit tests; appearance is the only field under test.
const buildRecipe = (name: string): BuilderRecipe => ({
  appearance: { name, fgColor: '#FF8800' },
  keep: true,
  exportMode: 'active',
  rankCode: 0,
  rarityCode: 0,
  factionCode: 0,
  mainStatsV: [],
  minLevel: 0,
  maxLevel: 16,
  substatsV: [],
  fixedSubstatsV: [],
  minCount: 0,
  autoMinCount: true,
  autoSubstatFlex: false,
  minRequiredRolls: 0,
  autoMinRequiredRolls: true,
  lockedMinRequiredRolls: 0,
  artifactTypes: [],
  artifactSets: [],
  artifactMetaSets: [],
})

test('SFC writer emits `appearance` as the leading key in recipe entries', () => {
  const payload = buildSfcPayload({
    version: 'appearance-leading-key',
    metasets: [],
    substatTargets: defaultSubstatTargets(),
    recipes: [buildRecipe('Leading Recipe')],
  }) as Record<string, unknown>
  const recipe = ((payload['Recipes'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(recipe, 'expected exported recipe')
  // Object.keys preserves insertion order for string keys, which is exactly the contract
  // appearancePersistField relies on by being spread first into the entry literal.
  assert.equal(Object.keys(recipe)[0], 'appearance', 'appearance must be the first key of the recipe entry')
})

test('SFC writer emits `appearance` as the leading key in safeguard entries', () => {
  // Build a default rule then attach an appearance so the entry has something to lead with.
  const rule = createFactorySafeguardBuilderDefaults()
  rule.appearance = { name: 'Leading Safeguard', fgColor: '#22CC44' }
  const payload = buildSfcPayload({
    version: 'appearance-leading-key',
    metasets: [],
    substatTargets: defaultSubstatTargets(),
    recipes: [],
    safeguardRules: [rule],
    safeguardsEnabled: true,
  }) as Record<string, unknown>
  const entry = ((payload['Safeguards'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(entry, 'expected exported safeguard entry')
  assert.equal(Object.keys(entry)[0], 'appearance', 'appearance must be the first key of the safeguard entry')
})

test('readAppearanceFromRecord ignores non-plain-object appearance values and falls back to flat fields', () => {
  // Array appearance is exotic — must not short-circuit the nested branch.
  const fromArray = readAppearanceFromRecord({
    appearance: [{ name: 'should-be-ignored' }] as unknown as Record<string, unknown>,
    name: 'Flat Wins',
    fgcolor: '#112233',
  })
  assert.deepEqual(fromArray, { name: 'Flat Wins', fgColor: '#112233' })
})
