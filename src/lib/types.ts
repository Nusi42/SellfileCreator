// Shared domain catalogs && formatters (used by HSF viewer as well)
import { NBSP } from './constants'
import { artifactSetDescriptions } from './setDescriptions'
import { ArtifactSetPieceGroup } from './gearSets/groups'
import { getRuntimeGearSet, getRuntimeGearSetVersion, listRuntimeGearSets } from './gearSets/runtimeStore'
import {
  ArtifactSet as ArtifactSetCatalog,
  type ArtifactSet as ArtifactSetType,
  type ArtifactSetId as ArtifactSetIdType,
} from './artifactSets'
export { NBSP } from './constants'
export { ArtifactSetPieceGroup } from './gearSets/groups'
export const ArtifactSet = ArtifactSetCatalog
// eslint-disable-next-line no-redeclare -- keep value and type aliases aligned for imports
export type ArtifactSet = ArtifactSetType
export type ArtifactSetId = ArtifactSetIdType

// Artifact types (slots) as an enum for readability (values match HSF IDs)
export const ArtifactType = {
  Helmet: 1,
  Chestplate: 2,
  Gauntlets: 3,
  Boots: 4,
  Weapon: 5,
  Shield: 6,
  Ring: 7,
  Amulet: 8,
  Banner: 9,
} as const

// eslint-disable-next-line no-redeclare -- share the value name so callers import `ArtifactType` for both runtime and typing
export type ArtifactType = number
export type ArtifactTypeId = ArtifactType | number

// Artifact type (slot) names by HSF numeric ID -> human label
export const artifactTypeNames: Record<number, string> = {
  [ArtifactType.Helmet]: 'Helmet',
  [ArtifactType.Chestplate]: 'Chestplate',
  [ArtifactType.Gauntlets]: 'Gauntlets',
  [ArtifactType.Boots]: 'Boots',
  [ArtifactType.Weapon]: 'Weapon',
  [ArtifactType.Shield]: 'Shield',
  [ArtifactType.Ring]: 'Ring',
  [ArtifactType.Amulet]: 'Amulet',
  [ArtifactType.Banner]: 'Banner',
}

// Preferred artifact type (slot) order for consistent UI rendering
export const PREFERRED_ARTIFACT_TYPE_ORDER: readonly ArtifactType[] = [
  ArtifactType.Weapon,
  ArtifactType.Helmet,
  ArtifactType.Shield,
  ArtifactType.Gauntlets,
  ArtifactType.Chestplate,
  ArtifactType.Boots,
  ArtifactType.Ring,
  ArtifactType.Amulet,
  ArtifactType.Banner,
] as const

/** Comparator for artifact types (slots) using preferred order. */
export function compareArtifactTypes(a: ArtifactTypeId, b: ArtifactTypeId): number {
  const an = Number(a) as ArtifactType
  const bn = Number(b) as ArtifactType
  const ai = PREFERRED_ARTIFACT_TYPE_ORDER.indexOf(an)
  const bi = PREFERRED_ARTIFACT_TYPE_ORDER.indexOf(bn)
  if (ai !== -1 && bi !== -1) return ai - bi
  if (ai !== -1) return -1
  if (bi !== -1) return 1
  return an - bn
}


// Artifact set IDs live in `artifactSets.ts` to keep them import-cycle-free.

// Artifact Set IDs mapped to names (ascending by ID).
// Uses enum keys to avoid magic numbers while remaining numeric at runtime.
export const artifactSetNames: Record<number, string> = {
  [ArtifactSet.Life]: 'Life',
  [ArtifactSet.Offense]: 'Offense',
  [ArtifactSet.Defense]: 'Defense',
  [ArtifactSet.Speed]: 'Speed',
  [ArtifactSet.CriticalRate]: 'Critical Rate',
  [ArtifactSet.CritDamage]: 'Crit Damage',
  [ArtifactSet.Accuracy]: 'Accuracy',
  [ArtifactSet.Resistance]: 'Resistance',
  [ArtifactSet.Lifesteal]: 'Lifesteal',
  [ArtifactSet.Fury]: 'Fury',
  [ArtifactSet.Daze]: 'Daze',
  [ArtifactSet.Cursed]: 'Cursed',
  [ArtifactSet.Frost]: 'Frost',
  [ArtifactSet.Frenzy]: 'Frenzy',
  [ArtifactSet.Regeneration]: 'Regeneration',
  [ArtifactSet.Immunity]: 'Immunity',
  [ArtifactSet.Shield]: 'Shield',
  [ArtifactSet.Relentless]: 'Relentless',
  [ArtifactSet.Savage]: 'Savage',
  [ArtifactSet.Destroy]: 'Destroy',
  [ArtifactSet.Stun]: 'Stun',
  [ArtifactSet.Toxic]: 'Toxic',
  [ArtifactSet.Provoke]: 'Provoke',
  [ArtifactSet.Retaliation]: 'Retaliation',
  [ArtifactSet.Avenging]: 'Avenging',
  [ArtifactSet.Stalwart]: 'Stalwart',
  [ArtifactSet.Reflex]: 'Reflex',
  [ArtifactSet.Curing]: 'Curing',
  [ArtifactSet.Cruel]: 'Cruel',
  [ArtifactSet.Immortal]: 'Immortal',
  [ArtifactSet.DivineOffense]: 'Divine Offense',
  [ArtifactSet.DivineCriticalRate]: 'Divine Critical Rate',
  [ArtifactSet.DivineLife]: 'Divine Life',
  [ArtifactSet.DivineSpeed]: 'Divine Speed',
  [ArtifactSet.SwiftParry]: 'Swift Parry',
  [ArtifactSet.Deflection]: 'Deflection',
  [ArtifactSet.Resilience]: 'Resilience',
  [ArtifactSet.Perception]: 'Perception',
  [ArtifactSet.Affinitybreaker]: 'Affinitybreaker',
  [ArtifactSet.Untouchable]: 'Untouchable',
  [ArtifactSet.Fatal]: 'Fatal',
  [ArtifactSet.Frostbite]: 'Frostbite',
  [ArtifactSet.Bloodthirst]: 'Bloodthirst',
  [ArtifactSet.Guardian]: 'Guardian',
  [ArtifactSet.Fortitude]: 'Fortitude',
  [ArtifactSet.Lethal]: 'Lethal',
  [ArtifactSet.Protection]: 'Protection',
  [ArtifactSet.Stoneskin]: 'Stoneskin',
  [ArtifactSet.Killstroke]: 'Killstroke',
  [ArtifactSet.Instinct]: 'Instinct',
  [ArtifactSet.Bolster]: 'Bolster',
  [ArtifactSet.Defiant]: 'Defiant',
  [ArtifactSet.Impulse]: 'Impulse',
  [ArtifactSet.Zeal]: 'Zeal',
  [ArtifactSet.Righteous]: 'Righteous',
  [ArtifactSet.Supersonic]: 'Supersonic',
  [ArtifactSet.Merciless]: 'Merciless',
  [ArtifactSet.Slayer]: 'Slayer',
  [ArtifactSet.Feral]: 'Feral',
  [ArtifactSet.Pinpoint]: 'Pinpoint',
  [ArtifactSet.Stonecleaver]: 'Stonecleaver',
  [ArtifactSet.Rebirth]: 'Rebirth',
  [ArtifactSet.Chronophage]: 'Chronophage',
  [ArtifactSet.Mercurial]: 'Mercurial',
  [ArtifactSet.Refresh]: 'Refresh',
  [ArtifactSet.Cleansing]: 'Cleansing',
  [ArtifactSet.Bloodshield]: 'Bloodshield',
  [ArtifactSet.Reaction]: 'Reaction',
  [ArtifactSet.Revenge]: 'Revenge',
}

