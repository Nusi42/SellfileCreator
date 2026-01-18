import type {
  GearDbArtifactRow,
  GearDbChampionRow,
  GearDbLastUsedRow,
} from './importers/gearDbNormalizer'
import {
  ARTIFACT_COLUMN_KEYS,
  CHAMPION_COLUMN_KEYS,
} from './importers/gearDbSchema'

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
  | { kind: 'gearDbFile'; name: string; base64?: string; downloadPath?: string }
  | { kind: 'gearDbFileBinary'; name: string; bytes: Uint8Array; contentType?: string | null }
  | GearDbRawSnapshotCommand
  | GearDbRawDeltaCommand

// Raw snapshot payload — mirrors what Helper serializes over JSON.
// Snapshot payload typed so downstream callers can reuse the SQL importer without branching.
export type GearDbRawSnapshotCommand = {
  kind: 'gearDbRawSnapshot'
  snapshotId: string | null
  payloadVersion: number | null
  artifacts: GearDbArtifactRow[]
  inboxArtifacts: GearDbArtifactRow[]
  champions: GearDbChampionRow[]
  lastUsed: GearDbLastUsedRow[]
}

export type GearDbRawTable = 'Artifacts' | 'InboxArtifacts' | 'Champs' | 'LastUsed'

export type GearDbRawDeltaOperation =
  | { op: 'upsert'; table: 'Artifacts' | 'InboxArtifacts'; row: GearDbArtifactRow }
  | { op: 'upsert'; table: 'Champs'; row: GearDbChampionRow }
  | { op: 'upsert'; table: 'LastUsed'; row: GearDbLastUsedRow }
  | { op: 'remove'; table: GearDbRawTable; id: number }

// Delta payload that mutates the active snapshot without shipping the DB blob.
export type GearDbRawDeltaCommand = {
  kind: 'gearDbRawDelta'
  snapshotId: string | null
  payloadVersion: number | null
  ops: GearDbRawDeltaOperation[]
}

