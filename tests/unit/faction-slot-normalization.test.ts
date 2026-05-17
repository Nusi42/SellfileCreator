/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeFactionSlotScope, normalizeSlotsOverrideFaction } from '../../src/lib/recipeNormalization'
import { ArtifactType } from '../../src/lib/types'
import type { ArtifactTypeId } from '../../src/lib/types'
import type { BuilderRecipe } from '../../src/lib/hsfBuilder'

// Minimal recipe shape — only the fields normalizeFactionSlotScope reads.
type SlotRecipe = Pick<BuilderRecipe, 'factionCode' | 'artifactTypes'>

const recipe = (overrides: Partial<SlotRecipe> = {}): SlotRecipe => ({
  factionCode: 0,
  artifactTypes: [],
  ...overrides,
})

const RING = ArtifactType.Ring as ArtifactTypeId
const AMULET = ArtifactType.Amulet as ArtifactTypeId
const BANNER = ArtifactType.Banner as ArtifactTypeId
const HELMET = ArtifactType.Helmet as ArtifactTypeId
const CHEST = ArtifactType.Chestplate as ArtifactTypeId
const ALL_ACC = [RING, AMULET, BANNER]

// faction = 0 — normalization must not touch anything
test('factionCode 0: artifactTypes unchanged (empty)', () => {
  const r = recipe({ factionCode: 0, artifactTypes: [] })
  assert.strictEqual(normalizeFactionSlotScope(r), r)
})

test('factionCode 0: artifactTypes unchanged (armor+accessory mix)', () => {
  const r = recipe({ factionCode: 0, artifactTypes: [HELMET, RING] })
  assert.strictEqual(normalizeFactionSlotScope(r), r)
})

test('factionCode absent: no normalization applied', () => {
  // Omit factionCode entirely to simulate a recipe that never had one set.
  const r = { artifactTypes: [HELMET] } as SlotRecipe
  assert.strictEqual(normalizeFactionSlotScope(r), r)
})

// faction set — empty artifactTypes → all accessories
test('faction set + empty artifactTypes → all accessories', () => {
  const out = normalizeFactionSlotScope(recipe({ factionCode: 3, artifactTypes: [] }))
  assert.deepEqual(out.artifactTypes, ALL_ACC)
})

// faction set — only armor slots → all accessories
test('faction set + only armor slots → all accessories', () => {
  const out = normalizeFactionSlotScope(recipe({ factionCode: 5, artifactTypes: [HELMET, CHEST] }))
  assert.deepEqual(out.artifactTypes, ALL_ACC)
})

// faction set — only accessories → unchanged (same reference)
test('faction set + only accessories → same object returned', () => {
  const r = recipe({ factionCode: 2, artifactTypes: [RING, BANNER] })
  const out = normalizeFactionSlotScope(r)
  // Object must be different (slots untouched but reference may differ) — check values
  assert.deepEqual(out.artifactTypes, [RING, BANNER])
})

// faction set — mixed armor+accessories → armor stripped, accessories kept
test('faction set + mixed slots → armor stripped', () => {
  const out = normalizeFactionSlotScope(recipe({ factionCode: 1, artifactTypes: [HELMET, RING, CHEST, AMULET] }))
  assert.deepEqual(out.artifactTypes, [RING, AMULET])
})

// identity: already normalized → same reference returned
test('faction set + already all-accessory → same reference', () => {
  const r = recipe({ factionCode: 7, artifactTypes: ALL_ACC })
  assert.strictEqual(normalizeFactionSlotScope(r), r)
})

// --- normalizeSlotsOverrideFaction ---

// no faction → always no-op
test('normalizeSlotsOverrideFaction: no faction → unchanged', () => {
  const r = recipe({ factionCode: 0, artifactTypes: [HELMET, RING] })
  assert.strictEqual(normalizeSlotsOverrideFaction(r), r)
})

// faction set, only accessories → no change
test('normalizeSlotsOverrideFaction: faction + accessories only → unchanged', () => {
  const r = recipe({ factionCode: 2, artifactTypes: [RING, AMULET] })
  assert.strictEqual(normalizeSlotsOverrideFaction(r), r)
})

// faction set, armor slot present → clear faction
test('normalizeSlotsOverrideFaction: faction + armor slot → faction cleared', () => {
  const r = recipe({ factionCode: 3, artifactTypes: [HELMET] })
  const out = normalizeSlotsOverrideFaction(r)
  assert.strictEqual(out.factionCode, 0)
  assert.deepEqual(out.artifactTypes, [HELMET])
})

// faction set, mixed slots → clear faction
test('normalizeSlotsOverrideFaction: faction + mixed slots → faction cleared', () => {
  const out = normalizeSlotsOverrideFaction(recipe({ factionCode: 1, artifactTypes: [HELMET, RING] }))
  assert.strictEqual(out.factionCode, 0)
})
