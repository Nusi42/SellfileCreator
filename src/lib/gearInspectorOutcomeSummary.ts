import { RULE_SOURCE_SAFEGUARDS } from './merge'
import { isMatchSold } from './gearInspectorVerdict'
import type { GearInspectorOutcomeSummary, GearInspectorPreviewRow } from '../types/gearInspectorPreview'

// Summarize sell/keep outcomes for a given set of Gear Inspector rows.
export function buildGearInspectorOutcomeSummary(rows: readonly GearInspectorPreviewRow[]): GearInspectorOutcomeSummary {
  // Track sold outcomes separately so kept can be derived without re-scanning.
  let soldCount = 0
  // Track Safeguard wins so the summary can highlight protections.
  let safeguardKeepCount = 0
  for (const row of rows) {
    // Explicit sell matches are the only outcomes that leave the kept bucket.
    if (isMatchSold(row.match)) soldCount += 1
    // Safeguard injections carry a dedicated rule source tag.
    if (row.match?.ruleSource === RULE_SOURCE_SAFEGUARDS) safeguardKeepCount += 1
  }
  // Total rows define the gear population represented in this summary.
  const total = rows.length
  // Kept includes explicit Keep matches plus any item without a Sell rule.
  const kept = total - soldCount
  return {
    total,
    sold: soldCount,
    kept,
    keptBySafeguards: safeguardKeepCount,
  }
}

// Paired result: scoped counts (items visible after filtering) alongside totals (full DB).
export type GearInspectorOutcomeSummaryPair = {
  scoped: GearInspectorOutcomeSummary
  total: GearInspectorOutcomeSummary
}

// Compute scoped and total summaries in a single pass over all rows.
// scopedIds contains the artifact IDs of items currently visible after filtering;
// every row contributes to total, but only rows in scopedIds contribute to scoped.
export function buildGearInspectorOutcomeSummaryPair(
  allRows: readonly GearInspectorPreviewRow[],
  scopedIds: ReadonlySet<number>,
): GearInspectorOutcomeSummaryPair {
  let totalSold = 0, totalSafeguard = 0
  let scopedSold = 0, scopedSafeguard = 0, scopedTotal = 0
  for (const row of allRows) {
    const isSell = isMatchSold(row.match)
    const isSafeguard = row.match?.ruleSource === RULE_SOURCE_SAFEGUARDS
    if (isSell) totalSold += 1
    if (isSafeguard) totalSafeguard += 1
    if (scopedIds.has(row.artifact.id)) {
      scopedTotal += 1
      if (isSell) scopedSold += 1
      if (isSafeguard) scopedSafeguard += 1
    }
  }
  const totalCount = allRows.length
  return {
    scoped: { total: scopedTotal, sold: scopedSold, kept: scopedTotal - scopedSold, keptBySafeguards: scopedSafeguard },
    total: { total: totalCount, sold: totalSold, kept: totalCount - totalSold, keptBySafeguards: totalSafeguard },
  }
}
