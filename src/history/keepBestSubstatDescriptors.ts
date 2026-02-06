/**
 * keepBestSubstatDescriptors
 *
 * History descriptor helpers for Keep Best Substat so the timeline can
 * display structured rule snapshots with the same visual language as Keep Uniques.
 */
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { KeepBestSubstatRule } from '../lib/keepBestSubstat'
import type { KeepUniqueRuleCountMode } from '../lib/keepUniques'
import { sanitizeKeepUniqueCountMode } from '../lib/keepUniques'
import { statVariantI18nKey } from '../lib/types'
import type { TranslateFn } from './builderUpdateDescriptor'
import type { KeepBestSubstatRulesDescriptorMode } from './historyDescriptorTypes'

export type { KeepBestSubstatRulesDescriptorMode }

type RuleChangeSummary = {
  added: KeepBestSubstatRule[]
  removed: KeepBestSubstatRule[]
  updated: Array<{ previous: KeepBestSubstatRule; next: KeepBestSubstatRule }>
}

// createKeepBestSubstatEnabledChangeDescriptor snapshots the toggle history entry.
export const createKeepBestSubstatEnabledChangeDescriptor = (params: {
  previousEnabled: boolean
  nextEnabled: boolean
  rules: KeepBestSubstatRule[]
}): HistoryEntryDescriptor | null => {
  const { previousEnabled, nextEnabled, rules } = params
  if (previousEnabled === nextEnabled) return null
  return {
    kind: 'keepBestSubstatEnabledChange',
    previousEnabled,
    nextEnabled,
    rules: snapshotKeepBestSubstatRules(rules),
  }
}

// createKeepBestSubstatRulesChangeDescriptor snapshots keep-best rule edits.
export const createKeepBestSubstatRulesChangeDescriptor = (params: {
  previous: KeepBestSubstatRule[]
  next: KeepBestSubstatRule[]
  mode?: KeepBestSubstatRulesDescriptorMode
}): HistoryEntryDescriptor | null => {
  const { previous, next, mode = 'edit' } = params
  const summary = diffKeepBestSubstatRules(previous, next)
  const totalChanges = summary.added.length + summary.removed.length + summary.updated.length
  if (totalChanges === 0) return null
  return {
    kind: 'keepBestSubstatRulesChange',
    previous: snapshotKeepBestSubstatRules(previous),
    next: snapshotKeepBestSubstatRules(next),
    mode,
  }
}

