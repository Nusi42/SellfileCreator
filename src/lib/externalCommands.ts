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

  // Accept endpoint payloads shaped like ArtifactLog.json and convert them to
  // the existing raw snapshot command path used by the app today.
  if (
    normalized === 'artifactlog'
    || normalized === 'artifactlogsnapshot'
    || normalized === 'artifactsnapshot'
    || normalized === 'artifactdump'
  ) {
    const snapshot = normalizeArtifactLogSnapshot(payload, 'artifacts')
    return snapshot
  }

  // Inbox payloads mirror ArtifactLog structure but map to the inbox table.
  if (normalized === 'inboxartifactlog' || normalized === 'inboxartifacts') {
    const snapshot = normalizeArtifactLogSnapshot(payload, 'inbox')
    return snapshot
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
  // has payloads the Gear Inspector can render.
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

const normalizeArtifactLogSnapshot = (
  payload: unknown,
  defaultSource: 'artifacts' | 'inbox',
): GearDbRawSnapshotCommand | null => {
  // Parse JSON text payloads first so helper integrations can forward log
  // files directly without pre-decoding.
  const parsedPayload = parseJsonLikeValue(payload)
  // Array payloads represent one flat artifact list.
  if (Array.isArray(parsedPayload)) {
    const rows = parseArtifactLogArray(parsedPayload, null)
    if (rows.length === 0) return null
    return {
      kind: 'gearDbRawSnapshot',
      snapshotId: null,
      payloadVersion: 1,
      artifacts: defaultSource === 'artifacts' ? rows : [],
      inboxArtifacts: defaultSource === 'inbox' ? rows : [],
      champions: [],
      lastUsed: [],
    }
  }
  // Object payloads can bundle artifact log + hero map + inferred inbox log.
  if (!isObject(parsedPayload)) return null
  const record = parsedPayload as UnknownRecord
  // Some endpoints emit artifact and inbox arrays under different aliases.
  const artifactLogRaw = (
    record.artifactLog
    ?? record.ArtifactLog
    ?? record.artifacts
    ?? record.Artifacts
    ?? record.payload
    ?? record.data
  ) as unknown
  const inboxLogRaw = (
    record.inboxArtifactLog
    ?? record.InboxArtifactLog
    ?? record.inboxArtifacts
    ?? record.InboxArtifacts
    ?? record.inbox
  ) as unknown
  const heroMapRaw = (
    record.artifactByHeroIDLog
    ?? record.ArtifactByHeroIDLog
    ?? record.artifactByHeroIdLog
    ?? record.ArtifactByHeroIdLog
    ?? record.byHero
    ?? record.byHeroId
  ) as unknown
  const equippedByArtifact = parseArtifactByHeroMap(heroMapRaw)
  const artifacts = parseArtifactLogArray(artifactLogRaw, equippedByArtifact)
  const inboxArtifacts = parseArtifactLogArray(inboxLogRaw, null)
  // Default-source mode keeps single-array envelopes deterministic.
  if (artifacts.length === 0 && inboxArtifacts.length === 0) {
    const fallbackRows = parseArtifactLogArray(record, defaultSource === 'artifacts' ? equippedByArtifact : null)
    if (fallbackRows.length === 0) return null
    return {
      kind: 'gearDbRawSnapshot',
      snapshotId: extractString(record.snapshotId ?? record.SnapshotId ?? record.snapshot) ?? null,
      payloadVersion: toNumber(record.payloadVersion ?? record.PayloadVersion ?? record.version) ?? 1,
      artifacts: defaultSource === 'artifacts' ? fallbackRows : [],
      inboxArtifacts: defaultSource === 'inbox' ? fallbackRows : [],
      champions: parseChampionArray(record.champions ?? record.Champions ?? []),
      lastUsed: parseLastUsedArray(record.lastUsed ?? record.LastUsed ?? []),
    }
  }
  return {
    kind: 'gearDbRawSnapshot',
    snapshotId: extractString(record.snapshotId ?? record.SnapshotId ?? record.snapshot) ?? null,
    payloadVersion: toNumber(record.payloadVersion ?? record.PayloadVersion ?? record.version) ?? 1,
    artifacts: defaultSource === 'artifacts' ? artifacts : [],
    inboxArtifacts: defaultSource === 'inbox' ? (inboxArtifacts.length > 0 ? inboxArtifacts : artifacts) : inboxArtifacts,
    champions: parseChampionArray(record.champions ?? record.Champions ?? []),
    lastUsed: parseLastUsedArray(record.lastUsed ?? record.LastUsed ?? []),
  }
}

const parseArtifactByHeroMap = (value: unknown): Map<number, number> | null => {
  const parsed = parseJsonLikeValue(value)
  if (!isObject(parsed)) return null
  const byArtifactId = new Map<number, number>()
  const heroes = parsed as UnknownRecord
  // ArtifactByHeroIDLog uses hero-id keys and per-slot artifact id values.
  for (const [heroIdRaw, slotsRaw] of Object.entries(heroes)) {
    const heroId = toNumber(heroIdRaw)
    if (!heroId || heroId <= 0) continue
    const slots = parseJsonLikeValue(slotsRaw)
    if (!isObject(slots)) continue
    for (const artifactIdRaw of Object.values(slots as UnknownRecord)) {
      const artifactId = toNumber(artifactIdRaw)
      if (!artifactId || artifactId <= 0) continue
      // First-writer wins to keep assignment stable if duplicates appear.
      if (!byArtifactId.has(artifactId)) byArtifactId.set(artifactId, heroId)
    }
  }
  return byArtifactId.size > 0 ? byArtifactId : null
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
