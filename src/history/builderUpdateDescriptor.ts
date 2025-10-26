import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { NBSP } from '../lib/constants'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById, normalizeMetasetIconId } from '../lib/metasetIcons'
import {
  artifactSetI18nKey,
  artifactTypeI18nKey,
  compareArtifactSets,
  compareArtifactTypes,
  compareVariants,
  factionI18nKey,
  statVariantI18nKey,
  type ArtifactSetId,
  type ArtifactTypeId,
  type StatVariantLike,
} from '../lib/types'
import {
  BUILDER_FIELD_KEYS,
  areBuilderFieldValuesEqual,
  type BuilderFieldKey,
} from '../lib/multiEditDraft'

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

type DescribeBuilderConfigUpdateParams = {
  previous: BuilderConfig
  next: BuilderConfig
  index: number
  t: TranslateFn
  metasets: Metaset[]
}

type SummarizeBuilderConfigDiffParams = {
  previous: BuilderConfig
  next: BuilderConfig
  t: TranslateFn
  metasets: Metaset[]
}

type BuilderConfigDiffSummary = {
  detailLines: string[]
  changedKeys: Set<BuilderFieldKey>
}

export function createHistoryBuilderBaseline(overrides: Partial<BuilderConfig> = {}): BuilderConfig {
  return {
    name: '',
    keep: true,
    exportMode: 'active',
    rankCode: 0,
    rarityCode: 0,
    rarityMode: 'auto',
    autoRaritySupplementsThreshold: 'rare',
    factionCode: 0,
    mainStatsV: [],
    minLevel: 0,
    maxLevel: 16,
    rollBaseline: 'afterStart',
    earlyKeepMode: 'early',
    substatsV: [],
    fixedSubstatsV: [],
    minCount: 0,
    autoMinCount: true,
    autoSubstatFlex: false,
    minRequiredRolls: 0,
    autoMinRequiredRolls: true,
    substatRollBoundsV: {},
    substatRollTargetsV: {},
    artifactTypes: [],
    artifactSets: [],
    artifactMetaSets: [],
    substatMinTarget: 'selected',
    ...overrides,
  }
}

export function describeBuilderConfigUpdate(params: DescribeBuilderConfigUpdateParams): HistoryEntryDescriptor | null {
  const { previous, next, index, t, metasets } = params
  const { detailLines, changedKeys } = summarizeBuilderConfigDiff({ previous, next, t, metasets })
  if (changedKeys.size === 0) return null

  const label = buildConfigLabel(index, next, t)
  const title = t('historyBuilderSavedTitle', { label })
  const descriptor: HistoryEntryDescriptor = detailLines.length > 0
    ? { title, detailLines }
    : { title }
  return descriptor
}