const isObject = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

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

  // Handle gear DB payloads shipped from Helper or a watcher.
  if (normalized === 'geardbfile' || normalized === 'geardbupdate' || normalized === 'geardbpayload') {
    // Prefer base64 blobs but allow paths/urls for local tools.
    const base64Value = extractString(lookup.get('base64', 'data', 'content', 'payload'))
    // Accept download paths when base64 blobs are not shipped.
    const downloadPath = extractString(lookup.get('downloadpath', 'path', 'url', 'href'))
    // Reject payloads that do not provide any usable DB source.
    if (!base64Value && !downloadPath) return null
    // Use the explicit filename if supplied, otherwise a safe default.
    const nameValue = extractString(lookup.get('filename', 'name')) ?? 'RslHelper.db'
    // Build a normalized command for downstream command handling.
    const command: { kind: 'gearDbFile'; name: string; base64?: string; downloadPath?: string } = {
      kind: 'gearDbFile',
      name: nameValue,
      ...(base64Value ? { base64: base64Value } : {}),
      ...(downloadPath ? { downloadPath } : {}),
    }
    return command
  }

  // Handle full raw DB snapshots that ship table rows directly.
  if (normalized === 'geardbrawsnapshot' || normalized === 'geardbrawdump' || normalized === 'geardbjsonsnapshot') {
    // Snapshot parsing expects object-like payloads with named fields.
    if (!isObject(payload)) return null
    // Reuse the canonical snapshot normalizer for consistency.
    const snapshot = normalizeGearDbRawSnapshot(payloadRecord)
    return snapshot
  }

  // Handle raw DB delta payloads that update an active snapshot.
  if (normalized === 'geardbrawdelta' || normalized === 'geardbjsondelta') {
    // Delta parsing expects object-like payloads with operations.
    if (!isObject(payload)) return null
    // Reuse the canonical delta normalizer for consistency.
    const delta = normalizeGearDbRawDelta(payloadRecord)
    return delta
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

// Snapshot helpers remain permissive (case-insensitive fields) so Helper can
// ship payloads without worrying about exact casing.
const normalizeGearDbRawSnapshot = (raw: UnknownRecord): GearDbRawSnapshotCommand | null => {
  const snapshotId = extractString(raw.snapshotId ?? raw.SnapshotId ?? raw.snapshotID ?? raw.snapshot)
  const payloadVersion = toNumber(raw.payloadVersion ?? raw.PayloadVersion ?? raw.version) ?? null
  const artifacts = parseArtifactArray(raw.artifacts ?? raw.Artifacts)
  const inboxArtifacts = parseArtifactArray(raw.inboxArtifacts ?? raw.InboxArtifacts ?? raw.inbox)
  // Allow snapshots that only carry inbox items as long as at least one table
  // has payloads the tester can render.
  if (artifacts.length === 0 && inboxArtifacts.length === 0) return null
  const champions = parseChampionArray(raw.champions ?? raw.Champions ?? raw.champs)
  const lastUsed = parseLastUsedArray(raw.lastUsed ?? raw.LastUsed ?? raw.lastused)
  return {
    kind: 'gearDbRawSnapshot',
    snapshotId: snapshotId ?? null,
    payloadVersion,
    artifacts,
    inboxArtifacts,
    champions,
    lastUsed,
  }
}

const normalizeGearDbRawDelta = (raw: UnknownRecord): GearDbRawDeltaCommand | null => {
  const snapshotId = extractString(raw.snapshotId ?? raw.SnapshotId ?? raw.snapshotID ?? raw.snapshot)
  const payloadVersion = toNumber(raw.payloadVersion ?? raw.PayloadVersion ?? raw.version) ?? null
  // Accept either camelCase or PascalCase `ops` to match Delphi helper output.
  const opsCandidate = (raw.ops ?? raw.Ops) as unknown
  const opsRaw = Array.isArray(opsCandidate) ? opsCandidate as unknown[] : null
  if (!opsRaw || opsRaw.length === 0) return null
  const ops: GearDbRawDeltaOperation[] = []
  for (const entry of opsRaw) {
    // Each entry gets validated individually so one bad op does not poison the
    // entire payload; helpers simply skip the malformed slots.
    const op = parseDeltaOperation(entry)
    if (!op) continue
    ops.push(op)
  }
  if (ops.length === 0) return null
  return {
    kind: 'gearDbRawDelta',
    snapshotId: snapshotId ?? null,
    payloadVersion,
    ops,
  }
}

const parseDeltaOperation = (raw: unknown): GearDbRawDeltaOperation | null => {
  if (!isObject(raw)) return null
  const opValue = extractString((raw.op ?? raw.operation ?? raw.type) as unknown)
  if (!opValue) return null
  const op = opValue.trim().toLowerCase()
  const tableName = extractString((raw.table ?? raw.Table) as unknown)
  const table = tableName ? canonicalizeTable(tableName) : null
  if (!table) return null
  if (op === 'remove' || op === 'delete') {
    const idValue = toNumber((raw.id ?? raw.ID) as unknown)
    if (!idValue || idValue <= 0) return null
    return { op: 'remove', table, id: idValue }
  }
  if (op !== 'upsert' && op !== 'insert' && op !== 'update') return null
  if (table === 'Artifacts' || table === 'InboxArtifacts') {
    const row = parseArtifactRow(raw.row ?? raw.Row)
    if (!row) return null
    return { op: 'upsert', table, row }
  }
  if (table === 'Champs') {
    const row = parseChampionRow(raw.row ?? raw.Row)
    if (!row) return null
    return { op: 'upsert', table, row }
  }
  if (table === 'LastUsed') {
    const row = parseLastUsedRow(raw.row ?? raw.Row)
    if (!row) return null
    return { op: 'upsert', table, row }
  }
  return null
}

const canonicalizeTable = (value: string): GearDbRawTable | null => {
  const key = value.trim().toLowerCase()
  if (key === 'artifacts') return 'Artifacts'
  if (key === 'inbox' || key === 'inboxartifacts') return 'InboxArtifacts'
  if (key === 'champs' || key === 'champions') return 'Champs'
  if (key === 'lastused' || key === 'lastusedartifacts') return 'LastUsed'
  return null
}

// Parse helper that silently drops malformed rows to keep queue processing robust.
const parseArtifactArray = (value: unknown): GearDbArtifactRow[] => {
  if (!Array.isArray(value)) return []
  const result: GearDbArtifactRow[] = []
  for (const entry of value) {
    const row = parseArtifactRow(entry)
    if (row) result.push(row)
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

const parseArtifactRow = (value: unknown): GearDbArtifactRow | null => {
  if (!isObject(value)) return null
  const row: Partial<GearDbArtifactRow> = {}
  const record = value as UnknownRecord
  const target = row as Record<string, number | null>
  // The schema list doubles as a whitelist so extra helper metadata never leaks in.
  for (const column of ARTIFACT_COLUMN_KEYS) {
    const key = column as string
    const candidate = getValueIgnoreCase(record, key)
    if (candidate === undefined) continue
    // every artifact column is numeric; convert eagerly so downstream logic can
    // treat the payload exactly like SQL rows.
    const normalized = toNumber(candidate)
    target[key] = normalized ?? null
  }
  const id = toNumber(row.ID)
  if (!id || id <= 0) return null
  row.ID = id
  return row as GearDbArtifactRow
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
