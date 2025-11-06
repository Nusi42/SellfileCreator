import { ACCESSORY_NO_SET_ID } from '../constants'
import {
  ArtifactSet,
  type ArtifactSetId,
  ArtifactType,
  type ArtifactTypeId,
  Faction,
  type FactionId,
  type LevelMilestone,
  StatId,
  StatVariant,
  mainToVariant,
  subToVariant,
  type RankValue,
} from '../types'
import {
  coerceTesterLevel,
  coerceTesterRank,
  coerceTesterRarity,
  isAccessorySlot,
  normalizeTesterFaction,
  normalizeTesterSetForSlot,
} from '../testerDomain'
import type { TestItem } from '../ruleEval'

export const STAT_SCALE = 2 ** 32 // 4_294_967_296

const DB_SLOT_TO_ARTIFACT_TYPE: Record<number, ArtifactTypeId> = {
  1: ArtifactType.Helmet,
  2: ArtifactType.Chestplate,
  3: ArtifactType.Gauntlets,
  4: ArtifactType.Boots,
  5: ArtifactType.Weapon,
  6: ArtifactType.Shield,
  7: ArtifactType.Ring,
  8: ArtifactType.Amulet,
  9: ArtifactType.Banner,
}

const ACCESSORY_FACTION_MAP: Record<number, FactionId> = {
  0: 0 as FactionId,
  1: Faction.BannerLords,
  2: Faction.HighElves,
  3: Faction.SacredOrder,
  4: Faction.Barbarians, // keep classic mapping for completeness
  5: Faction.OgrynTribes,
  6: Faction.Lizardmen,
  7: Faction.Skinwalkers,
  8: Faction.Orcs,
  9: Faction.Demonspawn,
  10: Faction.UndeadHordes,
  11: Faction.DarkElves,
  12: Faction.KnightRevenant,
  13: Faction.Barbarians, // DB alias
  14: Faction.SylvanWatchers,
  15: Faction.Shadowkin,
  16: Faction.Dwarves,
}

const PERCENT_STATS = new Set<number>([
  StatId.CR,
  StatId.CDMG,
])

const PERCENT_WHEN_FLAT_FLAG_ZERO = new Set<number>([
  StatId.HP,
  StatId.ATK,
  StatId.DEF,
])

type SubstatColumn = {
  id: keyof GearDbArtifactRow
  flag: keyof GearDbArtifactRow
  level: keyof GearDbArtifactRow
  base: keyof GearDbArtifactRow
  glyph: keyof GearDbArtifactRow
}

const SUBSTAT_COLUMNS: readonly SubstatColumn[] = [
  { id: 's1id', flag: 's1fl', level: 's1lvl', base: 's1lvlid', glyph: 's1gv' },
  { id: 's2id', flag: 's2fl', level: 's2lvl', base: 's2lvlid', glyph: 's2gv' },
  { id: 's3id', flag: 's3fl', level: 's3lvl', base: 's3lvlid', glyph: 's3gv' },
  { id: 's4id', flag: 's4fl', level: 's4lvl', base: 's4lvlid', glyph: 's4gv' },
] as const

export type GearDbArtifactRow = {
  ID: number
  price?: number | null
  rank?: number | null
  type?: number | null
  lvl?: number | null
  mid?: number | null
  mlvl?: number | null
  mfl?: number | null
  mlvlid?: number | null
  mgv?: number | null
  s1id?: number | null
  s1lvl?: number | null
  s1fl?: number | null
  s1lvlid?: number | null
  s1gv?: number | null
  s2id?: number | null
  s2lvl?: number | null
  s2fl?: number | null
  s2lvlid?: number | null
  s2gv?: number | null
  s3id?: number | null
  s3lvl?: number | null
  s3fl?: number | null
  s3lvlid?: number | null
  s3gv?: number | null
  s4id?: number | null
  s4lvl?: number | null
  s4fl?: number | null
  s4lvlid?: number | null
  s4gv?: number | null
  rarity?: number | null
  aset?: number | null
  accset?: number | null
  ss?: number | null
  cID?: number | null
  s1mlvlid?: number | null
  s2mlvlid?: number | null
  s3mlvlid?: number | null
  s4mlvlid?: number | null
  sumHP?: number | null
  sumATK?: number | null
  sumDEF?: number | null
  sumSPD?: number | null
  sumCQuote?: number | null
  sumCDMG?: number | null
  sumRES?: number | null
  sumACC?: number | null
  ASCID?: number | null
  ASCLVL?: number | null
  ASCFL?: number | null
  ASCLVLID?: number | null
  ASCGV?: number | null
  ASCLEVEL?: number | null
  REROLLCOUNT?: number | null
}

