/* eslint import/no-unused-modules: off */
/**
 * safeguard-bundle-multiedit.test.ts
 *
 * Multi-edit across a mixed selection of rules and bundle headers.
 *
 * The distinction that has to hold: a bundle owns its COUNT, its SCOPE CHIPS, its name and its
 * tags — and nothing else. It matches no gear (its candidates are whatever its members matched)
 * and scores none (the pooled feed is ranked by the score each member gave), so a staged
 * filter/ranking/mode edit must skip it rather than write a setting the scan never reads. The
 * fields it does own are exactly the ones worth editing in bulk, which is what makes mixed
 * selections useful at all.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFactorySafeguardBuilderDefaults,
  SafeguardRuleActivation,
  SAFEGUARD_BUNDLE_INERT_FIELDS,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  applyMultiEditFieldsToSafeguardRule,
  createSafeguardMultiEditDraft,
  SAFEGUARD_BUNDLE_INERT_FIELD_KEYS,
  SAFEGUARD_COMBINATION_FIELD_KEYS,
  SAFEGUARD_FIELD_KEYS,
} from '../../src/lib/safeguardMultiEditDraft.js'
import { ARTIFACT_TYPE_RING } from '../../src/lib/generated/domainConstants.js'
import type { ArtifactTypeId } from '../../src/lib/types.js'

const plainRule = (): SafeguardRule => createFactorySafeguardBuilderDefaults()
const bundleHeader = (): SafeguardRule => ({ ...createFactorySafeguardBuilderDefaults(), bundle: true })

// Stages one field as a dirty common value, the shape the builder form produces on edit.
const stage = (
  rules: readonly SafeguardRule[],
  key: (typeof SAFEGUARD_FIELD_KEYS)[number],
  value: unknown,
) => {
  const draft = createSafeguardMultiEditDraft(rules as SafeguardRule[], rules.map((_, i) => String(i)))
  return {
    ...draft.fields,
    [key]: { ...draft.fields[key], value, status: 'common' as const, dirty: true },
  }
}

test('quota and scope edits apply to bundles just like rules', () => {
  // The two fields a header actually owns — and the reason mixed selections are useful.
  const rules = [plainRule(), bundleHeader()]
  const countMode = { perRule: false, perSet: false, perFaction: false, perMainStat: false, perSlot: true }
  for (const [key, value] of [
    ['requiredCount', 7],
    ['countMode', countMode],
  ] as const) {
    const fields = stage(rules, key, value)
    for (const rule of rules) {
      const applied = applyMultiEditFieldsToSafeguardRule(rule, fields, [key]) as Record<string, unknown>
      assert.deepEqual(applied[key], value, `${key} must apply to ${rule.bundle ? 'a bundle' : 'a rule'}`)
    }
  }
})

test('a staged filter edit lands on rules and skips bundles', () => {
  const rules = [plainRule(), bundleHeader()]
  const fields = stage(rules, 'slots', [ARTIFACT_TYPE_RING as ArtifactTypeId])
  // The plain rule takes the filter…
  const editedRule = applyMultiEditFieldsToSafeguardRule(rules[0] as SafeguardRule, fields, ['slots'])
  assert.deepEqual(editedRule.combination.slots, [ARTIFACT_TYPE_RING])
  // …the bundle does not, because it has no filter to narrow.
  const editedBundle = applyMultiEditFieldsToSafeguardRule(rules[1] as SafeguardRule, fields, ['slots'])
  assert.deepEqual(editedBundle.combination.slots, [], 'a bundle must not take a gear filter')
})

test('staged ranking and mode edits skip bundles too', () => {
  // A header neither scores gear nor carries an activation the engine reads, so writing either
  // would leave a setting the form no longer shows and the scan never consults.
  const rules = [plainRule(), bundleHeader()]
  for (const [key, value] of [
    ['activation', SafeguardRuleActivation.AnticipateGaps],
    ['weightMainStatByRank', false],
    ['ignorePreviousSafeguards', false],
  ] as const) {
    const fields = stage(rules, key, value)
    const editedRule = applyMultiEditFieldsToSafeguardRule(rules[0] as SafeguardRule, fields, [key]) as Record<string, unknown>
    assert.deepEqual(editedRule[key], value, `${key} must still apply to a plain rule`)
    const editedBundle = applyMultiEditFieldsToSafeguardRule(rules[1] as SafeguardRule, fields, [key]) as Record<string, unknown>
    const before = (bundleHeader() as Record<string, unknown>)[key]
    assert.deepEqual(editedBundle[key], before, `${key} must not be written onto a bundle`)
  }
})

test('every combination field is covered by the skip set', () => {
  // Guard against a new filter field being added to the editable set without being registered
  // here — it would silently start writing filters onto bundles.
  const combinationKeys = SAFEGUARD_FIELD_KEYS.filter((key) => (
    ['slots', 'sets', 'metaSetNames', 'ranks', 'rarities', 'mainStats', 'factions'].includes(key)
  ))
  for (const key of combinationKeys) {
    assert.ok(SAFEGUARD_COMBINATION_FIELD_KEYS.has(key), `${key} must be in the combination key set`)
  }
  // …and nothing non-filter crept into that set, which drives the combination routing.
  for (const key of SAFEGUARD_COMBINATION_FIELD_KEYS) {
    assert.ok(combinationKeys.includes(key), `${key} is not a combination field`)
  }
})

test('the bundle skip set is exactly the inert fields plus the filter keys', () => {
  // The skip set is DERIVED from the rule-level SSOT; this pins the derivation so a field added
  // to SAFEGUARD_BUNDLE_INERT_FIELDS without a matching edit key is noticed here rather than by
  // a bundle silently taking an edit it does not own.
  for (const key of SAFEGUARD_COMBINATION_FIELD_KEYS) {
    assert.ok(SAFEGUARD_BUNDLE_INERT_FIELD_KEYS.has(key), `${key} must be skipped on a bundle`)
  }
  for (const field of SAFEGUARD_BUNDLE_INERT_FIELDS) {
    // `combination` has no edit key of its own — it is exploded into the seven filter keys above.
    if (field === 'combination') continue
    assert.ok(
      SAFEGUARD_BUNDLE_INERT_FIELD_KEYS.has(field as (typeof SAFEGUARD_FIELD_KEYS)[number]),
      `${field} is inert on a bundle but has no matching edit key in the skip set`,
    )
  }
  // The owned fields must stay editable, or bulk-editing a bundle becomes impossible.
  for (const key of ['requiredCount', 'countMode', 'tags', 'appearanceName', 'appearanceFgColor'] as const) {
    assert.ok(!SAFEGUARD_BUNDLE_INERT_FIELD_KEYS.has(key), `${key} is owned by a bundle and must stay editable`)
  }
})
