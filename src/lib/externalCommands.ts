import { mainToVariant, subToVariant } from './types'
import {
  coerceTesterLevel,
  coerceTesterRank,
  coerceTesterRarity,
  normalizeTesterFaction,
  normalizeTesterSetForSlot,
  normalizeTesterSlot,
} from './testerDomain'
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

// rowNumber follows the UI’s 1-based row numbering so HTTP integrations can send
// the same value they show to users.
export type ExternalCommand =
  | { kind: 'selectRule'; rowNumber: number | null }
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
    const rowNumberValue = lookup.get('rownumber', 'row')
    const rowNumberNum = toNumber(rowNumberValue)
    const rowNumber = rowNumberNum != null && Number.isFinite(rowNumberNum)
      ? Math.max(1, Math.floor(rowNumberNum))
      : null
    const command: { kind: 'selectRule'; rowNumber: number | null } = {
      kind: 'selectRule',
      rowNumber,
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

  const slotValue = lookup.get('slot', 'artifacttype', 'itemslot')
  const slot = normalizeTesterSlot(slotValue)
  if (slot == null) return null

  const setValue = lookup.get('set', 'artifactset', 'setid')
  if (setValue == null) return null
  const set = normalizeTesterSetForSlot(slot, setValue)

  const rank = coerceTesterRank(lookup.get('rank'))
  const rarity = coerceTesterRarity(lookup.get('rarity'))
  const level = coerceTesterLevel(lookup.get('level'))

  const faction = normalizeTesterFaction(slot, lookup.get('faction'))

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
