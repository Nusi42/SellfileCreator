/* eslint import/no-unused-modules: off */
/**
 * safeguard-groups-normalize.test.ts
 *
 * A safeguard GROUP is a contiguous run of rules sharing one `group.id`, with the group's
 * settings carried inline on every member. `normalizeSafeguardGroups` is the repair pass that
 * keeps the array describing POSSIBLE groups wherever it came from — a hand-edited file, an
 * append import, a paste, a drag that split a run:
 *
 *  1. an id names ONE run (a repeated id after a gap gets a fresh id, settings cloned);
 *  2. a run has at least two members (a group of one is dissolved);
 *  3. every member of a run carries the same settings (the edited member wins, else the head).
 *
 * Repair NEVER drops an entry (CLAUDE.md: never silently discard user data), and a list with no
 * groups is returned by identity so pre-group files load and re-save byte-identically.
 *
 * Run resolution itself lives in Rust (wasm/rule_engine_core/src/safeguards/groups.rs) and has
 * its own #[test]s; this suite covers the TypeScript facade, the repair and the write-back.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createFactorySafeguardBuilderDefaults,
  normalizeSafeguardRule,
  type SafeguardGroupSettings,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  normalizeSafeguardGroups,
  resolveSafeguardGroups,
  safeguardGroupRunIndices,
  safeguardGroupRunRange,
  safeguardGroupSettingsAt,
  safeguardListHasGroups,
} from '../../src/lib/safeguardGroups.js'

// Group settings with a given id and count; chips at the per-rule default.
const settings = (id: string, requiredCount = 2): SafeguardGroupSettings => ({
  id,
  requiredCount,
  countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
})

// A plain rule, named so failures are readable.
const rule = (name: string): SafeguardRule => ({ ...createFactorySafeguardBuilderDefaults(), appearance: { name } })

// A member of the given group.
const member = (name: string, group: SafeguardGroupSettings): SafeguardRule => ({ ...rule(name), group })

// A divider.
const separator = (name: string): SafeguardRule => ({ ...rule(name), separator: true })

// The group id every entry ended up with (null when ungrouped), for compact assertions.
const idsOf = (rules: readonly SafeguardRule[]): Array<string | null> => rules.map((r) => r.group?.id ?? null)

test('a group-free list is returned unchanged, by identity', () => {
  const rules = [rule('a'), rule('b'), separator('# section'), rule('c')]
  // Identity matters: downstream memos (including the resolver's own) key on it, so a no-op
  // repair must not invalidate them.
  assert.equal(normalizeSafeguardGroups(rules), rules)
  assert.equal(safeguardListHasGroups(rules), false)
})

test('adjacent members form one run and report their range', () => {
  const g = settings('g')
  const rules = normalizeSafeguardGroups([rule('a'), member('b', g), member('c', g), member('d', g), rule('e')])
  assert.deepEqual(safeguardGroupRunRange(rules, 2), { start: 1, end: 4 })
  assert.deepEqual(safeguardGroupRunIndices(rules, 3), [1, 2, 3])
  assert.equal(safeguardGroupRunRange(rules, 0), null)
  assert.deepEqual(safeguardGroupRunIndices(rules, 4), [4])
  assert.equal(safeguardListHasGroups(rules), true)
  const resolved = resolveSafeguardGroups(rules)
  assert.deepEqual(resolved.runStarts, [-1, 1, 1, 1, -1])
  assert.deepEqual(resolved.runLens, [0, 3, 3, 3, 0])
})

test('a run of one is dissolved — a group needs two members', () => {
  const rules = normalizeSafeguardGroups([rule('a'), member('lonely', settings('g')), rule('b')])
  assert.deepEqual(idsOf(rules), [null, null, null])
  // Nothing was dropped.
  assert.equal(rules.length, 3)
})

test('a repeated id after a gap becomes a second group with cloned settings', () => {
  const g = settings('g', 4)
  const rules = normalizeSafeguardGroups([member('a', g), member('b', g), rule('x'), member('c', g), member('d', g)])
  const ids = idsOf(rules)
  assert.equal(ids[0], 'g')
  assert.equal(ids[1], 'g')
  assert.equal(ids[2], null)
  assert.notEqual(ids[3], 'g', 'the later run must be re-idd')
  assert.equal(ids[3], ids[4], 'both members of the later run share the new id')
  // The promise travels with the new id.
  assert.equal(rules[3]?.group?.requiredCount, 4)
})

test('a separator ends a run and never joins one', () => {
  const g = settings('g')
  const rules = normalizeSafeguardGroups([member('a', g), member('b', g), separator('#'), member('c', g), member('d', g)])
  assert.deepEqual(safeguardGroupRunRange(rules, 0), { start: 0, end: 2 })
  assert.equal(safeguardGroupRunRange(rules, 2), null)
  assert.deepEqual(safeguardGroupRunRange(rules, 3), { start: 3, end: 5 })
  assert.notEqual(rules[3]?.group?.id, 'g')
})

test("without a previous list, the run's head decides the settings every member carries", () => {
  const rules = normalizeSafeguardGroups([member('a', settings('g', 5)), member('b', settings('g', 1))])
  assert.equal(rules[1]?.group?.requiredCount, 5)
  assert.equal(safeguardGroupSettingsAt(rules, 1)?.requiredCount, 5)
})

test('with a previous list, the member that was just edited wins over the head', () => {
  const g = settings('g', 5)
  const previous = normalizeSafeguardGroups([member('a', g), member('b', g), member('c', g)])
  // The builder replaced entry 1 with a new object carrying a new group count.
  const edited: SafeguardRule = { ...(previous[1] as SafeguardRule), group: settings('g', 9) }
  const next = normalizeSafeguardGroups([previous[0] as SafeguardRule, edited, previous[2] as SafeguardRule], previous)
  assert.deepEqual(next.map((r) => r.group?.requiredCount), [9, 9, 9])
  // A list that already agrees is returned by identity.
  assert.equal(normalizeSafeguardGroups(next, next), next)
})

test('a fresh member that already carries the head copy does not spuriously win', () => {
  const g = settings('g', 5)
  const previous = normalizeSafeguardGroups([member('a', g), member('b', g)])
  // Inserted new object (a paste/drop) with an identical copy: nothing should change.
  const inserted = member('c', settings('g', 5))
  const next = normalizeSafeguardGroups([...previous, inserted], previous)
  assert.deepEqual(next.map((r) => r.group?.requiredCount), [5, 5, 5])
})

test('repair never discards an entry, whatever it carried', () => {
  const rules = [member('a', settings('x')), rule('b'), member('c', settings('x')), separator('#'), member('d', settings('y'))]
  const next = normalizeSafeguardGroups(rules)
  assert.equal(next.length, rules.length)
  assert.deepEqual(next.map((r) => r.appearance?.name), ['a', 'b', 'c', '#', 'd'])
})

test('the shipped lategame preset still loads as a flat, group-free list', () => {
  // Regression guard: the preset fakes structure with '#'-prefixed separator labels, and those
  // must stay pure line-style hints — never inferred into groups.
  const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8')) as {
    Safeguards: unknown[]
  }
  const rules = sfc.Safeguards
    .map((entry) => normalizeSafeguardRule(entry))
    .filter((entry): entry is SafeguardRule => entry !== null)
  assert.ok(rules.length > 0, 'the preset must contain safeguard entries')
  assert.equal(safeguardListHasGroups(rules), false, 'no preset entry may load as a group member')
  assert.equal(normalizeSafeguardGroups(rules), rules)
})
