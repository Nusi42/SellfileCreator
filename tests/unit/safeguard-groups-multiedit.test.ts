/* eslint import/no-unused-modules: off */
/**
 * safeguard-groups-multiedit.test.ts
 *
 * Multi-edit across a selection that mixes group members and ungrouped rules.
 *
 * Members are ordinary rules, so every existing field applies to them unchanged. The two group
 * fields (`groupRequiredCount`, `groupCountMode`) apply to every GROUPED member of the selection
 * and pass over ungrouped rules — multi-edit never creates a group.
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
  SAFEGUARD_FIELD_KEYS,
} from '../../src/lib/safeguardMultiEditDraft.js'
import { ARTIFACT_TYPE_RING } from '../../src/lib/generated/domainConstants.js'
import type { ArtifactTypeId } from '../../src/lib/types.js'

const perRule = { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false }
const perSlot = { perRule: false, perSet: false, perFaction: false, perMainStat: false, perSlot: true }
const plainRule = (): SafeguardRule => createFactorySafeguardBuilderDefaults()
const memberOf = (id: string, requiredCount = 2): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  group: { id, requiredCount, countMode: perRule },
})

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

test('ordinary edits apply to members exactly like rules', () => {
  const rules = [plainRule(), memberOf('g')]
  const fields = stage(rules, 'requiredCount', 7)
  for (const rule of rules) {
    assert.equal(applyMultiEditFieldsToSafeguardRule(rule, fields, ['requiredCount']).requiredCount, 7)
  }
  const filter = stage(rules, 'slots', [ARTIFACT_TYPE_RING as ArtifactTypeId])
  for (const rule of rules) {
    assert.deepEqual(applyMultiEditFieldsToSafeguardRule(rule, filter, ['slots']).combination.slots, [ARTIFACT_TYPE_RING])
  }
  const mode = stage(rules, 'activation', SafeguardRuleActivation.Off)
  for (const rule of rules) {
    assert.equal(applyMultiEditFieldsToSafeguardRule(rule, mode, ['activation']).activation, SafeguardRuleActivation.Off)
  }
})

test('a staged group count lands on every grouped member and passes over ungrouped rules', () => {
  const rules = [plainRule(), memberOf('a', 2), memberOf('b', 5)]
  const fields = stage(rules, 'groupRequiredCount', 9)
  const applied = rules.map((rule) => applyMultiEditFieldsToSafeguardRule(rule, fields, ['groupRequiredCount']))
  assert.equal(applied[0]?.group, undefined, 'multi-edit never creates a group')
  assert.equal(applied[1]?.group?.requiredCount, 9)
  assert.equal(applied[2]?.group?.requiredCount, 9)
  // Membership (the id) is untouched — only the settings changed.
  assert.equal(applied[1]?.group?.id, 'a')
  assert.equal(applied[2]?.group?.id, 'b')
})

test('a staged group count mode lands on grouped members only', () => {
  const rules = [plainRule(), memberOf('a')]
  const fields = stage(rules, 'groupCountMode', perSlot)
  const applied = rules.map((rule) => applyMultiEditFieldsToSafeguardRule(rule, fields, ['groupCountMode']))
  assert.equal(applied[0]?.group, undefined)
  assert.equal(applied[1]?.group?.countMode.perSlot, true)
  // The member's OWN chips are a different field and stay as they were.
  assert.equal(applied[1]?.countMode.perSlot, false)
})

test('the draft reads group fields as mixed when the selection spans different groups', () => {
  const rules = [memberOf('a', 2), memberOf('b', 5)]
  const draft = createSafeguardMultiEditDraft(rules, ['0', '1'])
  assert.equal(draft.fields.groupRequiredCount.status, 'mixed')
  // Same group settings → common, even across two different runs.
  const same = createSafeguardMultiEditDraft([memberOf('a', 3), memberOf('b', 3)], ['0', '1'])
  assert.equal(same.fields.groupRequiredCount.status, 'common')
  assert.equal(same.fields.groupCountMode.status, 'common')
})
