import { mainToVariant, subToVariant } from './types'
import type { TestItem } from './ruleEval'

type UnknownRecord = Record<string, unknown>

export type ExternalCommand =
  | { id: string | null; kind: 'selectRule'; ruleIndex: number | null; ruleId: string | null; source?: string }
  | { id: string | null; kind: 'testerItems'; items: ExternalTesterArtifact[]; openTester: boolean; source?: string }

export type ExternalTesterArtifact = {
  Slot?: unknown
  slot?: unknown
  ArtifactType?: unknown
  artifactType?: unknown
  Set?: unknown
  set?: unknown
  ArtifactSet?: unknown
  artifactSet?: unknown
  Rank?: unknown
  rank?: unknown
  Rarity?: unknown
  rarity?: unknown
  Level?: unknown
  level?: unknown
  Faction?: unknown
  faction?: unknown
  MainStatID?: unknown
  mainStatId?: unknown
  MainStatF?: unknown
  mainStatF?: unknown
  MainStat?: unknown
  mainStat?: unknown
  Main?: unknown
  main?: unknown
  Substats?: unknown
  substats?: unknown
  SubStats?: unknown
  subStats?: unknown
  SubValues?: unknown
  subValues?: unknown
  Name?: unknown
  name?: unknown
  Id?: unknown
  id?: unknown
  UID?: unknown
  uid?: unknown
}

type ExternalTesterSubstat = {
  ID?: unknown
  Id?: unknown
  id?: unknown
  IsFlat?: unknown
  isFlat?: unknown
  Value?: unknown
  value?: unknown
}

const isObject = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes') return true
  }
  return false
}

const coerceRank = (value: unknown): 1 | 2 | 3 | 4 | 5 | 6 => {
  const num = toNumber(value)
  if (num && num >= 1 && num <= 6) return num as 1 | 2 | 3 | 4 | 5 | 6
  return 6
}

const coerceRarity = (value: unknown): 1 | 2 | 3 | 4 | 5 | 6 => {
  const num = toNumber(value)
  if (num && num >= 1 && num <= 6) return num as 1 | 2 | 3 | 4 | 5 | 6
  return 6
}

const coerceLevel = (value: unknown): 0 | 4 | 8 | 12 | 16 => {
  const num = toNumber(value)
  if (!Number.isFinite(num)) return 0
  const rounded = Math.max(0, Math.min(16, Math.round(Number(num))))
  if (rounded === 4) return 4
  if (rounded === 8) return 8
  if (rounded === 12) return 12
  if (rounded >= 16) return 16
  return 0
}

const normalizeSubstatsArray = (value: unknown): ExternalTesterSubstat[] => {
  if (Array.isArray(value)) {
    return value.filter(isObject).map((entry) => entry as ExternalTesterSubstat)
  }
  return []
}

const extractSubstats = (artifact: ExternalTesterArtifact): ExternalTesterSubstat[] => {
  const candidates = [artifact.Substats, artifact.substats, artifact.SubStats, artifact.subStats]
  for (const candidate of candidates) {
    const arr = normalizeSubstatsArray(candidate)
    if (arr.length > 0) return arr
  }
  return []
}

const extractMainTuple = (artifact: ExternalTesterArtifact): { id: number; flag: number } | null => {
  const directId = toNumber(artifact.MainStatID ?? artifact.mainStatId ?? artifact.MainStat)
  const directFlag = toNumber(artifact.MainStatF ?? artifact.mainStatF)
  if (directId !== null) {
    return { id: directId, flag: directFlag ?? 0 }
  }
  const nested = artifact.MainStat ?? artifact.mainStat ?? artifact.Main
  if (isObject(nested)) {
    const nestedId = toNumber((nested as UnknownRecord).ID ?? (nested as UnknownRecord).Id ?? (nested as UnknownRecord).id)
    const nestedFlag = toNumber((nested as UnknownRecord).IsFlat ?? (nested as UnknownRecord).isFlat ?? (nested as UnknownRecord).F ?? (nested as UnknownRecord).f)
    if (nestedId !== null) {
      return { id: nestedId, flag: nestedFlag ?? 0 }
    }
  }
  return null
}

