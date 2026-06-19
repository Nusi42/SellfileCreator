/* eslint import/no-unused-modules: off */

// Coverage for safeguardFocusGroupKeyFor — the SSOT that the improvement-chance flyout uses to
// scope the candidate list to a single count-group when a per-row focus button is toggled. The key
// must mirror WASM bucketing: two artifacts share a key iff they share a quota bucket under the
// active count-mode dimensions. These tests pin that (a) only active dimensions participate,
// (b) different dimensions never collide, and (c) an all-inactive mode yields null (global group).

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  safeguardFocusGroupKeyFor,
  type SafeguardDetectionArtifact,
  type SafeguardRuleCountMode,
} from '../../src/lib/safeguards.js'
import { ArtifactType, ArtifactSet, StatVariant, Faction, type ArtifactSetId } from '../../src/lib/types.js'

// Minimal artifact builder — only the dimension fields matter for grouping; the rest are filler.
const artifact = (over: Partial<SafeguardDetectionArtifact> = {}): SafeguardDetectionArtifact => ({
  itemKey: 1,
  slot: ArtifactType.Weapon,
  set: ArtifactSet.Offense,
  rank: 6,
  rarity: 5,
  level: 16,
  exactLevel: 16,
  faction: Faction.BannerLords,
  mainStat: StatVariant.ATK,
  substats: [],
  ...over,
})

const mode = (over: Partial<SafeguardRuleCountMode> = {}): SafeguardRuleCountMode => ({
  perRule: false,
  perSlot: false,
  perSet: false,
  perFaction: false,
  perMainStat: false,
  ...over,
})

test('no active per-group dimension yields null (single global group)', () => {
  assert.equal(safeguardFocusGroupKeyFor(artifact(), mode()), null)
  // perRule alone is not a grouping dimension.
  assert.equal(safeguardFocusGroupKeyFor(artifact(), mode({ perRule: true })), null)
})

test('only active dimensions participate in the key', () => {
  const a = artifact({ slot: ArtifactType.Helmet, mainStat: StatVariant.HP })
  const b = artifact({ slot: ArtifactType.Helmet, mainStat: StatVariant.DEF })
  // Group by slot only → same slot ⇒ same key despite different main stat.
  assert.equal(
    safeguardFocusGroupKeyFor(a, mode({ perSlot: true })),
    safeguardFocusGroupKeyFor(b, mode({ perSlot: true })),
  )
  // Group by main stat only → different main ⇒ different key.
  assert.notEqual(
    safeguardFocusGroupKeyFor(a, mode({ perMainStat: true })),
    safeguardFocusGroupKeyFor(b, mode({ perMainStat: true })),
  )
})

test('multi-dimension keys split on any differing active dimension', () => {
  const both = mode({ perSlot: true, perSet: true })
  const base = artifact({ slot: ArtifactType.Helmet, set: ArtifactSet.Offense })
  const sameGroup = artifact({ slot: ArtifactType.Helmet, set: ArtifactSet.Offense })
  const diffSet = artifact({ slot: ArtifactType.Helmet, set: ArtifactSet.Defense })
  assert.equal(safeguardFocusGroupKeyFor(base, both), safeguardFocusGroupKeyFor(sameGroup, both))
  assert.notEqual(safeguardFocusGroupKeyFor(base, both), safeguardFocusGroupKeyFor(diffSet, both))
})

test('dimension values are prefixed so cross-dimension collisions cannot occur', () => {
  // A set id and a faction id with the same numeric value must not produce the same key segment.
  const a = artifact({ set: 2 as ArtifactSetId, faction: 2 as typeof Faction.BannerLords })
  const keySet = safeguardFocusGroupKeyFor(a, mode({ perSet: true }))
  const keyFaction = safeguardFocusGroupKeyFor(a, mode({ perFaction: true }))
  assert.notEqual(keySet, keyFaction)
})
