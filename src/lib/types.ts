// Shared domain catalogs and formatters (used by HSF viewer as well)

// Artifact type (slot) names by HSF numeric ID -> human label
export const artifactTypeNames: Record<number, string> = {
  1: 'Helmet',
  2: 'Chestplate',
  3: 'Gauntlets',
  4: 'Boots',
  5: 'Weapon',
  6: 'Shield',
  7: 'Ring',
  8: 'Amulet',
  9: 'Banner',
}

// Artifact Set IDs mapped to names (ascending by ID).
export const artifactSetNames: Record<number, string> = {
  1: 'Life',
  2: 'Offense',
  3: 'Defense',
  4: 'Speed',
  5: 'Critical Rate',
  6: 'Crit Damage',
  7: 'Accuracy',
  8: 'Resistance',
  9: 'Lifesteal',
  10: 'Fury',
  11: 'Daze',
  12: 'Cursed',
  13: 'Frost',
  14: 'Frenzy',
  15: 'Regeneration',
  16: 'Immunity',
  17: 'Shield',
  18: 'Relentless',
  19: 'Savage',
  20: 'Destroy',
  21: 'Stun',
  22: 'Toxic',
  23: 'Provoke',
  24: 'Retaliation',
  25: 'Avenging',
  26: 'Stalwart',
  27: 'Reflex',
  28: 'Curing',
  29: 'Cruel',
  30: 'Immortal',
  31: 'Divine Offense',
  32: 'Divine Critical Rate',
  33: 'Divine Life',
  34: 'Divine Speed',
  35: 'Swift Parry',
  36: 'Deflection',
  37: 'Resilience',
  38: 'Perception',
  39: 'Affinitybreaker',
  40: 'Untouchable',
  41: 'Fatal',
  42: 'Frostbite',
  43: 'Bloodthirst',
  44: 'Guardian',
  45: 'Fortitude',
  46: 'Lethal',
  47: 'Protection',
  48: 'Stoneskin',
  49: 'Killstroke',
  50: 'Instinct',
  51: 'Bolster',
  52: 'Defiant',
  53: 'Impulse',
  54: 'Zeal',
  // ...
  57: 'Righteous', 
  58: 'Supersonic', 
  59: 'Merciless', 
  60: 'Slayer',
  61: 'Feral', 
  62: 'Pinpoint', 
  63: 'Stonecleaver',
  64: 'Rebirth',
  65: 'Chronophage',
  // ...
  1000: 'Refresh',
  1001: 'Cleansing',
  1002: 'Bloodshield',
  1003: 'Reaction',
  1004: 'Revenge',
}

// Rarity enum codes in HSF files (index-based, not bitmask)
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

export function rarityCodeToName(code?: number): string {
  if (code === undefined || code === null) return ''
  return rarityEnumNames[code] ?? String(code)
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
export function statNameFromId(id?: number, isFlat?: boolean): string {
  if (id === undefined || id === null) return ''
  switch (id)
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

  return `ID ${id}`
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

export function formatArtifactTypes(types?: number[]): string {
  if (!types || !types.length) return ''
  return types.map((t) => artifactTypeNames[t] ?? ``).join(', ')
}

export function formatArtifactSets(sets?: number[]): string {
  if (!sets || !sets.length) return ''
  return sets.map((s) => artifactSetNames[s] ?? ``).join(', ')
}

// Faction ID mapping used in HSF files (1..15), 0 = Any
export const factionNames: Record<number, string> = {
  0: '',
  1: 'Banner Lords',
  2: 'High Elves',
  3: 'Sacred Order',
  13: 'Barbarians',
  5: 'Ogryn Tribes',
  6: 'Lizardmen',
  7: 'Skinwalkers',
  8: 'Orcs',
  9: 'Demonspawn',
  10: 'Undead Hordes',
  11: 'Dark Elves',
  12: 'Knight Revenant',
  16: 'Dwarves',
  14: 'Shadowkin',
  15: 'Sylvan Watchers',
}

export function factionCodeToName(code?: number): string {
  if (code === undefined || code === null) return ''
  return factionNames[code] ?? String(code)
}

export function formatRank(code?: number): string {
  if (code === undefined || code === null) return ''
  if (code === 0) return ''
  if (code >= 1 && code <= 6) return `${code}★`
  if (code >= 7 && code <= 11) return `≥ ${code - 6}★`
  if (code >= 12 && code <= 16) return `≤ ${code - 10}★`
  return String(code)
}

export function formatLevel(level?: number): string {
  if (level === undefined || level === null) return ''
  if (level === 99) return ''
  if ([0, 4, 8, 12, 16].includes(level)) return `At +${level}`
  return String(level)
}
