/**
 * safeguardsDescriptors
 *
 * History descriptor helpers for Safeguards so the timeline can display
 * structured rule snapshots with the same visual language as builder diffs.
 */
// safeguardsDescriptors keeps safeguard history data-only until render.
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { SafeguardRule, SafeguardRuleActivation, SafeguardRuleCountMode } from '../lib/safeguards'
import { SafeguardSubstatMatch, normalizeSafeguardSubstatMatch } from '../lib/safeguards'
import type { Metaset } from '../lib/metasets'
import { compareArtifactSets, compareArtifactTypes, compareVariants, factionI18nKey, statVariantI18nKey, StatVariant, STAT_VARIANTS_PRIORITY } from '../lib/types'
import type { TranslateFn } from './builderUpdateDescriptor'
import { collectMetasetSnapshotEntries, normalizeNumberArray } from './historyDescriptorUtils'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from '../lib/gearSets/selection'
import type { SafeguardsRulesDescriptorMode } from './historyDescriptorTypes'
import { snapshotSafeguardRules, snapshotMetasets } from './historySnapshotUtils'
import { normalizeTesterSortWeight, TESTER_SORT_WEIGHT_DEFAULT } from '../lib/testerSort'

export type { SafeguardsRulesDescriptorMode }

type RuleChangeSummary = {
  added: SafeguardRule[]
  removed: SafeguardRule[]
  updated: Array<{ previous: SafeguardRule; next: SafeguardRule }>
}

type SafeguardRuleSignature = {
  id: string
  name: string
  requiredCount: number
  activation: SafeguardRuleActivation
  ignorePreviousSafeguards: boolean
  ignoreEquippedInCollection: boolean
  ignoreEquippedInVault: boolean
  countMode: SafeguardRuleCountMode
  slots: number[]
  sets: Array<{ id: number; excluded: boolean }>
  meta: string[]
  ranks: number[]
  rarities: number[]
  mains: number[]
  factions: number[]
  substats: number[]
  substatMatch: SafeguardSubstatMatch
  substatWeights: Array<[number, number]>
}

// isSafeguardRuleOrderChanged flags pure reorders so history can record them.
export const isSafeguardRuleOrderChanged = (previous: SafeguardRule[], next: SafeguardRule[]): boolean => {
  // Reorders only matter when the list lengths match.
  if (previous.length !== next.length) return false
  // Any ID mismatch at the same index means the order changed.
  return previous.some((rule, index) => rule.id !== next[index]?.id)
}

// createSafeguardsEnabledChangeDescriptor snapshots the toggle history entry.
export const createSafeguardsEnabledChangeDescriptor = (params: {
  previousEnabled: boolean
  nextEnabled: boolean
  rules: SafeguardRule[]
}): HistoryEntryDescriptor | null => {
  const { previousEnabled, nextEnabled, rules } = params
  if (previousEnabled === nextEnabled) return null
  return {
    kind: 'safeguardsEnabledChange',
    previousEnabled,
    nextEnabled,
    rules: snapshotSafeguardRules(rules),
  }
}

// createSafeguardsRulesChangeDescriptor snapshots safeguard rule edits.
export const createSafeguardsRulesChangeDescriptor = (params: {
  previous: SafeguardRule[]
  next: SafeguardRule[]
  metasets: Metaset[]
  mode?: SafeguardsRulesDescriptorMode
}): HistoryEntryDescriptor | null => {
  const { previous, next, metasets, mode = 'edit' } = params
  const summary = diffSafeguardRules(previous, next)
  const totalChanges = summary.added.length + summary.removed.length + summary.updated.length
  // Reorders should still be recorded even when the rules themselves are unchanged.
  const orderChanged = isSafeguardRuleOrderChanged(previous, next)
  if (totalChanges === 0 && !orderChanged) return null
  return {
    kind: 'safeguardsRulesChange',
    previous: snapshotSafeguardRules(previous),
    next: snapshotSafeguardRules(next),
    metasets: snapshotMetasets(metasets),
    mode,
  }
}

