import type {
  GearDbArtifactRow,
  GearDbChampionRow,
  GearDbLastUsedRow,
} from './importers/gearDbNormalizer'
import { CHAMPION_COLUMN_KEYS } from './importers/gearDbSchema'

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

// rowNumber follows the UI's 1-based row numbering so HTTP integrations can send
// the same value they show to users.
export type ExternalCommand =
  | { kind: 'selectRule'; rowNumber: number | null }
  | { kind: 'gearDbFileBinary'; name: string; bytes: Uint8Array; contentType?: string | null }
  | GearDbRawSnapshotCommand
  // Separate per-type messages pushed by RSL Helper — the sender streams each
  // collection individually instead of bundling all four in one envelope.
  | GearDbArtifactsCommand
  | GearDbChampionsCommand
  | GearDbInboxArtifactsCommand
  | GearDbLastUsedCommand

// Internal synthetic snapshot — accumulates per-type parts so downstream helpers
// can process a complete four-table dataset from a single entry point.
export type GearDbRawSnapshotCommand = {
  kind: 'gearDbRawSnapshot'
  snapshotId: string | null
  payloadVersion: number | null
  artifacts: GearDbArtifactRow[]
  inboxArtifacts: GearDbArtifactRow[]
  champions: GearDbChampionRow[]
  lastUsed: GearDbLastUsedRow[]
}

// Individual per-type payloads — each carries exactly one collection so the
// sender can publish them independently rather than in a combined snapshot.
export type GearDbArtifactsCommand = {
  kind: 'gearDbArtifacts'
  artifacts: GearDbArtifactRow[]
}
export type GearDbChampionsCommand = {
  kind: 'gearDbChampions'
  champions: GearDbChampionRow[]
}
export type GearDbInboxArtifactsCommand = {
  kind: 'gearDbInboxArtifacts'
  inboxArtifacts: GearDbArtifactRow[]
}
export type GearDbLastUsedCommand = {
  kind: 'gearDbLastUsed'
  lastUsed: GearDbLastUsedRow[]
}

const isObject = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

// Helper payload dumps can include trailing NUL bytes when read from fixed-size
// buffers. Strip them before attempting JSON parsing.
const stripNullTerminators = (value: string): string => {
  const nulIndex = value.indexOf('\u0000')
  if (nulIndex < 0) return value
  return value.slice(0, nulIndex)
}

// ArtifactLog payloads can arrive as stringified JSON; parse defensively so the
// event parser can treat object and text inputs the same way.
const parseJsonLikeValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = stripNullTerminators(value).trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const extractString = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function normalizeExternalEvent(name: string, payload: unknown): ExternalCommand | null {
  // Trim and normalize the event name so aliases stay consistent.
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  // Reject empty or non-alphanumeric event names immediately.
  if (!normalized) return null
  // Treat non-object payloads as empty to keep lookups safe.
  const payloadRecord = isObject(payload) ? (payload as UnknownRecord) : {}
  // Use a case-insensitive lookup so payload casing stays flexible.
  const lookup = createCaseInsensitiveLookup(payloadRecord)

  // Handle rule selection aliases from Helper and test tooling.
  if (normalized === 'selectrule' || normalized === 'select' || normalized === 'selectconfig' || normalized === 'selectrow') {
    // Accept either `rowNumber` or shorter `row` fields for compatibility.
    const rowNumberValue = lookup.get('rownumber', 'row')
    // Coerce the incoming value so we can validate bounds.
    const rowNumberNum = toNumber(rowNumberValue)
    // Clamp row selection to 1-based integers when valid.
    const rowNumber = rowNumberNum != null && Number.isFinite(rowNumberNum)
      ? Math.max(1, Math.floor(rowNumberNum))
      : null
    // Return a normalized command payload for the UI dispatcher.
    const command: { kind: 'selectRule'; rowNumber: number | null } = {
      kind: 'selectRule',
      rowNumber,
    }
    return command
  }

  // Separate per-type gear messages — each carries a single collection so the
  // sender can publish them individually rather than in one combined snapshot.
  if (normalized === 'artifacts') {
    // Params carry ArtifactLog-style rows: { artifacts: ArtifactLog[] }.
    // The endpoint switched to the ArtifactLog shape (kindId/rankId/rarityId),
    // so we delegate to the ArtifactLog parser instead of the raw DB row parser.
    const rows = parseArtifactLogArray(payloadRecord.artifacts ?? payload, null)
    const command: GearDbArtifactsCommand = { kind: 'gearDbArtifacts', artifacts: rows }
    return command
  }
  if (normalized === 'champions') {
    // Params key matches the method name: { champions: GearDbChampionRow[] }.
    const rows = parseChampionArray(payloadRecord.champions ?? payload)
    const command: GearDbChampionsCommand = { kind: 'gearDbChampions', champions: rows }
    return command
  }
  if (normalized === 'inboxartifacts') {
    // Params carry ArtifactLog-style rows: { inboxArtifacts: ArtifactLog[] }.
    // Mirrors the artifacts branch — same schema change applies to inbox items.
    // Also check lowercase variant for protocol flexibility.
    const rows = parseArtifactLogArray(payloadRecord.inboxArtifacts ?? payloadRecord.inboxartifacts ?? payload, null)
    const command: GearDbInboxArtifactsCommand = { kind: 'gearDbInboxArtifacts', inboxArtifacts: rows }
    return command
  }
  if (normalized === 'lastused') {
    // Params key matches the method name: { lastUsed: GearDbLastUsedRow[] }.
    const rows = parseLastUsedArray(payloadRecord.lastUsed ?? payloadRecord.lastused ?? payload)
    const command: GearDbLastUsedCommand = { kind: 'gearDbLastUsed', lastUsed: rows }
    return command
  }

  // Unknown commands are ignored to keep the parser strict.
  return null
}

