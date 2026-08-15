/**
 * safeguardGroupPool.ts
 *
 * The candidate flyout's GROUP VIEW: every piece the members of one group feed, ranked together
 * the way the engine ranks them, with the group's own cutoff. Built purely from the detection
 * snapshot the members already carry — each member's `candidates` (its own ranking; those
 * `isWithinQuota` are the pieces it fed) and its post-cap `itemKeys` (what survived the group's
 * decision) — so the view shows exactly what the scan decided, without a second scoring pass.
 *
 * Ordering mirrors `safeguard_apply_group_caps`: score descending, then the feeder's own rank,
 * then the feeder's position in the run, then the item key. Ranks are re-numbered over the pool
 * (`candidateRank`) and within each of the group's buckets (`bucketRank`, keyed by the group's
 * own scope chips through the same focus-key helper the flyout's focus chip uses).
 */
import {
  safeguardFocusGroupKeyFor,
  type SafeguardCandidateOut,
  type SafeguardDetectionArtifact,
  type SafeguardDetectionEntry,
  type SafeguardRuleCountMode,
} from './safeguards'

export type SafeguardGroupPool = {
  // Pool rows in group order, shaped exactly like a member's own candidate list so the flyout
  // renders them through the same component. `isWithinQuota` here means "kept by the group".
  candidates: SafeguardCandidateOut[]
  // Every artifact any member reported, keyed by item key, for the row renderer.
  artifactsByItemKey: ReadonlyMap<number, SafeguardDetectionArtifact>
  // Which member fed each row: the 1-based safeguard ordinal, for the row's feeder marker.
  feederOrdinalByItemKey: ReadonlyMap<number, number>
}

// One fed piece before ranking; the tie-break fields match the engine's ordering.
type PooledPiece = {
  itemKey: number
  score: number
  ownRank: number
  feederOrder: number
  feederOrdinal: number
  kept: boolean
}

/**
 * Builds the pooled view for one group from its members' detection entries (in run order).
 * Returns null when no member has candidates yet, so the flyout can keep its usual placeholder.
 */
export const buildSafeguardGroupPool = (
  memberEntries: readonly SafeguardDetectionEntry[],
  groupCountMode: SafeguardRuleCountMode,
): SafeguardGroupPool | null => {
  const artifacts = new Map<number, SafeguardDetectionArtifact>()
  const pieces = new Map<number, PooledPiece>()
  let anyCandidates = false
  memberEntries.forEach((entry, feederOrder) => {
    for (const artifact of entry.artifacts ?? []) artifacts.set(artifact.itemKey, artifact)
    const kept = new Set(entry.itemKeys)
    for (const candidate of entry.candidates ?? []) {
      anyCandidates = true
      // Only what the member actually FED reaches the pool: its own top-N (kept and sold alike).
      if (!candidate.isWithinQuota) continue
      // A piece two overlapping members both fed is one piece in the pool; the first (higher in
      // the run) keeps it, matching how the engine's cumulative protection assigns it.
      if (pieces.has(candidate.itemKey)) continue
      pieces.set(candidate.itemKey, {
        itemKey: candidate.itemKey,
        score: candidate.score,
        ownRank: candidate.candidateRank,
        feederOrder,
        feederOrdinal: entry.ruleOrdinal ?? feederOrder + 1,
        kept: kept.has(candidate.itemKey),
      })
    }
  })
  if (!anyCandidates) return null
  // Best score first, then the engine's deterministic tie-breaks.
  const ordered = Array.from(pieces.values()).sort((left, right) => (
    right.score - left.score
    || left.ownRank - right.ownRank
    || left.feederOrder - right.feederOrder
    || left.itemKey - right.itemKey
  ))
  // Per-bucket counters keyed by the group's chips; a null key means one global bucket.
  const bucketCounters = new Map<string, number>()
  const feederOrdinalByItemKey = new Map<number, number>()
  const candidates: SafeguardCandidateOut[] = ordered.map((piece, index) => {
    const artifact = artifacts.get(piece.itemKey)
    const bucketKey = artifact ? (safeguardFocusGroupKeyFor(artifact, groupCountMode) ?? '') : ''
    const bucketRank = (bucketCounters.get(bucketKey) ?? 0) + 1
    bucketCounters.set(bucketKey, bucketRank)
    feederOrdinalByItemKey.set(piece.itemKey, piece.feederOrdinal)
    return {
      itemKey: piece.itemKey,
      score: piece.score,
      candidateRank: index + 1,
      bucketRank,
      isWithinQuota: piece.kept,
    }
  })
  return { candidates, artifactsByItemKey: artifacts, feederOrdinalByItemKey }
}
