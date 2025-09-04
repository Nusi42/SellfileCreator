// Shared domain catalogs && formatters (used by HSF viewer as well)

// Artifact types (slots) as an enum for readability (values match HSF IDs)
export enum ArtifactType {
  Helmet = 1,
  Chestplate = 2,
  Gauntlets = 3,
  Boots = 4,
  Weapon = 5,
  Shield = 6,
  Ring = 7,
  Amulet = 8,
  Banner = 9,
}

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

// Readable enum for artifact set IDs (use these instead of magic numbers).
// Values intentionally match the numeric IDs used in HSF/HSFR for full compatibility.
export enum ArtifactSet {
  Life = 1,
  Offense = 2,
  Defense = 3,
  Speed = 4,
  CriticalRate = 5,
  CritDamage = 6,
  Accuracy = 7,
  Resistance = 8,
  Lifesteal = 9,
  Fury = 10,
  Daze = 11,
  Cursed = 12,
  Frost = 13,
  Frenzy = 14,
  Regeneration = 15,
  Immunity = 16,
  Shield = 17,
  Relentless = 18,
  Savage = 19,
  Destroy = 20,
  Stun = 21,
  Toxic = 22,
  Provoke = 23,
  Retaliation = 24,
  Avenging = 25,
  Stalwart = 26,
  Reflex = 27,
  Curing = 28,
  Cruel = 29,
  Immortal = 30,
  DivineOffense = 31,
  DivineCriticalRate = 32,
  DivineLife = 33,
  DivineSpeed = 34,
  SwiftParry = 35,
  Deflection = 36,
  Resilience = 37,
  Perception = 38,
  Affinitybreaker = 39,
  Untouchable = 40,
  Fatal = 41,
  Frostbite = 42,
  Bloodthirst = 43,
  Guardian = 44,
  Fortitude = 45,
  Lethal = 46,
  Protection = 47,
  Stoneskin = 48,
  Killstroke = 49,
  Instinct = 50,
  Bolster = 51,
  Defiant = 52,
  Impulse = 53,
  Zeal = 54,
  Righteous = 57,
  Supersonic = 58,
  Merciless = 59,
  Slayer = 60,
  Feral = 61,
  Pinpoint = 62,
  Stonecleaver = 63,
  Rebirth = 64,
  Chronophage = 65,
  // Accessories
  Refresh = 1000,
  Cleansing = 1001,
  Bloodshield = 1002,
  Reaction = 1003,
  Revenge = 1004,
}

// Accept both enum and raw numeric IDs.
export type ArtifactSetId = ArtifactSet | number

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
  [ArtifactSet.Refresh]: 'Refresh',
  [ArtifactSet.Cleansing]: 'Cleansing',
  [ArtifactSet.Bloodshield]: 'Bloodshield',
  [ArtifactSet.Reaction]: 'Reaction',
  [ArtifactSet.Revenge]: 'Revenge',
}

// Rarity enum codes in HSF files (index-based, not bitmask)
export enum RarityCode {
  Any = 0,
  Common = 1,
  Uncommon = 2,
  Rare = 3,
  Epic = 4,
  Legendary = 5,
  GTE_Common = 6,
  GTE_Uncommon = 7,
  GTE_Rare = 8,
  GTE_Epic = 9,
  LTE_Uncommon = 10,
  LTE_Rare = 11,
  LTE_Epic = 12,
  LTE_Legendary = 13,
  LTE_Mythical = 14,
  Mythical = 15,
  GTE_Legendary = 16,
}

export type RarityCodeId = RarityCode | number

export const rarityNames: Record<number, string> = {
  [RarityCode.Any]: '',
  [RarityCode.Common]: 'Common',
  [RarityCode.Uncommon]: 'Uncommon',
  [RarityCode.Rare]: 'Rare',
  [RarityCode.Epic]: 'Epic',
  [RarityCode.Legendary]: 'Legendary',
  [RarityCode.GTE_Common]: '≥ Common',
  [RarityCode.GTE_Uncommon]: '≥ Uncommon',
  [RarityCode.GTE_Rare]: '≥ Rare',
  [RarityCode.GTE_Epic]: '≥ Epic',
  [RarityCode.LTE_Uncommon]: '≤ Uncommon',
  [RarityCode.LTE_Rare]: '≤ Rare',
  [RarityCode.LTE_Epic]: '≤ Epic',
  [RarityCode.LTE_Legendary]: '≤ Legendary',
  [RarityCode.LTE_Mythical]: '≤ Mythical',
  [RarityCode.Mythical]: 'Mythical',
  [RarityCode.GTE_Legendary]: '≥ Legendary',
}

/** Human-readable name for a rarity code (accepts enum or number). */
export function rarityCodeToName(code?: RarityCodeId): string {
  if (code === undefined || code === null) return ''
  return rarityNames[Number(code)] ?? String(code)
}

// Export canonical code lists for UI selections (centralized to avoid duplication)

// Stat ID mapping (partial). Falls back to raw ID label.
export enum StatId {
  Any = -1,
  HP = 1,
  ATK = 2,
  DEF = 3,
  SPD = 4,
  RES = 5,
  ACC = 6,
  CR = 7,
  CDMG = 8,
  HP_ATK_DEF = 9,
  RollCount = 99,
}

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
  case -1: return ''
  case  1: return isFlat ? 'HP' : 'HP%'
  case  2: return isFlat ? 'ATK' : 'ATK%'
  case  3: return isFlat ? 'DEF' : 'DEF%'
  case  4: return 'SPD'
  case  5: return 'RES'
  case  6: return 'ACC'
  case  9: return 'HP/ATK/DEF'
  case  7: return 'CR%'
  case  8: return 'CDMG%'
  case 99: return 'Roll Count'
  }

  return `ID ${n}`
}

