import { mainToVariant, subToVariant } from './types'
import type { TestItem } from './ruleEval'

type UnknownRecord = Record<string, unknown>

type CaseInsensitiveLookup = {
  get: (...keys: string[]) => unknown
}

const createCaseInsensitiveLookup = (record: UnknownRecord): CaseInsensitiveLookup => {
  const map = new Map<string, unknown>()
  for (const [key, value] of Object.entries(record)) {
    map.set(key.toLowerCase(), value)
  }
  return {
    get: (...keys: string[]) => {
      for (const key of keys) {
        const lookupKey = key.toLowerCase()
        if (map.has(lookupKey)) {
          return map.get(lookupKey)
        }
      }
      return undefined
    },
  }
}

export type ExternalCommand =
  | { kind: 'selectRule'; ruleIndex: number | null; ruleId: string | null }
  | { kind: 'testerItems'; items: ExternalTesterArtifact[]; openTester: boolean }

export type ExternalTesterArtifact = {
  Slot?: unknown
  slot?: unknown
  ArtifactType?: unknown
  artifactType?: unknown
  artifacttype?: unknown
  Set?: unknown
  set?: unknown
  ArtifactSet?: unknown
  artifactSet?: unknown
  artifactset?: unknown
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
  mainstatid?: unknown
  MainStatF?: unknown
  mainStatF?: unknown
  mainstatf?: unknown
  MainStat?: unknown
  mainStat?: unknown
  mainstat?: unknown
  Main?: unknown
  main?: unknown
  Substats?: unknown
  substats?: unknown
  SubStats?: unknown
  subStats?: unknown
  substatslist?: unknown
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
  isflat?: unknown
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

const extractSubstats = (lookup: CaseInsensitiveLookup): ExternalTesterSubstat[] => {
  const candidates = [
    lookup.get('substats'),
    lookup.get('sub_stats'),
    lookup.get('substatslist'),
    lookup.get('subvalues'),
  ]
  for (const candidate of candidates) {
    const arr = normalizeSubstatsArray(candidate)
    if (arr.length > 0) return arr
  }
  return []
}

const extractMainTuple = (lookup: CaseInsensitiveLookup): { id: number; flag: number } | null => {
  const directId = toNumber(lookup.get('mainstatid', 'mainstat', 'main'))
  const directFlag = toNumber(lookup.get('mainstatf', 'mainstatflag', 'mainstatflat', 'mainstat_f'))
  if (directId !== null) {
    return { id: directId, flag: directFlag ?? 0 }
  }
  const nested = lookup.get('mainstat', 'main')
  if (isObject(nested)) {
    const nestedLookup = createCaseInsensitiveLookup(nested as UnknownRecord)
    const nestedId = toNumber(nestedLookup.get('id', 'statid'))
    const nestedFlag = toNumber(nestedLookup.get('isflat', 'f', 'flag'))
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
  const lookup = createCaseInsensitiveLookup(raw as UnknownRecord)
  const typeRaw = extractString(lookup.get('type', 'command', 'action'))
  if (!typeRaw) return null
  const type = typeRaw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')

  if (type === 'selectrule' || type === 'select' || type === 'selectconfig' || type === 'selectrow') {
    const ruleIndexValue = lookup.get('ruleindex', 'rowindex', 'index', 'row')
    const ruleIndexNum = toNumber(ruleIndexValue)
    const ruleIndex = ruleIndexNum != null && Number.isFinite(ruleIndexNum) ? Math.max(0, Math.floor(ruleIndexNum)) : null
    const ruleId = extractString(lookup.get('ruleid', 'rulekey', 'ruleidentifier', 'configid'))
    const command: { kind: 'selectRule'; ruleIndex: number | null; ruleId: string | null } = {
      kind: 'selectRule',
      ruleIndex,
      ruleId: ruleId ?? null,
    }
    return command
  }

  if (type === 'testeritems' || type === 'ruletesteritems' || type === 'enqueueitems' || type === 'addruletesteritems') {
    const itemsCandidate = lookup.get('items', 'artifacts', 'payload')
    const items = Array.isArray(itemsCandidate)
      ? (itemsCandidate.filter(isObject) as ExternalTesterArtifact[])
      : []
    if (items.length === 0) return null
    const openTester = toBoolean(lookup.get('opentester', 'opendialog', 'activatetester'))
    const command: { kind: 'testerItems'; items: ExternalTesterArtifact[]; openTester: boolean } = {
      kind: 'testerItems',
      items,
      openTester,
    }
    return command
  }

  return null
}

export function externalArtifactToTestItem(artifact: ExternalTesterArtifact): TestItem | null {
  const lookup = createCaseInsensitiveLookup(artifact as UnknownRecord)

  const slotCandidate = toNumber(lookup.get('slot', 'artifacttype', 'itemslot'))
  if (slotCandidate == null) return null
  const slot = Math.max(0, Math.min(9, Math.floor(slotCandidate)))

  const setCandidate = toNumber(lookup.get('set', 'artifactset', 'setid'))
  if (setCandidate == null) return null
  const set = Math.max(0, Math.floor(setCandidate))

  const rank = coerceRank(lookup.get('rank'))
  const rarity = coerceRarity(lookup.get('rarity'))
  const level = coerceLevel(lookup.get('level'))

  const factionCandidate = toNumber(lookup.get('faction'))
  const normalizedFaction = factionCandidate != null ? Math.max(0, Math.floor(factionCandidate)) : 0
  const isAccessory = slot >= 7 && slot <= 9
  const faction = isAccessory ? normalizedFaction : 0

  const mainTuple = extractMainTuple(lookup)
  const mainVariant = mainTuple ? mainToVariant(mainTuple.id, mainTuple.flag) : mainToVariant(-1, 0)

  const substats = extractSubstats(lookup)
  const subValues: Record<number, number> = {}
  for (const entry of substats) {
    const entryLookup = createCaseInsensitiveLookup(entry as UnknownRecord)
    const subId = toNumber(entryLookup.get('id', 'statid'))
    if (subId == null) continue
    const isFlatSource = entryLookup.get('isflat', 'flat', 'f')
    const flatValue = ((): boolean | number | string | undefined => {
      if (typeof isFlatSource === 'boolean' || typeof isFlatSource === 'number' || typeof isFlatSource === 'string') {
        return isFlatSource
      }
      return undefined
    })()
    const variant = subToVariant(subId, flatValue)
    const valueNum = toNumber(entryLookup.get('value'))
    if (valueNum == null) continue
    subValues[Number(variant)] = Number(valueNum)
  }

  const name = extractString(lookup.get('name'))

  const item: TestItem = {
    slot,
    set,
    rank,
    rarity,
    level,
    faction,
    main: mainVariant,
    ...(Object.keys(subValues).length > 0 ? { subValues } : {}),
    ...(name ? { name } : {}),
  }

  return item
}
