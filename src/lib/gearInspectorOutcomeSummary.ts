import { RULE_SOURCE_SAFEGUARDS } from './merge'
import type { GearInspectorOutcomeSummary, GearInspectorPreviewRow } from '../types/gearInspectorPreview'

// Summarize sell/keep outcomes for a given set of Gear Inspector rows.
export function buildGearInspectorOutcomeSummary(rows: readonly GearInspectorPreviewRow[]): GearInspectorOutcomeSummary {
  // Track sold outcomes separately so kept can be derived without re-scanning.
  let soldCount = 0
  // Track Safeguard wins so the summary can highlight protections.
  let safeguardKeepCount = 0
  for (const row of rows) {
    // Explicit sell matches are the only outcomes that leave the kept bucket.
    if (row.match?.keep === false) soldCount += 1
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
