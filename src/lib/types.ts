// Shared domain catalogs && formatters (used by HSF viewer as well)
import { ACCESSORY_NO_SET_ID, NBSP } from './constants'
import {
  ARTIFACT_TYPE_AMULET,
  ARTIFACT_TYPE_BANNER,
  ARTIFACT_TYPE_BOOTS,
  ARTIFACT_TYPE_CHESTPLATE,
  ARTIFACT_TYPE_GAUNTLETS,
  ARTIFACT_TYPE_HELMET,
  PREFERRED_ARTIFACT_TYPE_ORDER as GENERATED_PREFERRED_ARTIFACT_TYPE_ORDER,
  PREFERRED_STAT_ORDER as GENERATED_PREFERRED_STAT_ORDER,
  ARTIFACT_TYPE_RING,
  ARTIFACT_TYPE_SHIELD,
  ARTIFACT_TYPE_WEAPON,
  LEVEL_ANY_SENTINEL as GENERATED_LEVEL_ANY_SENTINEL,
  RARITY_CODE_ANY,
  RARITY_CODE_COMMON,
  RARITY_CODE_EPIC,
  RARITY_CODE_GTE_COMMON,
  RARITY_CODE_GTE_EPIC,
  RARITY_CODE_GTE_LEGENDARY,
  RARITY_CODE_GTE_RARE,
  RARITY_CODE_GTE_UNCOMMON,
  RARITY_CODE_LEGENDARY,
  RARITY_CODE_LTE_EPIC,
  RARITY_CODE_LTE_LEGENDARY,
  RARITY_CODE_LTE_MYTHICAL,
  RARITY_CODE_LTE_RARE,
  RARITY_CODE_LTE_UNCOMMON,
  RARITY_CODE_MYTHICAL,
  RARITY_CODE_RARE,
  RARITY_CODE_UNCOMMON,
  RANK_CODE_ANY,
  RANK_CODE_ONE,
  RANK_CODE_TWO,
  RANK_CODE_THREE,
  RANK_CODE_FOUR,
  RANK_CODE_FIVE,
  RANK_CODE_SIX,
  RANK_CODE_GTE_ONE,
  RANK_CODE_GTE_TWO,
  RANK_CODE_GTE_THREE,
  RANK_CODE_GTE_FOUR,
  RANK_CODE_GTE_FIVE,
  RANK_CODE_LTE_TWO,
  RANK_CODE_LTE_THREE,
  RANK_CODE_LTE_FOUR,
  RANK_CODE_LTE_FIVE,
  RANK_CODE_LTE_SIX,
  STAT_ID_ACC,
  STAT_ID_ANY,
  STAT_ID_ATK,
  STAT_ID_CDMG,
  STAT_ID_CR,
  STAT_ID_DEF,
  STAT_ID_HP,
  STAT_ID_HP_ATK_DEF,
  STAT_ID_RES,
  STAT_ID_ROLL_COUNT,
  STAT_ID_SPD,
  STAT_VARIANT_ACC,
  STAT_VARIANT_ANY,
  STAT_VARIANT_ATK_FLAT,
  STAT_VARIANT_ATK_PERCENT,
  STAT_VARIANT_CDMG,
  STAT_VARIANT_CR,
  STAT_VARIANT_DEF_FLAT,
  STAT_VARIANT_DEF_PERCENT,
  STAT_VARIANT_HP_FLAT,
  STAT_VARIANT_HP_PERCENT,
  STAT_VARIANT_RES,
  STAT_VARIANT_ROLL_COUNT,
  STAT_VARIANT_SPD,
  STAT_VARIANTS_PRIORITY as GENERATED_STAT_VARIANTS_PRIORITY,
  STAT_VARIANTS_PRIORITY_ROW1 as GENERATED_STAT_VARIANTS_PRIORITY_ROW1,
  STAT_VARIANTS_PRIORITY_ROW2 as GENERATED_STAT_VARIANTS_PRIORITY_ROW2,
  FACTION_ID_BANNER_LORDS,
  FACTION_ID_HIGH_ELVES,
  FACTION_ID_SACRED_ORDER,
  FACTION_ID_OGRYN_TRIBES,
  FACTION_ID_LIZARDMEN,
  FACTION_ID_SKINWALKERS,
  FACTION_ID_ORCS,
  FACTION_ID_DEMONSPAWN,
  FACTION_ID_UNDEAD_HORDES,
  FACTION_ID_DARK_ELVES,
  FACTION_ID_KNIGHT_REVENANT,
  FACTION_ID_BARBARIANS,
  FACTION_ID_SYLVAN_WATCHERS,
  FACTION_ID_SHADOWKIN,
  FACTION_ID_DWARVES,
  FACTION_ID_ARGONITES,
  FACTION_NAMES as GENERATED_FACTION_NAMES,
  ALLOWED_MAINS_BY_SLOT as GENERATED_ALLOWED_MAINS_BY_SLOT,
  ALLOWED_SUBS_BY_SLOT as GENERATED_ALLOWED_SUBS_BY_SLOT,
  ARTIFACT_TYPE_DISPLAY_NAMES as GENERATED_ARTIFACT_TYPE_DISPLAY_NAMES,
} from './generated/domainConstants'
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
  Helmet: ARTIFACT_TYPE_HELMET,
  Chestplate: ARTIFACT_TYPE_CHESTPLATE,
  Gauntlets: ARTIFACT_TYPE_GAUNTLETS,
  Boots: ARTIFACT_TYPE_BOOTS,
  Weapon: ARTIFACT_TYPE_WEAPON,
  Shield: ARTIFACT_TYPE_SHIELD,
  Ring: ARTIFACT_TYPE_RING,
  Amulet: ARTIFACT_TYPE_AMULET,
  Banner: ARTIFACT_TYPE_BANNER,
} as const

