// configCollectionDescriptors keeps config list history localized at render time.
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { BuilderFieldKey } from '../lib/multiEditDraft'
import { makeBuilderConfigSnapshotLines } from './builderUpdateDescriptor'
import type { TranslateFn } from './historyI18n'
import type { ConfigInsertionLocation, ConfigLabelSnapshot } from './historyLabelUtils'
import {
  buildInsertionLocation,
  formatConfigLabel,
  formatConfigLabelFromConfig,
  formatInsertionLocation,
  snapshotConfigLabel,
} from './historyLabelUtils'
import { snapshotBuilderConfig, snapshotMetasets } from './historySnapshotUtils'

// Cap label lists so history tooltips stay compact.
const MAX_DETAIL_LABELS = 4

// DescribeConfigAddedParams drive localized history output.
type DescribeConfigAddedParams = {
  index: number
  cfg: BuilderConfig
  location: ConfigInsertionLocation | null
  t: TranslateFn
  lang: string
  metasets: Metaset[]
}

// DescribeConfigsDuplicatedParams carries localized duplication details.
type DescribeConfigsDuplicatedParams = {
  labels: ConfigLabelSnapshot[]
  location: ConfigInsertionLocation | null
  t: TranslateFn
}

// DescribeConfigsMovedParams carries localized move details.
type DescribeConfigsMovedParams = {
  direction: 'up' | 'down' | 'top' | 'bottom'
  labels: ConfigLabelSnapshot[]
  t: TranslateFn
}

// DescribeConfigsDeletedParams handles deletions plus config snapshots.
type DescribeConfigsDeletedParams = {
  removed: Array<{ index: number; cfg: BuilderConfig | undefined; label: ConfigLabelSnapshot }>
  t: TranslateFn
  lang: string
  metasets: Metaset[]
}

// DescribeConfigsClearedParams covers clear-all entries.
type DescribeConfigsClearedParams = {
  previousCount: number
  t: TranslateFn
}

// DescribeConfigsInsertedParams covers paste/import entries.
type DescribeConfigsInsertedParams = {
  mode: 'paste' | 'import'
  labels: ConfigLabelSnapshot[]
  location: ConfigInsertionLocation | null
  t: TranslateFn
}

// DescribeConfigOptionsAppliedParams details config option toggles.
type DescribeConfigOptionsAppliedParams = {
  labels: ConfigLabelSnapshot[]
  enableCount: number
  disableCount: number
  t: TranslateFn
}

// DescribeMultiEditAppliedParams details multi-edit operations.
type DescribeMultiEditAppliedParams = {
  labels: ConfigLabelSnapshot[]
  fieldKeys: BuilderFieldKey[]
  t: TranslateFn
}

// createConfigAddedDescriptor snapshots a newly inserted config for history.
export const createConfigAddedDescriptor = (params: {
  index: number
  cfg: BuilderConfig
  previous: BuilderConfig[]
  metasets: Metaset[]
}): HistoryEntryDescriptor => {
  const { index, cfg, previous, metasets } = params
  return {
    kind: 'configAdded',
    index,
    cfg: snapshotBuilderConfig(cfg),
    location: buildInsertionLocation(index, previous),
    metasets: snapshotMetasets(metasets),
  }
}

// createConfigsDuplicatedDescriptor snapshots duplicated labels for history.
export const createConfigsDuplicatedDescriptor = (params: {
  labels: ConfigLabelSnapshot[]
  location: ConfigInsertionLocation | null
}): HistoryEntryDescriptor | null => {
  const { labels, location } = params
  if (labels.length === 0) return null
  return {
    kind: 'configsDuplicated',
    labels,
    location,
  }
}

// createConfigsMovedDescriptor snapshots a move action for history.
export const createConfigsMovedDescriptor = (params: {
  direction: DescribeConfigsMovedParams['direction']
  labels: ConfigLabelSnapshot[]
}): HistoryEntryDescriptor | null => {
  const { direction, labels } = params
  if (labels.length === 0) return null
  return {
    kind: 'configsMoved',
    direction,
    labels,
  }
}

// createConfigsDeletedDescriptor snapshots deleted configs for history.
export const createConfigsDeletedDescriptor = (params: {
  removed: Array<{ index: number; cfg: BuilderConfig | undefined }>
  metasets: Metaset[]
}): HistoryEntryDescriptor | null => {
  const { removed, metasets } = params
  if (removed.length === 0) return null
  const snapshotRemoved = removed
    .filter((entry) => Boolean(entry.cfg))
    .map((entry) => ({
      index: entry.index,
      cfg: snapshotBuilderConfig(entry.cfg!),
      label: snapshotConfigLabel(entry.index, entry.cfg!),
    }))
  if (snapshotRemoved.length === 0) return null
  return {
    kind: 'configsDeleted',
    removed: snapshotRemoved,
    metasets: snapshotMetasets(metasets),
  }
}