type ArtifactSetPieceMeta = { id: number; group: ArtifactSetPieceGroup }

const artifactSetPieceGroups: Record<number, ArtifactSetPieceGroup> = (() => {
  const metaEntries: ArtifactSetPieceMeta[] = []
  for (const [id, name] of Object.entries(artifactSetNames)) {
    const pieces = artifactSetDescriptions[name]?.pieces
    // Accessory sets always carry a single piece bonus.
    if (pieces === 1) {
      metaEntries.push({ id: Number(id), group: ArtifactSetPieceGroup.Accessories })
      continue
    }
    // Armor sets with 2 or 4 pieces behave as fixed-size set bonuses.
    if (pieces === 2 || pieces === 4) {
      metaEntries.push({ id: Number(id), group: ArtifactSetPieceGroup.ArmorFixed })
      continue
    }
    // Everything else (1–9 variable sets today) lands in the variable bucket.
    metaEntries.push({ id: Number(id), group: ArtifactSetPieceGroup.ArmorVariable })
  }
  return metaEntries.reduce<Record<number, ArtifactSetPieceGroup>>((acc, entry) => {
    acc[entry.id] = entry.group
    return acc
  }, {})
})()

/** Resolve the normalized piece-count grouping for an artifact set ID. */
export function getArtifactSetPieceGroup(id: ArtifactSetId): ArtifactSetPieceGroup {
  const runtime = getRuntimeGearSet(id)
  if (runtime) return runtime.pieceGroup
  return artifactSetPieceGroups[Number(id)] ?? ArtifactSetPieceGroup.ArmorFixed
}

/** Convenience arrays keep UI filters and Keep Unique defaults in sync. */
export const ACCESSORY_SET_IDS = Object.freeze(
  Object.entries(artifactSetPieceGroups)
    .filter(([, group]) => group === ArtifactSetPieceGroup.Accessories)
    .map(([id]) => Number(id) as ArtifactSetId),
)

export const ARMOR_FIXED_SET_IDS = Object.freeze(
  Object.entries(artifactSetPieceGroups)
    .filter(([, group]) => group === ArtifactSetPieceGroup.ArmorFixed)
    .map(([id]) => Number(id) as ArtifactSetId),
)

export const ARMOR_VARIABLE_SET_IDS = Object.freeze(
  Object.entries(artifactSetPieceGroups)
    .filter(([, group]) => group === ArtifactSetPieceGroup.ArmorVariable)
    .map(([id]) => Number(id) as ArtifactSetId),
)

// Alias the variable list so "9-piece sets" callers have an intuitive export.
export const NINE_PIECE_SET_IDS = ARMOR_VARIABLE_SET_IDS

// Accessory slots accept traditional accessory sets (1-piece bonuses) and
// any of the flexible 1–9 piece families.
export const ACCESSORY_SLOTS_COMPATIBLE_SET_IDS = Object.freeze(
  Array.from(new Set<number>([
    ...ACCESSORY_SET_IDS,
    ...ARMOR_VARIABLE_SET_IDS,
  ])).sort((a, b) => a - b)
    .map((id) => id as ArtifactSetId),
)

export const ALL_ARTIFACT_SET_IDS = Object.freeze(
  Array.from(new Set<number>([
    ...ACCESSORY_SET_IDS,
    ...ARMOR_FIXED_SET_IDS,
    ...ARMOR_VARIABLE_SET_IDS,
  ])).sort((a, b) => a - b)
    .map((id) => id as ArtifactSetId),
)

type RuntimeGearSetCache = {
  version: number
  entries: Array<[string, string]>
  accessories: readonly ArtifactSetId[]
  armorFixed: readonly ArtifactSetId[]
  armorVariable: readonly ArtifactSetId[]
  all: readonly ArtifactSetId[]
}

const runtimeGearSetCache: RuntimeGearSetCache = {
  version: -1,
  entries: Object.entries(artifactSetNames),
  accessories: ACCESSORY_SET_IDS,
  armorFixed: ARMOR_FIXED_SET_IDS,
  armorVariable: ARMOR_VARIABLE_SET_IDS,
  all: ALL_ARTIFACT_SET_IDS,
}

const mergeSetIds = (base: readonly ArtifactSetId[], extras: ArtifactSetId[]): readonly ArtifactSetId[] => {
  if (!extras.length) return base
  return Object.freeze(
    Array.from(new Set<number>([
      ...base,
      ...extras,
    ])).sort((a, b) => a - b)
      .map((id) => id as ArtifactSetId),
  )
}

function ensureRuntimeGearSetCache(): void {
  const version = getRuntimeGearSetVersion()
  if (version === runtimeGearSetCache.version) return
  const runtimeSets = listRuntimeGearSets()
  if (!runtimeSets.length) {
    runtimeGearSetCache.entries = Object.entries(artifactSetNames)
    runtimeGearSetCache.accessories = ACCESSORY_SET_IDS
    runtimeGearSetCache.armorFixed = ARMOR_FIXED_SET_IDS
    runtimeGearSetCache.armorVariable = ARMOR_VARIABLE_SET_IDS
    runtimeGearSetCache.all = ALL_ARTIFACT_SET_IDS
    runtimeGearSetCache.version = version
    return
  }
  const entryMap = new Map<string, string>(Object.entries(artifactSetNames))
  const accessories: ArtifactSetId[] = []
  const armorFixed: ArtifactSetId[] = []
  const armorVariable: ArtifactSetId[] = []
  runtimeSets.forEach((set) => {
    entryMap.set(String(set.id), set.canonicalName)
    const id = set.id as ArtifactSetId
    switch (set.pieceGroup) {
      case ArtifactSetPieceGroup.Accessories:
        accessories.push(id)
        break
      case ArtifactSetPieceGroup.ArmorFixed:
        armorFixed.push(id)
        break
      case ArtifactSetPieceGroup.ArmorVariable:
        armorVariable.push(id)
        break
      default:
        armorFixed.push(id)
    }
  })
  runtimeGearSetCache.entries = Array.from(entryMap.entries())
  runtimeGearSetCache.accessories = mergeSetIds(ACCESSORY_SET_IDS, accessories)
  runtimeGearSetCache.armorFixed = mergeSetIds(ARMOR_FIXED_SET_IDS, armorFixed)
  runtimeGearSetCache.armorVariable = mergeSetIds(ARMOR_VARIABLE_SET_IDS, armorVariable)
  runtimeGearSetCache.all = mergeSetIds(ALL_ARTIFACT_SET_IDS, [...accessories, ...armorFixed, ...armorVariable])
  runtimeGearSetCache.version = version
}