// describeKeepBestSubstatEnabledChange localizes toggle history entries.
export function describeKeepBestSubstatEnabledChange(params: {
  previousEnabled: boolean
  nextEnabled: boolean
  rules: KeepBestSubstatRule[]
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor | null {
  const { previousEnabled, nextEnabled, rules, t } = params
  if (previousEnabled === nextEnabled) return null
  const titleKey = nextEnabled ? 'historyKeepBestSubstatEnabledTitle' : 'historyKeepBestSubstatDisabledTitle'
  const detailLines = [t('historyKeepBestSubstatRulesCountLine', { count: rules.length })]
  return { title: t(titleKey), detailLines }
}

// describeKeepBestSubstatRulesChange localizes keep-best rule changes.
export function describeKeepBestSubstatRulesChange(params: {
  previous: KeepBestSubstatRule[]
  next: KeepBestSubstatRule[]
  t: TranslateFn
  mode?: KeepBestSubstatRulesDescriptorMode
}): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, t, mode = 'edit' } = params
  const summary = diffKeepBestSubstatRules(previous, next)
  const totalChanges = summary.added.length + summary.removed.length + summary.updated.length
  if (totalChanges === 0) return null

  if (mode === 'reset') {
    return {
      title: t('historyKeepBestSubstatResetTitle'),
      detailLines: [t('historyKeepBestSubstatRulesCountLine', { count: next.length })],
    }
  }

  if (summary.added.length === 1 && summary.removed.length === 0 && summary.updated.length === 0) {
    const rule = summary.added[0]!
    const title = t('historyKeepBestSubstatRuleAddedTitle', { stat: formatRuleStat(rule, t) })
    const detailLines = buildRuleSnapshotLines(rule, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  if (summary.removed.length === 1 && summary.added.length === 0 && summary.updated.length === 0) {
    const rule = summary.removed[0]!
    const title = t('historyKeepBestSubstatRuleDeletedTitle', { stat: formatRuleStat(rule, t) })
    const detailLines = buildRuleSnapshotLines(rule, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  if (summary.updated.length === 1 && summary.added.length === 0 && summary.removed.length === 0) {
    const update = summary.updated[0]!
    const title = t('historyKeepBestSubstatRuleUpdatedTitle', { stat: formatRuleStat(update.next, t) })
    const detailLines = buildRuleDiffLines(update.previous, update.next, t)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }

  const title = t('historyKeepBestSubstatRulesUpdatedTitle', { count: totalChanges })
  const detailLines = summarizeRuleStats(summary, t)
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

function diffKeepBestSubstatRules(previous: KeepBestSubstatRule[], next: KeepBestSubstatRule[]): RuleChangeSummary {
  const previousById = new Map(previous.map((rule) => [rule.id, rule]))
  const nextById = new Map(next.map((rule) => [rule.id, rule]))
  const added: KeepBestSubstatRule[] = []
  const removed: KeepBestSubstatRule[] = []
  const updated: Array<{ previous: KeepBestSubstatRule; next: KeepBestSubstatRule }> = []
  for (const [id, rule] of nextById) {
    const prevRule = previousById.get(id)
    if (!prevRule) {
      added.push(rule)
      continue
    }
    if (buildRuleSignature(prevRule) !== buildRuleSignature(rule)) {
      updated.push({ previous: prevRule, next: rule })
    }
  }
  for (const [id, rule] of previousById) {
    if (!nextById.has(id)) removed.push(rule)
  }
  return { added, removed, updated }
}

function buildRuleSignature(rule: KeepBestSubstatRule): string {
  const mode = normalizeCountMode(rule.countMode)
  return JSON.stringify({
    id: rule.id,
    substat: Number(rule.substat),
    requiredCount: Math.max(1, Math.floor(rule.requiredCount)),
    countMode: mode,
  })
}

function normalizeCountMode(mode: KeepUniqueRuleCountMode): KeepUniqueRuleCountMode {
  const normalized = sanitizeKeepUniqueCountMode(mode)
  if (normalized.perRule) {
    return { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false }
  }
  return {
    perRule: false,
    perSet: normalized.perSet,
    perFaction: normalized.perFaction,
    perMainStat: normalized.perMainStat,
    perSlot: normalized.perSlot,
  }
}

function formatRuleStat(rule: KeepBestSubstatRule, t: TranslateFn): string {
  return t(statVariantI18nKey(rule.substat))
}

function buildRuleSnapshotLines(rule: KeepBestSubstatRule, t: TranslateFn): string[] {
  const scopeLabel = formatCountModeScope(rule.countMode, t)
  const detailLines = [
    t('historyKeepBestSubstatRuleCountLine', { count: Math.max(1, Math.floor(rule.requiredCount)) }),
  ]
  if (scopeLabel) detailLines.push(t('historyKeepBestSubstatRuleScopeLine', { scope: scopeLabel }))
  return detailLines
}

function buildRuleDiffLines(previous: KeepBestSubstatRule, next: KeepBestSubstatRule, t: TranslateFn): string[] {
  const lines: string[] = []
  if (Number(previous.substat) !== Number(next.substat)) {
    lines.push(t('historyKeepBestSubstatRuleStatLine', {
      previous: formatRuleStat(previous, t),
      next: formatRuleStat(next, t),
    }))
  }
  if (Math.max(1, Math.floor(previous.requiredCount)) !== Math.max(1, Math.floor(next.requiredCount))) {
    lines.push(t('historyKeepBestSubstatRuleCountLine', { count: Math.max(1, Math.floor(next.requiredCount)) }))
  }
  const prevScope = formatCountModeScope(previous.countMode, t)
  const nextScope = formatCountModeScope(next.countMode, t)
  if (prevScope !== nextScope) {
    lines.push(t('historyKeepBestSubstatRuleScopeLine', { scope: nextScope || t('keepUniquesCountModePerRule') }))
  }
  return lines
}

function formatCountModeScope(mode: KeepUniqueRuleCountMode, t: TranslateFn): string {
  const normalized = sanitizeKeepUniqueCountMode(mode)
  if (normalized.perRule) return t('keepUniquesCountModePerRule')
  const parts: string[] = []
  if (normalized.perSlot) parts.push(t('keepUniquesCountModePerSlot'))
  if (normalized.perSet) parts.push(t('keepUniquesCountModePerSet'))
  if (normalized.perFaction) parts.push(t('keepUniquesCountModePerFaction'))
  if (normalized.perMainStat) parts.push(t('keepUniquesCountModePerMain'))
  return parts.join(' × ')
}

function summarizeRuleStats(summary: RuleChangeSummary, t: TranslateFn): string[] {
  // Build a list of substat labels so summary lines stay readable.
  const stats = [
    ...summary.added.map((rule) => formatRuleStat(rule, t)),
    ...summary.removed.map((rule) => formatRuleStat(rule, t)),
    ...summary.updated.map(({ next }) => formatRuleStat(next, t)),
  ].filter((name) => name.length > 0)
  if (stats.length === 0) return []
  return stats
    .slice()
    // Sort labels alphabetically since they are already localized strings.
    .sort((left, right) => left.localeCompare(right))
    .map((label) => t('historyKeepBestSubstatRuleStatSummaryLine', { stat: label }))
}

function snapshotKeepBestSubstatRules(rules: KeepBestSubstatRule[]): KeepBestSubstatRule[] {
  return rules.map((rule) => ({
    ...rule,
    countMode: normalizeCountMode(rule.countMode),
  }))
}