// eslint-disable-next-line no-redeclare -- share the value name so callers import `ArtifactType` for both runtime and typing
export type ArtifactType = number
export type ArtifactTypeId = ArtifactType | number

// Artifact type (slot) names by HSF numeric ID -> human label (from generated constants).
export const artifactTypeNames: Record<number, string> = { ...GENERATED_ARTIFACT_TYPE_DISPLAY_NAMES }

// Preferred artifact type (slot) order for consistent UI rendering
// Pull order values from generated shared constants so TS and Rust use one SSOT.
export const PREFERRED_ARTIFACT_TYPE_ORDER: readonly ArtifactType[] = (
  GENERATED_PREFERRED_ARTIFACT_TYPE_ORDER as readonly ArtifactType[]
)

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
  // Treat the accessory "no set" sentinel like a 1-piece accessory set for UI grouping.
  if (Number(id) === ACCESSORY_NO_SET_ID) return ArtifactSetPieceGroup.Accessories
  const runtime = getRuntimeGearSet(id)
  if (runtime) return runtime.pieceGroup
  return artifactSetPieceGroups[Number(id)] ?? ArtifactSetPieceGroup.ArmorFixed
}

/** Convenience arrays keep UI filters and Safeguard defaults in sync. */
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

// Accessory slots accept the no-set sentinel (Spider-dungeon unset accessories),
// traditional accessory sets (1-piece bonuses), and any of the flexible 1–9 piece families.
export const ACCESSORY_SLOTS_COMPATIBLE_SET_IDS = Object.freeze(
  Array.from(new Set<number>([
    ACCESSORY_NO_SET_ID,
    ...ACCESSORY_SET_IDS,
    ...ARMOR_VARIABLE_SET_IDS,
  ])).sort((a, b) => a - b)
    .map((id) => id as ArtifactSetId),
)