export function summarizeBuilderConfigDiff(params: SummarizeBuilderConfigDiffParams): BuilderConfigDiffSummary {
  const { previous, next, t, metasets } = params
  const changed = collectChangedFields(previous, next)
  if (changed.size === 0) {
    return { detailLines: [], changedKeys: changed }
  }

  const detailLines: string[] = []
  let slotDiffLine: string | null = null
  let metasetDiffLine: string | null = null
  let artifactSetsDiffLine: string | null = null

  if (changed.has('name')) {
    pushDiff(detailLines, t, t('builderConfigName'), formatName(previous, t), formatName(next, t))
  }
  if (changed.has('keep')) {
    pushInlineDiff(detailLines, t, t('builderAction'), formatKeepValue(previous, t), formatKeepValue(next, t))
  }
  if (changed.has('exportMode')) {
    pushInlineDiff(detailLines, t, t('historyBuilderExportModeLabel'), formatExportModeValue(previous, t), formatExportModeValue(next, t))
  }
  if (changed.has('rankCode')) {
    pushDiff(detailLines, t, t('builderRank'), formatRankValue(previous, t), formatRankValue(next, t))
  }
  if (hasAny(changed, ['rarityMode', 'rarityCode', 'autoRaritySupplementsThreshold'])) {
    pushInlineDiff(detailLines, t, t('filterRarity'), formatRarityValue(previous, t), formatRarityValue(next, t))
  }
  if (changed.has('factionCode')) {
    pushInlineDiff(detailLines, t, t('builderFaction'), formatFactionValue(previous, t), formatFactionValue(next, t))
  }
  if (hasAny(changed, ['minLevel', 'maxLevel'])) {
    pushInlineDiff(detailLines, t, t('historyBuilderLevelsLabel'), formatLevelWindowValue(previous, t), formatLevelWindowValue(next, t))
  }
  if (changed.has('artifactTypes')) {
    slotDiffLine = makeSlotsDiffLine(previous, next, t)
  }
  if (changed.has('artifactMetaSets')) {
    metasetDiffLine = makeMetasetsDiffLine(previous, next, metasets, t)
  }
  if (changed.has('artifactSets')) {
    artifactSetsDiffLine = makeArtifactSetsDiffLine(previous, next, t)
  }
  if (changed.has('mainStatsV')) {
    detailLines.push(makeMainStatsDiffLine(previous, next, t))
  }
  if (hasAny(changed, ['substatsV', 'fixedSubstatsV', 'substatRollBoundsV'])) {
    detailLines.push(makeSubstatsDiffLine(previous, next, t))
  }
  if (hasAny(changed, ['minCount', 'autoMinCount', 'autoSubstatFlex'])) {
    pushInlineDiff(detailLines, t, t('builderRequiredSubstats'), formatRequiredSubstatsValue(previous, t), formatRequiredSubstatsValue(next, t))
  }
  if (hasAny(changed, ['minRequiredRolls', 'autoMinRequiredRolls', 'substatMinTarget'])) {
    pushInlineDiff(detailLines, t, t('builderMinRequiredRolls'), formatMinRequiredRollsValue(previous, t), formatMinRequiredRollsValue(next, t))
  }
  if (changed.has('earlyKeepMode')) {
    pushInlineDiff(detailLines, t, t('builderMilestoneThresholds'), formatMilestoneModeValue(previous, t), formatMilestoneModeValue(next, t))
  }
  if (slotDiffLine) {
    detailLines.push(slotDiffLine)
  }
  if (metasetDiffLine) {
    detailLines.push(metasetDiffLine)
  }
  if (artifactSetsDiffLine) {
    detailLines.push(artifactSetsDiffLine)
  }
  if (changed.has('rollBaseline')) {
    pushDiff(detailLines, t, t('historyBuilderRollBaselineLabel'), formatRollBaselineValue(previous, t), formatRollBaselineValue(next, t))
  }
  return { detailLines, changedKeys: changed }
}

export function collectChangedFields(previous: BuilderConfig, next: BuilderConfig): Set<BuilderFieldKey> {
  const changed = new Set<BuilderFieldKey>()
  for (const key of BUILDER_FIELD_KEYS) {
    if (!areBuilderFieldValuesEqual(key, previous[key], next[key])) {
      changed.add(key)
    }
  }
  return changed
}

function hasAny(set: Set<BuilderFieldKey>, keys: BuilderFieldKey[]): boolean {
  for (const key of keys) {
    if (set.has(key)) return true
  }
  return false
}

function pushDiff(target: string[], t: TranslateFn, label: string, previous: string, next: string) {
  const prevText = normalizeDisplay(previous, t)
  const nextText = normalizeDisplay(next, t)
  if (prevText === nextText) return
  target.push(t('historyDiffLine', { label, previous: prevText, next: nextText }))
}

function pushInlineDiff(target: string[], t: TranslateFn, label: string, previous: string, next: string) {
  const prevText = normalizeDisplay(previous, t)
  const nextText = normalizeDisplay(next, t)
  if (prevText === nextText) return
  target.push(`${label}: ${prevText}${NBSP}→${NBSP}${nextText}`)
}

function makeSlotsDiffLine(previous: BuilderConfig, next: BuilderConfig, t: TranslateFn): string {
  const prevTypes = normalizeNumberArray(previous.artifactTypes).map(Number).sort(compareArtifactTypes)
  const nextTypes = normalizeNumberArray(next.artifactTypes).map(Number).sort(compareArtifactTypes)
  return JSON.stringify({
    kind: 'slotsDiff',
    label: t('builderSlots'),
    previous: prevTypes,
    next: nextTypes,
    previousText: formatArtifactTypesValue(previous, t),
    nextText: formatArtifactTypesValue(next, t),
  })
}