const getArtifactSetEntries = (): Array<[string, string]> => {
  ensureRuntimeGearSetCache()
  return runtimeGearSetCache.entries
}

export function getAccessorySetIds(): readonly ArtifactSetId[] {
  ensureRuntimeGearSetCache()
  return runtimeGearSetCache.accessories
}

export function getArmorFixedSetIds(): readonly ArtifactSetId[] {
  ensureRuntimeGearSetCache()
  return runtimeGearSetCache.armorFixed
}

export function getArmorVariableSetIds(): readonly ArtifactSetId[] {
  ensureRuntimeGearSetCache()
  return runtimeGearSetCache.armorVariable
}

export function getAllKnownArtifactSetIds(): readonly ArtifactSetId[] {
  ensureRuntimeGearSetCache()
  return runtimeGearSetCache.all
}

const ACCESSORY_COMPAT_BASE = new Set<number>(ACCESSORY_SLOTS_COMPATIBLE_SET_IDS.map((id) => Number(id)))

export function getAccessorySlotsCompatibleSetIds(): readonly ArtifactSetId[] {
  const extras: ArtifactSetId[] = []
  getAccessorySetIds().forEach((id) => {
    const numeric = Number(id)
    if (!ACCESSORY_COMPAT_BASE.has(numeric)) extras.push(id)
  })
  getArmorVariableSetIds().forEach((id) => {
    const numeric = Number(id)
    if (!ACCESSORY_COMPAT_BASE.has(numeric)) extras.push(id)
  })
  return mergeSetIds(ACCESSORY_SLOTS_COMPATIBLE_SET_IDS, extras)
}

export function findArtifactSetIdByName(name: string): ArtifactSetId | null {
  ensureRuntimeGearSetCache()
  for (const [id, label] of runtimeGearSetCache.entries) {
    if (label === name) {
      return Number(id) as ArtifactSetId
    }
  }
  return null
}

/**
 * Filter and sort artifact sets for UI menus.
 * - When `order === 'az'`, sorts alphabetically by set name.
 * - For `order === 'game' | 'icons'`, sorts by numeric ID (in‑game order).
 * Returns tuples of [idAsString, name].
 */
type ArtifactSetSearchOptions = {
  translate?: (key: ReturnType<typeof artifactSetI18nKey>) => string
}

export function filterAndSortSetEntries(
  search: string,
  order: 'game' | 'az' | 'icons',
  opts?: ArtifactSetSearchOptions,
): Array<[string, string]> {
  const entries = getArtifactSetEntries()
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = normalizedSearch
    ? entries.filter(([id, name]) => {
      if (name.toLowerCase().includes(normalizedSearch)) return true
      const translate = opts?.translate
      if (!translate) return false
      const localized = translate(artifactSetI18nKey(Number(id)))
      const normalizedLocalized = localized.trim().toLowerCase()
      return normalizedLocalized.includes(normalizedSearch)
    })
    : entries
  if (order === 'az') {
    return filtered.slice().sort((a, b) => a[1].localeCompare(b[1]))
  }
  // 'game' and 'icons' both use numeric ID (in‑game) ordering for stability
  return filtered.slice().sort((a, b) => Number(a[0]) - Number(b[0]))
}

// Rarity enum codes in HSF files (index-based, not bitmask)
export const RarityCode = {
  Any: 0,
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
  GTE_Common: 6,
  GTE_Uncommon: 7,
  GTE_Rare: 8,
  GTE_Epic: 9,
  LTE_Uncommon: 10,
  LTE_Rare: 11,
  LTE_Epic: 12,
  LTE_Legendary: 13,
  LTE_Mythical: 14,
  Mythical: 15,
  GTE_Legendary: 16,
} as const

// eslint-disable-next-line no-redeclare -- value/type pair share the user-facing identifier
export type RarityCode = number

export const RARITY_CODES: readonly RarityCode[] = [
  RarityCode.Any,
  RarityCode.Common,
  RarityCode.Uncommon,
  RarityCode.Rare,
  RarityCode.Epic,
  RarityCode.Legendary,
  RarityCode.GTE_Common,
  RarityCode.GTE_Uncommon,
  RarityCode.GTE_Rare,
  RarityCode.GTE_Epic,
  RarityCode.LTE_Uncommon,
  RarityCode.LTE_Rare,
  RarityCode.LTE_Epic,
  RarityCode.LTE_Legendary,
  RarityCode.LTE_Mythical,
  RarityCode.Mythical,
  RarityCode.GTE_Legendary,
] as const

export function isRarityCode(value: unknown): value is RarityCode {
  return typeof value === 'number' && RARITY_CODES.includes(value as RarityCode)
}

export const rarityNames: Record<number, string> = {
  [RarityCode.Any]: '',
  [RarityCode.Common]: 'Common',
  [RarityCode.Uncommon]: 'Uncommon',
  [RarityCode.Rare]: 'Rare',
  [RarityCode.Epic]: 'Epic',
  [RarityCode.Legendary]: 'Legendary',
  [RarityCode.GTE_Common]: `≥${NBSP}Common`,
  [RarityCode.GTE_Uncommon]: `≥${NBSP}Uncommon`,
  [RarityCode.GTE_Rare]: `≥${NBSP}Rare`,
  [RarityCode.GTE_Epic]: `≥${NBSP}Epic`,
  [RarityCode.LTE_Uncommon]: `≤${NBSP}Uncommon`,
  [RarityCode.LTE_Rare]: `≤${NBSP}Rare`,
  [RarityCode.LTE_Epic]: `≤${NBSP}Epic`,
  [RarityCode.LTE_Legendary]: `≤${NBSP}Legendary`,
  [RarityCode.LTE_Mythical]: `≤${NBSP}Mythical`,
  [RarityCode.Mythical]: 'Mythical',
  [RarityCode.GTE_Legendary]: `≥${NBSP}Legendary`,
}

/** Human-readable name for a rarity code. */
export function rarityCodeToName(code?: RarityCode): string {
  if (code === undefined || code === null) return ''
  return rarityNames[Number(code)] ?? String(code)
}

