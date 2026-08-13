/* eslint import/no-unused-modules: off */
/**
 * safeguard-bundle-sfc-roundtrip.test.ts
 *
 * SFC persistence for the bundle outline. The contract has two halves and the second is the
 * one that protects existing users:
 *
 *  1. A bundle outline survives write → read → write unchanged (structure, quotas, pinned caps).
 *  2. Every file written BEFORE bundles existed re-serializes byte-identically. The outline
 *     fields are all omitted at their defaults precisely so that holds — this suite proves it
 *     against the shipped 154-entry lategame preset rather than a synthetic fixture, because
 *     the preset is what real users load.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildReadableSafeguardRuleEntry } from '../../src/lib/sfcIO.js'
import {
  createFactorySafeguardBuilderDefaults,
  normalizeSafeguardRule,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  normalizeSafeguardOutline,
  safeguardBundleDemand,
  safeguardBundleMemberIndices,
} from '../../src/lib/safeguardOutline.js'

// Writes a rule list out and reads it straight back, the way a save/load cycle does.
const roundTrip = (rules: readonly SafeguardRule[]): SafeguardRule[] => normalizeSafeguardOutline(
  rules
    .map((rule) => normalizeSafeguardRule(buildReadableSafeguardRuleEntry(rule)))
    .filter((rule): rule is SafeguardRule => rule !== null),
)

test('a nested bundle outline survives a save/load round trip intact', () => {
  // The motivating shape from the lategame preset: a shared per-faction promise fed by a
  // per-set member, with a second bundle nested inside.
  const original = normalizeSafeguardOutline([
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: '% Rings' }, bundle: true, requiredCount: 3 },
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: 'Per set' }, depth: 1, requiredCount: 1 },
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: 'SPD core' }, depth: 1, bundle: true, requiredCount: 2, collapsed: true },
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: 'SPD banners' }, depth: 2 },
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: 'Loose rule' } },
  ])
  const reloaded = roundTrip(original)
  assert.equal(reloaded.length, original.length)
  assert.deepEqual(reloaded.map((r) => r.depth ?? 0), [0, 1, 1, 2, 0])
  assert.deepEqual(reloaded.map((r) => r.bundle === true), [true, false, true, false, false])
  assert.deepEqual(reloaded.map((r) => r.requiredCount), [3, 1, 2, 1, 1])
  // The collapsed chevron state travels with the document.
  assert.equal(reloaded[2]?.collapsed, true)
  // Membership is reconstructed from depth alone — nothing about it is persisted.
  assert.deepEqual(safeguardBundleMemberIndices(reloaded, 0), [1, 3])
  assert.deepEqual(safeguardBundleMemberIndices(reloaded, 2), [3])
  // Each header's own count comes back verbatim — it is the promise, not a derivation.
  assert.equal(safeguardBundleDemand(reloaded, 0), 3)
  assert.equal(safeguardBundleDemand(reloaded, 2), 2)
})

test('a second round trip is a fixed point', () => {
  // Idempotence is what makes "load, change nothing, save" a no-diff operation.
  const once = roundTrip([
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: 'B' }, bundle: true },
    { ...createFactorySafeguardBuilderDefaults(), appearance: { name: 'm' }, depth: 1 },
  ])
  assert.deepEqual(
    once.map((rule) => buildReadableSafeguardRuleEntry(rule)),
    roundTrip(once).map((rule) => buildReadableSafeguardRuleEntry(rule)),
  )
})

test('every safeguard entry in the shipped lategame preset re-serializes byte-identically', () => {
  // The backward-compatibility gate. If any outline field ever starts being written at its
  // default, this diff appears on a file nobody edited.
  const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8')) as {
    Safeguards: unknown[]
  }
  assert.ok(sfc.Safeguards.length > 0, 'the preset must contain safeguard entries')
  for (const [index, raw] of sfc.Safeguards.entries()) {
    const rule = normalizeSafeguardRule(raw)
    assert.ok(rule, `entry ${index} must load`)
    const rewritten = buildReadableSafeguardRuleEntry(rule)
    assert.deepEqual(
      JSON.parse(JSON.stringify(rewritten)),
      raw,
      `safeguard entry ${index} must re-serialize unchanged`,
    )
  }
})

test('a pre-bundle entry gains no outline keys on load or save', () => {
  // Explicit version of the guarantee above, on the minimal shape.
  const legacy = {
    requiredCount: 2,
    activation: 'protectExisting',
    countMode: { perRule: false, perSet: true, perFaction: true, perMainStat: false, perSlot: true },
    ignorePreviousSafeguards_v2: false,
    ignoreEquippedInCollection: false,
    ignoreEquippedInVault: false,
    tuple: { slots: [], sets: [], metaSetNames: [], ranks: [], rarities: [], mainStats: [], factions: [] },
  }
  const rule = normalizeSafeguardRule(legacy)
  assert.ok(rule)
  // Nothing structural is invented on the way in…
  assert.equal(rule!.bundle, undefined)
  assert.equal(rule!.depth, undefined)
  // …and nothing is written on the way back out.
  assert.deepEqual(JSON.parse(JSON.stringify(buildReadableSafeguardRuleEntry(rule!))), legacy)
})
