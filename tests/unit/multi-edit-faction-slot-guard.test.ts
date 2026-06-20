/* eslint import/no-unused-modules: off */

// Per-rule mutual-exclusivity guard for slot ↔ faction edits in multi-edit.
// Recipes and safeguards both honor the same invariant: a multi-edit click that
// would force an armor slot onto a faction-set rule (or a faction onto an
// armor-slot rule) is skipped for that rule instead of silently rewriting one
// side. Single-edit and normalization helpers retain their slots-win /
// faction-wins behavior and are covered separately by faction-slot-normalization.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyMultiEditFieldToRecipe,
  applyMultiEditFieldsToRecipe,
  type MultiEditFieldState,
  type MultiEditFields,
} from '../../src/lib/recipeMultiEditDraft'
import {
  applyMultiEditFieldToSafeguardRule,
  applyMultiEditFieldsToSafeguardRule,
  type SafeguardMultiEditFields,
} from '../../src/lib/safeguardMultiEditDraft'
import { createHistoryBuilderBaseline } from '../../src/history/builderUpdateDescriptor'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  normalizeSafeguardFactionSlotScope,
  type SafeguardRule,
} from '../../src/lib/safeguards'
import { ACCESSORY_SLOT_IDS } from '../../src/lib/gearInspectorDomain'
import { ArtifactType, type ArtifactTypeId, type FactionId } from '../../src/lib/types'

// Slot ids reused across tests.
const RING = ArtifactType.Ring as ArtifactTypeId
const AMULET = ArtifactType.Amulet as ArtifactTypeId
const BANNER = ArtifactType.Banner as ArtifactTypeId
const HELMET = ArtifactType.Helmet as ArtifactTypeId
const WEAPON = ArtifactType.Weapon as ArtifactTypeId

// Build a minimal MultiEditFieldState for an array-patch edit. Only `patch` and
// `dirty` matter for applyMultiEditFieldToRecipe's patch branch.
const arrayPatchField = (patch: { add?: readonly number[]; remove?: readonly number[]; replace?: readonly number[] }): MultiEditFieldState => ({
  status: 'common',
  value: [],
  dirty: true,
  initialStatus: 'common',
  initialValue: [],
  mixedValues: null,
  initialMixedValues: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: patch as any,
})

// Build a MultiEditFieldState for a scalar-replace edit (no patch).
const scalarField = (value: unknown): MultiEditFieldState => ({
  status: 'common',
  value,
  dirty: true,
  initialStatus: 'common',
  initialValue: value,
  mixedValues: null,
  initialMixedValues: null,
  patch: null,
})

// Minimal safeguard rule factory for the tests.
const makeSafeguard = (overrides: Partial<SafeguardRule['combination']> = {}): SafeguardRule => ({
  weightMainStatByRank: false,
  combination: {
    slots: [],
    sets: [],
    metaSetNames: [],
    ranks: [],
    rarities: [],
    mainStats: [],
    factions: [],
    ...overrides,
  },
  requiredCount: 1,
  activation: SafeguardRuleActivation.ProtectExisting,
  countMode: SAFEGUARD_DEFAULT_COUNT_MODE,
  ignorePreviousSafeguards: true,
  ignoreEquippedInCollection: false,
  ignoreEquippedInVault: false,
  improvementChanceThreshold: null,
  substats: [],
  substatMatch: SafeguardSubstatMatch.Min1,
  substatWeights: {},
})

// ── recipes ───────────────────────────────────────────────────────────────────

test('recipe: armor-slot add patch skipped when faction is set', () => {
  // Rule with faction X but no slots yet — Weapon-add patch must be a no-op.
  const recipe = createHistoryBuilderBaseline({ factionCode: 5, artifactTypes: [] })
  const next = applyMultiEditFieldToRecipe(recipe, 'artifactTypes', arrayPatchField({ add: [WEAPON] }))
  // Same reference: nothing changed for this rule.
  assert.strictEqual(next, recipe)
})

test('recipe: armor-slot add patch applies when no faction is set', () => {
  // Companion case — same patch reaches the compatible rule and adds Weapon.
  const recipe = createHistoryBuilderBaseline({ factionCode: 0, artifactTypes: [] })
  const next = applyMultiEditFieldToRecipe(recipe, 'artifactTypes', arrayPatchField({ add: [WEAPON] }))
  assert.deepEqual(next.artifactTypes, [WEAPON])
  assert.strictEqual(next.factionCode ?? 0, 0)
})

test('recipe: accessory-slot add patch unaffected by faction (no conflict)', () => {
  // Faction is only incompatible with armor slots — accessories are still valid.
  const recipe = createHistoryBuilderBaseline({ factionCode: 3, artifactTypes: [] })
  const next = applyMultiEditFieldToRecipe(recipe, 'artifactTypes', arrayPatchField({ add: [RING] }))
  assert.deepEqual(next.artifactTypes, [RING])
  assert.strictEqual(next.factionCode, 3)
})

test('recipe: scalar artifactTypes replace skipped when armor slot would land on faction-set rule', () => {
  // Scalar-value path mirrors the patch guard for consistency.
  const recipe = createHistoryBuilderBaseline({ factionCode: 5, artifactTypes: [] })
  const next = applyMultiEditFieldToRecipe(recipe, 'artifactTypes', scalarField([HELMET]))
  assert.strictEqual(next, recipe)
})