// Preferred artifact set order (game order) is the numeric ID order.
// Provide a comparator to centralize sorting in UIs and formatters.
export function compareArtifactSets(a: ArtifactSetId, b: ArtifactSetId): number {
  return Number(a) - Number(b)
}

// Export canonical code lists for UI selections (centralized to avoid duplication)

// Stat ID mapping (partial). Falls back to raw ID label.
export const StatId = {
  Any: -1,
  HP: 1,
  ATK: 2,
  DEF: 3,
  SPD: 4,
  RES: 5,
  ACC: 6,
  CR: 7,
  CDMG: 8,
  HP_ATK_DEF: 9,
  RollCount: 99,
} as const

// eslint-disable-next-line no-redeclare -- mirror const name for stat-id type alias
export type StatId = number
export type StatIdLike = StatId | number

/**
 * Human-readable stat label from HSF id and flat flag.
 * For HP/ATK/DEF, returns percent variant when isFlat=false (e.g., HP%).
 */
export function statNameFromId(id?: StatIdLike, isFlat?: boolean): string {
  if (id === undefined || id === null) return ''
  const n = Number(id)
  switch (n)
  {
  case StatId.Any: return ''
  case StatId.HP: return isFlat ? 'HP' : 'HP%'
  case StatId.ATK: return isFlat ? 'ATK' : 'ATK%'
  case StatId.DEF: return isFlat ? 'DEF' : 'DEF%'
  case StatId.SPD: return 'SPD'
  case StatId.RES: return 'RES'
  case StatId.ACC: return 'ACC'
  case StatId.HP_ATK_DEF: return 'HP/ATK/DEF'
  case StatId.CR: return 'CR%'
  case StatId.CDMG: return 'CDMG%'
  case StatId.RollCount: return 'Roll Count'
  }

  return `ID ${n}`
}

// returns whether it's "ANY" substat
export function statIsAny(id?: number): boolean {
  return id === StatId.Any
}

// Variant-based sort for HSF substats used in previews


// Prefer StatVariant conversions for parsing/formatting in UI-facing code.

// UI-friendly unified stat variant catalog (no separate isFlat flag needed in UI state)
// Encoding: high byte = HSF Stat ID, low byte = flat flag (0 percent/default, 1 flat).
export const StatVariant = {
  Any: StatId.Any,
  HP: (StatId.HP << 8) | 0,
  HP_FLAT: (StatId.HP << 8) | 1,
  ATK: (StatId.ATK << 8) | 0,
  ATK_FLAT: (StatId.ATK << 8) | 1,
  DEF: (StatId.DEF << 8) | 0,
  DEF_FLAT: (StatId.DEF << 8) | 1,
  SPD: (StatId.SPD << 8) | 1,
  RES: (StatId.RES << 8) | 1,
  ACC: (StatId.ACC << 8) | 1,
  CR: (StatId.CR << 8) | 0,
  CDMG: (StatId.CDMG << 8) | 0,
  RollCount: (StatId.RollCount << 8) | 1,
} as const

// eslint-disable-next-line no-redeclare -- preserve the StatVariant name for value + type
export type StatVariant = number
export type StatVariantLike = StatVariant | number

// Canonical builder/substat stat ordering: SPD-focused row first, then flat/percent HP/ATK/DEF.
export const STAT_VARIANTS_PRIORITY_ROW1 = [
  StatVariant.SPD,
  StatVariant.CR,
  StatVariant.CDMG,
  StatVariant.ACC,
  StatVariant.RES,
] as const

export const STAT_VARIANTS_PRIORITY_ROW2 = [
  StatVariant.HP_FLAT,
  StatVariant.HP,
  StatVariant.ATK_FLAT,
  StatVariant.ATK,
  StatVariant.DEF_FLAT,
  StatVariant.DEF,
] as const

export const STAT_VARIANTS_PRIORITY = [
  ...STAT_VARIANTS_PRIORITY_ROW1,
  ...STAT_VARIANTS_PRIORITY_ROW2,
] as const

/** UI label string for a StatVariant (or numeric-encoded variant). */
export function labelOfVariant(v: StatVariantLike): string {
  const n = Number(v)
  // Handle composite main stat ID in high byte
  {
    const id = (n >> 8) & 0xFF
    if (id === StatId.HP_ATK_DEF) return 'HP/ATK/DEF'
  }
  switch (n) {
    case StatVariant.Any: return ''
    case StatVariant.HP: return 'HP%'
    case StatVariant.HP_FLAT: return 'HP'
    case StatVariant.ATK: return 'ATK%'
    case StatVariant.ATK_FLAT: return 'ATK'
    case StatVariant.DEF: return 'DEF%'
    case StatVariant.DEF_FLAT: return 'DEF'
    case StatVariant.SPD: return 'SPD'
    case StatVariant.RES: return 'RES'
    case StatVariant.ACC: return 'ACC'
    case StatVariant.CR: return 'CR%'
    case StatVariant.CDMG: return 'CDMG%'
    case StatVariant.RollCount: return 'Roll Count'
  }
  return String(n)
}

/** Parse a human-readable stat label into a StatVariant. Returns null if unknown. */
export function variantFromLabel(input: string): StatVariant | null {
  const s = String(input).trim().toUpperCase()
  switch (s) {
    case 'HP%': return StatVariant.HP
    case 'HP': return StatVariant.HP_FLAT
    case 'ATK%': return StatVariant.ATK
    case 'ATK': return StatVariant.ATK_FLAT
    case 'DEF%': return StatVariant.DEF
    case 'DEF': return StatVariant.DEF_FLAT
    case 'SPD': return StatVariant.SPD
    case 'RES': return StatVariant.RES
    case 'ACC': return StatVariant.ACC
    case 'CR%': return StatVariant.CR
    case 'CDMG%': return StatVariant.CDMG
    case 'ROLL COUNT': return StatVariant.RollCount
  }
  return null
}

// HSF tuple helpers live in hsfTypes.ts to keep this module focused on UI-facing variants.

// Low-level decoders for StatVariant. Keep the bit layout knowledge centralized
// here so other modules (e.g., hsfTypes) can delegate without duplicating logic.
// No decoding helpers here; variant-to-HSF tuple helpers live in hsfTypes.ts.

/** Convert HSF main stat tuple (id,f) to StatVariant encoding. */
export function mainToVariant(id?: number, f?: number | boolean | string): StatVariant {
  if (id === undefined || id === null) return StatVariant.Any
  if (id === StatId.Any) return StatVariant.Any
  // Normalize f to 0/1 in case HSF uses boolean for flat flag
  const flat = ((): number => {
    if (typeof f === 'boolean') return f ? 1 : 0
    if (typeof f === 'string') {
      const s = f.trim().toLowerCase()
      if (s === 'true' || s === '1') return 1
      return 0
    }
    const n = Number(f ?? 0)
    return n !== 0 ? 1 : 0
  })()
  if (id >= 1 && id <= 3) return (((id & 0xFF) << 8) | flat) as StatVariant
  if (id >= 4 && id <= 6) return (((id & 0xFF) << 8) | 1) as StatVariant
  if (id >= 7 && id <= 8) return (((id & 0xFF) << 8) | 0) as StatVariant
  if (id === StatId.HP_ATK_DEF) return (((id & 0xFF) << 8) | 1) as StatVariant
  return StatVariant.Any
}