// returns whether it's "ANY" substat
export function statIsAny(id?: number): boolean {
  return id === -1
}

// Variant-based sort for HSF substats used in previews


// Prefer StatVariant conversions for parsing/formatting in UI-facing code.

// UI-friendly unified stat variant enum (no separate isFlat flag needed in UI state)
// StatVariant encoding: high byte = HSF Stat ID, low byte = flat flag (0 percent/default, 1 flat).
// For HP/ATK/DEF, both percent (default) && flat variants exist. Others are fixed: SPD/RES/ACC use flag=1; CR/CDMG use flag=0.
export enum StatVariant {
  Any = -1,
  HP = (1 << 8) | 0,
  HP_FLAT = (1 << 8) | 1,
  ATK = (2 << 8) | 0,
  ATK_FLAT = (2 << 8) | 1,
  DEF = (3 << 8) | 0,
  DEF_FLAT = (3 << 8) | 1,
  SPD = (4 << 8) | 1,
  RES = (5 << 8) | 1,
  ACC = (6 << 8) | 1,
  CR = (7 << 8) | 0,
  CDMG = (8 << 8) | 0,
}

export type StatVariantLike = StatVariant | number

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
  }
  return null
}

// HSF tuple helpers live in hsfTypes.ts to keep this module focused on UI-facing variants.

// Low-level decoders for StatVariant. Keep the bit layout knowledge centralized
// here so other modules (e.g., hsfTypes) can delegate without duplicating logic.
// No decoding helpers here; variant-to-HSF tuple helpers live in hsfTypes.ts.

/** Convert HSF main stat tuple (id,f) to StatVariant encoding. */
export function mainToVariant(id?: number, f?: number): StatVariant {
  if (id === undefined || id === null) return StatVariant.Any
  if (id === -1) return StatVariant.Any
  if (id >= 1 && id <= 3) return (((id & 0xFF) << 8) | ((f ?? 0) === 1 ? 1 : 0)) as StatVariant
  if (id >= 4 && id <= 6) return (((id & 0xFF) << 8) | 1) as StatVariant
  if (id >= 7 && id <= 8) return (((id & 0xFF) << 8) | 0) as StatVariant
  if (id === StatId.HP_ATK_DEF) return (((id & 0xFF) << 8) | 1) as StatVariant
  return StatVariant.Any
}

/** Convert HSF substat tuple (id,isFlat) to StatVariant encoding. */
export function subToVariant(id?: number, isFlat?: boolean): StatVariant {
  if (id === undefined || id === null) return StatVariant.Any
  if (id === -1) return StatVariant.Any
  if (id >= 1 && id <= 3) return (((id & 0xFF) << 8) | (isFlat ? 1 : 0)) as StatVariant
  if (id >= 4 && id <= 6) return (((id & 0xFF) << 8) | 1) as StatVariant
  if (id >= 7 && id <= 8) return (((id & 0xFF) << 8) | 0) as StatVariant
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
  return types.map((t) => artifactTypeNames[Number(t)] ?? ``).join(', ')
}

export function artifactTypeName(id: ArtifactTypeId): string {
  return artifactTypeNames[Number(id)] ?? String(id)
}

export function formatArtifactSets(sets?: ArtifactSetId[]): string {
  if (!sets || !sets.length) return ''
  return sets.map((s) => artifactSetNames[Number(s)] ?? ``).join(', ')
}

// Convenience: safe lookup that accepts either enum || number, with a readable fallback
export function artifactSetName(id: ArtifactSetId): string {
  return artifactSetNames[Number(id)] ?? String(id)
}

// Faction ID mapping used in HSF files (1..15), 0 = Any
// Readable enum for factions (values match HSF IDs)
export enum Faction {
  BannerLords = 1,
  HighElves = 2,
  SacredOrder = 3,
  Barbarians = 13,
  OgrynTribes = 5,
  Lizardmen = 6,
  Skinwalkers = 7,
  Orcs = 8,
  Demonspawn = 9,
  UndeadHordes = 10,
  DarkElves = 11,
  KnightRevenant = 12,
  Dwarves = 16,
  Shadowkin = 14,
  SylvanWatchers = 15,
}

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
}

/** Human-readable faction name from Faction code (accepts enum or number). */
export function factionCodeToName(code?: FactionId): string {
  if (code === undefined || code === null) return ''
  return factionNames[Number(code)] ?? String(code)
}

export enum RankCode {
  Any = 0,
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  GTE_One = 7,
  GTE_Two = 8,
  GTE_Three = 9,
  GTE_Four = 10,
  GTE_Five = 11,
  LTE_Two = 12,
  LTE_Three = 13,
  LTE_Four = 14,
  LTE_Five = 15,
  LTE_Six = 16,
}

export type RankCodeId = RankCode | number

/** Human-readable rank label for HSF-compatible rank code 0..16. */
export function formatRank(code?: RankCodeId): string {
  if (code === undefined || code === null) return ''
  const n = Number(code)
  if (n === 0) return ''
  if (n >= 1 && n <= 6) return `${n}★`
  if (n >= 7 && n <= 11) return `≥ ${n - 6}★`
  if (n >= 12 && n <= 16) return `≤ ${n - 10}★`
  return String(n)
}

export function formatLevel(level?: number): string {
  if (level === undefined || level === null) return ''
  if (level === 99) return ''
  // Display ranges for checkpoint levels: 0->"0-3", 4->"4-7", ... 12->"12-15", 16->"16"
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
