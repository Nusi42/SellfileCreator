import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { NBSP } from '../lib/constants'
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

export function describeBuilderConfigUpdate(params: DescribeBuilderConfigUpdateParams): HistoryEntryDescriptor | null {
  const { previous, next, index, t, metasets } = params
  const changed = collectChangedFields(previous, next)
  if (changed.size === 0) return null

  const label = buildConfigLabel(index, next, t)
  const title = t('historyBuilderSavedTitle', { label })
  const detailLines: string[] = []

  if (changed.has('name')) {
    pushDiff(detailLines, t, t('builderConfigName'), formatName(previous, t), formatName(next, t))
  }
  if (changed.has('keep')) {
    pushDiff(detailLines, t, t('builderAction'), formatKeepValue(previous, t), formatKeepValue(next, t))
  }
  if (changed.has('visibility')) {
    pushDiff(detailLines, t, t('historyBuilderSellfileModeLabel'), formatVisibilityValue(previous, t), formatVisibilityValue(next, t))
  }
  if (changed.has('rankCode')) {
    pushDiff(detailLines, t, t('builderRank'), formatRankValue(previous, t), formatRankValue(next, t))
  }
  if (hasAny(changed, ['rarityMode', 'rarityCode', 'autoRaritySupplementsThreshold'])) {
    pushDiff(detailLines, t, t('filterRarity'), formatRarityValue(previous, t), formatRarityValue(next, t))
  }
  if (changed.has('factionCode')) {
    pushDiff(detailLines, t, t('builderFaction'), formatFactionValue(previous, t), formatFactionValue(next, t))
  }
  if (hasAny(changed, ['minLevel', 'maxLevel'])) {
    pushDiff(detailLines, t, t('historyBuilderLevelsLabel'), formatLevelWindowValue(previous, t), formatLevelWindowValue(next, t))
  }
  if (changed.has('artifactTypes')) {
    pushDiff(detailLines, t, t('builderSlots'), formatArtifactTypesValue(previous, t), formatArtifactTypesValue(next, t))
  }
  if (changed.has('artifactSets')) {
    pushDiff(detailLines, t, t('setsTitle'), formatArtifactSetsValue(previous, t), formatArtifactSetsValue(next, t))
  }
  if (changed.has('artifactMetaSets')) {
    pushDiff(detailLines, t, t('menuMetasetsSection'), formatMetasetsValue(previous, metasets, t), formatMetasetsValue(next, metasets, t))
  }
  if (changed.has('mainStatsV')) {
    pushDiff(detailLines, t, t('builderMain'), formatMainStatsValue(previous, t), formatMainStatsValue(next, t))
  }
  if (hasAny(changed, ['substatsV', 'fixedSubstatsV'])) {
    pushDiff(detailLines, t, t('builderSubstats'), formatSubstatsValue(previous, t), formatSubstatsValue(next, t))
  }
  if (changed.has('substatRollBoundsV')) {
    pushDiff(detailLines, t, t('historyBuilderRollBoundsLabel'), formatRollBoundsValue(previous, t), formatRollBoundsValue(next, t))
  }
  if (hasAny(changed, ['minCount', 'autoMinCount', 'autoSubstatFlex'])) {
    pushDiff(detailLines, t, t('builderRequiredSubstats'), formatRequiredSubstatsValue(previous, t), formatRequiredSubstatsValue(next, t))
  }
  if (hasAny(changed, ['minRequiredRolls', 'autoMinRequiredRolls', 'substatMinTarget'])) {
    pushDiff(detailLines, t, t('builderMinRequiredRolls'), formatMinRequiredRollsValue(previous, t), formatMinRequiredRollsValue(next, t))
  }
  if (changed.has('earlyKeepMode')) {
    pushDiff(detailLines, t, t('builderMilestoneThresholds'), formatMilestoneModeValue(previous, t), formatMilestoneModeValue(next, t))
  }
  if (changed.has('rollBaseline')) {
    pushDiff(detailLines, t, t('historyBuilderRollBaselineLabel'), formatRollBaselineValue(previous, t), formatRollBaselineValue(next, t))
  }
  if (changed.has('rollMode')) {
    pushDiff(detailLines, t, t('historyBuilderRollModeLabel'), formatRollModeValue(previous, t), formatRollModeValue(next, t))
  }

  const descriptor: HistoryEntryDescriptor = detailLines.length > 0
    ? { title, detailLines }
    : { title }
  return descriptor
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

function formatVisibilityValue(cfg: BuilderConfig, t: TranslateFn): string {
  const mode = cfg.visibility ?? 'enabled'
  switch (mode) {
    case 'hidden': return t('builderSellfileModeDisabled')
    case 'draft': return t('builderSellfileModeDraft')
    default: return t('builderSellfileModeEnabled')
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

function formatArtifactSetsValue(cfg: BuilderConfig, t: TranslateFn): string {
  const sets = normalizeNumberArray(cfg.artifactSets)
  if (sets.length === 0) return t('any')
  const sorted = sets.slice().sort(compareArtifactSets)
  return sorted.map((setId) => t(artifactSetI18nKey(setId as ArtifactSetId))).join(', ')
}

function formatMetasetsValue(cfg: BuilderConfig, metasets: Metaset[], t: TranslateFn): string {
  const ids = Array.isArray(cfg.artifactMetaSets) ? cfg.artifactMetaSets.filter(Boolean) : []
  if (ids.length === 0) return t('any')
  const names = ids.map((id) => {
    const meta = metasets.find((entry) => entry.id === id)
    const rawName = (meta?.name ?? '').trim()
    return rawName.length > 0 ? rawName : id
  })
  return names.join(', ')
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

function formatRollBoundsValue(cfg: BuilderConfig, t: TranslateFn): string {
  const bounds = cfg.substatRollBoundsV ?? {}
  const entries = Object.entries(bounds)
  if (entries.length === 0) return t('any')
  const formatted: string[] = []
  const normalized = entries
    .map(([variant, raw]) => ({ variant: Number(variant), raw: raw ?? {} }))
    .sort((a, b) => compareVariants(a.variant, b.variant))
  for (const entry of normalized) {
    const label = t(statVariantI18nKey(entry.variant as StatVariantLike))
    const min = typeof entry.raw.min === 'number' ? clampRoll(entry.raw.min) : undefined
    const max = typeof entry.raw.max === 'number' ? clampRoll(entry.raw.max, { cap: 4 }) : undefined
    let text = ''
    if (min !== undefined && max !== undefined && min === max) {
      text = `${label}=${min}r`
    } else if ((max === 0) && (min === undefined || min === 0)) {
      text = `${label}=0r`
    } else {
      const parts: string[] = []
      if (min !== undefined) parts.push(`≥${min}r`)
      if (max !== undefined) parts.push(`≤${max}r`)
      if (parts.length > 0) {
        text = `${label} ${parts.join(' ')}`
      }
    }
    if (text) formatted.push(text)
  }
  return formatted.length > 0 ? formatted.join(', ') : t('any')
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

function formatRollModeValue(cfg: BuilderConfig, t: TranslateFn): string {
  const mode = cfg.rollMode ?? 'auto'
  if (mode === 'strict') return t('historyBuilderRollModeStrict')
  if (mode === 'potential') return t('historyBuilderRollModePotential')
  return t('headerMenuAuto')
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
