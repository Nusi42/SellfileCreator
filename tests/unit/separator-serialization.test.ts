/**
 * separator-serialization.test.ts
 *
 * Separators (recipe exportMode='separator' and SafeguardRule.separator) persist
 * MINIMALLY — appearance plus the marker field, nothing else — and rehydrate to
 * working defaults on load. Safeguard separators are additionally inert: never
 * active, and their flag survives clone/snapshot/fingerprint plumbing.
 *
 * Group settings (SafeguardRule.group) are covered here too: they ride the SAME clone →
 * snapshot → fingerprint → normalize plumbing, so the contract belongs beside the separator one
 * rather than in a parallel file.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReadableRecipe,
  buildReadableSafeguardEntries,
  buildReadableSafeguardRuleEntry,
  normalizeRecipe,
  parseReadableSafeguardEntries,
} from '../../src/lib/sfcIO'
import {
  cloneSafeguardRule,
  createFactorySafeguardBuilderDefaults,
  createSafeguardRuleContentSnapshot,
  isSafeguardRuleActive,
  normalizeSafeguardRule,
  safeguardRuleContentFingerprint,
  SafeguardRuleActivation,
  type SafeguardRule,
} from '../../src/lib/safeguards'
import { loadLategameSfc } from '../setup/presetFixtures.js'

// ── recipe separators ────────────────────────────────────────────────────────

test('a separator recipe serializes to appearance + Separator only (unified format)', () => {
  const separator = normalizeRecipe({
    appearance: { name: '# Damage - Any Set', fgColor: '#ff8800' },
    Separator: true,
  })
  assert.equal(separator.exportMode, 'separator')
  const readable = buildReadableRecipe(separator, [])
  assert.deepEqual(Object.keys(readable).sort(), ['Separator', 'appearance'])
  assert.deepEqual(readable, {
    appearance: { name: '# Damage - Any Set', fgColor: '#ff8800' },
    Separator: true,
  })
})

test('legacy SellfileVisibility="Separator" entries still load — and re-save in the new format', () => {
  // Old files (full entries or slim ones) spell the marker via the visibility label.
  const loaded = normalizeRecipe({ SellfileVisibility: 'Separator' })
  assert.equal(loaded.exportMode, 'separator')
  // Unnamed separator: no appearance key; the save side always writes the unified flag.
  assert.deepEqual(buildReadableRecipe(loaded, []), { Separator: true })
})

test('every separator in the shipped lategame preset is minimal and in the unified format', () => {
  const sfc = loadLategameSfc()
  const separators = (sfc.Recipes as Array<Record<string, unknown>>)
    .filter((rec) => rec.Separator === true)
  assert.ok(separators.length > 0, 'the preset must contain separator recipes')
  // No legacy-format separators may remain in the shipped preset.
  assert.equal((sfc.Recipes as Array<Record<string, unknown>>)
    .filter((rec) => rec.SellfileVisibility === 'Separator').length, 0)
  for (const rec of separators) {
    const extra = Object.keys(rec).filter((k) => k !== 'appearance' && k !== 'Separator')
    assert.deepEqual(extra, [], `separator "${(rec.appearance as { name?: string } | undefined)?.name ?? ''}" must carry no rule fields`)
  }
})

// ── safeguard separators ─────────────────────────────────────────────────────

const makeSafeguardSeparator = (): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  appearance: { name: '## Utility', fgColor: '#00ccff' },
  separator: true,
})

test('a safeguard separator serializes to appearance + Separator only', () => {
  const entry = buildReadableSafeguardRuleEntry(makeSafeguardSeparator())
  assert.deepEqual(entry, {
    appearance: { name: '## Utility', fgColor: '#00ccff' },
    Separator: true,
  })
})

test('a minimal safeguard separator entry loads with defaults + the flag', () => {
  const rule = normalizeSafeguardRule({ appearance: { name: '## Utility' }, Separator: true })
  assert.ok(rule, 'minimal separator entries must not be skipped on load')
  assert.equal(rule!.separator, true)
  assert.equal(rule!.appearance?.name, '## Utility')
  // Factory-default body so the builder can toggle it back to a working rule.
  assert.deepEqual(rule!.combination.sets, [])
  assert.equal(rule!.requiredCount, 1)
})

test('safeguard separators are never active and the flag rides through clone/snapshot/fingerprint', () => {
  const separator = makeSafeguardSeparator()
  // Inert regardless of the stored activation value.
  assert.equal(separator.activation, SafeguardRuleActivation.ProtectExisting)
  assert.equal(isSafeguardRuleActive(separator), false)
  assert.equal(cloneSafeguardRule(separator).separator, true)
  assert.equal((createSafeguardRuleContentSnapshot(separator) as { separator?: boolean }).separator, true)
  // Flipping the flag must change the content fingerprint (rules-cache bust).
  const { separator: _dropped, ...twinBase } = separator
  assert.notEqual(
    safeguardRuleContentFingerprint(separator),
    safeguardRuleContentFingerprint(twinBase as SafeguardRule),
  )
})

// ── safeguard group members ──────────────────────────────────────────────────
// A group is not an entry kind: in memory it is inline settings a member carries (`group`). On
// disk it is POSITIONAL — one entry holding `Group` once plus its `members` — so a member's own
// record gains no key from the feature and no id is persisted. The contract belongs beside the
// separator one because it rides the SAME clone → snapshot → fingerprint → normalize plumbing.

const makeSafeguardMember = (): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  appearance: { name: 'Endgame Accessories', fgColor: '#88ccff' },
  requiredCount: 5,
  group: { id: 'g-acc', requiredCount: 3, countMode: { perRule: false, perSet: true, perFaction: false, perMainStat: false, perSlot: false } },
})

test('a group persists as ONE nested entry: settings once, members inside, no id', () => {
  const member = makeSafeguardMember()
  const [entry, ...rest] = buildReadableSafeguardEntries([member, { ...member, requiredCount: 7 }])
  assert.equal(rest.length, 0, 'a run of two collapses to a single nested entry')
  const group = entry as { Group?: { requiredCount: number; countMode: { perSet: boolean } }; members?: unknown[] }
  // The settings are written once, on the group — not repeated on each member.
  assert.equal(group.Group?.requiredCount, 3)
  assert.equal(group.Group?.countMode.perSet, true)
  assert.equal('id' in (group.Group ?? {}), false, 'the shape identifies the group; no id is stored')
  // Members are ordinary rule records, each keeping its own filter and count.
  assert.equal(group.members?.length, 2)
  const [first, second] = group.members as Array<{ tuple?: unknown; requiredCount?: number; Group?: unknown }>
  assert.ok(first?.tuple, 'a member must persist its combination tuple')
  assert.equal(first?.requiredCount, 5)
  assert.equal(second?.requiredCount, 7)
  assert.equal('Group' in (first ?? {}), false, 'membership is the nesting, not a key on the member')
})

test('an ungrouped rule is written flat and gains no group keys', () => {
  const [entry, ...rest] = buildReadableSafeguardEntries([createFactorySafeguardBuilderDefaults()])
  assert.equal(rest.length, 0)
  assert.equal('Group' in (entry ?? {}), false, 'Group must be omitted when the rule is not a member')
  assert.equal('members' in (entry ?? {}), false, 'an ungrouped rule is never nested')
  // The per-rule builder agrees — it is what the single-rule clipboard copy emits.
  assert.equal('Group' in buildReadableSafeguardRuleEntry(createFactorySafeguardBuilderDefaults()), false)
})

test('a nested group loads back with its settings intact and one minted id', () => {
  const rules = parseReadableSafeguardEntries([{
    Group: { requiredCount: 2, countMode: { perSlot: true } },
    members: [
      { appearance: { name: 'SPD core' }, requiredCount: 4, tuple: { slots: [], sets: [], ranks: [], rarities: [], mainStats: [], factions: [] } },
      { appearance: { name: 'SPD boots' }, requiredCount: 6, tuple: { slots: [], sets: [], ranks: [], rarities: [], mainStats: [], factions: [] } },
    ],
  }])
  assert.equal(rules.length, 2, 'members are unnested into the flat list')
  assert.equal(rules[0]?.group?.requiredCount, 2)
  assert.equal(rules[0]?.group?.countMode.perSlot, true)
  // One id minted for the run: not persisted, but shared by every member so runs resolve.
  assert.ok(rules[0]?.group?.id)
  assert.equal(rules[0]?.group?.id, rules[1]?.group?.id, 'both members share the minted id')
  // Members keep their own counts.
  assert.deepEqual(rules.map((r) => r.requiredCount), [4, 6])
})

test('two nested groups get DISTINCT ids so they never resolve as one run', () => {
  const nested = (name: string) => ({
    Group: { requiredCount: 2, countMode: { perSlot: true } },
    members: [
      { appearance: { name }, requiredCount: 1, tuple: { slots: [], sets: [], ranks: [], rarities: [], mainStats: [], factions: [] } },
      { appearance: { name }, requiredCount: 1, tuple: { slots: [], sets: [], ranks: [], rarities: [], mainStats: [], factions: [] } },
    ],
  })
  const rules = parseReadableSafeguardEntries([nested('a'), nested('b')])
  assert.equal(rules.length, 4)
  assert.equal(rules[0]?.group?.id, rules[1]?.group?.id)
  assert.equal(rules[2]?.group?.id, rules[3]?.group?.id)
  assert.notEqual(rules[0]?.group?.id, rules[2]?.group?.id, 'adjacent groups must stay separate runs')
})

test('a rule record carrying no nesting loads as ungrouped', () => {
  const rule = normalizeSafeguardRule({
    requiredCount: 1,
    tuple: { slots: [], sets: [], ranks: [], rarities: [], mainStats: [], factions: [] },
  })
  assert.ok(rule)
  assert.equal(rule!.group, undefined)
})

test('group settings ride through clone/snapshot/fingerprint', () => {
  const member = makeSafeguardMember()
  // A member is a live rule like any other.
  assert.equal(isSafeguardRuleActive(member), true)
  const clone = cloneSafeguardRule(member)
  assert.deepEqual(clone.group, member.group)
  assert.notEqual(clone.group, member.group, 'the clone must not share the settings object')
  assert.deepEqual((createSafeguardRuleContentSnapshot(member) as { group?: unknown }).group, member.group)
  // Joining/leaving a group changes what the engine emits → cache must bust.
  const { group: _dropped, ...plain } = member
  assert.notEqual(
    safeguardRuleContentFingerprint(member),
    safeguardRuleContentFingerprint(plain as SafeguardRule),
  )
  // So does the group's own count.
  assert.notEqual(
    safeguardRuleContentFingerprint(member),
    safeguardRuleContentFingerprint({ ...member, group: { ...member.group!, requiredCount: 9 } }),
  )
})
