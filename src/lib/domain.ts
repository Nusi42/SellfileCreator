// Domain catalogs and formatters shared across the app and HSF viewer

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

// Rarity is represented as a bitmask in HSF files
const rarityBitNames: Record<number, string> = {
  1: 'Common',
  2: 'Uncommon',
  4: 'Rare',
  8: 'Epic',
  16: 'Legendary',
  32: 'Mythical',
}

export function rarityMaskToNames(mask?: number): string {
  if (!mask) return 'Any'
  const out: string[] = []
  for (const bit of Object.keys(rarityBitNames).map(Number)) {
    if ((mask & bit) === bit) out.push(rarityBitNames[bit])
  }
  return out.length ? out.join(', ') : String(mask)
}

// Stat ID mapping (partial). Falls back to raw ID label.
export function statNameFromId(id?: number, isFlat?: boolean): string {
  if (id === undefined || id === null) return ''
  if (id === 4) return 'SPD'
  if (id === 7) return isFlat ? 'C.RATE' : 'C.RATE%'
  if (id === 8) return isFlat ? 'C.DMG' : 'C.DMG%'
  if (id === 1) return isFlat ? 'ATK' : 'ATK%'
  return `ID ${id}`
}

export function formatArtifactTypes(types?: number[]): string {
  if (!types || !types.length) return ''
  return types.map((t) => artifactTypeNames[t] ?? `Type ${t}`).join(', ')
}

export function formatArtifactSets(sets?: number[]): string {
  if (!sets || !sets.length) return ''
  return sets.map((s) => artifactSetNames[s] ?? `Set ${s}`).join(', ')
}

// Rank code mapping based on provided samples
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
