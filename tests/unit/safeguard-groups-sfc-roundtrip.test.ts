/* eslint import/no-unused-modules: off */
/**
 * safeguard-groups-sfc-roundtrip.test.ts
 *
 * SFC persistence for safeguard groups. A group persists POSITIONALLY: one entry carrying the
 * settings once plus the `members` it holds. The nesting IS the grouping, so nothing on disk needs
 * a unique id and none is written — ids are minted per load. The contract has two halves and the
 * second is the one that protects existing users:
 *
 *  1. A grouped list survives write → read → write unchanged (membership, the group's count and
 *     chips, every member's own count) — everything except the id, which is deliberately not
 *     persisted.
 *  2. A rule record gains no key from the feature — an UNGROUPED entry re-serializes byte-
 *     identically. This suite proves it against the shipped lategame preset rather than a
 *     synthetic fixture, because the preset is what real users load. The preset now ships
 *     groups of its own, so the check runs at LIST level: a group occupies one nested entry
 *     holding N members, so stored index and rule index no longer line up one-to-one.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReadableSafeguardEntries,
  buildReadableSafeguardRuleEntry,
  parseReadableSafeguardEntries,
} from '../../src/lib/sfcIO.js'
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

// Writes a rule list out and reads it straight back, the way a save/load cycle does — through the
// list-level pair, since a group persists as ONE nested entry rather than per-member keys.
const roundTrip = (rules: readonly SafeguardRule[]): SafeguardRule[] => normalizeSafeguardGroups(
  parseReadableSafeguardEntries(buildReadableSafeguardEntries(rules)),
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
  // The id is NOT persisted — the nesting identifies the group — so a fresh one is minted on load.
  // What must survive is that both members share it, which the run range above already proves.
  assert.ok(settings?.id)
  assert.notEqual(settings?.id, 'g-acc', 'the on-disk shape carries no id to restore')
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
  // Compared at the LIST level: the group's settings live on the nested entry, not on any member,
  // so a per-rule projection would compare blind to exactly what this test is about.
  assert.deepEqual(buildReadableSafeguardEntries(twice), buildReadableSafeguardEntries(once))
})

test('the shipped lategame preset re-serializes byte-identically, groups and all', () => {
  const rules = loadLategameSafeguardRules()
  const storedEntries = loadLategameSfc().Safeguards ?? []
  assert.ok(rules.length > 0)
  // List level, not per index: each group collapses N loaded rules back into ONE nested entry,
  // so the written list is what must match the file — entry-for-entry indices would not align.
  const written = buildReadableSafeguardEntries(rules)
  assert.equal(written.length, storedEntries.length, 'the entry count must survive a round trip')
  assert.deepEqual(written, storedEntries, 'the preset must round-trip byte-identically')
  // The half that protects pre-group files: an UNGROUPED rule still gains no Group key.
  for (const rule of rules) {
    if (rule.group != null) continue
    assert.equal('Group' in buildReadableSafeguardRuleEntry(rule), false,
      `ungrouped rule "${rule.appearance?.name ?? ''}" must not gain a Group key`)
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
