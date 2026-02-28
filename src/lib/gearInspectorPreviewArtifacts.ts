import { variantToMain, variantToSub } from './hsfTypes'
import type { NormalizedGearArtifact, NormalizedStat } from './importers/gearDbNormalizer'
import type { TestItem } from './ruleEval'
import { StatVariant, type RankValue } from './types'

type BuildOptions = {
  fallbackId?: number | undefined
  subOrder?: number[] | undefined
}

const cloneStat = (stat: NormalizedStat | null | undefined): NormalizedStat | null => (
  stat ? { ...stat, mythValue: stat.mythValue ?? 0 } : null
)

const cloneStats = (stats: NormalizedStat[] | undefined): NormalizedStat[] => (
  (stats ?? []).map((stat) => ({ ...stat, mythValue: stat.mythValue ?? 0 }))
)

const buildManualMainStat = (variantValue: number | undefined): NormalizedStat | null => {
  if (variantValue == null) return null
  const variant = Number(variantValue)
  if (!Number.isFinite(variant) || variant < 0 || variant === StatVariant.Any) return null
  const mainTuple = variantToMain(variant)
  return {
    source: 'main',
    statId: mainTuple.id,
    isFlat: (mainTuple.f ?? 0) === 1,
    variant: variant as StatVariant,
    baseValue: 0,
    glyphValue: 0,
    mythValue: 0,
    totalValue: Number.NaN,
  }
}

const buildManualSubstats = (
  item: TestItem,
  subOrder?: number[],
): NormalizedStat[] => {
  const subValues = item.subValues ?? {}
  const entries = Object.entries(subValues)
    .map(([variantKey, rawValue]) => {
      const variant = Number(variantKey)
      const value = Number(rawValue)
      if (!Number.isFinite(variant) || !Number.isFinite(value)) return null
      const subTuple = variantToSub(variant)
      const stat: NormalizedStat = {
        source: 'substat',
        statId: subTuple.id,
        isFlat: Boolean(subTuple.isFlat),
        variant: variant as StatVariant,
        baseValue: value,
        glyphValue: 0,
        mythValue: 0,
        totalValue: value,
      }
      return stat
    })
    .filter((stat): stat is NormalizedStat => Boolean(stat))

  if (!entries.length) return []
  if (subOrder && subOrder.length > 0) {
    const order = new Map<number, number>()
    subOrder.forEach((variant, idx) => { order.set(Number(variant), idx) })
    entries.sort((a, b) => {
      const ao = order.has(a.variant) ? order.get(a.variant)! : Number.MAX_SAFE_INTEGER
      const bo = order.has(b.variant) ? order.get(b.variant)! : Number.MAX_SAFE_INTEGER
      if (ao === bo) return a.variant - b.variant
      return ao - bo
    })
  } else {
    entries.sort((a, b) => a.variant - b.variant)
  }
  return entries
}

export function buildPreviewArtifactFromGearInspectorItem(
  item: TestItem,
  options?: BuildOptions,
): NormalizedGearArtifact {
  const extras = item.previewExtras
  const id = extras?.id ?? options?.fallbackId ?? 0
  const source = extras?.source ?? 'tester'
  const rerollCount = extras?.rerollCount ?? 0
  const equippedToChampionId = extras?.equippedToChampionId ?? null
  const equippedChampionBaseId = extras?.equippedChampionBaseId ?? null
  const equippedChampionRarity = (extras?.equippedChampionRarity ?? null) as RankValue | null
  const equippedChampionName = extras?.equippedChampionName ?? null
  const equippedChampionLocation = extras?.equippedChampionLocation ?? null
  const mainStat = extras?.mainStat ? cloneStat(extras.mainStat) : buildManualMainStat(item.main)
  const substats = extras?.substats ? cloneStats(extras.substats) : buildManualSubstats(item, options?.subOrder)
  const ascension = extras?.ascension ? cloneStat(extras.ascension) : null
  const exactLevel = (typeof extras?.exactLevel === 'number' && Number.isFinite(extras.exactLevel))
    ? Math.max(0, Math.min(16, Math.round(extras.exactLevel)))
    : null
  // Last-use metadata only exists for imported gear DB entries.
  const lastUseLocalTimestamp = typeof extras?.lastUseLocalTimestamp === 'string'
    ? extras.lastUseLocalTimestamp
    : null

  return {
    id,
    slot: item.slot,
    set: item.set,
    rank: item.rank,
    rarity: item.rarity,
    level: item.level,
    exactLevel,
    faction: item.faction ?? 0,
    mainStat,
    substats,
    ascension,
    gearInspectorItem: item,
    testerItem: item, // WASM boundary alias; keep until Rust side renames the field
    rerollCount,
    equippedToChampionId,
    equippedChampionBaseId,
    equippedChampionRarity,
    source,
    equippedChampionName,
    equippedChampionLocation,
    lastUseLocalTimestamp,
  }
}