export function normalizeExternalCommand(raw: unknown): ExternalCommand | null {
  // Legacy HTTP payloads ship the command name on the root object.
  if (!isObject(raw)) return null
  // Use a case-insensitive lookup to locate the command name.
  const lookup = createCaseInsensitiveLookup(raw as UnknownRecord)
  // Accept the historic field names used by earlier integrations.
  const typeRaw = extractString(lookup.get('type', 'command', 'action'))
  // Ignore payloads without a recognizable command name.
  if (!typeRaw) return null
  // Delegate to the shared event parser to keep behavior aligned.
  return normalizeExternalEvent(typeRaw, raw)
}

type ArtifactLogStatBlock = {
  id?: unknown
  level?: unknown
  isAbsolute?: unknown
  statValue?: unknown
  glyphValue?: unknown
  mValue?: unknown
}

type ArtifactLogRow = {
  id?: unknown
  price?: unknown
  level?: unknown
  rankId?: unknown
  kindId?: unknown
  rarityId?: unknown
  setKindId?: unknown
  requiredFraction?: unknown
  rerollsCount?: unknown
  ascendLevel?: unknown
  primary?: unknown
  secondary?: unknown
  ascend?: unknown
}

const parseArtifactLogArray = (
  value: unknown,
  equippedByArtifact: Map<number, number> | null,
): GearDbArtifactRow[] => {
  const parsed = parseJsonLikeValue(value)
  if (!Array.isArray(parsed)) return []
  const rows: GearDbArtifactRow[] = []
  for (const entry of parsed) {
    const row = parseArtifactLogRow(entry, equippedByArtifact)
    if (!row) continue
    rows.push(row)
  }
  return rows
}

