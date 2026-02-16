import { hashSafeguardCombination, sanitizeSafeguardCountMode, type SafeguardDetectionSnapshot } from './safeguards'

/**
 * Build a stable fingerprint for safeguards detection snapshots so callers in the
 * app shell and the worker can cheaply detect deltas without diffing the full payload.
 * The worker cannot import the React hook version, so this module provides a pure helper.
 */
export const fingerprintSafeguardDetection = (
  snapshot: SafeguardDetectionSnapshot | null,
): string | null => {
  if (!snapshot) return null
  const parts: string[] = []
  for (const entry of snapshot.entries) {
    const mode = sanitizeSafeguardCountMode(entry.countMode)
    parts.push([
      entry.ruleId ?? '',
      entry.ruleActivation ?? '',
      mode.perRule ? 1 : 0,
      mode.perSet ? 1 : 0,
      mode.perFaction ? 1 : 0,
      mode.perMainStat ? 1 : 0,
      mode.perSlot ? 1 : 0,
      entry.groupsTracked,
      entry.perGroupRequiredCount,
      entry.requiredCount,
      entry.currentCount,
      entry.projectedCount,
      entry.deficit,
      entry.coveredByExisting ? 1 : 0,
      entry.itemKeys.join(','),
      entry.placeholders.length,
      entry.placeholders.map((placeholder) => `${hashSafeguardCombination(placeholder.combination)}:${placeholder.missing}:${placeholder.reason}`).join(','),
    ].join(':'))
  }
  return parts.join(';')
}
