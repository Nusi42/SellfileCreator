import { ACCESSORY_NO_SET_ID } from '../constants'
import {
  ArtifactType,
  artifactSetName,
  factionCodeToName,
  Faction,
  type ArtifactSetId,
  type ArtifactTypeId,
  type FactionId,
} from '../types'
import { PACK_SET_SLOT_ICONS } from './gameIcons'

// Set x slot icons (`<Set>_<Slot>`, `<Faction>_<Accessory>`) come only from the asset pack;
// without it every lookup misses and callers fall back to the plain set icon.
const ICON_BY_KEY = new Map<string, string>(Object.entries(PACK_SET_SLOT_ICONS))

const SLOT_TOKENS_BY_TYPE: Record<ArtifactType, readonly string[]> = {
  [ArtifactType.Weapon]: ['Weapon'],
  [ArtifactType.Helmet]: ['Helmet'],
  [ArtifactType.Shield]: ['Shield'],
  [ArtifactType.Gauntlets]: ['Gloves'],
  [ArtifactType.Chestplate]: ['Chest'],
  [ArtifactType.Boots]: ['Boots'],
  [ArtifactType.Ring]: ['Ring'],
  [ArtifactType.Amulet]: ['Amulet'],
  [ArtifactType.Banner]: ['Banner'],
}

const ACCESSORY_TYPES = new Set<ArtifactType>([
  ArtifactType.Ring,
  ArtifactType.Amulet,
  ArtifactType.Banner,
])

const FACTION_PREFIX_BY_ID: Partial<Record<Faction, readonly string[]>> = {
  [Faction.BannerLords]: ['Banner_Lords'],
  [Faction.HighElves]: ['High_Elves'],
  [Faction.SacredOrder]: ['Sacred_Order'],
  [Faction.Barbarians]: ['Barbarians'],
  [Faction.OgrynTribes]: ['Ogryn_Tribes'],
  [Faction.Lizardmen]: ['Lizardmen'],
  [Faction.Skinwalkers]: ['Skinwalkers'],
  [Faction.Orcs]: ['Orcs'],
  [Faction.Demonspawn]: ['Demonspawn'],
  [Faction.UndeadHordes]: ['Undead_Hordes'],
  [Faction.DarkElves]: ['Dark_Elves'],
  [Faction.KnightRevenant]: ['Knight_Revenant'],
  [Faction.Dwarves]: ['Dwarfs'],
  [Faction.Shadowkin]: ['Shadowkin'],
  [Faction.SylvanWatchers]: ['Sylvan_Watchers'],
  // Argonites accessory slot icons live under the faction prefix.
  [Faction.Argonites]: ['Argonites'],
}

const SET_KEY_CACHE = new Map<number, readonly string[]>()
const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim()
const withUnderscores = (value: string): string => value.replace(/\s+/g, '_')

function candidateSetKeys(setId?: ArtifactSetId): readonly string[] {
  const numeric = Number(setId)
  if (!Number.isFinite(numeric) || numeric === 0 || numeric === ACCESSORY_NO_SET_ID) return []
  if (SET_KEY_CACHE.has(numeric)) return SET_KEY_CACHE.get(numeric)!
  const name = normalizeWhitespace(artifactSetName(numeric as ArtifactSetId))
  const keys = new Set<string>([String(numeric)])
  if (name && name !== String(numeric)) {
    keys.add(name)
    keys.add(withUnderscores(name))
  }
  const list = Array.from(keys)
  SET_KEY_CACHE.set(numeric, list)
  return list
}

function candidateFactionKeys(factionId?: FactionId): readonly string[] {
  if (factionId === undefined || factionId === null) return []
  const numeric = Number(factionId) as Faction
  if (!Number.isFinite(numeric) || numeric <= 0) return []
  const explicit = FACTION_PREFIX_BY_ID[numeric]
  if (explicit) return explicit
  const name = normalizeWhitespace(factionCodeToName(numeric))
  if (!name) return []
  const underscore = withUnderscores(name)
  return underscore ? [underscore] : []
}

function candidateSlotTokens(slotId?: ArtifactTypeId): readonly string[] {
  const numeric = Number(slotId) as ArtifactType
  return SLOT_TOKENS_BY_TYPE[numeric] ?? []
}

function lookupIcon(keys: readonly string[], slotTokens: readonly string[]): string | undefined {
  for (const key of keys) {
    for (const slotToken of slotTokens) {
      const icon = ICON_BY_KEY.get(`${key}_${slotToken}`)
      if (icon) return icon
    }
  }
  return undefined
}

export function gearSetSlotIconUrl(
  setId?: ArtifactSetId,
  slotId?: ArtifactTypeId,
  options?: { factionId?: FactionId },
): string | undefined {
  const slotTokens = candidateSlotTokens(slotId)
  if (!slotTokens.length) return undefined

  const numericSetId = Number(setId)
  if (
    numericSetId === ACCESSORY_NO_SET_ID
    && options?.factionId !== undefined
    && ACCESSORY_TYPES.has(Number(slotId) as ArtifactType)
  ) {
    const factionKeys = candidateFactionKeys(options.factionId)
    const factionIcon = lookupIcon(factionKeys, slotTokens)
    if (factionIcon) return factionIcon
  }

  const setKeys = candidateSetKeys(setId)
  if (!setKeys.length) return undefined
  return lookupIcon(setKeys, slotTokens)
}