// createConfigsClearedDescriptor captures the clear-all action.
export const createConfigsClearedDescriptor = (previousCount: number): HistoryEntryDescriptor => ({
  kind: 'configsCleared',
  previousCount,
})

// createConfigsInsertedDescriptor snapshots pasted/imported configs.
export const createConfigsInsertedDescriptor = (params: {
  mode: 'paste' | 'import'
  labels: ConfigLabelSnapshot[]
  location: ConfigInsertionLocation | null
}): HistoryEntryDescriptor | null => {
  const { mode, labels, location } = params
  if (labels.length === 0) return null
  return {
    kind: 'configsInserted',
    mode,
    labels,
    location,
  }
}

// createConfigOptionsAppliedDescriptor snapshots config option tags.
export const createConfigOptionsAppliedDescriptor = (params: {
  labels: ConfigLabelSnapshot[]
  enableCount: number
  disableCount: number
}): HistoryEntryDescriptor | null => {
  const { labels, enableCount, disableCount } = params
  if (labels.length === 0) return null
  return {
    kind: 'configOptionsApplied',
    labels,
    enableCount,
    disableCount,
  }
}

// createMultiEditAppliedDescriptor snapshots a multi-edit apply event.
export const createMultiEditAppliedDescriptor = (params: {
  labels: ConfigLabelSnapshot[]
  fieldKeys: BuilderFieldKey[]
}): HistoryEntryDescriptor | null => {
  const { labels, fieldKeys } = params
  if (labels.length === 0) return null
  return {
    kind: 'multiEditApplied',
    labels,
    fieldKeys,
  }
}

// describeConfigAdded localizes a config add descriptor at render time.
export function describeConfigAdded(params: DescribeConfigAddedParams): ResolvedHistoryEntryDescriptor {
  const { index, cfg, location, t, lang, metasets } = params
  const label = formatConfigLabelFromConfig(index, cfg, t)
  const locationLine = formatInsertionLocation(location, t)
  const detailLines = locationLine ? [locationLine] : []
  // Treat added configs as a single-state snapshot so tooltips show the actual values
  // that landed in the builder rather than a fabricated before/after diff.
  const snapshotLines = makeBuilderConfigSnapshotLines({ cfg, metasets, t, lang })
  if (snapshotLines.length > 0) {
    detailLines.push(...snapshotLines)
  }
  const descriptor: ResolvedHistoryEntryDescriptor = detailLines.length > 0
    ? { title: t('historyConfigAddedTitle', { label }), detailLines }
    : { title: t('historyConfigAddedTitle', { label }) }
  return descriptor
}

// describeConfigsDuplicated localizes config duplication entries.
export function describeConfigsDuplicated(params: DescribeConfigsDuplicatedParams): ResolvedHistoryEntryDescriptor | null {
  const { labels, location, t } = params
  if (labels.length === 0) return null
  const detailLines = mergeDetailLines(location, labels, t)
  if (labels.length === 1) {
    const label = formatConfigLabel(labels[0]!, t)
    return detailLines.length > 0
      ? { title: t('historyConfigDuplicatedTitle', { label }), detailLines }
      : { title: t('historyConfigDuplicatedTitle', { label }) }
  }
  return detailLines.length > 0
    ? { title: t('historyConfigsDuplicatedMultipleTitle', { count: labels.length }), detailLines }
    : { title: t('historyConfigsDuplicatedMultipleTitle', { count: labels.length }) }
}