/** Convert HSF substat tuple (id,isFlat) to StatVariant encoding. */
export function subToVariant(id?: number, isFlat?: boolean | number | string): StatVariant {
  if (id === undefined || id === null) return StatVariant.Any
  if (id === StatId.Any) return StatVariant.Any
  // Normalize isFlat to boolean in case HSF uses 0/1 numeric flags
  const flat = ((): number => {
    if (typeof isFlat === 'boolean') return isFlat ? 1 : 0
    if (typeof isFlat === 'string') {
      const s = isFlat.trim().toLowerCase()
      if (s === 'true' || s === '1') return 1
      return 0
    }
    const n = Number(isFlat ?? 0)
    return n !== 0 ? 1 : 0
  })()
  if (id >= 1 && id <= 3) return (((id & 0xFF) << 8) | flat) as StatVariant
  if (id >= 4 && id <= 6) return (((id & 0xFF) << 8) | 1) as StatVariant
  if (id >= 7 && id <= 8) return (((id & 0xFF) << 8) | 0) as StatVariant
  if (id === StatId.RollCount) return StatVariant.RollCount
  return StatVariant.Any
}

// Shared preferred stat order (used by summaries, preview chips, etc.)
// SPD, CR, CDMG, ACC, RES, then % before flat for HP/ATK/DEF
export const PREFERRED_STAT_ORDER: readonly StatVariant[] = [
  StatVariant.SPD,
  StatVariant.CR,
  StatVariant.CDMG,
  StatVariant.ACC,
  StatVariant.RES,
  StatVariant.HP,
  StatVariant.HP_FLAT,
  StatVariant.ATK,
  StatVariant.ATK_FLAT,
  StatVariant.DEF,
  StatVariant.DEF_FLAT,
  StatVariant.RollCount,
] as const

/** Comparator for StatVariants (or numeric-encoded variants) using PREFERRED_STAT_ORDER. */
export function compareVariants(a: StatVariantLike, b: StatVariantLike): number {
  const an = Number(a) as StatVariant
  const bn = Number(b) as StatVariant
  const ai = PREFERRED_STAT_ORDER.indexOf(an)
  const bi = PREFERRED_STAT_ORDER.indexOf(bn)
  if (ai !== -1 && bi !== -1) return ai - bi
  if (ai !== -1) return -1
  if (bi !== -1) return 1
  return an - bn
}

const NON_GLYPHABLE_VARIANTS = new Set<number>([
  StatVariant.CR,
  StatVariant.CDMG,
])

/** Returns true when a stat can receive glyph upgrades in-game. */
export function statSupportsGlyphs(variant: StatVariantLike): boolean {
  const numeric = Number(variant)
  if (!Number.isFinite(numeric)) return true
  if (numeric === StatVariant.Any) return true
  return !NON_GLYPHABLE_VARIANTS.has(numeric)
}

// --- Slot constraints (domain facts)
// Why: Keep allowed main/substat constraints centralized so builder and UI
// agree on feasibility. Mirrors docs/TECHNICAL.md#artifact-rules. Use StatVariant
// constants here to avoid duplicating encoding knowledge.

// Allowed main stats by slot (as StatVariant values)
export const ALLOWED_MAIN_BY_SLOT: Record<ArtifactType, ReadonlySet<number>> = {
  [ArtifactType.Weapon]: new Set<number>([StatVariant.ATK_FLAT]),
  [ArtifactType.Helmet]: new Set<number>([StatVariant.HP_FLAT]),
  [ArtifactType.Shield]: new Set<number>([StatVariant.DEF_FLAT]),
  [ArtifactType.Gauntlets]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.CR, StatVariant.CDMG,
  ]),
  [ArtifactType.Chestplate]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.ACC, StatVariant.RES,
  ]),
  [ArtifactType.Boots]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.SPD,
  ]),
  [ArtifactType.Ring]: new Set<number>([
    StatVariant.HP_FLAT, StatVariant.ATK_FLAT, StatVariant.DEF_FLAT,
  ]),
  [ArtifactType.Amulet]: new Set<number>([
    StatVariant.HP_FLAT, StatVariant.ATK_FLAT, StatVariant.DEF_FLAT,
    StatVariant.CDMG,
  ]),
  [ArtifactType.Banner]: new Set<number>([
    StatVariant.HP_FLAT, StatVariant.ATK_FLAT, StatVariant.DEF_FLAT,
    StatVariant.ACC, StatVariant.RES,
  ]),
}

// Allowed substats by slot (as StatVariant values)
export const ALLOWED_SUB_BY_SLOT: Record<ArtifactType, ReadonlySet<number>> = {
  [ArtifactType.Weapon]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.CR, StatVariant.CDMG,
    StatVariant.ACC, StatVariant.RES, StatVariant.SPD,
  ]),
  [ArtifactType.Helmet]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.CR, StatVariant.CDMG,
    StatVariant.ACC, StatVariant.RES, StatVariant.SPD,
  ]),
  [ArtifactType.Shield]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.CR, StatVariant.CDMG,
    StatVariant.ACC, StatVariant.RES, StatVariant.SPD,
  ]),
  [ArtifactType.Gauntlets]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.CR, StatVariant.CDMG,
    StatVariant.ACC, StatVariant.RES, StatVariant.SPD,
  ]),
  [ArtifactType.Chestplate]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.CR, StatVariant.CDMG,
    StatVariant.ACC, StatVariant.RES, StatVariant.SPD,
  ]),
  [ArtifactType.Boots]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.CR, StatVariant.CDMG,
    StatVariant.ACC, StatVariant.RES, StatVariant.SPD,
  ]),
  [ArtifactType.Ring]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
  ]),
  [ArtifactType.Amulet]: new Set<number>([
    StatVariant.HP_FLAT, StatVariant.ATK_FLAT, StatVariant.DEF_FLAT,
    StatVariant.CDMG, StatVariant.ACC, StatVariant.RES,
  ]),
  [ArtifactType.Banner]: new Set<number>([
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.SPD,
  ]),
}

/** True if a slot supports a given main StatVariant. */
export function slotSupportsMain(slot: ArtifactTypeId, main: StatVariantLike): boolean {
  const set = ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType]
  if (!set) return false
  if (Number(main) === StatVariant.Any) return true
  return set.has(Number(main))
}

