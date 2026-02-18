/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import type { HsfRuleWithRecipe } from '../../src/lib/merge.js'
import { RULE_SOURCE_HSFC, RULE_SOURCE_SAFEGUARDS } from '../../src/lib/merge.js'
import {
  hasConcreteSafeguardRowForRule,
  resolveSafeguardPreviewStarAction,
} from '../../src/lib/safeguardNavigation.js'

const makeRule = (overrides: Partial<HsfRuleWithRecipe>): HsfRuleWithRecipe => ({
  Keep: true,
  Use: true,
  IsRuleTypeAND: false,
  Substats: [],
  ...overrides,
})

test('detects concrete safeguard rows for the clicked safeguard id', () => {
  const rules: HsfRuleWithRecipe[] = [
    makeRule({
      __source: RULE_SOURCE_SAFEGUARDS,
      __safeguardRuleId: 'ku_a',
      __safeguardPlaceholder: true,
    }),
    makeRule({
      __source: RULE_SOURCE_SAFEGUARDS,
      __safeguardRuleId: 'ku_a',
      __safeguardPlaceholder: false,
      __safeguardItemKey: 77,
    }),
  ]
  assert.equal(hasConcreteSafeguardRowForRule(rules, 'ku_a'), true)
  assert.equal(resolveSafeguardPreviewStarAction(rules, 'ku_a'), 'openTester')
})

test('routes anticipate-only safeguard rows to safeguards tab', () => {
  const rules: HsfRuleWithRecipe[] = [
    makeRule({
      __source: RULE_SOURCE_SAFEGUARDS,
      __safeguardRuleId: 'ku_gap',
      __safeguardPlaceholder: true,
    }),
    makeRule({
      __source: RULE_SOURCE_HSFC,
      RecipeID: 2,
    }),
  ]
  assert.equal(hasConcreteSafeguardRowForRule(rules, 'ku_gap'), false)
  assert.equal(resolveSafeguardPreviewStarAction(rules, 'ku_gap'), 'openSafeguards')
})

test('does not treat safeguard rows without item keys as concrete matches', () => {
  const rules: HsfRuleWithRecipe[] = [
    makeRule({
      __source: RULE_SOURCE_SAFEGUARDS,
      __safeguardRuleId: 'ku_gap',
      // Some placeholder rows can lose explicit placeholder tags across boundaries.
      // Missing item keys still indicate these are not real gear-backed matches.
    }),
  ]
  assert.equal(hasConcreteSafeguardRowForRule(rules, 'ku_gap'), false)
  assert.equal(resolveSafeguardPreviewStarAction(rules, 'ku_gap'), 'openSafeguards')
})

test('treats missing safeguard ids as safeguards-tab routing', () => {
  const rules: HsfRuleWithRecipe[] = [
    makeRule({
      __source: RULE_SOURCE_SAFEGUARDS,
      __safeguardRuleId: 'ku_demo',
      __safeguardPlaceholder: false,
    }),
  ]
  assert.equal(hasConcreteSafeguardRowForRule(rules, null), false)
  assert.equal(resolveSafeguardPreviewStarAction(rules, '  '), 'openSafeguards')
})
