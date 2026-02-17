import test from 'node:test'
import assert from 'node:assert/strict'
import { dedupeHsfRulesForExport } from '../../src/lib/hsfDeduplicate'
import type { HsfRuleWithRecipe } from '../../src/lib/merge'
import { StatId } from '../../src/lib/types'

function makeRule(artifactSets: number[]): HsfRuleWithRecipe {
  return {
    Keep: true,
    IsRuleTypeAND: false,
    Use: true,
    ArtifactSet: artifactSets.slice(),
    ArtifactType: [1],
    Rank: 6,
    Rarity: 9,
    MainStatID: StatId.Any,
    MainStatF: 1,
    LVLForCheck: 0,
    Faction: 0,
    Substats: [
      {
        ID: StatId.SPD,
        Value: 5,
        IsFlat: false,
        NotAvailable: false,
        Condition: '>=',
      },
    ],
  }
}

test('dedupe drops set subsets when a superset already exists', () => {
  const superset = makeRule([4, 7, 18, 27])
  const subset = makeRule([4, 18])
  const deduped = dedupeHsfRulesForExport([superset, subset])
  assert.equal(deduped.length, 1)
  assert.deepEqual(deduped[0]?.ArtifactSet, [4, 7, 18, 27])
})

test('dedupe order does not matter for set superset coverage', () => {
  const superset = makeRule([4, 7, 18, 27])
  const subset = makeRule([4, 18])
  const deduped = dedupeHsfRulesForExport([subset, superset])
  assert.equal(deduped.length, 1)
  assert.deepEqual(deduped[0]?.ArtifactSet, [4, 7, 18, 27])
})

export const __hsfDeduplicateTestMarker = true