/** True if a slot supports a given sub StatVariant. */
export function slotSupportsSub(slot: ArtifactTypeId, sub: StatVariantLike): boolean {
  const set = ALLOWED_SUB_BY_SLOT[Number(slot) as ArtifactType]
  if (!set) return false
  if (Number(sub) === StatVariant.Any) return true
  return set.has(Number(sub))
}

/** Any of the selected slots support this main (or no selection = true). */
export function anySelectedSlotSupportsMain(selected: ArtifactTypeId[] | undefined, main: StatVariantLike): boolean {
  if (!selected || selected.length === 0) return true
  return selected.some(s => slotSupportsMain(s, main))
}

/** Any selected slot supports all substats in the list. No selection = true. */
export function anySelectedSlotSupportsAllSubstats(selected: ArtifactTypeId[] | undefined, subs: StatVariantLike[]): boolean {
  if (!selected || selected.length === 0) return true
  return selected.some(s => subs.every(v => slotSupportsSub(s, v)))
}

export function compareHsfSubstats(a: { ID: number; IsFlat?: boolean }, b: { ID: number; IsFlat?: boolean }): number {
  const av = subToVariant(a.ID, a.IsFlat)
  const bv = subToVariant(b.ID, b.IsFlat)
  const ai = PREFERRED_STAT_ORDER.indexOf(av)
  const bi = PREFERRED_STAT_ORDER.indexOf(bv)
  if (ai !== -1 && bi !== -1) return ai - bi
  if (ai !== -1) return -1
  if (bi !== -1) return 1
  // fallback: numeric ID, then flat before percent
  if (a.ID !== b.ID) return a.ID - b.ID
  return Number(Boolean(a.IsFlat)) - Number(Boolean(b.IsFlat))
}

export function formatArtifactTypes(types?: ArtifactTypeId[]): string {
  if (!types || !types.length) return ''
  const sorted = [...types].sort(compareArtifactTypes)
  return sorted.map((t) => artifactTypeNames[Number(t)] ?? ``).join(', ')
}

export function artifactTypeName(id: ArtifactTypeId): string {
  return artifactTypeNames[Number(id)] ?? String(id)
}

// i18n key for artifact type (slot) label. UI should use this with `t(...)`.
export function artifactTypeI18nKey(id: ArtifactTypeId): 'slotWeapon' | 'slotHelmet' | 'slotShield' | 'slotGauntlets' | 'slotChestplate' | 'slotBoots' | 'slotRing' | 'slotAmulet' | 'slotBanner' {
  switch (Number(id) as ArtifactType) {
    case ArtifactType.Weapon: return 'slotWeapon'
    case ArtifactType.Helmet: return 'slotHelmet'
    case ArtifactType.Shield: return 'slotShield'
    case ArtifactType.Gauntlets: return 'slotGauntlets'
    case ArtifactType.Chestplate: return 'slotChestplate'
    case ArtifactType.Boots: return 'slotBoots'
    case ArtifactType.Ring: return 'slotRing'
    case ArtifactType.Amulet: return 'slotAmulet'
    case ArtifactType.Banner: return 'slotBanner'
  }
  // Fallback to Weapon (should never hit with known IDs)
  return 'slotWeapon'
}

export function formatArtifactSets(sets?: ArtifactSetId[]): string {
  if (!sets || !sets.length) return ''
  const sorted = [...sets].sort(compareArtifactSets)
  return sorted.map((s) => artifactSetNames[Number(s)] ?? ``).join(', ')
}

// Convenience: safe lookup that accepts either enum || number, with a readable fallback
export function artifactSetName(id: ArtifactSetId): string {
  const runtime = getRuntimeGearSet(id)
  if (runtime) return runtime.canonicalName
  return artifactSetNames[Number(id)] ?? String(id)
}

export function getLocalizedGearSetName(
  id: ArtifactSetId,
  t: (key: ReturnType<typeof artifactSetI18nKey>) => string,
  _lang?: string,
): string {
  const runtime = getRuntimeGearSet(id)
  if (runtime) {
    return (runtime.canonicalName ?? String(id)).trim()
  }
  const label = t(artifactSetI18nKey(id))
  return label || artifactSetName(id)
}