export type StatSource = 'main' | 'substat' | 'ascension'

export type NormalizedStat = {
  source: StatSource
  statId: StatId
  isFlat: boolean
  variant: StatVariant
  baseValue: number
  glyphValue: number
  totalValue: number
  rolls?: number
  position?: number
}

export type NormalizedGearArtifact = {
  id: number
  slot: ArtifactTypeId
  set: ArtifactSetId
  rank: RankValue
  rarity: RankValue
  level: LevelMilestone
  faction: FactionId
  mainStat: NormalizedStat | null
  substats: NormalizedStat[]
  ascension: NormalizedStat | null
  testerItem: TestItem
  rerollCount: number
  equippedToChampionId: number | null
  source: 'artifacts' | 'inbox' | 'tester'
}

export type NormalizeOptions = {
  source?: 'artifacts' | 'inbox'
  name?: string
}

const toNumber = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null
  if (Number.isFinite(value)) return Number(value)
  return null
}

const decodeFixedPoint = (value: number | null | undefined): number => (
  toNumber(value) !== null ? Number(value) / STAT_SCALE : 0
)

const isFlatFlag = (flag: number | null | undefined): boolean => {
  if (flag === null || flag === undefined) return false
  return Number(flag) !== 0
}

const convertStatUnits = (statId: number, isFlat: boolean, value: number): number => {
  if (PERCENT_STATS.has(statId)) {
    return value * 100
  }
  if (!isFlat && PERCENT_WHEN_FLAT_FLAG_ZERO.has(statId)) {
    return value * 100
  }
  return value
}

const roundStatValue = (statId: number, isFlat: boolean, value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (PERCENT_STATS.has(statId) || (!isFlat && PERCENT_WHEN_FLAT_FLAG_ZERO.has(statId))) {
    return Math.round(value * 100) / 100
  }
  if (
    statId === StatId.HP
    || statId === StatId.ATK
    || statId === StatId.DEF
    || statId === StatId.SPD
    || statId === StatId.RES
    || statId === StatId.ACC
  ) {
    return Math.round(value)
  }
  return Math.round(value * 1000) / 1000
}

const finalizeStat = (statId: number, isFlat: boolean, base: number, glyph: number): {
  baseValue: number
  glyphValue: number
  totalValue: number
} => {
  const convertedBase = convertStatUnits(statId, isFlat, base)
  const convertedGlyph = convertStatUnits(statId, isFlat, glyph)
  const total = convertedBase + convertedGlyph
  return {
    baseValue: roundStatValue(statId, isFlat, convertedBase),
    glyphValue: roundStatValue(statId, isFlat, convertedGlyph),
    totalValue: roundStatValue(statId, isFlat, total),
  }
}

const extractMainStat = (row: GearDbArtifactRow): NormalizedStat | null => {
  const statId = toNumber(row.mid)
  if (statId === null || statId <= 0) return null
  const flat = isFlatFlag(row.mfl)
  const base = decodeFixedPoint(row.mlvlid)
  const glyph = decodeFixedPoint(row.mgv)
  const { baseValue, glyphValue, totalValue } = finalizeStat(statId, flat, base, glyph)
  const variant = mainToVariant(statId, flat ? 1 : 0)
  if (variant === StatVariant.Any) return null
  return {
    source: 'main',
    statId: statId as StatId,
    isFlat: flat,
    variant,
    baseValue,
    glyphValue,
    totalValue,
  }
}

const extractSubstat = (row: GearDbArtifactRow, column: SubstatColumn, index: number): NormalizedStat | null => {
  const statId = toNumber(row[column.id])
  if (statId === null || statId <= 0) return null
  const flat = isFlatFlag(row[column.flag])
  const base = decodeFixedPoint(row[column.base])
  const glyph = decodeFixedPoint(row[column.glyph])
  const { baseValue, glyphValue, totalValue } = finalizeStat(statId, flat, base, glyph)
  const variant = subToVariant(statId, flat ? 1 : 0)
  if (variant === StatVariant.Any) return null
  const rolls = toNumber(row[column.level]) ?? 0
  return {
    source: 'substat',
    statId: statId as StatId,
    isFlat: flat,
    variant,
    baseValue,
    glyphValue,
    totalValue,
    rolls: Math.max(0, rolls),
    position: index,
  }
}

