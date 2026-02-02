/**
 * substatTargets.ts
 *
 * Shared helpers for cloning and normalizing substat target tables.
 */
import type { SubstatTargetTable } from './hsfBuilder'

// cloneSubstatTargets keeps history snapshots isolated from live edits.
export const cloneSubstatTargets = (targets: SubstatTargetTable): SubstatTargetTable => ({
  // Clone each star bucket so nested maps cannot be mutated later.
  one: { ...(targets.one ?? {}) },
  // Preserve defaults by copying the record object per star.
  two: { ...(targets.two ?? {}) },
  // Keep the same shape so diffing logic sees stable keys.
  three: { ...(targets.three ?? {}) },
  // Clone higher-rank buckets to avoid shared references.
  four: { ...(targets.four ?? {}) },
  // Preserve the full 1–6★ set even when values are sparse.
  five: { ...(targets.five ?? {}) },
  // Always include six-star entries so fallbacks are deterministic.
  six: { ...(targets.six ?? {}) },
  // Carry the any-rank fallback so preview logic stays aligned.
  anyRankDefaultsTo: targets.anyRankDefaultsTo ?? 6,
})
