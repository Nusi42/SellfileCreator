/* eslint import/no-unused-modules: off */
/**
 * safeguard-bundle-inert-fields.test.ts
 *
 * Pins what a BUNDLE header owns against what it merely carries.
 *
 * The engine reads exactly two fields off a header — its required count and its count mode (see
 * safeguard_apply_bundle_caps). Everything else survives on the entry only so bundle ⇄ rule
 * conversion is lossless. SAFEGUARD_BUNDLE_INERT_FIELDS names that set once and
 * stripInertSafeguardFields is the projection built from it; these tests keep the two in step,
 * because a field that drifts out of either one comes back as a control the form offers and the
 * scan ignores.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFactorySafeguardBuilderDefaults,
  isSafeguardRuleActive,
  safeguardEntryEffectiveActivation,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  SAFEGUARD_BUNDLE_INERT_FIELDS,
  stripInertSafeguardFields,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import { ARTIFACT_TYPE_RING, STAT_VARIANT_SPD } from '../../src/lib/generated/domainConstants.js'
import type { ArtifactTypeId, StatVariant } from '../../src/lib/types.js'

// A fully loaded entry: every inert field carries a non-default value, so a projection that
// forgets one shows up as an unchanged field below.
const loadedRule = (): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  combination: {
    ...createFactorySafeguardBuilderDefaults().combination,
    slots: [ARTIFACT_TYPE_RING as ArtifactTypeId],
  },
  activation: SafeguardRuleActivation.AnticipateGaps,
  ignorePreviousSafeguards: true,
  ignoreEquippedInCollection: true,
  ignoreEquippedInVault: true,
  substats: [STAT_VARIANT_SPD as StatVariant],
  substatMatch: SafeguardSubstatMatch.PerSubstat,
  substatWeights: { [STAT_VARIANT_SPD as StatVariant]: 2 },
  weightMainStatByRank: true,
  mainStatRankWeightFactor: 2.5,
  improvementChanceThreshold: { atLevel0: 30, atLevel4: null, atLevel8: null, atLevel12: null },
  requiredCount: 5,
})

test('stripping a bundle neutralises every field it does not own', () => {
  const bundle: SafeguardRule = { ...loadedRule(), bundle: true }
  const stripped = stripInertSafeguardFields(bundle) as unknown as Record<string, unknown>
  const stored = bundle as unknown as Record<string, unknown>
  for (const field of SAFEGUARD_BUNDLE_INERT_FIELDS) {
    assert.notDeepEqual(
      stripped[field],
      stored[field],
      `${field} is listed as inert but survives the projection unchanged`,
    )
  }
  // The two owned quota fields must come through untouched — they ARE the bundle.
  assert.equal(stripped.requiredCount, 5)
  assert.deepEqual(stripped.countMode, bundle.countMode)
})

test('every field the projection changes is listed as inert', () => {
  // The other direction: a projection that starts neutralising something without saying so in the
  // SSOT would leave the builder form and multi-edit still offering it.
  const bundle: SafeguardRule = { ...loadedRule(), bundle: true }
  const stripped = stripInertSafeguardFields(bundle) as unknown as Record<string, unknown>
  const stored = bundle as unknown as Record<string, unknown>
  const inert = new Set<string>(SAFEGUARD_BUNDLE_INERT_FIELDS)
  for (const field of Object.keys(stored)) {
    if (inert.has(field)) continue
    assert.deepEqual(stripped[field], stored[field], `${field} changed but is not listed as inert`)
  }
})

test('rules and separators pass through untouched, by identity', () => {
  // Display code calls the projection unconditionally, so it must not invalidate memo deps for
  // the two kinds that own everything they carry.
  const rule = loadedRule()
  assert.equal(stripInertSafeguardFields(rule), rule)
  const separator: SafeguardRule = { ...loadedRule(), separator: true }
  assert.equal(stripInertSafeguardFields(separator), separator)
})

test('a bundle reads as ON whatever activation it stored', () => {
  // The cap is unconditional in Rust (resolve_demands never looks at activation, and the header
  // is forced off at prepare time), so no surface may render it as disabled.
  const offBundle: SafeguardRule = { ...loadedRule(), bundle: true, activation: SafeguardRuleActivation.Off }
  assert.equal(safeguardEntryEffectiveActivation(offBundle), SafeguardRuleActivation.ProtectExisting)
  assert.equal(isSafeguardRuleActive(offBundle), true)
  // Separators stay inert whatever they stored, and plain rules keep their own value.
  const separator: SafeguardRule = { ...loadedRule(), separator: true }
  assert.equal(safeguardEntryEffectiveActivation(separator), SafeguardRuleActivation.Off)
  assert.equal(isSafeguardRuleActive(separator), false)
  const rule = loadedRule()
  assert.equal(safeguardEntryEffectiveActivation(rule), SafeguardRuleActivation.AnticipateGaps)
  assert.equal(isSafeguardRuleActive(rule), true)
  assert.equal(isSafeguardRuleActive({ ...rule, activation: SafeguardRuleActivation.Off }), false)
})