// i18n key for artifact set label shown in UI. Use this with `t(...)` for localized set names.
export function artifactSetI18nKey(id: ArtifactSetId):
  | 'setLife' | 'setOffense' | 'setDefense' | 'setSpeed' | 'setCriticalRate' | 'setCritDamage' | 'setAccuracy' | 'setResistance'
  | 'setLifesteal' | 'setFury' | 'setDaze' | 'setCursed' | 'setFrost' | 'setFrenzy' | 'setRegeneration' | 'setImmunity'
  | 'setShield' | 'setRelentless' | 'setSavage' | 'setDestroy' | 'setStun' | 'setToxic' | 'setProvoke' | 'setRetaliation'
  | 'setAvenging' | 'setStalwart' | 'setReflex' | 'setCuring' | 'setCruel' | 'setImmortal' | 'setDivineOffense' | 'setDivineCriticalRate'
  | 'setDivineLife' | 'setDivineSpeed' | 'setSwiftParry' | 'setDeflection' | 'setResilience' | 'setPerception' | 'setAffinitybreaker' | 'setUntouchable'
  | 'setFatal' | 'setFrostbite' | 'setBloodthirst' | 'setGuardian' | 'setFortitude' | 'setLethal' | 'setProtection' | 'setStoneskin'
  | 'setKillstroke' | 'setInstinct' | 'setBolster' | 'setDefiant' | 'setImpulse' | 'setZeal' | 'setRighteous' | 'setSupersonic' | 'setMerciless' | 'setSlayer' | 'setFeral' | 'setPinpoint' | 'setStonecleaver' | 'setRebirth' | 'setChronophage'
  | 'setMercurial'
  | 'setRefresh' | 'setCleansing' | 'setBloodshield' | 'setReaction' | 'setRevenge'
{
  switch (Number(id) as ArtifactSet) {
    case ArtifactSet.Life: return 'setLife'
    case ArtifactSet.Offense: return 'setOffense'
    case ArtifactSet.Defense: return 'setDefense'
    case ArtifactSet.Speed: return 'setSpeed'
    case ArtifactSet.CriticalRate: return 'setCriticalRate'
    case ArtifactSet.CritDamage: return 'setCritDamage'
    case ArtifactSet.Accuracy: return 'setAccuracy'
    case ArtifactSet.Resistance: return 'setResistance'
    case ArtifactSet.Lifesteal: return 'setLifesteal'
    case ArtifactSet.Fury: return 'setFury'
    case ArtifactSet.Daze: return 'setDaze'
    case ArtifactSet.Cursed: return 'setCursed'
    case ArtifactSet.Frost: return 'setFrost'
    case ArtifactSet.Frenzy: return 'setFrenzy'
    case ArtifactSet.Regeneration: return 'setRegeneration'
    case ArtifactSet.Immunity: return 'setImmunity'
    case ArtifactSet.Shield: return 'setShield'
    case ArtifactSet.Relentless: return 'setRelentless'
    case ArtifactSet.Savage: return 'setSavage'
    case ArtifactSet.Destroy: return 'setDestroy'
    case ArtifactSet.Stun: return 'setStun'
    case ArtifactSet.Toxic: return 'setToxic'
    case ArtifactSet.Provoke: return 'setProvoke'
    case ArtifactSet.Retaliation: return 'setRetaliation'
    case ArtifactSet.Avenging: return 'setAvenging'
    case ArtifactSet.Stalwart: return 'setStalwart'
    case ArtifactSet.Reflex: return 'setReflex'
    case ArtifactSet.Curing: return 'setCuring'
    case ArtifactSet.Cruel: return 'setCruel'
    case ArtifactSet.Immortal: return 'setImmortal'
    case ArtifactSet.DivineOffense: return 'setDivineOffense'
    case ArtifactSet.DivineCriticalRate: return 'setDivineCriticalRate'
    case ArtifactSet.DivineLife: return 'setDivineLife'
    case ArtifactSet.DivineSpeed: return 'setDivineSpeed'
    case ArtifactSet.SwiftParry: return 'setSwiftParry'
    case ArtifactSet.Deflection: return 'setDeflection'
    case ArtifactSet.Resilience: return 'setResilience'
    case ArtifactSet.Perception: return 'setPerception'
    case ArtifactSet.Affinitybreaker: return 'setAffinitybreaker'
    case ArtifactSet.Untouchable: return 'setUntouchable'
    case ArtifactSet.Fatal: return 'setFatal'
    case ArtifactSet.Frostbite: return 'setFrostbite'
    case ArtifactSet.Bloodthirst: return 'setBloodthirst'
    case ArtifactSet.Guardian: return 'setGuardian'
    case ArtifactSet.Fortitude: return 'setFortitude'
    case ArtifactSet.Lethal: return 'setLethal'
    case ArtifactSet.Protection: return 'setProtection'
    case ArtifactSet.Stoneskin: return 'setStoneskin'
    case ArtifactSet.Killstroke: return 'setKillstroke'
    case ArtifactSet.Instinct: return 'setInstinct'
    case ArtifactSet.Bolster: return 'setBolster'
    case ArtifactSet.Defiant: return 'setDefiant'
    case ArtifactSet.Impulse: return 'setImpulse'
    case ArtifactSet.Zeal: return 'setZeal'
    case ArtifactSet.Righteous: return 'setRighteous'
    case ArtifactSet.Supersonic: return 'setSupersonic'
    case ArtifactSet.Merciless: return 'setMerciless'
    case ArtifactSet.Slayer: return 'setSlayer'
    case ArtifactSet.Feral: return 'setFeral'
    case ArtifactSet.Pinpoint: return 'setPinpoint'
    case ArtifactSet.Stonecleaver: return 'setStonecleaver'
    case ArtifactSet.Rebirth: return 'setRebirth'
    case ArtifactSet.Chronophage: return 'setChronophage'
    case ArtifactSet.Mercurial: return 'setMercurial'
    case ArtifactSet.Refresh: return 'setRefresh'
    case ArtifactSet.Cleansing: return 'setCleansing'
    case ArtifactSet.Bloodshield: return 'setBloodshield'
    case ArtifactSet.Reaction: return 'setReaction'
    case ArtifactSet.Revenge: return 'setRevenge'
  }
  return 'setLife'
}

// i18n key for faction label. UI should use with `t(...)`.
export function factionI18nKey(code: FactionId):
  | 'factionBannerLords' | 'factionHighElves' | 'factionSacredOrder' | 'factionBarbarians'
  | 'factionOgrynTribes' | 'factionLizardmen' | 'factionSkinwalkers' | 'factionOrcs'
  | 'factionDemonspawn' | 'factionUndeadHordes' | 'factionDarkElves' | 'factionKnightRevenant'
  | 'factionDwarves' | 'factionShadowkin' | 'factionSylvanWatchers'
  | 'factionArgonites'
{
  switch (Number(code) as Faction) {
    case Faction.BannerLords: return 'factionBannerLords'
    case Faction.HighElves: return 'factionHighElves'
    case Faction.SacredOrder: return 'factionSacredOrder'
    case Faction.Barbarians: return 'factionBarbarians'
    case Faction.OgrynTribes: return 'factionOgrynTribes'
    case Faction.Lizardmen: return 'factionLizardmen'
    case Faction.Skinwalkers: return 'factionSkinwalkers'
    case Faction.Orcs: return 'factionOrcs'
    case Faction.Demonspawn: return 'factionDemonspawn'
    case Faction.UndeadHordes: return 'factionUndeadHordes'
    case Faction.DarkElves: return 'factionDarkElves'
    case Faction.KnightRevenant: return 'factionKnightRevenant'
    case Faction.Dwarves: return 'factionDwarves'
    case Faction.Shadowkin: return 'factionShadowkin'
    case Faction.SylvanWatchers: return 'factionSylvanWatchers'
    case Faction.Argonites: return 'factionArgonites'
  }
  return 'factionBannerLords'
}

// i18n key for stat variant label.
export function statVariantI18nKey(v: StatVariantLike):
  | 'statHP' | 'statHP_flat' | 'statHP_percent'
  | 'statATK' | 'statATK_flat' | 'statATK_percent'
  | 'statDEF' | 'statDEF_flat' | 'statDEF_percent'
  | 'statSPD' | 'statRES' | 'statACC' | 'statCR' | 'statCDMG' | 'statRollCount'
  | 'statHPATKDEF'
{
  const n = Number(v)
  if (n >= 0) {
    const id = (n >>> 8) & 0xFF
    if (id === StatId.HP_ATK_DEF) return 'statHPATKDEF'
  }
  switch (n) {
    case StatVariant.HP_FLAT: return 'statHP_flat'
    case StatVariant.HP: return 'statHP_percent'
    case StatVariant.ATK_FLAT: return 'statATK_flat'
    case StatVariant.ATK: return 'statATK_percent'
    case StatVariant.DEF_FLAT: return 'statDEF_flat'
    case StatVariant.DEF: return 'statDEF_percent'
    case StatVariant.SPD: return 'statSPD'
    case StatVariant.RES: return 'statRES'
    case StatVariant.ACC: return 'statACC'
    case StatVariant.CR: return 'statCR'
    case StatVariant.CDMG: return 'statCDMG'
    case StatVariant.RollCount: return 'statRollCount'
  }
  return 'statHP'
}

