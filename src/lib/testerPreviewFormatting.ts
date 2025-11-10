import { statVariantI18nKey, rarityCodeToName } from './types'
import type { NormalizedGearArtifact, NormalizedStat } from './importers/gearDbNormalizer'
import { StatVariant } from './types'

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

export const CIRCLED_ZERO_CODE_POINT = 0x24ea
export const CIRCLED_ONE_CODE_POINT = 0x2460
export const CIRCLED_TWENTY_CODE_POINT = 0x2473

export type ItemSourceDescriptor = { label: string; tooltip?: string } | null

export const formatCircledDigit = (value?: number | null): string | null => {
  if (value == null) return null
  const rounded = Math.max(0, Math.floor(value))
  if (rounded === 0) return String.fromCodePoint(CIRCLED_ZERO_CODE_POINT)
  if (rounded >= 1 && rounded <= (CIRCLED_TWENTY_CODE_POINT - CIRCLED_ONE_CODE_POINT + 1)) {
    return String.fromCodePoint(CIRCLED_ONE_CODE_POINT + rounded - 1)
  }
  return String(rounded)
}

export const formatStatPreGlyph = (stat: NormalizedStat | null): string => {
  const value = resolveStatPreGlyphValue(stat)
  if (value == null) return ''
  if (Math.abs(value % 1) < 0.01) {
    return String(Math.round(value))
  }
  return value.toFixed(2).replace(/\.?0+$/, '')
}

export const formatStatNumber = (value?: number | null): string => {
  if (value == null) return ''
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value % 1) < 0.01) {
    return String(Math.round(value))
  }
  return value.toFixed(2).replace(/\.?0+$/, '')
}

export function formatSubstats(
  stats: readonly NormalizedStat[],
  translate: TranslateFn,
): { summary: string; tooltip: string } {
  if (!stats.length) return { summary: translate('testerSubstatsNone'), tooltip: translate('testerSubstatsNone') }
  const pieces: string[] = []
  const tooltips: string[] = []
  for (const stat of stats) {
    if (stat.variant === StatVariant.Any) continue
    const label = translate(statVariantI18nKey(stat.variant))
    const value = formatStatPreGlyph(stat)
    const compact = value ? `${label} ${value}` : label
    pieces.push(compact)
    const rolls = typeof stat.rolls === 'number' && stat.rolls > 0 ? ` (${translate('testerRollsLabel', { rolls: stat.rolls })})` : ''
    const mythMagnitude = Math.abs(Number(stat.mythValue) || 0)
    const mythSuffix = mythMagnitude >= 0.01
      ? ` (+${translate('rarityMythical')} ${formatStatNumber(mythMagnitude)})`
      : ''
    const glyph = stat.glyphValue && Math.abs(stat.glyphValue) > 0.001 ? ` (+${formatStatNumber(stat.glyphValue)})` : ''
    tooltips.push(`${compact}${mythSuffix}${glyph}${rolls}`)
  }
  return {
    summary: pieces.join(', '),
    tooltip: tooltips.join('\n'),
  }
}

export function resolveRarityLabel(translate: TranslateFn, rarityCode: number): string {
  switch (rarityCode) {
    case 1: return translate('rarityCommon')
    case 2: return translate('rarityUncommon')
    case 3: return translate('rarityRare')
    case 4: return translate('rarityEpic')
    case 5: return translate('rarityLegendary')
    case 6: return translate('rarityMythical')
    default: return rarityCodeToName(rarityCode)
  }
}

export function getItemSourceDescriptor(artifact: NormalizedGearArtifact, translate: TranslateFn): ItemSourceDescriptor {
  if (artifact.source === 'tester') {
    return null
  }
  if (artifact.source === 'inbox') {
    return { label: translate('testerSourceInbox') }
  }
  if (artifact.equippedToChampionId != null) {
    const inVault = artifact.equippedChampionLocation === 'vault' || artifact.equippedChampionLocation === 'reserveVault'
    const tooltip = artifact.equippedChampionName && artifact.equippedChampionName.trim().length > 0
      ? artifact.equippedChampionName.trim()
      : translate('testerEquippedLabel', { id: artifact.equippedToChampionId })
    return {
      label: inVault ? translate('testerSourceEquippedVault') : translate('testerSourceEquippedCollection'),
      tooltip,
    }
  }
  return { label: translate('testerSourceInventory') }
}

const resolveStatPreGlyphValue = (stat: NormalizedStat | null): number | null => {
  if (!stat) return null
  const base = Number(stat.baseValue) || 0
  const myth = Number(stat.mythValue) || 0
  const combined = base + myth
  if (!Number.isFinite(combined)) return null
  return combined
}
