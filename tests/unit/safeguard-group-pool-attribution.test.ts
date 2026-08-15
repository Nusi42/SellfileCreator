import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSafeguardGroupPool } from '../../src/lib/safeguardGroupPool.js'
import { SAFEGUARD_DEFAULT_COUNT_MODE, SafeguardRuleActivation } from '../../src/lib/safeguards.js'
import type { SafeguardDetectionEntry } from '../../src/lib/safeguards.js'
import type { NameAppearance } from '../../src/lib/nameAppearance.js'

// A detection entry carrying just the fields the pool builder reads; the rest are inert filler so
// the fixture stays readable when the entry type grows.
const makeEntry = (params: {
  ruleOrdinal: number | null
  candidates: { itemKey: number, score: number, candidateRank: number, isWithinQuota: boolean }[]
  itemKeys: number[]
}): SafeguardDetectionEntry => ({
  hash: `entry-${params.ruleOrdinal}`,
  combination: { slots: [], sets: [], ranks: [], rarities: [], mainStats: [], factions: [] },
  ruleOrdinal: params.ruleOrdinal,
  ruleActivation: SafeguardRuleActivation.ProtectExisting,
  countMode: SAFEGUARD_DEFAULT_COUNT_MODE,
  perBucketRequiredCount: 1,
  bucketsTracked: 1,
  requiredCount: 1,
  currentCount: 0,
  projectedCount: 0,
  deficit: 0,
  coveredByExisting: false,
  itemKeys: params.itemKeys,
  artifacts: [],
  candidates: params.candidates.map((candidate) => ({ ...candidate, bucketRank: candidate.candidateRank })),
} as unknown as SafeguardDetectionEntry)

const appearance = (name: string): NameAppearance => ({ name } as NameAppearance)

test('pooled rows are attributed to the member that fed them, not the edited rule', () => {
  // Two members of one run, sitting at list positions 8 and 10 so a run-relative index would be
  // visibly wrong. Each feeds one distinct piece.
  const members = [
    makeEntry({ ruleOrdinal: 8, candidates: [{ itemKey: 100, score: 9, candidateRank: 1, isWithinQuota: true }], itemKeys: [100] }),
    makeEntry({ ruleOrdinal: 10, candidates: [{ itemKey: 200, score: 5, candidateRank: 1, isWithinQuota: true }], itemKeys: [] }),
  ]
  const appearances = new Map([[8, appearance('Alpha')], [10, appearance('Beta')]])

  const pool = buildSafeguardGroupPool(members, SAFEGUARD_DEFAULT_COUNT_MODE, appearances)
  assert.ok(pool)

  // The piece fed by member #10 must carry member #10's ordinal AND its own name — labelling it
  // after whichever member's flyout is open is the bug this guards.
  const fedByBeta = pool.feederByItemKey.get(200)
  assert.equal(fedByBeta?.ordinal, 10)
  assert.equal(fedByBeta?.appearance?.name, 'Beta')

  const fedByAlpha = pool.feederByItemKey.get(100)
  assert.equal(fedByAlpha?.ordinal, 8)
  assert.equal(fedByAlpha?.appearance?.name, 'Alpha')
})

test('feeder ordinals are list-absolute, never the run-relative index', () => {
  // A single-member run late in the list: the run-relative index would be 1, the true ordinal 7.
  const members = [
    makeEntry({ ruleOrdinal: 7, candidates: [{ itemKey: 300, score: 1, candidateRank: 1, isWithinQuota: true }], itemKeys: [300] }),
  ]
  const pool = buildSafeguardGroupPool(members, SAFEGUARD_DEFAULT_COUNT_MODE, new Map())
  assert.equal(pool?.feederByItemKey.get(300)?.ordinal, 7)
})

test('a member without an ordinal cannot reach the pool', () => {
  // Entries are selected BY ordinal upstream, so a null one is a contract violation rather than a
  // row to guess an ordinal for — it must be dropped, not folded in under a fabricated number.
  const members = [
    makeEntry({ ruleOrdinal: null, candidates: [{ itemKey: 400, score: 1, candidateRank: 1, isWithinQuota: true }], itemKeys: [400] }),
  ]
  assert.equal(buildSafeguardGroupPool(members, SAFEGUARD_DEFAULT_COUNT_MODE, new Map()), null)
})

test('a member with no appearance yields an undefined appearance, not a sibling\'s', () => {
  const members = [
    makeEntry({ ruleOrdinal: 2, candidates: [{ itemKey: 500, score: 9, candidateRank: 1, isWithinQuota: true }], itemKeys: [500] }),
    makeEntry({ ruleOrdinal: 3, candidates: [{ itemKey: 600, score: 5, candidateRank: 1, isWithinQuota: true }], itemKeys: [] }),
  ]
  // Only member #2 has a name; member #3's row must not inherit it.
  const pool = buildSafeguardGroupPool(members, SAFEGUARD_DEFAULT_COUNT_MODE, new Map([[2, appearance('Named')]]))
  assert.equal(pool?.feederByItemKey.get(500)?.appearance?.name, 'Named')
  assert.equal(pool?.feederByItemKey.get(600)?.appearance, undefined)
})

test('a piece fed by two overlapping members is pooled once, to the earlier member', () => {
  // Mirrors the engine's cumulative assignment (and the Rust BTreeSet dedupe): one piece, one row.
  const members = [
    makeEntry({ ruleOrdinal: 4, candidates: [{ itemKey: 700, score: 9, candidateRank: 1, isWithinQuota: true }], itemKeys: [700] }),
    makeEntry({ ruleOrdinal: 5, candidates: [{ itemKey: 700, score: 9, candidateRank: 1, isWithinQuota: true }], itemKeys: [] }),
  ]
  const pool = buildSafeguardGroupPool(members, SAFEGUARD_DEFAULT_COUNT_MODE, new Map())
  assert.equal(pool?.candidates.filter((row) => row.itemKey === 700).length, 1)
  assert.equal(pool?.feederByItemKey.get(700)?.ordinal, 4)
})
