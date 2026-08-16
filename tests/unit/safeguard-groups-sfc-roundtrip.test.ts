/* eslint import/no-unused-modules: off */
/**
 * safeguard-groups-sfc-roundtrip.test.ts
 *
 * SFC persistence for safeguard groups. The contract has two halves and the second is the one
 * that protects existing users:
 *
 *  1. A grouped list survives write → read → write unchanged (membership, the group's count and
 *     chips, every member's own count).
 *  2. Every file written BEFORE groups existed re-serializes byte-identically. `Group` is
 *     omitted on ungrouped rules precisely so that holds — this suite proves it against the
 *     shipped 154-entry lategame preset rather than a synthetic fixture, because the preset is
 *     what real users load.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReadableSafeguardRuleEntry } from '../../src/lib/sfcIO.js'
import {
  createFactorySafeguardBuilderDefaults,
  normalizeSafeguardRule,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  normalizeSafeguardGroups,
  safeguardGroupRunRange,
  safeguardGroupSettingsAt,
} from '../../src/lib/safeguardGroups.js'
import { loadLategameSafeguardRules, loadLategameSfc } from '../setup/presetFixtures.js'

// Writes a rule list out and reads it straight back, the way a save/load cycle does.
const roundTrip = (rules: readonly SafeguardRule[]): SafeguardRule[] => normalizeSafeguardGroups(
  rules
    .map((rule) => normalizeSafeguardRule(buildReadableSafeguardRuleEntry(rule)))
    .filter((rule): rule is SafeguardRule => rule !== null),
)

const perSet = { perRule: false, perSet: true, perFaction: false, perMainStat: false, perSlot: false }

test('a grouped list survives a save/load round trip intact', () => {
  // The motivating shape: two accessory rules sharing one per-set promise, then a loose rule.
  const group = { id: 'g-acc', requiredCount: 3, countMode: perSet }
  const original = normalizeSafeguardGroups([
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: '% Rings' }, requiredCount: 2, group },
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: 'SPD banners' }, requiredCount: 4, group },
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: 'Loose rule' } },
  ])
  const reloaded = roundTrip(original)
  assert.equal(reloaded.length, original.length)
  assert.deepEqual(safeguardGroupRunRange(reloaded, 0), { start: 0, end: 2 })
  assert.equal(safeguardGroupRunRange(reloaded, 2), null)
  const settings = safeguardGroupSettingsAt(reloaded, 1)
  assert.equal(settings?.id, 'g-acc')
  assert.equal(settings?.requiredCount, 3)
  assert.equal(settings?.countMode.perSet, true)
  // Members keep their own counts — the group's number never overwrites them.
  assert.deepEqual(reloaded.map((r) => r.requiredCount), [2, 4, 1])
})

test('a second round trip is a fixed point', () => {
  const group = { id: 'g', requiredCount: 2, countMode: perSet }
  const once = roundTrip([
    { ...createFactorySafeguardBuilderDefaults(), group },
    { ...createFactorySafeguardBuilderDefaults(), group },
  ])
  const twice = roundTrip(once)
  assert.deepEqual(
    twice.map((rule) => buildReadableSafeguardRuleEntry(rule)),
    once.map((rule) => buildReadableSafeguardRuleEntry(rule)),
  )
})

test('every safeguard entry in the shipped lategame preset re-serializes byte-identically', () => {
  const rules = loadLategameSafeguardRules()
  const storedEntries = loadLategameSfc().Safeguards ?? []
  assert.ok(rules.length > 0)
  for (const [index, entry] of storedEntries.entries()) {
    const written = buildReadableSafeguardRuleEntry(rules[index] as SafeguardRule)
    assert.equal('Group' in written, false, `preset entry ${index} must not gain a Group key`)
    assert.deepEqual(written, entry, `preset entry ${index} must round-trip byte-identically`)
  }
})

test('a pre-group entry gains no group keys on load or save', () => {
  const loaded = normalizeSafeguardRule({
    requiredCount: 2,
    activation: 'protectExisting',
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    tuple: { slots: [], sets: [], ranks: [], rarities: [], mainStats: [], factions: [] },
  })
  assert.ok(loaded)
  assert.equal(loaded!.group, undefined)
  assert.equal('Group' in buildReadableSafeguardRuleEntry(loaded!), false)
})
