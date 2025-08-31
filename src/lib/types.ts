// Shared domain catalogs and formatters (used by HSF viewer as well)

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

// Accept both enum and raw numeric IDs during migration.
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

const rarityEnumNames: Record<number, string> = {
  0: '',
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
  6: '≥ Common',
  7: '≥ Uncommon',
  8: '≥ Rare',
  9: '≥ Epic',
  10: '≤ Uncommon',
  11: '≤ Rare',
  12: '≤ Epic',
  13: '≤ Legendary',
  14: '≤ Mythical',
  15: 'Mythical',
  16: '≥ Legendary',
}

export function rarityCodeToName(code?: RarityCodeId): string {
  if (code === undefined || code === null) return ''
  return rarityEnumNames[Number(code)] ?? String(code)
}

// Export canonical code lists for UI selections (centralized to avoid duplication)
export const rankCodes: number[] = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
export const rarityCodes: number[] = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
// Friendlier order for users: All, exacts (Common..Mythical), then >=, then <=
export const rarityCodesFriendly: number[] = [
  0, // All
  1, 2, 3, 4, 5, 15, // exacts
  6, 7, 8, 9, 16, // >= Common, >= Uncommon, >= Rare, >= Epic, >= Legendary
  10, 11, 12, 13, 14, // <= Uncommon..<= Mythical
]

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
  case  7: return 'CR%'
  case  8: return 'CDMG%'
  case 99: return 'Roll Count'
  }

  return `ID ${n}`
}

// returns whether it's "ANY" substat
export function statIsAny(id?: number, isFlat?: boolean): boolean {
  return id === -1;
}

// sorting substats for consistency. No idea whether this would break RSL helper compatibility
export function statNameSort(id1: {ID: number}, id2: {ID: number}): number {
  const customOrder = [4, // SPD
                       7, // Crit Rate
                       8, // Crit Damage
                       6, // Accuracy
                       5, // Resistance
                       1, // HP
                       2, // Attack
                       3, // Defense
  ];

  const index1 = customOrder.indexOf(id1.ID);
  const index2 = customOrder.indexOf(id2.ID);

  // If both IDs are in the custom order, sort by their position in the array
  if (index1 !== -1 && index2 !== -1) {
    return index1 - index2;
  }
  // If only id1 is known, it comes first
  if (index1 !== -1) return -1;
  
  // If only id2 is known, it comes first
  if (index2 !== -1) return 1;
  
  // If both are unknown, sort by actual ID value
  return id1.ID - id2.ID;
}


// MainStat enum mapping (order provided by samples for UI selection)
// MainStat mapping from (ID, F) pairs derived from samples
// F appears to indicate flat (1) vs percent (0) for HP/ATK/DEF families.
export function formatMainStat(id?: number, f?: number): string {
  if (id === undefined || id === null) return ''
  if (id === -1) return ''
  // HP family (ID 1)
  if (id === 1) return f === 0 ? 'HP%' : 'HP'
  // ATK family (ID 2)
  if (id === 2) return f === 0 ? 'ATK%' : 'ATK'
  // DEF family (ID 3)
  if (id === 3) return f === 0 ? 'DEF%' : 'DEF'
  // Speed (ID 4)
  if (id === 4) return 'SPD'
  // Resistance (ID 5)
  if (id === 5) return 'RES'
  // Accuracy (ID 6)
  if (id === 6) return 'ACC'
  // Crit Rate% (ID 7)
  if (id === 7) return 'CR%'
  // Crit Damage% (ID 8)
  if (id === 8) return 'CDMG%'
  // HP/Attack/Defense combined (ID 9)
  if (id === 9) return 'HP/ATK/DEF'
  return `ID ${id}${f !== undefined ? ` (F=${f})` : ''}`
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

// Convenience: safe lookup that accepts either enum or number, with a readable fallback
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