export const ALL_ARTIFACT_SET_IDS = Object.freeze(
  Array.from(new Set<number>([
    ACCESSORY_NO_SET_ID,
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
  // Handle the synthetic "no set" sentinel before scanning the baked catalog.
  if (name === NO_GEAR_SET_FALLBACK_NAME) return ACCESSORY_NO_SET_ID as ArtifactSetId
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
  includeNoSet?: boolean
  noSetLabel?: string
}

export function filterAndSortSetEntries(
  search: string,
  order: 'game' | 'az' | 'icons',
  opts?: ArtifactSetSearchOptions,
): Array<[string, string]> {
  // Allow callers to opt into the accessory-only "no set" sentinel entry.
  const includeNoSet = Boolean(opts?.includeNoSet)
  // Use a localized label when possible, fallback to a stable English name.
  const noSetLabel = opts?.noSetLabel ?? NO_GEAR_SET_FALLBACK_NAME
  // Pull the canonical runtime entries and keep no-set as a separate token.
  const entries = getArtifactSetEntries()
  // Preserve tuple typing so downstream destructuring stays strict.
  const noSetEntry: [string, string] = [String(ACCESSORY_NO_SET_ID), noSetLabel]
  // Normalize once so we can test both canonical + localized labels.
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = normalizedSearch
    ? entries.filter(([id, name]) => {
      // Match the canonical name first to keep the fast path cheap.
      if (name.toLowerCase().includes(normalizedSearch)) return true
      // Translate remaining set names for localized search.
      const translate = opts?.translate
      if (!translate) return false
      const localized = translate(artifactSetI18nKey(Number(id)))
      const normalizedLocalized = localized.trim().toLowerCase()
      return normalizedLocalized.includes(normalizedSearch)
    })
    : entries
  // The sentinel label is already localized; match it directly.
  const includeFilteredNoSet = includeNoSet
    && (normalizedSearch.length === 0 || noSetLabel.trim().toLowerCase().includes(normalizedSearch))
  const sorted = order === 'az'
    ? filtered.slice().sort((a, b) => a[1].localeCompare(b[1]))
    // 'game' and 'icons' both use numeric ID (in‑game) ordering for stability.
    : filtered.slice().sort((a, b) => Number(a[0]) - Number(b[0]))
  // A-Z keeps pure alphabetical placement, including no-set.
  if (!includeFilteredNoSet) return sorted
  if (order === 'az') {
    return [...sorted, noSetEntry].sort((a, b) => a[1].localeCompare(b[1]))
  }
  // Game/icons order keeps no-set anchored directly before Refresh.
  const refreshIndex = sorted.findIndex(([id]) => Number(id) === ArtifactSet.Refresh)
  if (refreshIndex < 0) return [noSetEntry, ...sorted]
  return [
    ...sorted.slice(0, refreshIndex),
    noSetEntry,
    ...sorted.slice(refreshIndex),
  ]
}

// Rarity enum codes in HSF files (index-based, not bitmask)
export const RarityCode = {
  Any: RARITY_CODE_ANY,
  Common: RARITY_CODE_COMMON,
  Uncommon: RARITY_CODE_UNCOMMON,
  Rare: RARITY_CODE_RARE,
  Epic: RARITY_CODE_EPIC,
  Legendary: RARITY_CODE_LEGENDARY,
  GTE_Common: RARITY_CODE_GTE_COMMON,
  GTE_Uncommon: RARITY_CODE_GTE_UNCOMMON,
  GTE_Rare: RARITY_CODE_GTE_RARE,
  GTE_Epic: RARITY_CODE_GTE_EPIC,
  LTE_Uncommon: RARITY_CODE_LTE_UNCOMMON,
  LTE_Rare: RARITY_CODE_LTE_RARE,
  LTE_Epic: RARITY_CODE_LTE_EPIC,
  LTE_Legendary: RARITY_CODE_LTE_LEGENDARY,
  LTE_Mythical: RARITY_CODE_LTE_MYTHICAL,
  Mythical: RARITY_CODE_MYTHICAL,
  GTE_Legendary: RARITY_CODE_GTE_LEGENDARY,
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

// Map discrete rarity values (1..6) to the exact HSF rarity codes.
export function rarityCodeFromRankValue(rarity: RankValue): RarityCode {
  // Keep the mapping explicit so future rarity additions are easy to audit.
  const map: Record<RankValue, RarityCode> = {
    1: RarityCode.Common,
    2: RarityCode.Uncommon,
    3: RarityCode.Rare,
    4: RarityCode.Epic,
    5: RarityCode.Legendary,
    6: RarityCode.Mythical,
  }
  return map[rarity]
}

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

/**
 * Decompose a RarityCode into its comparator glyph + the base rank (1–6) of the rarity word it
 * names. SSOT used by the coloured rarity-label renderer so every comparator form (Common, ≥ Rare,
 * ≤ Epic) tints the underlying rarity word in its colour. `rank` is null for Any (no word).
 */
export function rarityCodeParts(code?: RarityCode): { comparator: '' | '≥' | '≤'; rank: RankValue | null } {
  const c = Number(code)
  switch (c) {
    case RarityCode.Any: return { comparator: '', rank: null }
    case RarityCode.Common: return { comparator: '', rank: 1 }
    case RarityCode.Uncommon: return { comparator: '', rank: 2 }
    case RarityCode.Rare: return { comparator: '', rank: 3 }
    case RarityCode.Epic: return { comparator: '', rank: 4 }
    case RarityCode.Legendary: return { comparator: '', rank: 5 }
    case RarityCode.Mythical: return { comparator: '', rank: 6 }
    case RarityCode.GTE_Common: return { comparator: '≥', rank: 1 }
    case RarityCode.GTE_Uncommon: return { comparator: '≥', rank: 2 }
    case RarityCode.GTE_Rare: return { comparator: '≥', rank: 3 }
    case RarityCode.GTE_Epic: return { comparator: '≥', rank: 4 }
    case RarityCode.GTE_Legendary: return { comparator: '≥', rank: 5 }
    case RarityCode.LTE_Uncommon: return { comparator: '≤', rank: 2 }
    case RarityCode.LTE_Rare: return { comparator: '≤', rank: 3 }
    case RarityCode.LTE_Epic: return { comparator: '≤', rank: 4 }
    case RarityCode.LTE_Legendary: return { comparator: '≤', rank: 5 }
    case RarityCode.LTE_Mythical: return { comparator: '≤', rank: 6 }
    default: return { comparator: '', rank: null }
  }
}

// Preferred artifact set order (game order) is the numeric ID order.
// Provide a comparator to centralize sorting in UIs and formatters.
export function compareArtifactSets(a: ArtifactSetId, b: ArtifactSetId): number {
  return Number(a) - Number(b)
}

// Export canonical code lists for UI selections (centralized to avoid duplication)

// Stat ID mapping (partial). Falls back to raw ID label.
export const StatId = {
  Any: STAT_ID_ANY,
  HP: STAT_ID_HP,
  ATK: STAT_ID_ATK,
  DEF: STAT_ID_DEF,
  SPD: STAT_ID_SPD,
  RES: STAT_ID_RES,
  ACC: STAT_ID_ACC,
  CR: STAT_ID_CR,
  CDMG: STAT_ID_CDMG,
  HP_ATK_DEF: STAT_ID_HP_ATK_DEF,
  RollCount: STAT_ID_ROLL_COUNT,
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
  Any: STAT_VARIANT_ANY,
  HP: STAT_VARIANT_HP_PERCENT,
  HP_FLAT: STAT_VARIANT_HP_FLAT,
  ATK: STAT_VARIANT_ATK_PERCENT,
  ATK_FLAT: STAT_VARIANT_ATK_FLAT,
  DEF: STAT_VARIANT_DEF_PERCENT,
  DEF_FLAT: STAT_VARIANT_DEF_FLAT,
  SPD: STAT_VARIANT_SPD,
  RES: STAT_VARIANT_RES,
  ACC: STAT_VARIANT_ACC,
  CR: STAT_VARIANT_CR,
  CDMG: STAT_VARIANT_CDMG,
  RollCount: STAT_VARIANT_ROLL_COUNT,
}

// eslint-disable-next-line no-redeclare -- preserve the StatVariant name for value + type
export type StatVariant = number
export type StatVariantLike = StatVariant | number

// Canonical builder/substat stat ordering: SPD-focused row first, then flat/percent HP/ATK/DEF.
// Pull row priority values from generated shared constants so TS and Rust use one SSOT.
export const STAT_VARIANTS_PRIORITY_ROW1: readonly StatVariant[] = (
  GENERATED_STAT_VARIANTS_PRIORITY_ROW1 as readonly StatVariant[]
)

// Pull row priority values from generated shared constants so TS and Rust use one SSOT.
export const STAT_VARIANTS_PRIORITY_ROW2: readonly StatVariant[] = (
  GENERATED_STAT_VARIANTS_PRIORITY_ROW2 as readonly StatVariant[]
)

// Pull merged priority values from generated shared constants so TS and Rust use one SSOT.
export const STAT_VARIANTS_PRIORITY: readonly StatVariant[] = (
  GENERATED_STAT_VARIANTS_PRIORITY as readonly StatVariant[]
)

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
// Pull preferred order values from generated shared constants so TS and Rust use one SSOT.
export const PREFERRED_STAT_ORDER: readonly StatVariant[] = (
  GENERATED_PREFERRED_STAT_ORDER as readonly StatVariant[]
)

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

// Allowed main stats by slot (as StatVariant values) — built from generated constants.
export const ALLOWED_MAIN_BY_SLOT: Record<ArtifactType, ReadonlySet<number>> =
  Object.fromEntries(
    Object.entries(GENERATED_ALLOWED_MAINS_BY_SLOT).map(([k, v]) => [Number(k), new Set(v)])
  ) as Record<ArtifactType, ReadonlySet<number>>

// Allowed substats by slot (as StatVariant values) — built from generated constants.
export const ALLOWED_SUB_BY_SLOT: Record<ArtifactType, ReadonlySet<number>> =
  Object.fromEntries(
    Object.entries(GENERATED_ALLOWED_SUBS_BY_SLOT).map(([k, v]) => [Number(k), new Set(v)])
  ) as Record<ArtifactType, ReadonlySet<number>>

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

/** i18n key for a rarity RankValue (1–6). UI should use this with `t(...)`. */
export function rarityRankValueI18nKey(rankValue: number): 'rarityCommon' | 'rarityUncommon' | 'rarityRare' | 'rarityEpic' | 'rarityLegendary' | 'rarityMythical' {
  switch (rankValue) {
    case 1: return 'rarityCommon'
    case 2: return 'rarityUncommon'
    case 3: return 'rarityRare'
    case 4: return 'rarityEpic'
    case 5: return 'rarityLegendary'
    case 6: return 'rarityMythical'
  }
  return 'rarityCommon'
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

const NO_GEAR_SET_FALLBACK_NAME = 'No Gear-Set'

// Convenience: safe lookup that accepts either enum || number, with a readable fallback
export function artifactSetName(id: ArtifactSetId): string {
  // Provide a human label for the accessory-only "no set" sentinel.
  if (Number(id) === ACCESSORY_NO_SET_ID) return NO_GEAR_SET_FALLBACK_NAME
  const runtime = getRuntimeGearSet(id)
  if (runtime) return runtime.canonicalName
  return artifactSetNames[Number(id)] ?? String(id)
}

type GearSetLabelKey = ReturnType<typeof artifactSetI18nKey> | 'noSetAccessories'

export function getLocalizedGearSetName(
  id: ArtifactSetId,
  t: (key: GearSetLabelKey) => string,
  _lang?: string,
): string {
  // Use the dedicated label for the accessory no-set sentinel.
  if (Number(id) === ACCESSORY_NO_SET_ID) return t('noSetAccessories')
  const runtime = getRuntimeGearSet(id)
  if (runtime) {
    return (runtime.canonicalName ?? String(id)).trim()
  }
  // t() already falls back to en-US when the key is absent; trust the catalog result directly.
  return t(artifactSetI18nKey(id))
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

// Faction IDs used in HSF files (1..17), 0 = Any — values from generated constants.
export const Faction = {
  BannerLords:    FACTION_ID_BANNER_LORDS,
  HighElves:      FACTION_ID_HIGH_ELVES,
  SacredOrder:    FACTION_ID_SACRED_ORDER,
  OgrynTribes:    FACTION_ID_OGRYN_TRIBES,
  Lizardmen:      FACTION_ID_LIZARDMEN,
  Skinwalkers:    FACTION_ID_SKINWALKERS,
  Orcs:           FACTION_ID_ORCS,
  Demonspawn:     FACTION_ID_DEMONSPAWN,
  UndeadHordes:   FACTION_ID_UNDEAD_HORDES,
  DarkElves:      FACTION_ID_DARK_ELVES,
  KnightRevenant: FACTION_ID_KNIGHT_REVENANT,
  Barbarians:     FACTION_ID_BARBARIANS,
  SylvanWatchers: FACTION_ID_SYLVAN_WATCHERS,
  Shadowkin:      FACTION_ID_SHADOWKIN,
  Dwarves:        FACTION_ID_DWARVES,
  Argonites:      FACTION_ID_ARGONITES,
} as const

// eslint-disable-next-line no-redeclare -- expose the Faction identifier in both namespaces
export type Faction = number
export type FactionId = Faction | number

// Faction name map from generated constants (includes 0: '' for Any).
export const factionNames: Record<number, string> = { ...GENERATED_FACTION_NAMES }

/** Human-readable faction name from Faction code (accepts enum or number). */
export function factionCodeToName(code?: FactionId): string {
  if (code === undefined || code === null) return ''
  return factionNames[Number(code)] ?? String(code)
}

export const RankCode = {
  Any: RANK_CODE_ANY,
  One: RANK_CODE_ONE,
  Two: RANK_CODE_TWO,
  Three: RANK_CODE_THREE,
  Four: RANK_CODE_FOUR,
  Five: RANK_CODE_FIVE,
  Six: RANK_CODE_SIX,
  GTE_One: RANK_CODE_GTE_ONE,
  GTE_Two: RANK_CODE_GTE_TWO,
  GTE_Three: RANK_CODE_GTE_THREE,
  GTE_Four: RANK_CODE_GTE_FOUR,
  GTE_Five: RANK_CODE_GTE_FIVE,
  LTE_Two: RANK_CODE_LTE_TWO,
  LTE_Three: RANK_CODE_LTE_THREE,
  LTE_Four: RANK_CODE_LTE_FOUR,
  LTE_Five: RANK_CODE_LTE_FIVE,
  LTE_Six: RANK_CODE_LTE_SIX,
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
// Value is generated from shared/domain-constants.json to keep TS and Rust aligned.
export const LEVEL_ANY_SENTINEL = GENERATED_LEVEL_ANY_SENTINEL

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
