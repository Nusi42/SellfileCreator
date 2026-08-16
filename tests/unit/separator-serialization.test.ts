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
  buildReadableSafeguardRuleEntry,
  normalizeRecipe,
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
// A group is not an entry kind: it is inline settings a member carries (`group`), persisted as
// `Group: { id, requiredCount, countMode }`. The contract belongs beside the separator one because
// it rides the SAME clone → snapshot → fingerprint → normalize plumbing.

const makeSafeguardMember = (): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  appearance: { name: 'Endgame Accessories', fgColor: '#88ccff' },
  requiredCount: 5,
  group: { id: 'g-acc', requiredCount: 3, countMode: { perRule: false, perSet: true, perFaction: false, perMainStat: false, perSlot: false } },
})

test('a group member serializes its own tuple AND its inline group settings', () => {
  const entry = buildReadableSafeguardRuleEntry(makeSafeguardMember())
  const keys = Object.keys(entry)
  // A member is an ordinary rule: it still persists its own filter and count.
  assert.equal(keys.includes('tuple'), true, 'a member must persist its combination tuple')
  assert.equal((entry as { requiredCount?: number }).requiredCount, 5)
  // Plus the group it belongs to, capitalised like Separator.
  const group = (entry as { Group?: { id: string; requiredCount: number; countMode: { perSet: boolean } } }).Group
  assert.equal(group?.id, 'g-acc')
  assert.equal(group?.requiredCount, 3)
  assert.equal(group?.countMode.perSet, true)
})

test('Group is omitted on ungrouped rules so pre-group files re-save byte-identically', () => {
  const entry = buildReadableSafeguardRuleEntry(createFactorySafeguardBuilderDefaults())
  assert.equal('Group' in entry, false, 'Group must be omitted when the rule is not a member')
})

test('a member entry loads back with its group settings intact', () => {
  const rule = normalizeSafeguardRule({
    appearance: { name: 'SPD core' },
    Group: { id: ' g1 ', requiredCount: 2, countMode: { perSlot: true } },
    requiredCount: 4,
    tuple: { slots: [], sets: [], ranks: [], rarities: [], mainStats: [], factions: [] },
  })
  assert.ok(rule, 'member entries must not be skipped on load')
  assert.equal(rule!.group?.id, 'g1', 'the id is trimmed')
  assert.equal(rule!.group?.requiredCount, 2)
  assert.equal(rule!.group?.countMode.perSlot, true)
  assert.equal(rule!.requiredCount, 4)
})

test('a Group without a usable id loads as an ungrouped rule, never as a rejected entry', () => {
  const rule = normalizeSafeguardRule({
    Group: { requiredCount: 2 },
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