const extractSubstats = (row: GearDbArtifactRow): NormalizedStat[] => {
  const stats: NormalizedStat[] = []
  SUBSTAT_COLUMNS.forEach((column, idx) => {
    const stat = extractSubstat(row, column, idx + 1)
    if (stat) stats.push(stat)
  })
  return stats
}

const extractAscensionStat = (row: GearDbArtifactRow): NormalizedStat | null => {
  const level = toNumber(row.ASCLEVEL)
  const statId = toNumber(row.ASCID)
  if ((level ?? 0) <= 0 || statId === null || statId <= 0) return null
  const flat = isFlatFlag(row.ASCFL)
  const base = decodeFixedPoint(row.ASCLVLID)
  const glyph = decodeFixedPoint(row.ASCGV)
  const { baseValue, glyphValue, totalValue } = finalizeStat(statId, flat, base, glyph)
  const variant = subToVariant(statId, flat ? 1 : 0)
  if (variant === StatVariant.Any) return null
  return {
    source: 'ascension',
    statId: statId as StatId,
    isFlat: flat,
    variant,
    baseValue,
    glyphValue,
    totalValue,
    rolls: Math.max(0, level ?? 0),
  }
}

const determineSlot = (value: number | null | undefined): ArtifactTypeId => {
  const key = toNumber(value)
  if (key !== null && DB_SLOT_TO_ARTIFACT_TYPE[key]) {
    return DB_SLOT_TO_ARTIFACT_TYPE[key]
  }
  throw new Error(`Unsupported artifact slot id: ${value}`)
}

const determineSet = (slot: ArtifactTypeId, value: number | null | undefined): number => {
  const numeric = toNumber(value)
  if (numeric === null) return slot === ArtifactType.Ring || slot === ArtifactType.Amulet || slot === ArtifactType.Banner
    ? ACCESSORY_NO_SET_ID
    : ArtifactSet.Life
  if (numeric <= 0) {
    if (isAccessorySlot(slot)) return ACCESSORY_NO_SET_ID
    return ArtifactSet.Life
  }
  return numeric
}

const determineFaction = (slot: ArtifactTypeId, accset: number | null | undefined): FactionId => {
  if (!isAccessorySlot(slot)) return 0 as FactionId
  const numeric = toNumber(accset)
  if (numeric === null) return 0 as FactionId
  return ACCESSORY_FACTION_MAP[numeric] ?? 0 as FactionId
}

const buildSubValueMap = (stats: NormalizedStat[]): Record<number, number> => {
  const map = new Map<number, number>()
  for (const stat of stats) {
    if (stat.variant === StatVariant.Any) continue
    if (Math.abs(stat.totalValue) <= 0) continue
    const existing = map.get(stat.variant) ?? 0
    const combined = existing + stat.totalValue
    map.set(stat.variant, roundStatValue(stat.statId, stat.isFlat, combined))
  }
  return Object.fromEntries(map.entries())
}

export function normalizeGearDbArtifact(row: GearDbArtifactRow, options: NormalizeOptions = {}): NormalizedGearArtifact {
  const slot = determineSlot(row.type)
  const rawSet = determineSet(slot, row.aset)
  const set = normalizeTesterSetForSlot(slot, rawSet) as ArtifactSetId
  const rank = coerceTesterRank(row.rank, 6)
  const rarity = coerceTesterRarity(row.rarity, 6)
  const level = coerceTesterLevel(row.lvl, 0)
  const faction = normalizeTesterFaction(slot, determineFaction(slot, row.accset))

  const mainStat = extractMainStat(row)
  const substats = extractSubstats(row)
  const ascension = extractAscensionStat(row)

  const rerollCount = toNumber(row.REROLLCOUNT) ?? 0
  const equippedToChampionId = (() => {
    const value = toNumber(row.cID)
    if (value === null || value === 0) return null
    return value
  })()
  const source = options.source ?? 'artifacts'

  const subValues = buildSubValueMap(substats)

  const testerItem: TestItem = {
    ...(options.name ? { name: options.name } : {}),
    slot,
    set,
    rank,
    rarity,
    level,
    faction,
    ...(mainStat ? { main: mainStat.variant } : {}),
    subValues,
    previewExtras: {
      id: row.ID,
      source,
      rerollCount,
      equippedToChampionId,
      mainStat,
      substats,
      ascension: ascension ?? null,
    },
  }

  return {
    id: row.ID,
    slot,
    set,
    rank,
    rarity,
    level,
    faction,
    mainStat,
    substats,
    ascension: ascension ?? null,
    testerItem,
    rerollCount,
    equippedToChampionId,
    source,
  }
}
