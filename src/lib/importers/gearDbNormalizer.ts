import { ACCESSORY_NO_SET_ID } from '../constants'
import {
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
  coerceGearInspectorLevel,
  coerceGearInspectorRank,
  coerceGearInspectorRarity,
  isAccessorySlot,
  normalizeGearInspectorFaction,
  normalizeGearInspectorSetForSlot,
} from '../gearInspectorDomain'
import type { TestItem } from '../ruleEval'

export const STAT_SCALE = 2 ** 32 // 4_294_967_296

// Specialized error lets the importer drop metadata rows without masking real failures.
export class UnsupportedGearDbRowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedGearDbRowError'
  }
}

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
  // Assume new accset code 17 maps to Argonites for forward compatibility.
  17: Faction.Argonites,
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

// Keys of GearDbArtifactRow whose non-nullable value type is number; excludes boolean fields like isLocked.
type NumericGearDbKey = { [K in keyof GearDbArtifactRow]-?: NonNullable<GearDbArtifactRow[K]> extends number ? K : never }[keyof GearDbArtifactRow]

type SubstatColumn = {
  id: NumericGearDbKey
  flag: NumericGearDbKey
  level: NumericGearDbKey
  base: NumericGearDbKey
  glyph: NumericGearDbKey
  myth: NumericGearDbKey
}

const SUBSTAT_COLUMNS: readonly SubstatColumn[] = [
  { id: 's1id', flag: 's1fl', level: 's1lvl', base: 's1lvlid', glyph: 's1gv', myth: 's1mlvlid' },
  { id: 's2id', flag: 's2fl', level: 's2lvl', base: 's2lvlid', glyph: 's2gv', myth: 's2mlvlid' },
  { id: 's3id', flag: 's3fl', level: 's3lvl', base: 's3lvlid', glyph: 's3gv', myth: 's3mlvlid' },
  { id: 's4id', flag: 's4fl', level: 's4lvl', base: 's4lvlid', glyph: 's4gv', myth: 's4mlvlid' },
] as const

export type GearDbArtifactRow = {
  ID: number
  // Revision counter from the JSON endpoint — incremented by RSL Helper on every
  // attribute change.  Not present in SQLite rows; optional so both sources share the type.
  revision?: number | null
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
  // Set to true when the player has locked the item in-game (sourced from the readOnly endpoint field).
  isLocked?: boolean | null
}

export type GearDbChampionRow = {
  ID: number
  /** Current hero-variant ID; ascension level = HeroID − BaseHeroID (0–6). */
  HeroID?: number | null
  Name?: string | null
  Vault?: number | null
  RVault?: number | null
  BaseHeroID?: number | null
  Rarity?: number | null
  /** Empowerment level (0–4 in observed data). Independent of ascension; comes from the
   *  `EmpLvl` column in the SQL dump or `empLvl` (camelCase aliases) in JSON endpoint payloads. */
  EmpLvl?: number | null
  /** Champion affinity (1=Magic, 2=Force, 3=Spirit, 4=Void). Roster sort key between
   *  blessing-grade and ascension; the desired order is Void > Force > Magic > Spirit
   *  (see `AFFINITY_ROSTER_PRIORITY` in `champAnalytics.ts`). */
  Affinity?: number | null
  /** Champion Double-Ascension / Blessing grade — the `B` is "Blessing", NOT "Base".
   *  Equivalent to RSL's in-game "Awakening" level (0–6). Mirrors the WebSocket
   *  `doubleAscend.grade` field. Roster sort key between empowerment and affinity. */
  BGrade?: number | null
  /** Current star count (1–6, the yellow stars on the champion icon). Equivalent to
   *  the WebSocket `grade` field at top level (NOT `doubleAscend.grade`). Used as a
   *  Gear Analytics roster sort tail tiebreaker after ascensionLevel. */
  Rang?: number | null
  /** Champion XP level (1–60). Equivalent to the WebSocket `level` field. Used as a
   *  Gear Analytics roster sort tail tiebreaker after Rang. */
  Lvl?: number | null
}

export type GearDbLastUsedRow = {
  id: number // `LastUsedArtifacts.id` (artifact FK)
  lastUse?: string | number | null // Stored as text or Julian-day REAL
  ID?: number | null // Helper occasionally capitalizes the column name.
  // JSON snapshots can reuse the uppercase column (to match SQL dumps), so we
  // keep both spellings for round trip safety.
}

export type StatSource = 'main' | 'substat' | 'ascension'

export type ChampionLocation = 'collection' | 'vault' | 'reserveVault'