test('recipe: factionCode scalar set skipped when rule already has armor slots', () => {
  // Symmetric direction: faction multi-edit must not silently rewrite armor slots.
  const recipe = createHistoryBuilderBaseline({ factionCode: 0, artifactTypes: [WEAPON] })
  const next = applyMultiEditFieldToRecipe(recipe, 'factionCode', scalarField(4))
  assert.strictEqual(next, recipe)
})

test('recipe: factionCode scalar set applies when rule has only accessories', () => {
  // No armor slot — faction set is valid and writes through.
  const recipe = createHistoryBuilderBaseline({ factionCode: 0, artifactTypes: [RING] })
  const next = applyMultiEditFieldToRecipe(recipe, 'factionCode', scalarField(4))
  assert.strictEqual(next.factionCode, 4)
  assert.deepEqual(next.artifactTypes, [RING])
})

// ── safeguards ────────────────────────────────────────────────────────────────

test('safeguard: armor-slot add patch skipped when factions is non-empty', () => {
  const rule = makeSafeguard({ factions: [5 as FactionId], slots: [] })
  const next = applyMultiEditFieldToSafeguardRule(rule, 'slots', arrayPatchField({ add: [WEAPON] }))
  assert.strictEqual(next, rule)
})

test('safeguard: armor-slot add patch applies when factions is empty', () => {
  const rule = makeSafeguard({ factions: [], slots: [] })
  const next = applyMultiEditFieldToSafeguardRule(rule, 'slots', arrayPatchField({ add: [WEAPON] }))
  assert.deepEqual(next.combination.slots, [WEAPON])
  assert.deepEqual(next.combination.factions, [])
})

test('safeguard: factions add patch skipped when slots contain armor', () => {
  const rule = makeSafeguard({ factions: [], slots: [WEAPON as ArtifactTypeId] })
  const next = applyMultiEditFieldToSafeguardRule(rule, 'factions', arrayPatchField({ add: [3 as FactionId] }))
  assert.strictEqual(next, rule)
})

test('safeguard: factions add patch applies when slots are accessory-only', () => {
  const rule = makeSafeguard({ factions: [], slots: [RING as ArtifactTypeId] })
  const next = applyMultiEditFieldToSafeguardRule(rule, 'factions', arrayPatchField({ add: [3 as FactionId] }))
  assert.deepEqual(next.combination.factions, [3])
  assert.deepEqual(next.combination.slots, [RING])
})

// ── faction → accessory-slots invariant (apply-time normalizer) ──────────────

test('normalizeSafeguardFactionSlotScope: factions set + empty slots → fills with all accessories', () => {
  const rule = makeSafeguard({ factions: [3 as FactionId], slots: [] })
  const next = normalizeSafeguardFactionSlotScope(rule)
  assert.deepEqual(next.combination.slots, [...ACCESSORY_SLOT_IDS])
  assert.deepEqual(next.combination.factions, [3])
})

test('normalizeSafeguardFactionSlotScope: factions set + non-empty slots → unchanged', () => {
  const rule = makeSafeguard({ factions: [3 as FactionId], slots: [RING as ArtifactTypeId] })
  assert.strictEqual(normalizeSafeguardFactionSlotScope(rule), rule)
})

test('normalizeSafeguardFactionSlotScope: empty factions → unchanged', () => {
  const rule = makeSafeguard({ factions: [], slots: [] })
  assert.strictEqual(normalizeSafeguardFactionSlotScope(rule), rule)
})

test('applyMultiEditFieldsToSafeguardRule: factions replace patch on empty slots → slots auto-filled to accessories', () => {
  // Simulates the full multi-edit apply path: user staged a factions replace
  // patch in the dropdown; post-loop normalizer fills accessories.
  const rule = makeSafeguard({ factions: [], slots: [] })
  const fields = {
    factions: arrayPatchField({ replace: [3 as FactionId] }),
  } as unknown as SafeguardMultiEditFields
  const next = applyMultiEditFieldsToSafeguardRule(rule, fields, ['factions'])
  assert.deepEqual(next.combination.factions, [3])
  assert.deepEqual(next.combination.slots, [...ACCESSORY_SLOT_IDS])
})

test('applyMultiEditFieldsToRecipe: factionCode scalar set with empty slots → slots auto-filled to accessories', () => {
  // Recipe-side parity: faction set via multi-edit with empty slots → auto-fill.
  const recipe = createHistoryBuilderBaseline({ factionCode: 0, artifactTypes: [] })
  const fields = {
    factionCode: scalarField(4),
  } as unknown as MultiEditFields
  const next = applyMultiEditFieldsToRecipe(recipe, fields, ['factionCode'])
  assert.strictEqual(next.factionCode, 4)
  // normalizeFactionSlotScope substitutes ACCESSORY_SLOT_IDS when slots are empty.
  assert.deepEqual(next.artifactTypes, [RING, AMULET, BANNER])
})

test('applyMultiEditFieldsToRecipe: no faction set → slots stay empty', () => {
  // Negative case: nothing to enforce, recipe passes through.
  const recipe = createHistoryBuilderBaseline({ factionCode: 0, artifactTypes: [] })
  const fields = {
    factionCode: scalarField(0),
  } as unknown as MultiEditFields
  const next = applyMultiEditFieldsToRecipe(recipe, fields, ['factionCode'])
  assert.strictEqual(next.factionCode ?? 0, 0)
  assert.deepEqual(next.artifactTypes ?? [], [])
})
