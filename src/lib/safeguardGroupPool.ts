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
  safeguardFocusBucketKeyFor,
  type SafeguardCandidateOut,
  type SafeguardDetectionArtifact,
  type SafeguardDetectionEntry,
  type SafeguardRuleCountMode,
} from './safeguards'
import type { NameAppearance } from './nameAppearance'

// Bucket-counter key for a group with no scope chip at all: every row ranks in one shared pool.
// `safeguardFocusBucketKeyFor` returns null for that case and never emits this string itself, so
// it cannot collide with a real key.
const GLOBAL_BUCKET_KEY = 'bucket:global'
// Prefix for a piece whose artifact is missing from the detection snapshot. Suffixed with the
// item key so each such row lands in a private bucket and cannot displace real pieces' ranks.
const UNKNOWN_BUCKET_KEY_PREFIX = 'bucket:unknown:'

/** How one pooled row's feeding member identifies itself in the list. */
export type SafeguardGroupFeeder = {
  // The feeder's 1-based safeguard ordinal, for the row's feeder marker and match attribution.
  ordinal: number
  // The feeder's name/colour, or undefined when that member carries no appearance of its own.
  appearance: NameAppearance | undefined
}

export type SafeguardGroupPool = {
  // Pool rows in group order, shaped exactly like a member's own candidate list so the flyout
  // renders them through the same component. `isWithinQuota` here means "kept by the group".
  candidates: SafeguardCandidateOut[]
  // Every artifact any member reported, keyed by item key, for the row renderer.
  artifactsByItemKey: ReadonlyMap<number, SafeguardDetectionArtifact>
  // Which member fed each row. The pooled list mixes every member's gear, so a row must be
  // attributed to ITS feeder — naming them all after the rule whose flyout is open would print
  // one member's name beside another's feeder ordinal, and the whole point of the view is to
  // answer "why was my piece kept/sold".
  feederByItemKey: ReadonlyMap<number, SafeguardGroupFeeder>
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
 *
 * `appearanceByOrdinal` supplies each member's name/colour by its 1-based safeguard ordinal, so
 * every pooled row can be attributed to the member that actually fed it.
 */
export const buildSafeguardGroupPool = (
  memberEntries: readonly SafeguardDetectionEntry[],
  groupCountMode: SafeguardRuleCountMode,
  appearanceByOrdinal: ReadonlyMap<number, NameAppearance>,
): SafeguardGroupPool | null => {
  const artifacts = new Map<number, SafeguardDetectionArtifact>()
  const pieces = new Map<number, PooledPiece>()
  let anyCandidates = false
  memberEntries.forEach((entry, feederOrder) => {
    // Callers select these entries BY ruleOrdinal, so it is always present; there is deliberately
    // no fallback to feederOrder + 1, which is the member's index within the RUN and would point
    // the feeder marker at an unrelated chip whenever the group does not start the list.
    const feederOrdinal = entry.ruleOrdinal
    if (feederOrdinal == null) return
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
        feederOrdinal,
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
  const feederByItemKey = new Map<number, SafeguardGroupFeeder>()
  const candidates: SafeguardCandidateOut[] = ordered.map((piece, index) => {
    const artifact = artifacts.get(piece.itemKey)
    // Two distinct "no key" cases that must NOT share a counter: a group with no scope chip is
    // one global bucket (every row genuinely ranks together), while a piece whose artifact never
    // reached the snapshot has no bucket at all. Folding both onto '' let the artifact-less rows
    // consume the global bucket's first ranks and push every real piece past the cutoff line.
    // The global bucket keeps the shared key; an unknown piece gets its own private one.
    const bucketKey = artifact
      ? (safeguardFocusBucketKeyFor(artifact, groupCountMode) ?? GLOBAL_BUCKET_KEY)
      : `${UNKNOWN_BUCKET_KEY_PREFIX}${piece.itemKey}`
    const bucketRank = (bucketCounters.get(bucketKey) ?? 0) + 1
    bucketCounters.set(bucketKey, bucketRank)
    // Attribute the row to its feeder, carrying that member's own appearance.
    feederByItemKey.set(piece.itemKey, {
      ordinal: piece.feederOrdinal,
      appearance: appearanceByOrdinal.get(piece.feederOrdinal),
    })
    return {
      itemKey: piece.itemKey,
      score: piece.score,
      candidateRank: index + 1,
      bucketRank,
      isWithinQuota: piece.kept,
    }
  })
  return { candidates, artifactsByItemKey: artifacts, feederByItemKey }
}