export type ChampionLookupRecord = {
  id: number
  name: string | null
  /** Where the champion lives — exactly one of the three. Replaces the prior
   *  `vault` + `reserveVault` boolean pair (mutually exclusive flags were the wrong
   *  representation for a one-of-three value). */
  location: ChampionLocation
  baseHeroId: number | null
  rarity: RankValue | null
  /** Champion ascension level (HeroID − BaseHeroID, 0–6); null when absent in the DB row. */
  ascensionLevel: number | null
  /** Champion empowerment level (0–4 observed); null when absent (e.g. older dumps without EmpLvl). */
  empowermentLevel: number | null
  /** Champion affinity numeric code (1=Magic, 2=Force, 3=Spirit, 4=Void); null when unknown. */
  affinity: number | null
  /** Champion Double-Ascension / Blessing grade (RSL "Awakening" level, 0–6); null when absent. */
  blessingGrade: number | null
  /** Current star count (1–6); null when absent. */
  starGrade: number | null
  /** Champion XP level (1–60); null when absent. */
  experienceLevel: number | null
}

export type NormalizedStat = {
  source: StatSource
  statId: StatId
  isFlat: boolean
  variant: StatVariant
  baseValue: number
  glyphValue: number
  mythValue: number
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
  exactLevel?: number | null
  faction: FactionId
  mainStat: NormalizedStat | null
  substats: NormalizedStat[]
  ascension: NormalizedStat | null
  gearInspectorItem: TestItem
  rerollCount: number
  /** Reference to the equipped champion's full lookup record. Null when the artifact
   *  is unequipped OR the equipped champion id is missing from the current lookup.
   *  Callers read the id via `artifact.equippedChampion?.id` — there is no separate
   *  `equippedToChampionId` foreign-key field. */
  equippedChampion: ChampionLookupRecord | null
  source: 'artifacts' | 'inbox' | 'manual'
  lastUseLocalTimestamp: string | null
  // True when the player has locked this item in-game; always false for manual entries.
  isLocked: boolean
}