const extractString = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function normalizeExternalCommand(raw: unknown): ExternalCommand | null {
  if (!isObject(raw)) return null
  const id = extractString((raw as UnknownRecord).id ?? (raw as UnknownRecord).eventId ?? (raw as UnknownRecord).Id)
  const typeRaw = extractString((raw as UnknownRecord).type ?? (raw as UnknownRecord).command ?? (raw as UnknownRecord).action)
  const source = extractString((raw as UnknownRecord).source)
  if (!typeRaw) return null
  const type = typeRaw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')

  if (type === 'selectrule' || type === 'select' || type === 'selectconfig' || type === 'selectrow') {
    const ruleIndexValue = (raw as UnknownRecord).ruleIndex ?? (raw as UnknownRecord).rowIndex ?? (raw as UnknownRecord).index ?? (raw as UnknownRecord).row
    const ruleIndexNum = toNumber(ruleIndexValue)
    const ruleIndex = ruleIndexNum != null && Number.isFinite(ruleIndexNum) ? Math.max(0, Math.floor(ruleIndexNum)) : null
    const ruleId = extractString((raw as UnknownRecord).ruleId ?? (raw as UnknownRecord).ruleKey ?? (raw as UnknownRecord).ruleIdentifier ?? (raw as UnknownRecord).configId)
    const command: { id: string | null; kind: 'selectRule'; ruleIndex: number | null; ruleId: string | null; source?: string } = {
      id: id ?? null,
      kind: 'selectRule',
      ruleIndex,
      ruleId: ruleId ?? null,
    }
    if (source) {
      command.source = source
    }
    return command
  }

  if (type === 'testeritems' || type === 'ruletesteritems' || type === 'enqueueitems' || type === 'addruletesteritems') {
    const itemsCandidate = (raw as UnknownRecord).items ?? (raw as UnknownRecord).artifacts ?? (raw as UnknownRecord).payload
    const items = Array.isArray(itemsCandidate)
      ? (itemsCandidate.filter(isObject) as ExternalTesterArtifact[])
      : []
    if (items.length === 0) return null
    const openTester = toBoolean((raw as UnknownRecord).openTester ?? (raw as UnknownRecord).openDialog ?? (raw as UnknownRecord).activateTester)
    const command: { id: string | null; kind: 'testerItems'; items: ExternalTesterArtifact[]; openTester: boolean; source?: string } = {
      id: id ?? null,
      kind: 'testerItems',
      items,
      openTester,
    }
    if (source) {
      command.source = source
    }
    return command
  }

  return null
}

export function externalArtifactToTestItem(artifact: ExternalTesterArtifact): TestItem | null {
  const slotCandidate = toNumber(artifact.Slot ?? artifact.slot ?? artifact.ArtifactType ?? artifact.artifactType)
  if (slotCandidate == null) return null
  const slot = Math.max(0, Math.floor(slotCandidate))
  const setCandidate = toNumber(artifact.Set ?? artifact.set ?? artifact.ArtifactSet ?? artifact.artifactSet)
  if (setCandidate == null) return null
  const set = Math.max(0, Math.floor(setCandidate))
  const rank = coerceRank(artifact.Rank ?? artifact.rank)
  const rarity = coerceRarity(artifact.Rarity ?? artifact.rarity)
  const level = coerceLevel(artifact.Level ?? artifact.level)
  const factionCandidate = toNumber(artifact.Faction ?? artifact.faction)
  const faction = factionCandidate != null ? Math.max(0, Math.floor(factionCandidate)) : 0

  const mainTuple = extractMainTuple(artifact)
  const mainVariant = mainTuple ? mainToVariant(mainTuple.id, mainTuple.flag) : mainToVariant(-1, 0)

  const substats = extractSubstats(artifact)
  const subValues: Record<number, number> = {}
  for (const entry of substats) {
    const subId = toNumber(entry.ID ?? entry.Id ?? entry.id)
    if (subId == null) continue
    const isFlatRaw = entry.IsFlat ?? entry.isFlat
    const flatValue = ((): boolean | number | string | undefined => {
      if (typeof isFlatRaw === 'boolean' || typeof isFlatRaw === 'number' || typeof isFlatRaw === 'string') {
        return isFlatRaw
      }
      return undefined
    })()
    const variant = subToVariant(subId, flatValue)
    const valueNum = toNumber(entry.Value ?? entry.value)
    if (valueNum == null) continue
    subValues[Number(variant)] = Number(valueNum)
  }

  const name = extractString(artifact.Name ?? artifact.name)

  const item: TestItem = {
    slot: slot,
    set: set,
    rank,
    rarity,
    level,
    faction: faction,
    main: mainVariant,
    ...(Object.keys(subValues).length > 0 ? { subValues } : {}),
    ...(name ? { name } : {}),
  }

  return item
}
