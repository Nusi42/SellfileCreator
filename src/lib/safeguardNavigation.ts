import type { HsfRuleWithRecipe } from './merge'
import { RULE_SOURCE_SAFEGUARDS } from './ruleSources'

// Safeguard star clicks can either jump to Rule Tester or back into Safeguards.
// Keep this token centralized so App + tests share one decision contract.
export type SafeguardPreviewStarAction = 'openTester' | 'openSafeguards'

// Concrete safeguard rows come from real gear matches.
// Placeholder rows represent anticipate gaps and should route to Safeguards editing.
const isConcreteSafeguardRow = (rule: HsfRuleWithRecipe): boolean => (
  rule.__source === RULE_SOURCE_SAFEGUARDS
  && typeof rule.__safeguardItemKey === 'number'
  && Number.isFinite(rule.__safeguardItemKey)
  && rule.__safeguardPlaceholder !== true
)

// Scan the merged preview rows for at least one real-gear match for the selected safeguard rule.
// Returning false means the rule currently only has placeholder/anticipate coverage.
export function hasConcreteSafeguardRowForRule(
  rules: readonly HsfRuleWithRecipe[],
  safeguardRuleId: string | null | undefined,
): boolean {
  if (!safeguardRuleId) return false
  const normalizedRuleId = safeguardRuleId.trim()
  if (normalizedRuleId.length === 0) return false
  return rules.some((rule) => (
    isConcreteSafeguardRow(rule)
    && rule.__safeguardRuleId === normalizedRuleId
  ))
}

// Resolve where the UI should navigate when a safeguard-star row is clicked.
// Real matches go to Rule Tester, while anticipate-only rules go to Safeguards.
export function resolveSafeguardPreviewStarAction(
  rules: readonly HsfRuleWithRecipe[],
  safeguardRuleId: string | null | undefined,
): SafeguardPreviewStarAction {
  return hasConcreteSafeguardRowForRule(rules, safeguardRuleId)
    ? 'openTester'
    : 'openSafeguards'
}