// describeConfigsMoved localizes move entries for config reordering.
export function describeConfigsMoved(params: DescribeConfigsMovedParams): ResolvedHistoryEntryDescriptor | null {
  const { direction, labels, t } = params
  if (labels.length === 0) return null
  const detailLines = summarizeLabels(labels, t)
  const singleKey = SINGLE_MOVE_KEYS[direction]
  const multiKey = MULTI_MOVE_KEYS[direction]
  const title = labels.length === 1
    ? t(singleKey, { label: formatConfigLabel(labels[0]!, t) })
    : t(multiKey, { count: labels.length })
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

// describeConfigsDeleted localizes delete entries plus config snapshots.
export function describeConfigsDeleted(params: DescribeConfigsDeletedParams): ResolvedHistoryEntryDescriptor | null {
  const { removed, t, lang, metasets } = params
  if (!removed.length) return null
  const labels = removed
    .map((entry) => entry.label)
    .filter(Boolean)
  const detailLines = summarizeLabels(labels, t)
  if (labels.length === 0) return null
  if (labels.length === 1) {
    const cfg = removed.find((entry) => Boolean(entry.cfg))?.cfg ?? null
    // Likewise, deleted configs show their last-known state instead of a diff against defaults.
    const snapshotLines = cfg ? makeBuilderConfigSnapshotLines({ cfg, metasets, t, lang }) : []
    if (snapshotLines.length > 0) {
      return { title: t('historyConfigDeletedTitle', { label: formatConfigLabel(labels[0]!, t) }), detailLines: snapshotLines }
    }
    return { title: t('historyConfigDeletedTitle', { label: formatConfigLabel(labels[0]!, t) }) }
  }
  return detailLines.length > 0
    ? { title: t('historyConfigsDeletedMultipleTitle', { count: labels.length }), detailLines }
    : { title: t('historyConfigsDeletedMultipleTitle', { count: labels.length }) }
}

// describeConfigsCleared localizes the clear-all history entry.
export function describeConfigsCleared(params: DescribeConfigsClearedParams): ResolvedHistoryEntryDescriptor | null {
  const { previousCount, t } = params
  if (previousCount === 0) return null
  return { title: t('historyConfigsClearedTitle') }
}

// describeConfigsInserted localizes paste/import history entries.
export function describeConfigsInserted(params: DescribeConfigsInsertedParams): ResolvedHistoryEntryDescriptor | null {
  const { mode, labels, location, t } = params
  if (labels.length === 0) return null
  const detailLines = mergeDetailLines(location, labels, t)
  if (labels.length === 1) {
    const key = mode === 'import' ? 'historyConfigImportedTitle' : 'historyConfigPastedTitle'
    const title = t(key, { label: formatConfigLabel(labels[0]!, t) })
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }
  const key = mode === 'import' ? 'historyConfigsImportedMultipleTitle' : 'historyConfigsPastedMultipleTitle'
  const title = t(key, { count: labels.length })
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

// describeConfigOptionsApplied localizes tag enable/disable entries.
export function describeConfigOptionsApplied(params: DescribeConfigOptionsAppliedParams): ResolvedHistoryEntryDescriptor | null {
  const { labels, enableCount, disableCount, t } = params
  // Skip empty changes to avoid noisy history entries.
  if (labels.length === 0) return null
  // Summarize config labels to keep history concise.
  const detailLines = summarizeLabels(labels, t)
  // Prefix with a summary of enabled/disabled counts.
  detailLines.unshift(t('historyConfigOptionsAppliedSummaryLine', { enabled: enableCount, disabled: disableCount }))
  return detailLines.length > 0
    ? { title: t('historyConfigOptionsAppliedTitle'), detailLines }
    : { title: t('historyConfigOptionsAppliedTitle') }
}

// describeMultiEditApplied localizes multi-edit entries for history.
export function describeMultiEditApplied(params: DescribeMultiEditAppliedParams): ResolvedHistoryEntryDescriptor | null {
  const { labels, fieldKeys, t } = params
  if (labels.length === 0) return null
  const summaryLabels = summarizeLabels(labels, t)
  const fieldLabels = deriveFieldLabels(fieldKeys, t)
  const title = t('historyMultiEditAppliedTitle', { count: labels.length })
  const detailLines: string[] = []
  if (fieldLabels.length > 0) {
    detailLines.push(t('historyMultiEditFieldsLine', { fields: fieldLabels.join(', ') }))
  }
  detailLines.push(...summaryLabels)
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

function summarizeLabels(labels: ConfigLabelSnapshot[], t: TranslateFn): string[] {
  const formatted = labels.map((label) => formatConfigLabel(label, t))
  if (formatted.length <= MAX_DETAIL_LABELS) return formatted.slice()
  const slice = formatted.slice(0, MAX_DETAIL_LABELS)
  const remaining = formatted.length - MAX_DETAIL_LABELS
  slice.push(t('historyConfigsMoreLine', { count: remaining }))
  return slice
}

function mergeDetailLines(location: ConfigInsertionLocation | null, labels: ConfigLabelSnapshot[], t: TranslateFn): string[] {
  const summarized = summarizeLabels(labels, t)
  const locationLine = formatInsertionLocation(location, t)
  if (locationLine) return [locationLine, ...summarized]
  return summarized
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
  fieldKeys: BuilderFieldKey[],
  t: TranslateFn,
): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const key of fieldKeys) {
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
