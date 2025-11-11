import { ArtifactType, artifactSetName, type ArtifactSetId, type ArtifactTypeId } from '../types'

const RAW_SET_SLOT_ICONS = import.meta.glob('../../../ico/sets/slots/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const ICON_BY_KEY = new Map<string, string>()

for (const [path, url] of Object.entries(RAW_SET_SLOT_ICONS)) {
  const fileName = path.split('/').pop()
  if (!fileName) continue
  const base = fileName.replace(/\.webp$/i, '')
  ICON_BY_KEY.set(base, url)
}

const SLOT_TOKENS_BY_TYPE: Record<ArtifactType, readonly string[]> = {
  [ArtifactType.Weapon]: ['Weapon', 'Sword'],
  [ArtifactType.Helmet]: ['Helmet'],
  [ArtifactType.Shield]: ['Shield'],
  [ArtifactType.Gauntlets]: ['Gauntlets', 'Gloves'],
  [ArtifactType.Chestplate]: ['Chestplate', 'Chest'],
  [ArtifactType.Boots]: ['Boots'],
  [ArtifactType.Ring]: ['Ring'],
  [ArtifactType.Amulet]: ['Amulet', 'Amulett', 'Pendant'],
  [ArtifactType.Banner]: ['Banner'],
}

const SET_KEY_CACHE = new Map<number, readonly string[]>()

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim()
const withUnderscores = (value: string): string => value.replace(/[\s]+/g, '_')

function candidateSetKeys(setId?: ArtifactSetId): readonly string[] {
  const numeric = Number(setId)
  if (!Number.isFinite(numeric) || numeric <= 0) return []
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

function candidateSlotTokens(slotId?: ArtifactTypeId): readonly string[] {
  const numeric = Number(slotId) as ArtifactType
  return SLOT_TOKENS_BY_TYPE[numeric] ?? []
}

export function gearSetSlotIconUrl(setId?: ArtifactSetId, slotId?: ArtifactTypeId): string | undefined {
  const setKeys = candidateSetKeys(setId)
  if (!setKeys.length) return undefined
  const slotTokens = candidateSlotTokens(slotId)
  if (!slotTokens.length) return undefined
  for (const setKey of setKeys) {
    for (const slotToken of slotTokens) {
      const icon = ICON_BY_KEY.get(`${setKey}_${slotToken}`)
      if (icon) return icon
    }
  }
  return undefined
}
