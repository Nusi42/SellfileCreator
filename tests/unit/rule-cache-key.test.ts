/* eslint import/no-unused-modules: off */

// Regression coverage for composeRuleCacheKey — the rules-cache key that gates BOTH the
// WASM-side generated-rules cache (cacheGeneratedRules / computeMergedRulesCached) and the
// matcher reconfigure (lastConfiguredKey) in the rule-cache worker.
//
// History: the key originally omitted the recipe dimension entirely. Toggling all recipes
// off (keys → []) or editing a recipe left the key unchanged, so the WASM merge cache was
// never refreshed and returned the previously cached rules (still containing every recipe) —
// the sell-file preview and Gear Inspector kept matching on stale recipe rules. Final Sell
// and Safeguards toggles worked only because their content WAS in the key. These tests pin
// that EVERY output-affecting dimension flips the key — recipes included — so the cache can
// never silently serve stale merged rules again.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  composeRuleCacheKey,
  type RuleCacheKeyPipelineState,
  type RuleCacheKeyPayload,
} from '../../src/workers/ruleCacheKey.js'
import type { FinalSellRemainderConfig } from '../../src/lib/logicHub.js'

// A representative, fully-populated baseline so each test can perturb exactly one dimension.
const baseState = (): RuleCacheKeyPipelineState => ({
  keys: ['recipe-a#1', 'recipe-b#2'],
  substatTargetsKey: 'stk-1',
  totalLimitHit: false,
  truncatedRecipeIndices: [],
})

const basePayload = (): RuleCacheKeyPayload => ({
  omitDisabledBeforeSafeguards: false,
  dedupeBeforeSafeguards: false,
  finalSellRemainder: { artifacts: true, accessories: false, levels: [12, 16], setsMode: 'explicit' },
})

const baseFingerprint = '1:0:'

// Helper: the key for the unperturbed baseline.
const baselineKey = (): string => composeRuleCacheKey(baseState(), basePayload(), baseFingerprint)

test('composeRuleCacheKey is stable for identical inputs', () => {
  // Same content (distinct object identities) must produce the SAME key — otherwise the cache
  // never hits and every push re-sends ~17 MiB of rules.
  assert.equal(baselineKey(), baselineKey())
})

test('recipe-keys array changes flip the key (the regression that was missed)', () => {
  const before = baselineKey()
  // Edit a recipe: one per-recipe key changes.
  const edited = composeRuleCacheKey(
    { ...baseState(), keys: ['recipe-a#1', 'recipe-b#9'] },
    basePayload(),
    baseFingerprint,
  )
  assert.notEqual(edited, before, 'editing a recipe must change the key')

  // Disable all recipes: keys → []. This is the exact "turn off all recipes" toggle.
  const disabled = composeRuleCacheKey(
    { ...baseState(), keys: [] },
    basePayload(),
    baseFingerprint,
  )
  assert.notEqual(disabled, before, 'disabling all recipes must change the key')

  // Removing one recipe must also differ from both the full and the empty set.
  const oneRemoved = composeRuleCacheKey(
    { ...baseState(), keys: ['recipe-a#1'] },
    basePayload(),
    baseFingerprint,
  )
  assert.notEqual(oneRemoved, before)
  assert.notEqual(oneRemoved, disabled)
})

test('recipe-key order is significant (concatenation cannot alias)', () => {
  // Reordered recipes emit rules in a different order, so the key must differ. The per-key
  // separator guards against ['ab','c'] vs ['a','bc'] style aliasing too.
  const ordered = composeRuleCacheKey(
    { ...baseState(), keys: ['ab', 'c'] },
    basePayload(),
    baseFingerprint,
  )
  const reordered = composeRuleCacheKey(
    { ...baseState(), keys: ['c', 'ab'] },
    basePayload(),
    baseFingerprint,
  )
  const aliasAttempt = composeRuleCacheKey(
    { ...baseState(), keys: ['a', 'bc'] },
    basePayload(),
    baseFingerprint,
  )
  assert.notEqual(ordered, reordered)
  assert.notEqual(ordered, aliasAttempt)
})

test('every other output-affecting dimension also flips the key', () => {
  const before = baselineKey()

  // substatTargetsKey
  assert.notEqual(
    composeRuleCacheKey({ ...baseState(), substatTargetsKey: 'stk-2' }, basePayload(), baseFingerprint),
    before,
  )
  // totalLimitHit
  assert.notEqual(
    composeRuleCacheKey({ ...baseState(), totalLimitHit: true }, basePayload(), baseFingerprint),
    before,
  )
  // truncatedRecipeIndices identity
  assert.notEqual(
    composeRuleCacheKey({ ...baseState(), truncatedRecipeIndices: [3] }, basePayload(), baseFingerprint),
    before,
  )
  // omitDisabledBeforeSafeguards
  assert.notEqual(
    composeRuleCacheKey(baseState(), { ...basePayload(), omitDisabledBeforeSafeguards: true }, baseFingerprint),
    before,
  )
  // dedupeBeforeSafeguards
  assert.notEqual(
    composeRuleCacheKey(baseState(), { ...basePayload(), dedupeBeforeSafeguards: true }, baseFingerprint),
    before,
  )
  // safeguard fingerprint (the enabled flag + rule content, computed upstream)
  assert.notEqual(
    composeRuleCacheKey(baseState(), basePayload(), '0:0:'),
    before,
  )
})

test('each finalSellRemainder field flips the key, and null differs from configured', () => {
  const before = baselineKey()
  const variant = (fsr: FinalSellRemainderConfig | null): string =>
    composeRuleCacheKey(baseState(), { ...basePayload(), finalSellRemainder: fsr }, baseFingerprint)

  assert.notEqual(variant(null), before, 'disabling Final Sell must change the key')
  assert.notEqual(variant({ artifacts: false, accessories: false, levels: [12, 16], setsMode: 'explicit' }), before)
  assert.notEqual(variant({ artifacts: true, accessories: true, levels: [12, 16], setsMode: 'explicit' }), before)
  assert.notEqual(variant({ artifacts: true, accessories: false, levels: [16], setsMode: 'explicit' }), before)
  assert.notEqual(variant({ artifacts: true, accessories: false, levels: [12, 16], setsMode: 'any' }), before)
})