// Faction IDs used in HSF files (1..17), 0 = Any
export const Faction = {
  BannerLords: 1,
  HighElves: 2,
  SacredOrder: 3,
  Barbarians: 13,
  OgrynTribes: 5,
  Lizardmen: 6,
  Skinwalkers: 7,
  Orcs: 8,
  Demonspawn: 9,
  UndeadHordes: 10,
  DarkElves: 11,
  KnightRevenant: 12,
  Dwarves: 16,
  Shadowkin: 15,
  SylvanWatchers: 14,
  // Argonites extend the Nyresan Union cohort with the next unused ID.
  Argonites: 17,
} as const

// eslint-disable-next-line no-redeclare -- expose the Faction identifier in both namespaces
export type Faction = number
export type FactionId = Faction | number

export const factionNames: Record<number, string> = {
  0: '',
  [Faction.BannerLords]: 'Banner Lords',
  [Faction.HighElves]: 'High Elves',
  [Faction.SacredOrder]: 'Sacred Order',
  [Faction.Barbarians]: 'Barbarians',
  [Faction.OgrynTribes]: 'Ogryn Tribes',
  [Faction.Lizardmen]: 'Lizardmen',
  [Faction.Skinwalkers]: 'Skinwalkers',
  [Faction.Orcs]: 'Orcs',
  [Faction.Demonspawn]: 'Demonspawn',
  [Faction.UndeadHordes]: 'Undead Hordes',
  [Faction.DarkElves]: 'Dark Elves',
  [Faction.KnightRevenant]: 'Knight Revenant',
  [Faction.Dwarves]: 'Dwarves',
  [Faction.Shadowkin]: 'Shadowkin',
  [Faction.SylvanWatchers]: 'Sylvan Watchers',
  // Keep the UI label aligned with the exported enum entry.
  [Faction.Argonites]: 'Argonites',
}

/** Human-readable faction name from Faction code (accepts enum or number). */
export function factionCodeToName(code?: FactionId): string {
  if (code === undefined || code === null) return ''
  return factionNames[Number(code)] ?? String(code)
}

export const RankCode = {
  Any: 0,
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  GTE_One: 7,
  GTE_Two: 8,
  GTE_Three: 9,
  GTE_Four: 10,
  GTE_Five: 11,
  LTE_Two: 12,
  LTE_Three: 13,
  LTE_Four: 14,
  LTE_Five: 15,
  LTE_Six: 16,
} as const

// eslint-disable-next-line no-redeclare -- allow RankCode constant/type to share the same name
export type RankCode = number

export const RANK_CODES: readonly RankCode[] = [
  RankCode.Any,
  RankCode.One,
  RankCode.Two,
  RankCode.Three,
  RankCode.Four,
  RankCode.Five,
  RankCode.Six,
  RankCode.GTE_One,
  RankCode.GTE_Two,
  RankCode.GTE_Three,
  RankCode.GTE_Four,
  RankCode.GTE_Five,
  RankCode.LTE_Two,
  RankCode.LTE_Three,
  RankCode.LTE_Four,
  RankCode.LTE_Five,
  RankCode.LTE_Six,
] as const

export function isRankCode(value: unknown): value is RankCode {
  return typeof value === 'number' && RANK_CODES.includes(value as RankCode)
}

export const RANK_VALUES = [1, 2, 3, 4, 5, 6] as const
export type RankValue = (typeof RANK_VALUES)[number]

/** Human-readable rank label for HSF-compatible rank code 0..16. */
export function formatRank(code?: RankCode): string {
  if (code === undefined || code === null) return ''
  const n = Number(code)
  if (n === 0) return ''
  if (n >= 1 && n <= 6) return `${n}★`
  if (n >= 7 && n <= 11) return `≥${NBSP}${n - 6}★`
  if (n >= 12 && n <= 16) return `≤${NBSP}${n - 10}★`
  return String(n)
}

/** Level milestones used across builder logic (0, 4, 8, 12, 16). */
export type LevelMilestone = 0 | 4 | 8 | 12 | 16
export const LEVEL_MILESTONES: readonly LevelMilestone[] = [0, 4, 8, 12, 16] as const
export type LevelRange = { min: LevelMilestone; max: LevelMilestone }

export function isLevelMilestone(value: unknown): value is LevelMilestone {
  return typeof value === 'number' && LEVEL_MILESTONES.includes(value as LevelMilestone)
}

/** HSF sentinel meaning “any level” (mirrors LVLForCheck=99 in exports). */
export const LEVEL_ANY_SENTINEL = 99 as const

export function formatLevel(level?: number): string {
  if (level === undefined || level === null) return ''
  if (level === LEVEL_ANY_SENTINEL) return ''
  // Display ranges for checkpoint levels: 0->"0-3", 4->"4-7", … 12->"12-15", 16->"16"
  if ([0, 4, 8, 12, 16].includes(level)) {
    const start = level
    const end = Math.min(level + 3, 16)
    return start === end ? `${start}` : `${start}-${end}`
  }
  return String(level)
}
/**
 * types.ts
 *
 * Shared enums, type aliases, labels, and conversion utilities used across the
 * app: artifact sets/types, rarity/rank/faction names, and StatVariant helpers
 * for mapping between UI-friendly variants and HSF id/flag pairs.
 */

// Default substat chip colors by StatId (text/border FG and background BG)
// These are used across the app (preview table chips and Manage Colors dialog).
// Use variant-level color maps (percent vs flat) instead of ID-level maps.

// Variant-level defaults (distinguish % vs flat for HP/ATK/DEF)
export const DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT: Record<number, string> = {
  [StatVariant.HP]: '#8BC34A',
  [StatVariant.HP_FLAT]: '#689F38',
  [StatVariant.ATK]: '#FF7043',
  [StatVariant.ATK_FLAT]: '#E64A19',
  [StatVariant.DEF]: '#64B5F6',
  [StatVariant.DEF_FLAT]: '#42A5F5',
  [StatVariant.SPD]: '#BA68C8',
  [StatVariant.RES]: '#FFD54F',
  [StatVariant.ACC]: '#2979FF',
  [StatVariant.CR]: '#00E5FF',
  [StatVariant.CDMG]: '#FF80AB',
}

export const DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT: Record<number, string> = {
  [StatVariant.HP]: '#1E2E14',
  [StatVariant.HP_FLAT]: '#16250F',
  [StatVariant.ATK]: '#2F1A14',
  [StatVariant.ATK_FLAT]: '#27140F',
  [StatVariant.DEF]: '#0F2234',
  [StatVariant.DEF_FLAT]: '#0C1C2C',
  [StatVariant.SPD]: '#2A1C2F',
  [StatVariant.RES]: '#3A2F15',
  [StatVariant.ACC]: '#0A1E40',
  [StatVariant.CR]: '#062833',
  [StatVariant.CDMG]: '#2A0F1E',
}