function makeMainStatsDiffLine(previous: BuilderConfig, next: BuilderConfig, t: TranslateFn): string {
  const prevStats = normalizeNumberArray(previous.mainStatsV).map(Number).sort(compareVariants)
  const nextStats = normalizeNumberArray(next.mainStatsV).map(Number).sort(compareVariants)
  return JSON.stringify({
    kind: 'mainStatsDiff',
    label: t('builderMain'),
    previous: prevStats,
    next: nextStats,
    previousText: formatMainStatsValue(previous, t),
    nextText: formatMainStatsValue(next, t),
  })
}

function makeSubstatsDiffLine(previous: BuilderConfig, next: BuilderConfig, t: TranslateFn): string {
  const prevStats = normalizeNumberArray(previous.substatsV).map(Number).sort(compareVariants)
  const nextStats = normalizeNumberArray(next.substatsV).map(Number).sort(compareVariants)
  const prevLocked = normalizeNumberArray((previous as { fixedSubstatsV?: number[] }).fixedSubstatsV).map(Number).sort(compareVariants)
  const nextLocked = normalizeNumberArray((next as { fixedSubstatsV?: number[] }).fixedSubstatsV).map(Number).sort(compareVariants)
  const prevBounds = normalizeRollBounds((previous as { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> }).substatRollBoundsV)
  const nextBounds = normalizeRollBounds((next as { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> }).substatRollBoundsV)
  return JSON.stringify({
    kind: 'substatsDiff',
    label: t('builderSubstats'),
    previous: prevStats,
    previousLocked: prevLocked,
    previousBounds: prevBounds,
    next: nextStats,
    nextLocked,
    nextBounds,
    autoFlexPrev: previous.autoSubstatFlex === true,
    autoFlexNext: next.autoSubstatFlex === true,
    previousText: formatSubstatsValue(previous, t),
    nextText: formatSubstatsValue(next, t),
  })
}

function makeArtifactSetsDiffLine(previous: BuilderConfig, next: BuilderConfig, t: TranslateFn): string {
  const prevSets = normalizeNumberArray(previous.artifactSets).map(Number).sort(compareArtifactSets)
  const nextSets = normalizeNumberArray(next.artifactSets).map(Number).sort(compareArtifactSets)
  return JSON.stringify({
    kind: 'setListDiff',
    label: t('setsTitle'),
    previous: prevSets,
    next: nextSets,
    previousText: formatArtifactSetListFallback(prevSets, t),
    nextText: formatArtifactSetListFallback(nextSets, t),
  })
}

function makeMetasetsDiffLine(previous: BuilderConfig, next: BuilderConfig, metasets: Metaset[], t: TranslateFn): string {
  return JSON.stringify({
    kind: 'metasetDiff',
    label: t('menuMetasetsSection'),
    previous: collectMetasetDiffEntries(previous, metasets),
    next: collectMetasetDiffEntries(next, metasets),
    previousFallback: t('any'),
    nextFallback: t('any'),
  })
}

type MetasetDiffEntry = {
  id: string
  name: string
  icon?: string | null
}

function collectMetasetDiffEntries(cfg: BuilderConfig, metasets: Metaset[]): MetasetDiffEntry[] {
  const ids = Array.isArray(cfg.artifactMetaSets) ? cfg.artifactMetaSets.filter(Boolean) : []
  if (ids.length === 0) return []
  const out: MetasetDiffEntry[] = []
  for (const rawId of ids) {
    const id = String(rawId)
    const meta = metasets.find((entry) => entry.id === id) ?? null
    const rawName = (meta?.name ?? '').trim()
    const name = rawName.length > 0 ? rawName : id
    const iconId = normalizeMetasetIconId(meta?.iconId ?? DEFAULT_METASET_ICON_ID)
    const iconGlyph = iconId === 'none' || iconId === 'empty' ? null : metasetIconOptionById(iconId).glyph
    out.push({
      id,
      name,
      ...(iconGlyph ? { icon: iconGlyph } : {}),
    })
  }
  return out
}

function formatArtifactSetListFallback(ids: number[], t: TranslateFn): string {
  if (ids.length === 0) return t('any')
  const labels = ids
    .map((setId) => t(artifactSetI18nKey(Number(setId) as ArtifactSetId)).trim())
    .filter((label) => label.length > 0)
  if (labels.length === 0) return t('any')
  return labels.join(', ')
}

