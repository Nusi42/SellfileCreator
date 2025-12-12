import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { BuilderFieldKey } from '../lib/multiEditDraft'
import {
  buildConfigLabel,
  collectChangedFields,
  makeBuilderConfigSnapshotLines,
  type TranslateFn,
} from './builderUpdateDescriptor'

const MAX_DETAIL_LABELS = 4

type DescribeConfigAddedParams = {
  index: number
  cfg: BuilderConfig
  previous: BuilderConfig[]
  t: TranslateFn
  lang: string
  metasets: Metaset[]
}

type DescribeConfigsDuplicatedParams = {
  insertIndex: number
  labels: string[]
  previous: BuilderConfig[]
  t: TranslateFn
}

type DescribeConfigsMovedParams = {
  prev: BuilderConfig[]
  next: BuilderConfig[]
  selection: number[]
  direction: 'up' | 'down' | 'top' | 'bottom'
  t: TranslateFn
}

type DescribeConfigsDeletedParams = {
  removed: Array<{ index: number; cfg: BuilderConfig | undefined }>
  t: TranslateFn
  lang: string
  metasets: Metaset[]
}

type DescribeConfigsClearedParams = {
  previousCount: number
  t: TranslateFn
}

type DescribeConfigsInsertedParams = {
  mode: 'paste' | 'import'
  insertIndex: number
  labels: string[]
  previous: BuilderConfig[]
  t: TranslateFn
}

type DescribeMultiEditAppliedParams = {
  entries: Array<{ index: number; previous: BuilderConfig; next: BuilderConfig }>
  dirtyKeys: BuilderFieldKey[]
  t: TranslateFn
}

export function describeConfigAdded(params: DescribeConfigAddedParams): HistoryEntryDescriptor {
  const { index, cfg, previous, t, lang, metasets } = params
  const label = buildConfigLabel(index, cfg, t)
  const location = makeInsertionDetailLine(index, previous, t)
  const detailLines = location ? [location] : []
  // Treat added configs as a single-state snapshot so tooltips show the actual values
  // that landed in the builder rather than a fabricated before/after diff.
  const snapshotLines = makeBuilderConfigSnapshotLines({ cfg, metasets, t, lang })
  if (snapshotLines.length > 0) {
    detailLines.push(...snapshotLines)
  }
  const descriptor: HistoryEntryDescriptor = detailLines.length > 0
    ? { title: t('historyConfigAddedTitle', { label }), detailLines }
    : { title: t('historyConfigAddedTitle', { label }) }
  return descriptor
}

export function describeConfigsDuplicated(params: DescribeConfigsDuplicatedParams): HistoryEntryDescriptor | null {
  const { insertIndex, labels, previous, t } = params
  if (labels.length === 0) return null
  const location = makeInsertionDetailLine(insertIndex, previous, t)
  const detailLines = mergeDetailLines(location, labels, t)
  if (labels.length === 1) {
    return detailLines.length > 0
      ? { title: t('historyConfigDuplicatedTitle', { label: labels[0]! }), detailLines }
      : { title: t('historyConfigDuplicatedTitle', { label: labels[0]! }) }
  }
  return detailLines.length > 0
    ? { title: t('historyConfigsDuplicatedMultipleTitle', { count: labels.length }), detailLines }
    : { title: t('historyConfigsDuplicatedMultipleTitle', { count: labels.length }) }
}

