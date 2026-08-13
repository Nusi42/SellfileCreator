/* eslint import/no-unused-modules: off */
/**
 * safeguard-bundle-multiedit.test.ts
 *
 * Multi-edit across a mixed selection of rules and bundle headers.
 *
 * The distinction that has to hold: a bundle carries every quota/ranking/mode field a rule
 * does — which is precisely what makes editing them together useful — but it has NO gear
 * filter, because its candidates are whatever its members match. So a staged filter edit must
 * skip bundles rather than write a combination the entry can never apply, while every other
 * staged field lands on them normally.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFactorySafeguardBuilderDefaults,
  SafeguardRuleActivation,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  applyMultiEditFieldsToSafeguardRule,
  createSafeguardMultiEditDraft,
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

test('quota, mode and ranking edits apply to bundles just like rules', () => {
  // This is the reason mixed selections are useful at all: a bundle owns exactly these fields.
  const rules = [plainRule(), bundleHeader()]
  for (const [key, value] of [
    ['requiredCount', 7],
    ['activation', SafeguardRuleActivation.AnticipateGaps],
    ['weightMainStatByRank', false],
  ] as const) {
    const fields = stage(rules, key, value)
    for (const rule of rules) {
      const applied = applyMultiEditFieldsToSafeguardRule(rule, fields, [key]) as Record<string, unknown>
      assert.equal(applied[key], value, `${key} must apply to ${rule.bundle ? 'a bundle' : 'a rule'}`)
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

test('every combination field is covered by the skip set', () => {
  // Guard against a new filter field being added to the editable set without being registered
  // here — it would silently start writing filters onto bundles.
  const combinationKeys = SAFEGUARD_FIELD_KEYS.filter((key) => (
    ['slots', 'sets', 'metaSetNames', 'ranks', 'rarities', 'mainStats', 'factions'].includes(key)
  ))
  for (const key of combinationKeys) {
    assert.ok(SAFEGUARD_COMBINATION_FIELD_KEYS.has(key), `${key} must be in the bundle skip set`)
  }
  // …and nothing non-filter crept into the skip set, which would make bundles uneditable.
  for (const key of SAFEGUARD_COMBINATION_FIELD_KEYS) {
    assert.ok(combinationKeys.includes(key), `${key} is not a combination field`)
  }
})