export type NormalizeOptions = {
  source?: 'artifacts' | 'inbox'
  championLookup?: ReadonlyMap<number, ChampionLookupRecord>
  lastUseLocalTimestamp?: string | null
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

const finalizeStat = (statId: number, isFlat: boolean, base: number, glyph: number, myth?: number): {
  baseValue: number
  glyphValue: number
  mythValue: number
  totalValue: number
} => {
  const convertedBase = convertStatUnits(statId, isFlat, base)
  const convertedGlyph = convertStatUnits(statId, isFlat, glyph)
  const convertedMyth = convertStatUnits(statId, isFlat, myth ?? 0)
  // `totalValue` reflects the in-game base (pre-glyph) amount plus any Mythical
  // pre-roll so downstream logic can add glyphs explicitly without double-counting.
  return {
    baseValue: roundStatValue(statId, isFlat, convertedBase),
    glyphValue: roundStatValue(statId, isFlat, convertedGlyph),
    mythValue: roundStatValue(statId, isFlat, convertedMyth),
    totalValue: roundStatValue(statId, isFlat, convertedBase + convertedMyth),
  }
}

const extractMainStat = (row: GearDbArtifactRow): NormalizedStat | null => {
  const statId = toNumber(row.mid)
  if (statId === null || statId <= 0) return null
  const flat = isFlatFlag(row.mfl)
  const base = decodeFixedPoint(row.mlvlid)
  const glyph = decodeFixedPoint(row.mgv)
  const { baseValue, glyphValue, mythValue, totalValue } = finalizeStat(statId, flat, base, glyph)
  const variant = mainToVariant(statId, flat ? 1 : 0)
  if (variant === StatVariant.Any) return null
  return {
    source: 'main',
    statId: statId as StatId,
    isFlat: flat,
    variant,
    baseValue,
    glyphValue,
    mythValue,
    totalValue,
  }
}

const extractSubstat = (row: GearDbArtifactRow, column: SubstatColumn, index: number): NormalizedStat | null => {
  const statId = toNumber(row[column.id])
  if (statId === null || statId <= 0) return null
  const flat = isFlatFlag(row[column.flag])
  const base = decodeFixedPoint(row[column.base])
  const glyph = decodeFixedPoint(row[column.glyph])
  const myth = decodeFixedPoint(row[column.myth])
  const { baseValue, glyphValue, mythValue, totalValue } = finalizeStat(statId, flat, base, glyph, myth)
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
    mythValue,
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
  const { baseValue, glyphValue, mythValue, totalValue } = finalizeStat(statId, flat, base, glyph)
  const variant = subToVariant(statId, flat ? 1 : 0)
  if (variant === StatVariant.Any) return null
  return {
    source: 'ascension',
    statId: statId as StatId,
    isFlat: flat,
    variant,
    baseValue,
    glyphValue,
    mythValue,
    totalValue,
    rolls: Math.max(0, level ?? 0),
  }
}

const determineSlot = (value: number | null | undefined): ArtifactTypeId => {
  const key = toNumber(value)
  if (key !== null && DB_SLOT_TO_ARTIFACT_TYPE[key]) {
    return DB_SLOT_TO_ARTIFACT_TYPE[key]
  }
  throw new UnsupportedGearDbRowError(`Unsupported artifact slot id: ${value}`)
}

const determineSet = (slot: ArtifactTypeId, value: number | null | undefined): number => {
  const numeric = toNumber(value)
  if (numeric === null || numeric <= 0) {
    if (isAccessorySlot(slot)) return ACCESSORY_NO_SET_ID
    return 0
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
  // Use a plain object to avoid Map/Object.fromEntries hot-loop crashes in SQL.js imports.
  const values: Record<number, number> = {}
  // Fold substat values by StatVariant so downstream rules see consolidated totals.
  for (const stat of stats) {
    // Skip the "Any" placeholder so the payload stays semantically meaningful.
    if (stat.variant === StatVariant.Any) continue
    // Combine base + myth rolls to match the Gear Inspector's pre-glyph expectations.
    const baseAmount = stat.baseValue + (stat.mythValue ?? 0)
    // Drop zero-ish entries so we don't bloat the serialized subValues payload.
    if (Math.abs(baseAmount) <= 0) continue
    // Accumulate duplicate variants before rounding to preserve previous behavior.
    const existing = values[stat.variant] ?? 0
    const combined = existing + baseAmount
    // Keep rounding logic centralized to match the rest of the stat pipeline.
    values[stat.variant] = roundStatValue(stat.statId, stat.isFlat, combined)
  }
  return values
}

// Last-used timestamps arrive as local strings (`YYYY-MM-DD HH:MM:SS.sss`);
// normalize by trimming whitespace and dropping empty payloads.
const sanitizeLastUseTimestamp = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed
}

export function normalizeGearDbArtifact(row: GearDbArtifactRow, options: NormalizeOptions = {}): NormalizedGearArtifact {
  const slot = determineSlot(row.type)
  const rawSet = determineSet(slot, row.aset)
  const set = normalizeGearInspectorSetForSlot(slot, rawSet) as ArtifactSetId
  const rank = coerceGearInspectorRank(row.rank, 6)
  const rarity = coerceGearInspectorRarity(row.rarity, 6)
  const exactLevel = (() => {
    const value = toNumber(row.lvl)
    if (value === null) return null
    return Math.max(0, Math.min(16, Math.round(value)))
  })()
  const level = coerceGearInspectorLevel(row.lvl, 0)
  const faction = normalizeGearInspectorFaction(slot, determineFaction(slot, row.accset))

  const mainStat = extractMainStat(row)
  const substats = extractSubstats(row)
  const ascension = extractAscensionStat(row)

  const rerollCount = toNumber(row.REROLLCOUNT) ?? 0
  const isLocked = row.isLocked === true
  const equippedToChampionId = (() => {
    const value = toNumber(row.cID)
    if (value === null || value === 0) return null
    return value
  })()
  const championLookup = options.championLookup
  // Reference to the equipped champion's lookup record; null when unequipped or
  // when the champion id is not in the current lookup map. All previously
  // denormalized `equippedChampion*` fields are accessed off this reference.
  const equippedChampion = (equippedToChampionId != null && championLookup)
    ? championLookup.get(equippedToChampionId) ?? null
    : null
  const source = options.source ?? 'artifacts'
  const lastUseLocalTimestamp = sanitizeLastUseTimestamp(options.lastUseLocalTimestamp)

  const subValues = buildSubValueMap(substats)

  const gearInspectorItem: TestItem = {
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
      equippedChampion,
      mainStat,
      substats,
      ascension: ascension ?? null,
      exactLevel,
      lastUseLocalTimestamp,
      isLocked,
    },
  }

  return {
    id: row.ID,
    slot,
    set,
    rank,
    rarity,
    level,
    exactLevel,
    faction,
    mainStat,
    substats,
    ascension: ascension ?? null,
    gearInspectorItem,
    rerollCount,
    equippedChampion,
    source,
    lastUseLocalTimestamp,
    isLocked,
  }
}
