/* eslint import/no-unused-modules: off */
/**
 * safeguard-score-candidates
 *
 * Regression test for scoreSafeguardCandidates — the live-preview scoring path used
 * by the substats weights popover. Covers two bugs found together in production:
 *
 *  1. WASM init: scoreSafeguardCandidatesWithLoadedWasm throws when called on the
 *     main thread without prior WASM initialization (wasmInitialized flag is per-
 *     execution-context — main thread and workers have separate instances).
 *
 *  2. Field name mismatch: SafeguardDetectionArtifact.itemKey was serialized as-is
 *     to WASM which expects `id` (camelCase of Rust `pub id`). The serde
 *     `deny_unknown_fields` attribute rejected the payload silently via a caught error.
 *
 * These tests are intentionally simple: they verify that the function (a) does not
 * throw, (b) produces candidates ranked by weighted score, and (c) respects requiredCount
 * for isWithinQuota. Any field-name regression in the remap will produce a WASM serde
 * error that surfaces here before reaching production.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { scoreSafeguardCandidates, type SafeguardDetectionArtifact } from '../../src/lib/safeguards.js'
import { ArtifactSet, ArtifactType, Faction, StatVariant } from '../../src/lib/types.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'

// Minimal artifact fixture — only fields consumed by the scoring formula vary.
const makeArtifact = (itemKey: number, substats: SafeguardDetectionArtifact['substats']): SafeguardDetectionArtifact => ({
  itemKey,
  slot: ArtifactType.Weapon,
  set: ArtifactSet.Speed,
  rank: 6,
  rarity: 5,
  level: 16,
  exactLevel: 16,
  faction: Faction.BannerLords,
  mainStat: StatVariant.ATK,
  substats,
})

test('scoreSafeguardCandidates ranks by weighted score and respects requiredCount', async () => {
  // Bug 1 regression: WASM must be initialized before calling the sync scoring path.
  // warmupWasmRuleEngine is the standard test-context init (no 256 MB pre-grow side effect).
  await warmupWasmRuleEngine()

  // Three artifacts: A has the highest SPD roll, C has the lowest.
  const artifacts: SafeguardDetectionArtifact[] = [
    makeArtifact(101, [{ variant: StatVariant.SPD, isFlat: true, value: 6 }]),
    makeArtifact(102, [{ variant: StatVariant.SPD, isFlat: true, value: 10 }]),
    makeArtifact(103, [{ variant: StatVariant.SPD, isFlat: true, value: 3 }]),
  ]

  // Bug 2 regression: if itemKey is not remapped to id the WASM call throws here.
  const candidates = scoreSafeguardCandidates({
    artifacts,
    substats: [StatVariant.SPD],
    weights: { [StatVariant.SPD]: 1 },
    weightMainStatByRank: false,
    mainStatRankWeightFactor: 1,
    requiredCount: 1,
  })

  // SPD=10 (key 102) must rank first; SPD=3 (key 103) must rank last.
  const ranked = [...candidates].sort((a, b) => a.candidateRank - b.candidateRank)
  assert.equal(ranked[0]?.itemKey, 102, 'highest SPD roll must be rank 1')
  assert.equal(ranked[ranked.length - 1]?.itemKey, 103, 'lowest SPD roll must rank last')

  // requiredCount=1 means only rank-1 is within quota; all others are not.
  const withinQuota = candidates.filter(c => c.isWithinQuota)
  assert.equal(withinQuota.length, 1, 'exactly one candidate should be within quota')
  assert.equal(withinQuota[0]?.itemKey, 102, 'the kept item must be the highest scorer')
})

test('scoreSafeguardCandidates returns empty array when no substats are configured', async () => {
  await warmupWasmRuleEngine()

  const artifacts: SafeguardDetectionArtifact[] = [
    makeArtifact(201, [{ variant: StatVariant.SPD, isFlat: true, value: 8 }]),
  ]

  // No substats → WASM scores every artifact at 0, so none appear in the result.
  const candidates = scoreSafeguardCandidates({
    artifacts,
    substats: [],
    weights: {},
    weightMainStatByRank: false,
    mainStatRankWeightFactor: 1,
    requiredCount: 1,
  })

  assert.equal(candidates.length, 0, 'zero-scored artifacts must be omitted from results')
})