export function describeConfigsMoved(params: DescribeConfigsMovedParams): HistoryEntryDescriptor | null {
  const { prev, next, selection, direction, t } = params
  if (selection.length === 0) return null
  const nextPositions = new Map<BuilderConfig, number>()
  next.forEach((cfg, idx) => { if (cfg) nextPositions.set(cfg, idx) })
  const movedLabels: string[] = []
  const seen = new Set<string>()
  for (const idx of selection) {
    if (idx < 0 || idx >= prev.length) continue
    const cfg = prev[idx]
    if (!cfg) continue
    const nextIdx = nextPositions.get(cfg)
    if (nextIdx == null || nextIdx === idx) continue
    const label = buildConfigLabel(nextIdx, next[nextIdx]!, t)
    if (seen.has(label)) continue
    seen.add(label)
    movedLabels.push(label)
  }
  if (movedLabels.length === 0) return null
  const detailLines = summarizeLabels(movedLabels, t)
  const singleKey = SINGLE_MOVE_KEYS[direction]
  const multiKey = MULTI_MOVE_KEYS[direction]
  const title = movedLabels.length === 1
    ? t(singleKey, { label: movedLabels[0]! })
    : t(multiKey, { count: movedLabels.length })
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

export function describeConfigsDeleted(params: DescribeConfigsDeletedParams): HistoryEntryDescriptor | null {
  const { removed, t, lang, metasets } = params
  if (!removed.length) return null
  const labels: string[] = []
  const seen = new Set<string>()
  for (const entry of removed) {
    const { index, cfg } = entry
    if (!cfg) continue
    const label = buildConfigLabel(index, cfg, t)
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  if (labels.length === 0) return null
  const detailLines = summarizeLabels(labels, t)
  if (labels.length === 1) {
    const cfg = removed.find((entry) => Boolean(entry.cfg))?.cfg ?? null
    // Likewise, deleted configs show their last-known state instead of a diff against defaults.
    const snapshotLines = cfg ? makeBuilderConfigSnapshotLines({ cfg, metasets, t, lang }) : []
    if (snapshotLines.length > 0) {
      return { title: t('historyConfigDeletedTitle', { label: labels[0]! }), detailLines: snapshotLines }
    }
    return { title: t('historyConfigDeletedTitle', { label: labels[0]! }) }
  }
  return detailLines.length > 0
    ? { title: t('historyConfigsDeletedMultipleTitle', { count: labels.length }), detailLines }
    : { title: t('historyConfigsDeletedMultipleTitle', { count: labels.length }) }
}

export function describeConfigsCleared(params: DescribeConfigsClearedParams): HistoryEntryDescriptor | null {
  const { previousCount, t } = params
  if (previousCount === 0) return null
  return { title: t('historyConfigsClearedTitle') }
}

export function describeConfigsInserted(params: DescribeConfigsInsertedParams): HistoryEntryDescriptor | null {
  const { mode, insertIndex, labels, previous, t } = params
  if (labels.length === 0) return null
  const location = makeInsertionDetailLine(insertIndex, previous, t)
  const detailLines = mergeDetailLines(location, labels, t)
  if (labels.length === 1) {
    const key = mode === 'import' ? 'historyConfigImportedTitle' : 'historyConfigPastedTitle'
    const title = t(key, { label: labels[0]! })
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }
  const key = mode === 'import' ? 'historyConfigsImportedMultipleTitle' : 'historyConfigsPastedMultipleTitle'
  const title = t(key, { count: labels.length })
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

export function describeMultiEditApplied(params: DescribeMultiEditAppliedParams): HistoryEntryDescriptor | null {
  const { entries, dirtyKeys, t } = params
  if (entries.length === 0) return null
  const labels = summarizeLabels(entries.map(entry => buildConfigLabel(entry.index, entry.next, t)), t)
  const fieldLabels = deriveFieldLabels(entries, dirtyKeys, t)
  const title = t('historyMultiEditAppliedTitle', { count: entries.length })
  const detailLines: string[] = []
  if (fieldLabels.length > 0) {
    detailLines.push(t('historyMultiEditFieldsLine', { fields: fieldLabels.join(', ') }))
  }
  detailLines.push(...labels)
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

const SINGLE_MOVE_KEYS: Record<DescribeConfigsMovedParams['direction'], string> = {
  up: 'historyConfigMovedUpTitle',
  down: 'historyConfigMovedDownTitle',
  top: 'historyConfigMovedTopTitle',
  bottom: 'historyConfigMovedBottomTitle',
}

const MULTI_MOVE_KEYS: Record<DescribeConfigsMovedParams['direction'], string> = {
  up: 'historyConfigsMovedUpTitle',
  down: 'historyConfigsMovedDownTitle',
  top: 'historyConfigsMovedTopTitle',
  bottom: 'historyConfigsMovedBottomTitle',
}

function summarizeLabels(labels: string[], t: TranslateFn): string[] {
  if (labels.length <= MAX_DETAIL_LABELS) return labels.slice()
  const slice = labels.slice(0, MAX_DETAIL_LABELS)
  const remaining = labels.length - MAX_DETAIL_LABELS
  slice.push(t('historyConfigsMoreLine', { count: remaining }))
  return slice
}

function mergeDetailLines(location: string | null, labels: string[], t: TranslateFn): string[] {
  const summarized = summarizeLabels(labels, t)
  if (location) return [location, ...summarized]
  return summarized
}

function makeInsertionDetailLine(index: number, previous: BuilderConfig[], t: TranslateFn): string | null {
  if (previous.length === 0) return t('historyConfigsInsertedAtStartLine')
  if (index <= 0) return t('historyConfigsInsertedAtStartLine')
  if (index >= previous.length) return t('historyConfigsInsertedAtEndLine')
  const anchor = buildConfigLabel(index - 1, previous[index - 1]!, t)
  return t('historyConfigsInsertedAfterLine', { label: anchor })
}

const FIELD_LABEL_KEY_BY_BUILDER_KEY: Partial<Record<BuilderFieldKey, string>> = {
  name: 'builderConfigName',
  keep: 'builderAction',
  exportMode: 'historyBuilderExportModeLabel',
  rankCode: 'builderRank',
  rarityCode: 'filterRarity',
  rarityMode: 'filterRarity',
  autoRaritySupplementsThreshold: 'filterRarity',
  factionCode: 'builderFaction',
  mainStatsV: 'builderMain',
  minLevel: 'historyBuilderLevelsLabel',
  maxLevel: 'historyBuilderLevelsLabel',
  earlyKeepMode: 'builderMilestoneThresholds',
  substatsV: 'builderSubstats',
  fixedSubstatsV: 'builderSubstats',
  substatRollBoundsV: 'builderSubstats',
  minCount: 'builderRequiredSubstats',
  autoMinCount: 'builderRequiredSubstats',
  autoSubstatFlex: 'builderRequiredSubstats',
  minRequiredRolls: 'builderMinRequiredRolls',
  autoMinRequiredRolls: 'builderMinRequiredRolls',
  lockedMinRequiredRolls: 'builderMinRequiredRolls',
  artifactTypes: 'builderSlots',
  artifactSets: 'setsTitle',
  artifactMetaSets: 'menuMetasetsSection',
}

function deriveFieldLabels(
  entries: Array<{ previous: BuilderConfig; next: BuilderConfig }>,
  dirtyKeys: BuilderFieldKey[],
  t: TranslateFn,
): string[] {
  const keys = new Set<BuilderFieldKey>()
  if (dirtyKeys.length > 0) {
    for (const key of dirtyKeys) keys.add(key)
  }
  // Include detected changes to avoid stale dirty flags when no edits applied.
  for (const entry of entries) {
    const changed = collectChangedFields(entry.previous, entry.next)
    for (const key of changed) keys.add(key)
  }
  const labels: string[] = []
  const seen = new Set<string>()
  for (const key of keys) {
    const labelKey = FIELD_LABEL_KEY_BY_BUILDER_KEY[key]
    if (!labelKey) continue
    const label = t(labelKey)
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  labels.sort((a, b) => a.localeCompare(b))
  return labels
}