const parseArtifactLogRow = (
  value: unknown,
  equippedByArtifact: Map<number, number> | null,
): GearDbArtifactRow | null => {
  const parsed = parseJsonLikeValue(value)
  if (!isObject(parsed)) return null
  const row = parsed as ArtifactLogRow
  const id = toNumber(row.id)
  const slot = toNumber(row.kindId)
  const rank = toNumber(row.rankId)
  const rarity = toNumber(row.rarityId)
  if (!id || id <= 0 || !slot || slot <= 0 || !rank || rank <= 0 || !rarity || rarity <= 0) return null
  const primaryRaw = parseJsonLikeValue(row.primary)
  const primary = isObject(primaryRaw) ? primaryRaw as ArtifactLogStatBlock : {}
  const secondaryRaw = parseJsonLikeValue(row.secondary)
  const secondary = Array.isArray(secondaryRaw) ? secondaryRaw as ArtifactLogStatBlock[] : []
  const ascendRaw = parseJsonLikeValue(row.ascend)
  const ascend = isObject(ascendRaw) ? ascendRaw as ArtifactLogStatBlock : null
  // The adapter fills the SQL-like row shape expected by downstream helpers.
  const result: GearDbArtifactRow = {
    ID: id,
    price: toNumber(row.price) ?? 0,
    rank,
    type: slot,
    lvl: toNumber(row.level) ?? 0,
    mid: toNumber(primary.id) ?? 0,
    mlvl: toNumber(primary.level) ?? 0,
    mfl: toNumber(primary.isAbsolute) ?? 0,
    mlvlid: toNumber(primary.statValue) ?? 0,
    mgv: toNumber(primary.glyphValue) ?? 0,
    rarity,
    aset: toNumber(row.setKindId) ?? 0,
    accset: toNumber(row.requiredFraction) ?? 0,
    ss: 0,
    cID: equippedByArtifact?.get(id) ?? 0,
    sumHP: 0,
    sumATK: 0,
    sumDEF: 0,
    sumSPD: 0,
    sumCQuote: 0,
    sumCDMG: 0,
    sumRES: 0,
    sumACC: 0,
    ASCID: toNumber(ascend?.id) ?? 0,
    ASCLVL: toNumber(ascend?.level) ?? 0,
    ASCFL: toNumber(ascend?.isAbsolute) ?? 0,
    ASCLVLID: toNumber(ascend?.statValue) ?? 0,
    ASCGV: toNumber(ascend?.glyphValue) ?? 0,
    ASCLEVEL: toNumber(row.ascendLevel) ?? 0,
    REROLLCOUNT: toNumber(row.rerollsCount) ?? 0,
  }
  // Flatten up to four substats into the canonical SQL-ish columns.
  for (let index = 0; index < 4; index += 1) {
    const stat = secondary[index]
    const suffix = index + 1
    const idKey = `s${suffix}id` as keyof GearDbArtifactRow
    const levelKey = `s${suffix}lvl` as keyof GearDbArtifactRow
    const flatKey = `s${suffix}fl` as keyof GearDbArtifactRow
    const baseKey = `s${suffix}lvlid` as keyof GearDbArtifactRow
    const glyphKey = `s${suffix}gv` as keyof GearDbArtifactRow
    const mythKey = `s${suffix}mlvlid` as keyof GearDbArtifactRow
    const target = result as Record<string, number | null>
    target[idKey] = toNumber(stat?.id) ?? 0
    target[levelKey] = toNumber(stat?.level) ?? 0
    target[flatKey] = toNumber(stat?.isAbsolute) ?? 0
    target[baseKey] = toNumber(stat?.statValue) ?? 0
    target[glyphKey] = toNumber(stat?.glyphValue) ?? 0
    target[mythKey] = toNumber(stat?.mValue) ?? 0
  }
  return result
}

const parseChampionArray = (value: unknown): GearDbChampionRow[] => {
  if (!Array.isArray(value)) return []
  const result: GearDbChampionRow[] = []
  for (const entry of value) {
    const row = parseChampionRow(entry)
    if (row) result.push(row)
  }
  return result
}

const parseLastUsedArray = (value: unknown): GearDbLastUsedRow[] => {
  if (!Array.isArray(value)) return []
  const result: GearDbLastUsedRow[] = []
  for (const entry of value) {
    const row = parseLastUsedRow(entry)
    if (row) result.push(row)
  }
  return result
}

const parseChampionRow = (value: unknown): GearDbChampionRow | null => {
  if (!isObject(value)) return null
  const row: Partial<GearDbChampionRow> = {}
  const record = value as UnknownRecord
  const target = row as Record<string, number | string | null>
  // Iterate the canonical column list so unknown keys get ignored automatically.
  for (const column of CHAMPION_COLUMN_KEYS) {
    const key = column as string
    const candidate = getValueIgnoreCase(record, key)
    if (candidate === undefined) continue
    if (key === 'Name') {
      // Champs.Name stays string-based; numbers get stringified so helper logs
      // or enum IDs still surface in the UI instead of being dropped.
      row.Name = typeof candidate === 'string' ? candidate : (candidate == null ? null : String(candidate))
      continue
    }
    const normalized = toNumber(candidate)
    target[key] = normalized ?? null
  }
  const id = toNumber(row.ID)
  if (!id || id <= 0) return null
  row.ID = id
  return row as GearDbChampionRow
}

const parseLastUsedRow = (value: unknown): GearDbLastUsedRow | null => {
  if (!isObject(value)) return null
  const record = value as UnknownRecord
  // Support both `id` and `ID` because helper dumps mix casing between tables.
  const idCandidate = getValueIgnoreCase(record, 'id') ?? getValueIgnoreCase(record, 'ID')
  const id = toNumber(idCandidate)
  if (!id || id <= 0) return null
  const lastUseValue = (() => {
    const candidate = getValueIgnoreCase(record, 'lastUse') ?? getValueIgnoreCase(record, 'lastuse')
    if (candidate === undefined || candidate === null) return null
    // Accept strings or Julian-day numbers; conversion to timestamps happens in
    // the lookup helper so we keep this layer schema-agnostic.
    if (typeof candidate === 'string' || typeof candidate === 'number') return candidate
    if (typeof candidate === 'bigint') return Number(candidate)
    return null
  })()
  return { id, lastUse: lastUseValue }
}

const getValueIgnoreCase = (record: UnknownRecord, target: string): unknown => {
  const lower = target.toLowerCase()
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) return record[key]
  }
  return undefined
}
