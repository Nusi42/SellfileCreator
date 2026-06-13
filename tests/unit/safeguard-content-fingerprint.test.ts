/* eslint import/no-unused-modules: off */

// Regression coverage for safeguardRulesContentFingerprint — the SSOT signal shared by the
// rule-cache worker (computeRecipeKey) and the export-dirty badge (App.hsfExportStateSig).
// The export-dirty side previously omitted substatMatch + improvementChanceThreshold, so
// changing either left the "needs export/push" badge falsely clean and the user could ship a
// stale sell-file. These tests pin that EVERY output-affecting field flips the fingerprint
// (so both consumers invalidate), and that display-only fields (appearance, tags) do NOT.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createFactorySafeguardBuilderDefaults,
  safeguardRuleContentFingerprint,
  safeguardRulesContentFingerprint,
  SafeguardSubstatMatch,
  SafeguardRuleActivation,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'

// Deep-ish clone via the factory + spread so each case mutates an independent rule.
const baseRule = (): SafeguardRule => createFactorySafeguardBuilderDefaults()

test('fingerprint is stable for identical content', () => {
  assert.equal(safeguardRuleContentFingerprint(baseRule()), safeguardRuleContentFingerprint(baseRule()))
})

test('substatMatch change flips the fingerprint (was a stale-export bug)', () => {
  const a = baseRule()
  // Needs ≥2 substats for a non-Min1 match mode to be meaningful, but the fingerprint must
  // change regardless of whether the value is "active" — it is an output-affecting input.
  const b: SafeguardRule = { ...a, substats: [1, 2], substatMatch: SafeguardSubstatMatch.Min2 }
  const a2: SafeguardRule = { ...a, substats: [1, 2], substatMatch: SafeguardSubstatMatch.Min1 }
  assert.notEqual(safeguardRuleContentFingerprint(a2), safeguardRuleContentFingerprint(b))
})

test('improvementChanceThreshold change flips the fingerprint (was a stale-export bug)', () => {
  const a = baseRule()
  const b: SafeguardRule = {
    ...a,
    improvementChanceThreshold: { atLevel0: 50, atLevel4: null, atLevel8: null, atLevel12: null },
  }
  const c: SafeguardRule = {
    ...a,
    improvementChanceThreshold: { atLevel0: 75, atLevel4: null, atLevel8: null, atLevel12: null },
  }
  // null vs set, and set-value-vs-different-value, must both change the fingerprint.
  assert.notEqual(safeguardRuleContentFingerprint(a), safeguardRuleContentFingerprint(b))
  assert.notEqual(safeguardRuleContentFingerprint(b), safeguardRuleContentFingerprint(c))
})

test('output-affecting fields each flip the fingerprint', () => {
  const a = baseRule()
  const base = safeguardRuleContentFingerprint(a)
  const variants: SafeguardRule[] = [
    { ...a, requiredCount: a.requiredCount + 1 },
    { ...a, activation: SafeguardRuleActivation.AnticipateGaps },
    { ...a, ignorePreviousSafeguards: !a.ignorePreviousSafeguards },
    { ...a, ignoreEquippedInCollection: !a.ignoreEquippedInCollection },
    { ...a, ignoreEquippedInVault: !a.ignoreEquippedInVault },
    { ...a, countMode: { ...a.countMode, perSlot: !a.countMode.perSlot } },
    { ...a, substats: [1] },
    { ...a, substatWeights: { 1: 2 } },
    { ...a, combination: { ...a.combination, slots: [1] } },
  ]
  for (const v of variants) {
    assert.notEqual(safeguardRuleContentFingerprint(v), base)
  }
})

test('display-only fields do NOT flip the fingerprint (avoid spurious dirty)', () => {
  const a = baseRule()
  const base = safeguardRuleContentFingerprint(a)
  // appearance + tags are display/identification only — they must not mark the sell-file dirty.
  assert.equal(safeguardRuleContentFingerprint({ ...a, tags: ['anything'] }), base)
  assert.equal(
    safeguardRuleContentFingerprint({ ...a, appearance: { name: 'X', fgColor: '#fff' } }),
    base,
  )
})

test('list fingerprint reflects enabled flag, count, order, and content', () => {
  const r1 = baseRule()
  const r2: SafeguardRule = { ...baseRule(), requiredCount: 9 }
  // enabled flag matters.
  assert.notEqual(
    safeguardRulesContentFingerprint(true, [r1]),
    safeguardRulesContentFingerprint(false, [r1]),
  )
  // count matters (empty vs one).
  assert.notEqual(
    safeguardRulesContentFingerprint(true, []),
    safeguardRulesContentFingerprint(true, [r1]),
  )
  // order matters (rules are positional in the merge).
  assert.notEqual(
    safeguardRulesContentFingerprint(true, [r1, r2]),
    safeguardRulesContentFingerprint(true, [r2, r1]),
  )
  // identical lists match.
  assert.equal(
    safeguardRulesContentFingerprint(true, [r1, r2]),
    safeguardRulesContentFingerprint(true, [baseRule(), { ...baseRule(), requiredCount: 9 }]),
  )
})