function normalizeRollBounds(bounds: Record<number, { min?: number; max?: number; any?: boolean }> | undefined): Record<number, { min?: number; max?: number; any?: boolean }> {
  if (!bounds) return {}
  const out: Record<number, { min?: number; max?: number; any?: boolean }> = {}
  for (const [key, value] of Object.entries(bounds)) {
    const k = Number(key)
    if (!Number.isFinite(k)) continue
    const min = typeof value?.min === 'number' ? clampRoll(value.min) : undefined
    const max = typeof value?.max === 'number' ? clampRoll(value.max, { cap: 4 }) : undefined
    const wildcard = value?.any === true
    if (min !== undefined || max !== undefined || wildcard) {
      out[k] = {
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
        ...(wildcard ? { any: true } : {}),
      }
    }
  }
  return out
}

function normalizeDisplay(value: string, t: TranslateFn): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : t('historyValueEmpty')
}

export function buildConfigLabel(index: number, cfg: BuilderConfig, t: TranslateFn): string {
  const name = (cfg.name ?? '').trim()
  const base = t('historyConfigLabel', { n: index + 1 })
  return name ? `${base} - "${name}"` : base
}

function formatName(cfg: BuilderConfig, t: TranslateFn): string {
  const raw = (cfg.name ?? '').trim()
  return raw ? `"${raw}"` : t('historyValueEmpty')
}

function formatKeepValue(cfg: BuilderConfig, t: TranslateFn): string {
  return cfg.keep ? t('keepValueKeep') : t('keepValueSell')
}

function formatExportModeValue(cfg: BuilderConfig, t: TranslateFn): string {
  const mode = cfg.exportMode ?? 'active'
  switch (mode) {
    case 'disabled': return t('builderExportModeDisabled')
    case 'separator': return t('builderExportModeSeparator')
    default: return t('builderExportModeActive')
  }
}

function formatRankValue(cfg: BuilderConfig, t: TranslateFn): string {
  const n = Number(cfg.rankCode ?? 0)
  if (n === 0 || Number.isNaN(n)) return t('any')
  const star = (value: number): string => {
    switch (value) {
      case 1: return t('star1')
      case 2: return t('star2')
      case 3: return t('star3')
      case 4: return t('star4')
      case 5: return t('star5')
      case 6: return t('star6')
      default: return `${value}★`
    }
  }
  if (n >= 1 && n <= 6) return star(n)
  if (n >= 7 && n <= 11) return `≥${NBSP}${star(n - 6)}`
  if (n >= 12 && n <= 16) return `≤${NBSP}${star(n - 10)}`
  return String(n)
}

function formatRarityValue(cfg: BuilderConfig, t: TranslateFn): string {
  if (cfg.rarityMode === 'auto') {
    const threshold = cfg.autoRaritySupplementsThreshold ?? null
    if (!threshold) return t('headerMenuAuto')
    const tierKey = threshold === 'uncommon'
      ? 'rarityUncommon'
      : threshold === 'epic'
        ? 'rarityEpic'
        : 'rarityRare'
    return t('builderAutoGeLabel', { tier: t(tierKey) })
  }
  return formatRarityCode(cfg.rarityCode, t)
}

function formatRarityCode(code: number | undefined, t: TranslateFn): string {
  const n = Number(code ?? 0)
  if (Number.isNaN(n) || n === 0) return t('any')
  const label = (key: 'rarityCommon' | 'rarityUncommon' | 'rarityRare' | 'rarityEpic' | 'rarityLegendary' | 'rarityMythical'): string => t(key)
  switch (n) {
    case 1: return label('rarityCommon')
    case 2: return label('rarityUncommon')
    case 3: return label('rarityRare')
    case 4: return label('rarityEpic')
    case 5: return label('rarityLegendary')
    case 6: return `≥${NBSP}${label('rarityCommon')}`
    case 7: return `≥${NBSP}${label('rarityUncommon')}`
    case 8: return `≥${NBSP}${label('rarityRare')}`
    case 9: return `≥${NBSP}${label('rarityEpic')}`
    case 10: return `≤${NBSP}${label('rarityUncommon')}`
    case 11: return `≤${NBSP}${label('rarityRare')}`
    case 12: return `≤${NBSP}${label('rarityEpic')}`
    case 13: return `≤${NBSP}${label('rarityLegendary')}`
    case 14: return `≤${NBSP}${label('rarityMythical')}`
    case 15: return label('rarityMythical')
    case 16: return `≥${NBSP}${label('rarityLegendary')}`
    default: return String(n)
  }
}

