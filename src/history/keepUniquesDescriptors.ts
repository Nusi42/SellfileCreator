/**
 * keepUniquesDescriptors
 *
 * History descriptor helpers for Keep Uniques so the timeline can display
 * structured rule snapshots with the same visual language as builder diffs.
 */
// keepUniquesDescriptors keeps keep-unique history data-only until render.
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { KeepUniqueRule, KeepUniqueRuleActivation, KeepUniqueRuleCountMode } from '../lib/keepUniques'
import { KeepUniqueSubstatMatch, normalizeKeepUniqueSubstatMatch } from '../lib/keepUniques'
import type { Metaset } from '../lib/metasets'
import { compareArtifactSets, compareArtifactTypes, compareVariants, factionI18nKey, statVariantI18nKey, StatVariant, STAT_VARIANTS_PRIORITY } from '../lib/types'
import type { TranslateFn } from './builderUpdateDescriptor'
import { collectMetasetSnapshotEntries, normalizeNumberArray } from './historyDescriptorUtils'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from '../lib/gearSets/selection'
import type { KeepUniquesRulesDescriptorMode } from './historyDescriptorTypes'
import { snapshotKeepUniqueRules, snapshotMetasets } from './historySnapshotUtils'
import { normalizeTesterSortWeight, TESTER_SORT_WEIGHT_DEFAULT } from '../lib/testerSort'

export type { KeepUniquesRulesDescriptorMode }

type RuleChangeSummary = {
  added: KeepUniqueRule[]
  removed: KeepUniqueRule[]
  updated: Array<{ previous: KeepUniqueRule; next: KeepUniqueRule }>
}

// isKeepUniquesRuleOrderChanged flags pure reorders so history can record them.
export const isKeepUniquesRuleOrderChanged = (previous: KeepUniqueRule[], next: KeepUniqueRule[]): boolean => {
  // Reorders only matter when the list lengths match.
  if (previous.length !== next.length) return false
  // Any ID mismatch at the same index means the order changed.
  return previous.some((rule, index) => rule.id !== next[index]?.id)
}

// createKeepUniquesEnabledChangeDescriptor snapshots the toggle history entry.
export const createKeepUniquesEnabledChangeDescriptor = (params: {
  previousEnabled: boolean
  nextEnabled: boolean
  rules: KeepUniqueRule[]
}): HistoryEntryDescriptor | null => {
  const { previousEnabled, nextEnabled, rules } = params
  if (previousEnabled === nextEnabled) return null
  return {
    kind: 'keepUniquesEnabledChange',
    previousEnabled,
    nextEnabled,
    rules: snapshotKeepUniqueRules(rules),
  }
}

// createKeepUniquesRulesChangeDescriptor snapshots keep-unique rule edits.
export const createKeepUniquesRulesChangeDescriptor = (params: {
  previous: KeepUniqueRule[]
  next: KeepUniqueRule[]
  metasets: Metaset[]
  mode?: KeepUniquesRulesDescriptorMode
}): HistoryEntryDescriptor | null => {
  const { previous, next, metasets, mode = 'edit' } = params
  const summary = diffKeepUniqueRules(previous, next)
  const totalChanges = summary.added.length + summary.removed.length + summary.updated.length
  // Reorders should still be recorded even when the rules themselves are unchanged.
  const orderChanged = isKeepUniquesRuleOrderChanged(previous, next)
  if (totalChanges === 0 && !orderChanged) return null
  return {
    kind: 'keepUniquesRulesChange',
    previous: snapshotKeepUniqueRules(previous),
    next: snapshotKeepUniqueRules(next),
    metasets: snapshotMetasets(metasets),
    mode,
  }
}

