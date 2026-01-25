import { RULE_SOURCE_KEEP_UNIQUES } from './merge'
import type { TesterOutcomeSummary, TesterPreviewRow } from '../types/testerPreview'

// Summarize sell/keep outcomes for a given set of tester rows.
export function buildTesterOutcomeSummary(rows: readonly TesterPreviewRow[]): TesterOutcomeSummary {
  // Track sold outcomes separately so kept can be derived without re-scanning.
  let soldCount = 0
  // Track Keep Unique wins so the summary can highlight protections.
  let keepUniqueKeepCount = 0
  for (const row of rows) {
    // Explicit sell matches are the only outcomes that leave the kept bucket.
    if (row.match?.keep === false) soldCount += 1
    // Keep Unique injections carry a dedicated rule source tag.
    if (row.match?.ruleSource === RULE_SOURCE_KEEP_UNIQUES) keepUniqueKeepCount += 1
  }
  // Total rows define the gear population represented in this summary.
  const total = rows.length
  // Kept includes explicit Keep matches plus any item without a Sell rule.
  const kept = total - soldCount
  return {
    total,
    sold: soldCount,
    kept,
    keptByKeepUniques: keepUniqueKeepCount,
  }
}