function formatFactionValue(cfg: BuilderConfig, t: TranslateFn): string {
  const code = cfg.factionCode ?? 0
  if (!code) return t('any')
  return t(factionI18nKey(code))
}

function clampLevel(level: number | undefined): number {
  if (typeof level !== 'number' || Number.isNaN(level)) return 0
  if (level < 0) return 0
  if (level > 16) return 16
  return level
}

function formatLevelWindowValue(cfg: BuilderConfig, t: TranslateFn): string {
  const min = clampLevel(cfg.minLevel ?? 0)
  const max = clampLevel(cfg.maxLevel ?? 16)
  const minLabel = `+${min}`
  const maxLabel = `+${max}`
  return t('historyBuilderLevelsValue', { min: minLabel, max: maxLabel })
}

function formatArtifactTypesValue(cfg: BuilderConfig, t: TranslateFn): string {
  const types = normalizeNumberArray(cfg.artifactTypes)
  if (types.length === 0) return t('any')
  const sorted = types.slice().sort(compareArtifactTypes)
  return sorted.map((typeId) => t(artifactTypeI18nKey(typeId as ArtifactTypeId))).join(', ')
}

function formatMainStatsValue(cfg: BuilderConfig, t: TranslateFn): string {
  const stats = normalizeNumberArray(cfg.mainStatsV)
  if (stats.length === 0) return t('any')
  const sorted = stats.slice().sort(compareVariants)
  return sorted.map((variant) => t(statVariantI18nKey(variant as StatVariantLike))).join(', ')
}

function formatSubstatsValue(cfg: BuilderConfig, t: TranslateFn): string {
  const substats = normalizeNumberArray(cfg.substatsV)
  if (substats.length === 0) return t('any')
  const fixed = new Set<number>(normalizeNumberArray(cfg.fixedSubstatsV))
  const sorted = substats.slice().sort(compareVariants)
  return sorted
    .map((variant) => {
      const label = t(statVariantI18nKey(variant as StatVariantLike))
      return fixed.has(Number(variant)) ? `${label} 🔒` : label
    })
    .join(', ')
}

function clampRoll(value: number, opts?: { cap?: number }): number {
  const capped = typeof opts?.cap === 'number' ? opts.cap : 5
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(capped, Math.floor(value)))
}

function formatRequiredSubstatsValue(cfg: BuilderConfig, t: TranslateFn): string {
  const auto = cfg.autoMinCount === true
  const count = typeof cfg.minCount === 'number' ? cfg.minCount : 0
  const base = auto ? t('headerMenuAuto') : String(count)
  const flex = cfg.autoSubstatFlex ? t('builderFlexChipOn') : t('builderFlexChipOff')
  return `${base} (${flex})`
}

function formatMinRequiredRollsValue(cfg: BuilderConfig, t: TranslateFn): string {
  const auto = cfg.autoMinRequiredRolls !== false
  const count = typeof cfg.minRequiredRolls === 'number' ? cfg.minRequiredRolls : 0
  const base = auto ? t('headerMenuAuto') : String(count)
  const scope = (cfg.substatMinTarget ?? 'selected') === 'locked'
    ? t('builderMinRequiredRollsChipLocked')
    : t('builderMinRequiredRollsChipSelected')
  return `${base} (${scope})`
}

function formatMilestoneModeValue(cfg: BuilderConfig, t: TranslateFn): string {
  const mode = (cfg.earlyKeepMode ?? 'early') === 'late' ? 'late' : 'early'
  return mode === 'late' ? t('builderLateLabel') : t('builderEarlyLabel')
}

function formatRollBaselineValue(cfg: BuilderConfig, t: TranslateFn): string {
  const baseline = cfg.rollBaseline ?? 'afterStart'
  return baseline === 'upToLevel'
    ? t('historyBuilderRollBaselineUpToLevel')
    : t('historyBuilderRollBaselineAfterStart')
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const result: number[] = []
  for (const entry of value) {
    const num = Number(entry)
    if (Number.isFinite(num)) result.push(num)
  }
  return result
}