// describeKeepUniquesEnabledChange localizes toggle history entries.
export function describeKeepUniquesEnabledChange(params: {
  previousEnabled: boolean
  nextEnabled: boolean
  rules: KeepUniqueRule[]
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor | null {
  const { previousEnabled, nextEnabled, rules, t } = params
  // Skip when the toggle is effectively unchanged.
  if (previousEnabled === nextEnabled) return null
  // Pick the title based on the new toggle state.
  const titleKey = nextEnabled ? 'historyKeepUniquesEnabledTitle' : 'historyKeepUniquesDisabledTitle'
  // Always surface the number of rules so the toggle context is visible.
  const detailLines = [t('historyKeepUniquesRulesCountLine', { count: rules.length })]
  // Emit a simple descriptor so history timelines stay succinct.
  return { title: t(titleKey), detailLines }
}

// describeKeepUniquesRulesChange localizes keep-unique rule changes.
export function describeKeepUniquesRulesChange(params: {
  previous: KeepUniqueRule[]
  next: KeepUniqueRule[]
  metasets: Metaset[]
  t: TranslateFn
  mode?: KeepUniquesRulesDescriptorMode
}): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, metasets, t, mode = 'edit' } = params
  // Treat identical rule lists as no-op so we do not enqueue empty history.
  const summary = diffKeepUniqueRules(previous, next)
  // Count the total change footprint to steer the descriptor shape.
  const totalChanges = summary.added.length + summary.removed.length + summary.updated.length
  // Track reorders separately so move actions get their own history entries.
  const orderChanged = isKeepUniquesRuleOrderChanged(previous, next)
  if (totalChanges === 0) {
    if (!orderChanged) return null
    const title = t('historyKeepUniquesRulesReorderedTitle')
    const detailLines = summarizeRuleOrder(next, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  if (mode === 'reset') {
    // Reset has a dedicated title so history stays explicit.
    return {
      title: t('historyKeepUniquesResetTitle'),
      detailLines: [t('historyKeepUniquesRulesCountLine', { count: next.length })],
    }
  }

  if (summary.added.length === 1 && summary.removed.length === 0 && summary.updated.length === 0) {
    // Use the added rule snapshot when only one rule is introduced.
    const rule = summary.added[0]!
    const title = t('historyKeepUniquesRuleAddedTitle', { name: formatRuleName(rule, t) })
    const detailLines = buildKeepUniqueRuleSnapshotLines(rule, metasets, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  if (summary.removed.length === 1 && summary.added.length === 0 && summary.updated.length === 0) {
    // Use the removed rule snapshot when only one rule is deleted.
    const rule = summary.removed[0]!
    const title = t('historyKeepUniquesRuleDeletedTitle', { name: formatRuleName(rule, t) })
    const detailLines = buildKeepUniqueRuleSnapshotLines(rule, metasets, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  if (summary.updated.length === 1 && summary.added.length === 0 && summary.removed.length === 0) {
    // Use the updated rule snapshot when only one rule changes.
    const update = summary.updated[0]!
    // Reuse the new rule name in the title so it mirrors the rule card.
    const title = t('historyKeepUniquesRuleUpdatedTitle', { name: formatRuleName(update.next, t) })
    // Emit before/after lines for only the fields that actually changed.
    const detailLines = buildKeepUniqueRuleDiffLines(update.previous, update.next, metasets, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  // Fall back to a summary when multiple rules are affected at once.
  const title = t('historyKeepUniquesRulesUpdatedTitle', { count: totalChanges })
  const detailLines = summarizeRuleNames(summary, t)
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

function diffKeepUniqueRules(previous: KeepUniqueRule[], next: KeepUniqueRule[]): RuleChangeSummary {
  // Index both lists by rule ID so additions/removals are easy to spot.
  const previousById = new Map(previous.map((rule) => [rule.id, rule]))
  const nextById = new Map(next.map((rule) => [rule.id, rule]))
  // Track rule-level changes by comparing stable signatures.
  const added: KeepUniqueRule[] = []
  const removed: KeepUniqueRule[] = []
  const updated: Array<{ previous: KeepUniqueRule; next: KeepUniqueRule }> = []
  for (const [id, rule] of nextById) {
    // Lookup the previous rule to detect add vs update.
    const prevRule = previousById.get(id)
    if (!prevRule) {
      // New ID => added rule.
      added.push(rule)
      continue
    }
    // Compare normalized signatures so ordering noise does not trigger updates.
    if (buildKeepUniqueRuleSignature(prevRule) !== buildKeepUniqueRuleSignature(rule)) {
      updated.push({ previous: prevRule, next: rule })
    }
  }
  for (const [id, rule] of previousById) {
    // Missing ID => removed rule.
    if (!nextById.has(id)) removed.push(rule)
  }
  return { added, removed, updated }
}

function buildKeepUniqueRuleSignature(rule: KeepUniqueRule): string {
  // Normalize array order so signatures ignore ordering noise.
  const combo = rule.combination
  // Normalize slots so set ordering differences do not count as edits.
  const slots = normalizeNumberArray(combo.slots).slice().sort(compareArtifactTypes)
  // Normalize set entries so exclusions are captured in the signature.
  const sets = normalizeArtifactSetSelections(combo.sets ?? [])
    .map((entry) => (entry.excluded ? `!${Number(entry.id)}` : `${Number(entry.id)}`))
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
  const normalizedSubstatMatch = normalizeKeepUniqueSubstatMatch(rule.substatMatch)
  // Normalize weights so edits show up even if arrays re-order.
  // Weights only affect the rule when Per Substat is not active.
  const weightEntries = normalizedSubstatMatch !== KeepUniqueSubstatMatch.PerSubstat && substats.length > 0
    ? Object.entries(rule.substatWeights ?? {})
      .map(([key, raw]) => {
        const variant = Number(key)
        const normalized = normalizeTesterSortWeight(Number(raw))
        return Number.isFinite(variant) ? `${variant}:${normalized.toFixed(2)}` : null
      })
      .filter((entry): entry is string => Boolean(entry && !entry.endsWith(`${TESTER_SORT_WEIGHT_DEFAULT.toFixed(2)}`)))
      .sort()
    : []
  // Serialize the normalized rule signature for comparison.
  return JSON.stringify({
    id: rule.id,
    name: rule.name,
    requiredCount: rule.requiredCount,
    activation: rule.activation,
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
  })
}

function normalizeCountMode(mode: KeepUniqueRuleCountMode): KeepUniqueRuleCountMode {
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
  return [...names.slice(0, MAX_LINES), t('historyConfigsMoreLine', { count: names.length - MAX_LINES })]
}

function summarizeRuleOrder(next: KeepUniqueRule[], t: TranslateFn): string[] {
  // Use the new order so the history tooltip communicates the latest ordering.
  const names = next.map((rule) => formatRuleName(rule, t)).filter((name) => name.length > 0)
  if (names.length === 0) return []
  // Keep the reorder summary compact like other history tooltips.
  const MAX_LINES = 4
  if (names.length <= MAX_LINES) return names
  // Append a "+N more" indicator when the list is long.
  return [...names.slice(0, MAX_LINES), t('historyConfigsMoreLine', { count: names.length - MAX_LINES })]
}

function formatRuleName(rule: KeepUniqueRule, t: TranslateFn): string {
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
  match: KeepUniqueSubstatMatch | null | undefined,
  t: TranslateFn,
): string => {
  const normalized = normalizeKeepUniqueSubstatMatch(match)
  if (normalized === 'all') return t('keepUniquesSubstatRequirementAll')
  if (normalized === 'perSubstat') return t('keepUniquesSubstatRequirementPer')
  return t('keepUniquesSubstatRequirementAny')
}

const formatSubstatList = (rule: KeepUniqueRule, t: TranslateFn): string => {
  const variants = sortSubstatsForHistory(rule.substats ?? [])
  if (variants.length === 0) return t('any')
  return variants.map((variant) => t(statVariantI18nKey(variant))).join(', ')
}

const formatSubstatWeights = (rule: KeepUniqueRule, t: TranslateFn): string => {
  const normalizedMatch = normalizeKeepUniqueSubstatMatch(rule.substatMatch)
  // Weights only surface when the match is not Per Substat.
  if (normalizedMatch === KeepUniqueSubstatMatch.PerSubstat) return ''
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

function buildKeepUniqueRuleSnapshotLines(rule: KeepUniqueRule, metasets: Metaset[], t: TranslateFn): string[] {
  // Provide a short, ordered summary so tooltips stay predictable.
  const detailLines: string[] = []
  // Render the rule activation mode as the first line.
  const modeLabel = formatRuleMode(rule.activation, t)
  detailLines.push(`${t('keepUniquesRuleModeLabel')}: ${modeLabel}`)
  // Render the required count and scope combination.
  const scopeLabel = formatCountModeLabel(rule.countMode, t)
  detailLines.push(`${t('keepUniquesRequiredCount')}: ${rule.requiredCount} (${scopeLabel})`)
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
  detailLines.push(`${t('keepUniquesSubstatLabel')}: ${formatSubstatList(rule, t)}`)
  if ((rule.substats ?? []).length > 0) {
    detailLines.push(`${t('keepUniquesSubstatRequirementLabel')}: ${formatSubstatMatch(rule.substatMatch, t)}`)
    const weightSummary = formatSubstatWeights(rule, t)
    if (weightSummary) {
      detailLines.push(`${t('keepUniquesSubstatWeightsLabel')}: ${weightSummary}`)
    }
  }
  return detailLines
}

function buildKeepUniqueRuleDiffLines(
  previous: KeepUniqueRule,
  next: KeepUniqueRule,
  metasets: Metaset[],
  t: TranslateFn,
): string[] {
  // Only include fields that changed so updated rule history matches config diffs.
  const detailLines: string[] = []
  // Compare rule names so renames are surfaced alongside other edits.
  pushDiffLine(detailLines, t, t('keepUniquesRuleNameLabel'), formatRuleName(previous, t), formatRuleName(next, t))
  // Compare activation modes so enable/anticipate changes are visible.
  pushDiffLine(detailLines, t, t('keepUniquesRuleModeLabel'), formatRuleMode(previous.activation, t), formatRuleMode(next.activation, t))
  // Compare required counts + scopes as a single summary line.
  pushDiffLine(detailLines, t, t('keepUniquesRequiredCount'), formatRequiredCountSummary(previous, t), formatRequiredCountSummary(next, t))
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
  pushDiffLine(detailLines, t, t('keepUniquesSubstatLabel'), formatSubstatList(previous, t), formatSubstatList(next, t))
  if ((previous.substats ?? []).length > 0 || (next.substats ?? []).length > 0) {
    pushDiffLine(
      detailLines,
      t,
      t('keepUniquesSubstatRequirementLabel'),
      formatSubstatMatch(previous.substatMatch, t),
      formatSubstatMatch(next.substatMatch, t),
    )
    const prevWeights = formatSubstatWeights(previous, t)
    const nextWeights = formatSubstatWeights(next, t)
    if (prevWeights || nextWeights) {
      pushDiffLine(detailLines, t, t('keepUniquesSubstatWeightsLabel'), prevWeights || t('historyValueEmpty'), nextWeights || t('historyValueEmpty'))
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

function formatRequiredCountSummary(rule: KeepUniqueRule, t: TranslateFn): string {
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

function normalizeSetSelectionEntries(entries: KeepUniqueRule['combination']['sets'] | undefined): NormalizedSetSelection {
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

function formatRuleMode(mode: KeepUniqueRuleActivation, t: TranslateFn): string {
  // Reuse the Keep Uniques UI labels so history text stays familiar.
  if (mode === 'off') return t('keepUniquesRuleModeOff')
  if (mode === 'anticipateGaps') return t('keepUniquesRuleModeAnticipate')
  return t('keepUniquesRuleModeProtect')
}

function formatCountModeLabel(mode: KeepUniqueRuleCountMode, t: TranslateFn): string {
  // Normalize missing scopes to "Per rule" to match UI behavior.
  const normalized = normalizeCountMode(mode)
  if (normalized.perRule) return t('keepUniquesCountModePerRule')
  // Build the scoped label list in a predictable order.
  const parts: string[] = []
  if (normalized.perSlot) parts.push(t('keepUniquesCountModePerSlot'))
  if (normalized.perSet) parts.push(t('keepUniquesCountModePerSet'))
  if (normalized.perFaction) parts.push(t('keepUniquesCountModePerFaction'))
  if (normalized.perMainStat) parts.push(t('keepUniquesCountModePerMain'))
  // Join the scope labels so the UI shows the active grouping set.
  return parts.length > 0 ? parts.join(', ') : t('keepUniquesCountModePerRule')
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

function makeSlotsSnapshotLine(rule: KeepUniqueRule, t: TranslateFn): string {
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

function makeSetListSnapshotLine(rule: KeepUniqueRule, t: TranslateFn): string {
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

function makeMetasetSnapshotLine(rule: KeepUniqueRule, metasets: Metaset[], t: TranslateFn): string {
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

function makeMainStatsSnapshotLine(rule: KeepUniqueRule, t: TranslateFn): string {
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
