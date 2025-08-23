export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythical'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type SetName =
  | 'speed' | 'lifesteal' | 'immortal' | 'divineSpeed' | 'perception' | 'resilience'
  | 'swiftParry' | 'untouchable' | 'stoneSkin' | 'protection' | 'revenge' | 'stalwart' | 'unknown'

export type StatKey =
  | 'hp' | 'hp%' | 'atk' | 'atk%' | 'def' | 'def%' | 'spd' | 'critRate%' | 'critDmg%'
  | 'res' | 'acc' | 'flatSubstatsOk'

export interface GearItem {
  id: string
  slot: 'weapon' | 'helmet' | 'shield' | 'gauntlets' | 'chest' | 'boots' | 'ring' | 'amulet' | 'banner'
  rarity: Rarity
  rank: Rank
  level: number
  set: SetName
  mainStat: StatKey
  subStats: Partial<Record<StatKey, number>>
  equippedBy?: string | null
}

export interface Rule {
  name: string
  description?: string
  filter: {
    slots?: GearItem['slot'][]
    rarities?: Rarity[]
    ranks?: Rank[]
    sets?: SetName[]
    maxLevel?: number
    onlyUnequipped?: boolean
    anySubstats?: StatKey[]
    allSubstats?: StatKey[]
    noneSubstats?: StatKey[]
    minSpeed?: number
  }
  action: 'sell' | 'keep'
}

export interface SellRuleSet {
  version: number
  strategy: 'whitelist' | 'blacklist'
  rules: Rule[]
}

export interface SellFileItem {
  id: string
}

// Shared domain catalogs and formatters (used by HSF viewer as well)

// Artifact type (slot) names by HSF numeric ID -> human label
export const artifactTypeNames: Record<number, string> = {
  1: 'Weapon',
  2: 'Helmet',
  3: 'Shield',
  4: 'Gauntlets',
  5: 'Chestplate',
  6: 'Boots',
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
  55: 'Righteous',
  56: 'Supersonic',
  57: 'Merciless',
  58: 'Slayer',
  59: 'Feral',
  60: 'Pinpoint',
  61: 'Stonecleaver',
  62: 'Rebirth',
  63: 'Chronophage',
  64: 'Refresh',
  65: 'Cleansing',
  66: 'Bloodshield',
  67: 'Reaction',
  68: 'Revenge',
}

// Rarity enum codes in HSF files (index-based, not bitmask)
const rarityEnumNames: Record<number, string> = {
  0: 'All',
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
  6: '>= Common',
  7: '>= Uncommon',
  8: '>= Rare',
  9: '>= Epic',
  10: '<= Uncommon',
  11: '<= Rare',
  12: '<= Epic',
  13: '<= Legendary',
  14: '<= Mythical',
  15: 'Mythical',
  16: '>= Legendary',
}

export function rarityCodeToName(code?: number): string {
  if (code === undefined || code === null) return ''
  return rarityEnumNames[code] ?? String(code)
}

// Stat ID mapping (partial). Falls back to raw ID label.
export function statNameFromId(id?: number, isFlat?: boolean): string {
  if (id === undefined || id === null) return ''
  if (id === -1) return 'Any'
  if (id === 4) return 'SPD'
  if (id === 7) return isFlat ? 'C.RATE' : 'C.RATE%'
  if (id === 8) return isFlat ? 'C.DMG' : 'C.DMG%'
  if (id === 1) return isFlat ? 'ATK' : 'ATK%'
  return `ID ${id}`
}

// MainStat enum mapping (order provided by samples for UI selection)
// MainStat mapping from (ID, F) pairs derived from samples
// F appears to indicate flat (1) vs percent (0) for HP/ATK/DEF families.
export function formatMainStat(id?: number, f?: number): string {
  if (id === undefined || id === null) return ''
  if (id === -1) return 'Any'
  // HP family (ID 1)
  if (id === 1) return f === 0 ? 'HP%' : 'HP'
  // ATK family (ID 2)
  if (id === 2) return f === 0 ? 'Attack%' : 'Attack'
  // DEF family (ID 3)
  if (id === 3) return f === 0 ? 'Defense%' : 'Defense'
  // Speed (ID 4)
  if (id === 4) return 'Speed'
  // Resistance (ID 5)
  if (id === 5) return 'Resistance'
  // Accuracy (ID 6)
  if (id === 6) return 'Accuracy'
  // Crit Rate% (ID 7)
  if (id === 7) return 'Crit Rate%'
  // Crit Damage% (ID 8)
  if (id === 8) return 'Crit Damage%'
  // HP/Attack/Defense combined (ID 9)
  if (id === 9) return 'HP/Attack/Defense'
  return `ID ${id}${f !== undefined ? ` (F=${f})` : ''}`
}

export function formatArtifactTypes(types?: number[]): string {
  if (!types || !types.length) return ''
  return types.map((t) => artifactTypeNames[t] ?? `Type ${t}`).join(', ')
}

export function formatArtifactSets(sets?: number[]): string {
  if (!sets || !sets.length) return ''
  return sets.map((s) => artifactSetNames[s] ?? `Set ${s}`).join(', ')
}

export function formatRank(code?: number): string {
  if (code === undefined || code === null) return ''
  if (code === 0) return 'All'
  if (code >= 1 && code <= 6) return `${code}-Star`
  if (code >= 7 && code <= 11) return `>= ${code - 6}-Star`
  if (code >= 12 && code <= 16) return `<= ${code - 10}-Star`
  return String(code)
}

export function formatLevel(level?: number): string {
  if (level === undefined || level === null) return ''
  if (level === 99) return 'Any level'
  if ([0, 4, 8, 12, 16].includes(level)) return `At +${level}`
  return String(level)
}