// describeSafeguardsEnabledChange localizes toggle history entries.
export function describeSafeguardsEnabledChange(params: {
  previousEnabled: boolean
  nextEnabled: boolean
  rules: SafeguardRule[]
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor | null {
  const { previousEnabled, nextEnabled, rules, t } = params
  // Skip when the toggle is effectively unchanged.
  if (previousEnabled === nextEnabled) return null
  // Pick the title based on the new toggle state.
  const titleKey = nextEnabled ? 'historySafeguardsEnabledTitle' : 'historySafeguardsDisabledTitle'
  // Always surface the number of rules so the toggle context is visible.
  const detailLines = [t('historySafeguardsRulesCountLine', { count: rules.length })]
  // Emit a simple descriptor so history timelines stay succinct.
  return { title: t(titleKey), detailLines }
}

// describeSafeguardsRulesChange localizes safeguard rule changes.
export function describeSafeguardsRulesChange(params: {
  previous: SafeguardRule[]
  next: SafeguardRule[]
  metasets: Metaset[]
  t: TranslateFn
  mode?: SafeguardsRulesDescriptorMode
}): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, metasets, t, mode = 'edit' } = params
  // Treat identical rule lists as no-op so we do not enqueue empty history.
  const summary = diffSafeguardRules(previous, next)
  // Count the total change footprint to steer the descriptor shape.
  const totalChanges = summary.added.length + summary.removed.length + summary.updated.length
  // Track reorders separately so move actions get their own history entries.
  const orderChanged = isSafeguardRuleOrderChanged(previous, next)
  if (totalChanges === 0) {
    if (!orderChanged) return null
    const title = t('historySafeguardsRulesReorderedTitle')
    const detailLines = summarizeRuleOrder(next, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  if (mode === 'reset') {
    // Reset has a dedicated title so history stays explicit.
    return {
      title: t('historySafeguardsResetTitle'),
      detailLines: [t('historySafeguardsRulesCountLine', { count: next.length })],
    }
  }

  if (summary.added.length === 1 && summary.removed.length === 0 && summary.updated.length === 0) {
    // Use the added rule snapshot when only one rule is introduced.
    const rule = summary.added[0]!
    const title = t('historySafeguardsRuleAddedTitle', { name: formatRuleName(rule, t) })
    const detailLines = buildSafeguardRuleSnapshotLines(rule, metasets, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  if (summary.removed.length === 1 && summary.added.length === 0 && summary.updated.length === 0) {
    // Use the removed rule snapshot when only one rule is deleted.
    const rule = summary.removed[0]!
    const title = t('historySafeguardsRuleDeletedTitle', { name: formatRuleName(rule, t) })
    const detailLines = buildSafeguardRuleSnapshotLines(rule, metasets, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  if (summary.updated.length === 1 && summary.added.length === 0 && summary.removed.length === 0) {
    // Use the updated rule snapshot when only one rule changes.
    const update = summary.updated[0]!
    // Reuse the new rule name in the title so it mirrors the rule card.
    const title = t('historySafeguardsRuleUpdatedTitle', { name: formatRuleName(update.next, t) })
    // Emit before/after lines for only the fields that actually changed.
    const detailLines = buildSafeguardRuleDiffLines(update.previous, update.next, metasets, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  // Fall back to a summary when multiple rules are affected at once.
  const title = t('historySafeguardsRulesUpdatedTitle', { count: totalChanges })
  const detailLines = summarizeRuleNames(summary, t)
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

function diffSafeguardRules(previous: SafeguardRule[], next: SafeguardRule[]): RuleChangeSummary {
  // Index both lists by rule ID so additions/removals are easy to spot.
  const previousById = new Map(previous.map((rule) => [rule.id, rule]))
  const nextById = new Map(next.map((rule) => [rule.id, rule]))
  // Track rule-level changes by comparing stable signatures.
  const added: SafeguardRule[] = []
  const removed: SafeguardRule[] = []
  const updated: Array<{ previous: SafeguardRule; next: SafeguardRule }> = []
  for (const [id, rule] of nextById) {
    // Lookup the previous rule to detect add vs update.
    const prevRule = previousById.get(id)
    if (!prevRule) {
      // New ID => added rule.
      added.push(rule)
      continue
    }
    // Compare normalized signatures so ordering noise does not trigger updates.
    if (!safeguardRuleSignaturesEqual(buildSafeguardRuleSignature(prevRule), buildSafeguardRuleSignature(rule))) {
      updated.push({ previous: prevRule, next: rule })
    }
  }
  for (const [id, rule] of previousById) {
    // Missing ID => removed rule.
    if (!nextById.has(id)) removed.push(rule)
  }
  return { added, removed, updated }
}

function buildSafeguardRuleSignature(rule: SafeguardRule): SafeguardRuleSignature {
  // Normalize array order so signatures ignore ordering noise.
  const combo = rule.combination
  // Normalize slots so set ordering differences do not count as edits.
  const slots = normalizeNumberArray(combo.slots).slice().sort(compareArtifactTypes)
  // Normalize set entries so exclusions are captured in the signature.
  const sets = normalizeArtifactSetSelections(combo.sets ?? [])
    .map((entry) => ({ id: Number(entry.id), excluded: entry.excluded === true }))
  // Normalize metaset IDs so their order does not affect comparisons.
  const meta = Array.isArray(combo.metaSetIds) ? combo.metaSetIds.map(String).sort() : []
  // Normalize ranks so signatures match regardless of selection order.
  const ranks = normalizeNumberArray(combo.ranks).slice().sort((a, b) => a - b)
  // Normalize rarities so signatures match regardless of selection order.
  const rarities = normalizeNumberArray(combo.rarities).slice().sort((a, b) => a - b)
  // Normalize main stats so signatures match regardless of selection order.
  const mains = normalizeNumberArray(combo.mainStats).slice().sort(compareVariants)
  // Normalize factions so signatures match regardless of selection order.
  const factions = normalizeNumberArray(combo.factions).slice().sort((a, b) => a - b)
  // Normalize substats so matching changes are tracked consistently.
  const substats = sortSubstatsForHistory(rule.substats ?? [])
  const normalizedSubstatMatch = normalizeSafeguardSubstatMatch(rule.substatMatch)
  // Normalize weights so edits show up even if arrays re-order.
  // Weights only affect the rule when Per Substat is not active.
  const weightEntries = normalizedSubstatMatch !== SafeguardSubstatMatch.PerSubstat && substats.length > 0
    ? Object.entries(rule.substatWeights ?? {})
      .map(([key, raw]) => {
        const variant = Number(key)
        const normalized = normalizeTesterSortWeight(Number(raw))
        return Number.isFinite(variant) ? [variant, normalized] as [number, number] : null
      })
      .filter((entry): entry is [number, number] => Boolean(entry && entry[1] !== TESTER_SORT_WEIGHT_DEFAULT))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    : []
  // Return the normalized typed signature so callers can compare structurally.
  return {
    id: rule.id,
    name: rule.name,
    requiredCount: rule.requiredCount,
    activation: rule.activation,
    // Keep toggle fields in the signature so history detects their edits.
    ignorePreviousSafeguards: rule.ignorePreviousSafeguards !== false,
    ignoreEquippedInCollection: rule.ignoreEquippedInCollection === true,
    ignoreEquippedInVault: rule.ignoreEquippedInVault === true,
    countMode: normalizeCountMode(rule.countMode),
    slots,
    sets,
    meta,
    ranks,
    rarities,
    mains,
    factions,
    substats,
    substatMatch: normalizedSubstatMatch,
    substatWeights: weightEntries,
  }
}

function safeguardRuleSignaturesEqual(left: SafeguardRuleSignature, right: SafeguardRuleSignature): boolean {
  if (
    left.id !== right.id
    || left.name !== right.name
    || left.requiredCount !== right.requiredCount
    || left.activation !== right.activation
    || left.ignorePreviousSafeguards !== right.ignorePreviousSafeguards
    || left.ignoreEquippedInCollection !== right.ignoreEquippedInCollection
    || left.ignoreEquippedInVault !== right.ignoreEquippedInVault
    || left.substatMatch !== right.substatMatch
  ) {
    return false
  }
  if (left.countMode.perRule !== right.countMode.perRule) return false
  if (left.countMode.perSet !== right.countMode.perSet) return false
  if (left.countMode.perFaction !== right.countMode.perFaction) return false
  if (left.countMode.perMainStat !== right.countMode.perMainStat) return false
  if (left.countMode.perSlot !== right.countMode.perSlot) return false
  if (left.slots.length !== right.slots.length) return false
  for (let idx = 0; idx < left.slots.length; idx += 1) if (left.slots[idx] !== right.slots[idx]) return false
  if (left.sets.length !== right.sets.length) return false
  for (let idx = 0; idx < left.sets.length; idx += 1) {
    const ls = left.sets[idx]!
    const rs = right.sets[idx]!
    if (ls.id !== rs.id || ls.excluded !== rs.excluded) return false
  }
  if (left.meta.length !== right.meta.length) return false
  for (let idx = 0; idx < left.meta.length; idx += 1) if (left.meta[idx] !== right.meta[idx]) return false
  if (left.ranks.length !== right.ranks.length) return false
  for (let idx = 0; idx < left.ranks.length; idx += 1) if (left.ranks[idx] !== right.ranks[idx]) return false
  if (left.rarities.length !== right.rarities.length) return false
  for (let idx = 0; idx < left.rarities.length; idx += 1) if (left.rarities[idx] !== right.rarities[idx]) return false
  if (left.mains.length !== right.mains.length) return false
  for (let idx = 0; idx < left.mains.length; idx += 1) if (left.mains[idx] !== right.mains[idx]) return false
  if (left.factions.length !== right.factions.length) return false
  for (let idx = 0; idx < left.factions.length; idx += 1) if (left.factions[idx] !== right.factions[idx]) return false
  if (left.substats.length !== right.substats.length) return false
  for (let idx = 0; idx < left.substats.length; idx += 1) if (left.substats[idx] !== right.substats[idx]) return false
  if (left.substatWeights.length !== right.substatWeights.length) return false
  for (let idx = 0; idx < left.substatWeights.length; idx += 1) {
    const lw = left.substatWeights[idx]!
    const rw = right.substatWeights[idx]!
    if (lw[0] !== rw[0] || lw[1] !== rw[1]) return false
  }
  return true
}

function normalizeCountMode(mode: SafeguardRuleCountMode): SafeguardRuleCountMode {
  // Default empty scopes to per-rule so signature comparisons stay stable.
  const perRule = mode.perRule
  const perSet = mode.perSet
  const perFaction = mode.perFaction
  const perMainStat = mode.perMainStat
  const perSlot = mode.perSlot
  if (perRule || (!perSet && !perFaction && !perMainStat && !perSlot)) {
    // Collapse to "per rule" to match UI defaults.
    return { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false }
  }
  // Preserve the active scopes when any grouping is enabled.
  return { perRule: false, perSet, perFaction, perMainStat, perSlot }
}

function summarizeRuleNames(summary: RuleChangeSummary, t: TranslateFn): string[] {
  // Collate a short list of rule names for multi-change summaries.
  const names = [
    ...summary.added.map((rule) => formatRuleName(rule, t)),
    ...summary.removed.map((rule) => formatRuleName(rule, t)),
    ...summary.updated.map(({ next }) => formatRuleName(next, t)),
  ].filter((name) => name.length > 0)
  if (names.length === 0) return []
  // Cap the label list so the tooltip stays compact.
  const MAX_LINES = 4
  if (names.length <= MAX_LINES) return names
  // Add a trailing "+N more" line when truncating.
  return [...names.slice(0, MAX_LINES), t('historyRecipesMoreLine', { count: names.length - MAX_LINES })]
}

function summarizeRuleOrder(next: SafeguardRule[], t: TranslateFn): string[] {
  // Use the new order so the history tooltip communicates the latest ordering.
  const names = next.map((rule) => formatRuleName(rule, t)).filter((name) => name.length > 0)
  if (names.length === 0) return []
  // Keep the reorder summary compact like other history tooltips.
  const MAX_LINES = 4
  if (names.length <= MAX_LINES) return names
  // Append a "+N more" indicator when the list is long.
  return [...names.slice(0, MAX_LINES), t('historyRecipesMoreLine', { count: names.length - MAX_LINES })]
}

function formatRuleName(rule: SafeguardRule, t: TranslateFn): string {
  // Keep rule names stable; fall back to the empty marker when unnamed.
  const raw = (rule.name ?? '').trim()
  return raw.length > 0 ? raw : t('historyValueEmpty')
}

// Keep stat ordering aligned with the UI priority rows for consistent summaries.
const SUBSTAT_ORDER = new Map<StatVariant, number>(
  STAT_VARIANTS_PRIORITY.map((variant, index) => [variant, index]),
)

const sortSubstatsForHistory = (values: readonly number[] | null | undefined): StatVariant[] => {
  if (!values || values.length === 0) return []
  const seen = new Set<number>()
  const result: StatVariant[] = []
  for (const raw of values) {
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) continue
    if (numeric === 0) continue
    if (seen.has(numeric)) continue
    seen.add(numeric)
    result.push(numeric as StatVariant)
  }
  return result.sort((left, right) => {
    const leftOrder = SUBSTAT_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = SUBSTAT_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return Number(left) - Number(right)
  })
}

const formatSubstatMatch = (
  match: SafeguardSubstatMatch | null | undefined,
  t: TranslateFn,
): string => {
  const normalized = normalizeSafeguardSubstatMatch(match)
  if (normalized === 'all') return t('safeguardsSubstatRequirementAll')
  if (normalized === 'perSubstat') return t('safeguardsSubstatRequirementPer')
  return t('safeguardsSubstatRequirementAny')
}

const formatSubstatList = (rule: SafeguardRule, t: TranslateFn): string => {
  const variants = sortSubstatsForHistory(rule.substats ?? [])
  if (variants.length === 0) return t('any')
  return variants.map((variant) => t(statVariantI18nKey(variant))).join(', ')
}

const formatSubstatWeights = (rule: SafeguardRule, t: TranslateFn): string => {
  const normalizedMatch = normalizeSafeguardSubstatMatch(rule.substatMatch)
  // Weights only surface when the match is not Per Substat.
  if (normalizedMatch === SafeguardSubstatMatch.PerSubstat) return ''
  const weights = rule.substatWeights ?? {}
  const entries: Array<{ variant: StatVariant; weight: number }> = []
  for (const [key, raw] of Object.entries(weights)) {
    const variant = Number(key)
    if (!Number.isFinite(variant)) continue
    if (variant === 0) continue
    const normalized = normalizeTesterSortWeight(Number(raw))
    if (normalized === TESTER_SORT_WEIGHT_DEFAULT) continue
    entries.push({ variant: variant as StatVariant, weight: normalized })
  }
  if (entries.length === 0) return ''
  entries.sort((left, right) => {
    const leftOrder = SUBSTAT_ORDER.get(left.variant) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = SUBSTAT_ORDER.get(right.variant) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return Number(left.variant) - Number(right.variant)
  })
  return entries
    .map(({ variant, weight }) => `${t(statVariantI18nKey(variant))} x${weight.toFixed(2)}`)
    .join(', ')
}

function buildSafeguardRuleSnapshotLines(rule: SafeguardRule, metasets: Metaset[], t: TranslateFn): string[] {
  // Provide a short, ordered summary so tooltips stay predictable.
  const detailLines: string[] = []
  // Render the rule activation mode as the first line.
  const modeLabel = formatRuleMode(rule.activation, t)
  detailLines.push(`${t('safeguardsRuleModeLabel')}: ${modeLabel}`)
  // Render the required count and scope combination.
  const scopeLabel = formatCountModeLabel(rule.countMode, t)
  detailLines.push(`${t('safeguardsRequiredCount')}: ${rule.requiredCount} (${scopeLabel})`)
  // Render rank/rarity/faction filters as text for quick scanning.
  detailLines.push(`${t('builderRank')}: ${formatRankList(rule.combination.ranks, t)}`)
  detailLines.push(`${t('filterRarity')}: ${formatRarityList(rule.combination.rarities, t)}`)
  detailLines.push(`${t('builderFaction')}: ${formatFactionList(rule.combination.factions, t)}`)
  // Structured payloads render the icon grids for slots/sets/main stats.
  detailLines.push(makeSlotsSnapshotLine(rule, t))
  detailLines.push(makeSetListSnapshotLine(rule, t))
  detailLines.push(makeMetasetSnapshotLine(rule, metasets, t))
  detailLines.push(makeMainStatsSnapshotLine(rule, t))
  // Substat filters behave like optional scope rules; keep the summary explicit.
  detailLines.push(`${t('safeguardsSubstatLabel')}: ${formatSubstatList(rule, t)}`)
  if ((rule.substats ?? []).length > 0) {
    detailLines.push(`${t('safeguardsSubstatRequirementLabel')}: ${formatSubstatMatch(rule.substatMatch, t)}`)
    const weightSummary = formatSubstatWeights(rule, t)
    if (weightSummary) {
      detailLines.push(`${t('safeguardsSubstatWeightsLabel')}: ${weightSummary}`)
    }
  }
  return detailLines
}

function buildSafeguardRuleDiffLines(
  previous: SafeguardRule,
  next: SafeguardRule,
  metasets: Metaset[],
  t: TranslateFn,
): string[] {
  // Only include fields that changed so updated rule history matches recipe diffs.
  const detailLines: string[] = []
  // Compare rule names so renames are surfaced alongside other edits.
  pushDiffLine(detailLines, t, t('safeguardsRuleNameLabel'), formatRuleName(previous, t), formatRuleName(next, t))
  // Compare activation modes so enable/anticipate changes are visible.
  pushDiffLine(detailLines, t, t('safeguardsRuleModeLabel'), formatRuleMode(previous.activation, t), formatRuleMode(next.activation, t))
  // Compare required counts + scopes as a single summary line.
  pushDiffLine(detailLines, t, t('safeguardsRequiredCount'), formatRequiredCountSummary(previous, t), formatRequiredCountSummary(next, t))
  // Compare rank filters using the same labels as the rule card.
  pushDiffLine(detailLines, t, t('builderRank'), formatRankList(previous.combination.ranks, t), formatRankList(next.combination.ranks, t))
  // Compare rarity filters using the same labels as the rule card.
  pushDiffLine(detailLines, t, t('filterRarity'), formatRarityList(previous.combination.rarities, t), formatRarityList(next.combination.rarities, t))
  // Compare faction filters using the shared faction labels.
  pushDiffLine(detailLines, t, t('builderFaction'), formatFactionList(previous.combination.factions, t), formatFactionList(next.combination.factions, t))
  // Compare slots via structured payloads so the history tooltip can render icons.
  const prevSlots = normalizeSortedNumberList(previous.combination.slots, compareArtifactTypes)
  const nextSlots = normalizeSortedNumberList(next.combination.slots, compareArtifactTypes)
  if (!areNumberListsEqual(prevSlots, nextSlots)) {
    detailLines.push(makeSlotsDiffLine(prevSlots, nextSlots, t))
  }
  // Compare sets via structured payloads so the history tooltip can render set icons.
  const prevSets = normalizeSetSelectionEntries(previous.combination.sets)
  const nextSets = normalizeSetSelectionEntries(next.combination.sets)
  if (
    !areNumberListsEqual(prevSets.included, nextSets.included)
    || !areNumberListsEqual(prevSets.excluded, nextSets.excluded)
  ) {
    detailLines.push(makeSetListDiffLine(prevSets, nextSets, t))
  }
  // Compare metasets via structured payloads to keep the diff readable.
  const prevMetaIds = normalizeMetasetIds(previous.combination.metaSetIds)
  const nextMetaIds = normalizeMetasetIds(next.combination.metaSetIds)
  if (!areStringListsEqual(prevMetaIds, nextMetaIds)) {
    detailLines.push(makeMetasetDiffLine(prevMetaIds, nextMetaIds, metasets, t))
  }
  // Compare main stats via structured payloads so chips show the before/after.
  const prevMains = normalizeSortedNumberList(previous.combination.mainStats, compareVariants)
  const nextMains = normalizeSortedNumberList(next.combination.mainStats, compareVariants)
  if (!areNumberListsEqual(prevMains, nextMains)) {
    detailLines.push(makeMainStatsDiffLine(prevMains, nextMains, t))
  }
  // Compare substat selection so ranked/unranked edits are visible.
  pushDiffLine(detailLines, t, t('safeguardsSubstatLabel'), formatSubstatList(previous, t), formatSubstatList(next, t))
  if ((previous.substats ?? []).length > 0 || (next.substats ?? []).length > 0) {
    pushDiffLine(
      detailLines,
      t,
      t('safeguardsSubstatRequirementLabel'),
      formatSubstatMatch(previous.substatMatch, t),
      formatSubstatMatch(next.substatMatch, t),
    )
    const prevWeights = formatSubstatWeights(previous, t)
    const nextWeights = formatSubstatWeights(next, t)
    if (prevWeights || nextWeights) {
      pushDiffLine(detailLines, t, t('safeguardsSubstatWeightsLabel'), prevWeights || t('historyValueEmpty'), nextWeights || t('historyValueEmpty'))
    }
  }
  return detailLines
}

function pushDiffLine(target: string[], t: TranslateFn, label: string, previous: string, next: string): void {
  // Skip unchanged text so the diff only highlights edits.
  if (previous === next) return
  // Use the shared diff label so history uses the same before/after formatting.
  target.push(t('historyDiffLine', { label, previous, next }))
}

function formatRequiredCountSummary(rule: SafeguardRule, t: TranslateFn): string {
  // Pair the required count with the active scope labels for quick scanning.
  const scopeLabel = formatCountModeLabel(rule.countMode, t)
  // Keep the format consistent with the snapshot line.
  return `${rule.requiredCount} (${scopeLabel})`
}

function normalizeSortedNumberList(
  values: number[] | undefined,
  sorter: (a: number, b: number) => number,
): number[] {
  // Normalize incoming values so undefined and invalid entries collapse to empty.
  const normalized = normalizeNumberArray(values).slice().sort(sorter)
  // Deduplicate while preserving sorted order.
  const unique: number[] = []
  for (const value of normalized) {
    if (unique.length === 0 || unique[unique.length - 1] !== value) {
      unique.push(value)
    }
  }
  return unique
}

function normalizeMetasetIds(values: readonly unknown[] | null | undefined): string[] {
  // Normalize into a stable, sorted string list so diffs ignore ordering noise.
  const normalized = Array.isArray(values) ? values.map((entry) => String(entry)).filter(Boolean) : []
  // Sort IDs to keep the ordering consistent between renders.
  normalized.sort()
  // Deduplicate the list so repeated IDs do not create false diffs.
  const unique: string[] = []
  for (const id of normalized) {
    if (unique.length === 0 || unique[unique.length - 1] !== id) {
      unique.push(id)
    }
  }
  return unique
}

function areNumberListsEqual(previous: number[], next: number[]): boolean {
  // Short-circuit when lengths differ to avoid extra comparisons.
  if (previous.length !== next.length) return false
  // Compare each index since lists are already normalized + sorted.
  for (let i = 0; i < previous.length; i += 1) {
    if (previous[i] !== next[i]) return false
  }
  return true
}

function areStringListsEqual(previous: string[], next: string[]): boolean {
  // Short-circuit when lengths differ to avoid extra comparisons.
  if (previous.length !== next.length) return false
  // Compare each index since lists are already normalized + sorted.
  for (let i = 0; i < previous.length; i += 1) {
    if (previous[i] !== next[i]) return false
  }
  return true
}

function makeSlotsDiffLine(previous: number[], next: number[], t: TranslateFn): string {
  // Emit the structured payload so history tooltips render slot icons.
  return JSON.stringify({
    kind: 'slotsDiff',
    label: t('builderSlots'),
    previous,
    next,
  })
}

type NormalizedSetSelection = { included: number[]; excluded: number[] }

function normalizeSetSelectionEntries(entries: SafeguardRule['combination']['sets'] | undefined): NormalizedSetSelection {
  const normalized = normalizeArtifactSetSelections(entries ?? [])
  const split = splitArtifactSetSelections(normalized)
  return {
    included: split.included.map(Number).sort(compareArtifactSets),
    excluded: split.excluded.map(Number).sort(compareArtifactSets),
  }
}

function makeSetListDiffLine(previous: NormalizedSetSelection, next: NormalizedSetSelection, t: TranslateFn): string {
  // Emit the structured payload so history tooltips render set icons.
  return JSON.stringify({
    kind: 'setListDiff',
    label: t('setsTitle'),
    previous: previous.included,
    next: next.included,
    previousExcluded: previous.excluded,
    nextExcluded: next.excluded,
  })
}

function makeMetasetDiffLine(previous: string[], next: string[], metasets: Metaset[], t: TranslateFn): string {
  // Emit the structured payload so history tooltips render metaset chips.
  return JSON.stringify({
    kind: 'metasetDiff',
    label: t('menuMetasetsSection'),
    previous: collectMetasetSnapshotEntries(previous, metasets),
    next: collectMetasetSnapshotEntries(next, metasets),
    previousFallback: t('any'),
    nextFallback: t('any'),
  })
}

function makeMainStatsDiffLine(previous: number[], next: number[], t: TranslateFn): string {
  // Emit the structured payload so history tooltips render main-stat chips.
  return JSON.stringify({
    kind: 'mainStatsDiff',
    label: t('builderMain'),
    previous,
    next,
    previousText: t('any'),
    nextText: t('any'),
  })
}

function formatRuleMode(mode: SafeguardRuleActivation, t: TranslateFn): string {
  // Reuse the Safeguards UI labels so history text stays familiar.
  if (mode === 'off') return t('safeguardsRuleModeOff')
  if (mode === 'anticipateGaps') return t('safeguardsRuleModeAnticipate')
  return t('safeguardsRuleModeProtect')
}

function formatCountModeLabel(mode: SafeguardRuleCountMode, t: TranslateFn): string {
  // Normalize missing scopes to "Per rule" to match UI behavior.
  const normalized = normalizeCountMode(mode)
  if (normalized.perRule) return t('safeguardsCountModePerRule')
  // Build the scoped label list in a predictable order.
  const parts: string[] = []
  if (normalized.perSlot) parts.push(t('safeguardsCountModePerSlot'))
  if (normalized.perSet) parts.push(t('safeguardsCountModePerSet'))
  if (normalized.perFaction) parts.push(t('safeguardsCountModePerFaction'))
  if (normalized.perMainStat) parts.push(t('safeguardsCountModePerMain'))
  // Join the scope labels so the UI shows the active grouping set.
  return parts.length > 0 ? parts.join(', ') : t('safeguardsCountModePerRule')
}

function formatRankList(values: number[] | undefined, t: TranslateFn): string {
  // Map numeric ranks into the localized star labels.
  const normalized = normalizeNumberArray(values).slice().sort((a, b) => a - b)
  if (normalized.length === 0) return t('any')
  // Render each rank as a localized star label.
  return normalized.map((rank) => t(rankLabelKey(rank))).join(', ')
}

function rankLabelKey(rank: number): string {
  // Clamp to the known star range so we always return a valid key.
  if (rank >= 6) return 'star6'
  if (rank === 5) return 'star5'
  if (rank === 4) return 'star4'
  if (rank === 3) return 'star3'
  if (rank === 2) return 'star2'
  return 'star1'
}

function formatRarityList(values: number[] | undefined, t: TranslateFn): string {
  // Translate rarity tiers using the same labels as the rarity selector.
  const normalized = normalizeNumberArray(values).slice().sort((a, b) => a - b)
  if (normalized.length === 0) return t('any')
  // Render each rarity using the shared localized labels.
  return normalized.map((rarity) => formatRarityLabel(rarity, t)).join(', ')
}

function formatRarityLabel(value: number, t: TranslateFn): string {
  // Mirror GearRaritySelect so history matches the UI wording.
  if (value === 1) return t('rarityCommon')
  if (value === 2) return t('rarityUncommon')
  if (value === 3) return t('rarityRare')
  if (value === 4) return t('rarityEpic')
  if (value === 5) return t('rarityLegendary')
  return t('rarityMythical')
}

function formatFactionList(values: number[] | undefined, t: TranslateFn): string {
  // Render faction names in ascending order so diffs stay stable.
  const normalized = normalizeNumberArray(values).slice().sort((a, b) => a - b)
  if (normalized.length === 0) return t('any')
  // Map IDs into the localized faction labels.
  return normalized.map((faction) => t(factionI18nKey(faction))).join(', ')
}

function makeSlotsSnapshotLine(rule: SafeguardRule, t: TranslateFn): string {
  // Use the slots snapshot schema so BuilderTooltipContent can show icons.
  const slots = normalizeNumberArray(rule.combination.slots).slice().sort(compareArtifactTypes)
  // Emit the structured payload as JSON so the tooltip renderer can parse it.
  return JSON.stringify({
    kind: 'slotsSnapshot',
    label: t('builderSlots'),
    values: slots,
    fallbackText: t('any'),
  })
}

function makeSetListSnapshotLine(rule: SafeguardRule, t: TranslateFn): string {
  // Serialize the set list so tooltip icons match the preview table.
  const selection = normalizeSetSelectionEntries(rule.combination.sets)
  // Emit the structured payload as JSON so the tooltip renderer can parse it.
  return JSON.stringify({
    kind: 'setListSnapshot',
    label: t('setsTitle'),
    values: selection.included,
    excluded: selection.excluded,
    fallbackText: t('any'),
  })
}

function makeMetasetSnapshotLine(rule: SafeguardRule, metasets: Metaset[], t: TranslateFn): string {
  // Resolve metaset IDs into names/icons for structured tooltip output.
  const entries = collectMetasetSnapshotEntries(rule.combination.metaSetIds ?? [], metasets)
  // Emit the structured payload as JSON so the tooltip renderer can parse it.
  return JSON.stringify({
    kind: 'metasetSnapshot',
    label: t('menuMetasetsSection'),
    entries,
    fallbackText: t('any'),
  })
}

function makeMainStatsSnapshotLine(rule: SafeguardRule, t: TranslateFn): string {
  // Render the main stat list using the shared snapshot layout.
  const stats = normalizeNumberArray(rule.combination.mainStats).slice().sort(compareVariants)
  // Emit the structured payload as JSON so the tooltip renderer can parse it.
  return JSON.stringify({
    kind: 'mainStatsSnapshot',
    label: t('builderMain'),
    values: stats,
    fallbackText: t('any'),
  })
}
