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
  | { kind: 'gearDbFileBinary'; name: string; bytes: Uint8Array; contentType?: string | null; playerId?: string | null; playerName?: string | null }
  | GearDbRawSnapshotCommand
  // Separate per-type messages pushed by RSL Helper — the sender streams each
  // collection individually instead of bundling all four in one envelope.
  | GearDbArtifactsCommand
  | GearDbChampionsCommand
  | GearDbInboxArtifactsCommand
  | GearDbLastUsedCommand
  | GearDbEquippedCommand

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
// `playerId`/`playerName` are RSL Helper's optional per-packet identity stamp (protocol
// phase 2) — either half may arrive alone; absent from pre-stamping Helper versions, in
// which case the dispatcher attributes the data to the active SFC account (see
// lib/accounts.ts classifyInboundAccountStamp).
export type GearDbArtifactsCommand = {
  kind: 'gearDbArtifacts'
  artifacts: GearDbArtifactRow[]
  playerId?: string | null
  playerName?: string | null
}
export type GearDbChampionsCommand = {
  kind: 'gearDbChampions'
  champions: GearDbChampionRow[]
  // Inverse of the per-champion artifacts slot map: artifactId → championId.
  // Built from the endpoint's { "1": artifactId, ... } structure so artifact
  // rows can have their cID field populated without a separate equipped-by feed.
  equippedByArtifact: Map<number, number>
  playerId?: string | null
  playerName?: string | null
}
export type GearDbInboxArtifactsCommand = {
  kind: 'gearDbInboxArtifacts'
  inboxArtifacts: GearDbArtifactRow[]
  playerId?: string | null
  playerName?: string | null
}
export type GearDbLastUsedCommand = {
  kind: 'gearDbLastUsed'
  lastUsed: GearDbLastUsedRow[]
  playerId?: string | null
  playerName?: string | null
}
// `ArtifactByHeroID` — the authoritative equip feed. RSL Helper pushes this (with a
// companion `artifacts` packet) on every gear move, while `champions` is only re-sent
// when a *champion* changes. Carrying only the equip mapping, it updates cID without
// touching champion metadata, so a gear move no longer waits for a champions packet.
export type GearDbEquippedCommand = {
  kind: 'gearDbEquipped'
  // Same inverse mapping as the champions command: artifactId → championId.
  equippedByArtifact: Map<number, number>
  playerId?: string | null
  playerName?: string | null
}

// The per-type gear packets RSL Helper streams individually (as opposed to the
// combined binary-DB transport). Each carries one collection that accumulates into a
// synthetic snapshot.
export type GearDbPartCommand =
  | GearDbArtifactsCommand
  | GearDbChampionsCommand
  | GearDbInboxArtifactsCommand
  | GearDbLastUsedCommand
  | GearDbEquippedCommand

// SSOT for "is this one of the streamed per-type gear packets". The accumulator, the
// queue coalescer, the drain loop and the background account-push all gate on this, so
// adding a packet type here wires it into every path at once.
export const isGearDbPartCommand = (cmd: ExternalCommand): cmd is GearDbPartCommand => (
  cmd.kind === 'gearDbArtifacts'
  || cmd.kind === 'gearDbChampions'
  || cmd.kind === 'gearDbInboxArtifacts'
  || cmd.kind === 'gearDbLastUsed'
  || cmd.kind === 'gearDbEquipped'
)

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

/**
 * Resolve the collection a per-type gear event carries. The collection normally lives
 * under a named key (`{ champions: [...] }`) but some senders publish the bare array at
 * the payload root, so the root is used as a fallback **only when the key is genuinely
 * absent** (`undefined`).
 *
 * An explicit `null` value (e.g. `{ champions: null }`, observed from RSL Helper at
 * startup before game data is loaded) is treated as an empty collection — NOT a signal
 * to fall back to the whole payload object. The old `record[key] ?? payload` idiom did
 * the latter, leaking `{ champions: null }` into the row parsers; harmless because they
 * reject non-arrays, but a footgun the moment a parser tolerates objects.
 *
 * SSOT: every per-type branch routes its collection lookup through here.
 */
const resolveEventCollection = (
  record: UnknownRecord,
  payload: unknown,
  ...keys: readonly string[]
): unknown => {
  for (const key of keys) {
    // `in` distinguishes "key present (even if null)" from "key absent".
    if (key in record) {
      const value = record[key]
      // Explicit null → empty collection; do not fall through to the payload root.
      return value === null ? [] : value
    }
  }
  // No named key present at all — the bare array may be the payload itself.
  return payload
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
  // Optional per-packet Player-ID stamp (RSL Helper protocol phase 2). Read once here
  // so every gear branch attaches the same value; null when the Helper doesn't stamp yet.
  const playerId = extractString(lookup.get('playerid'))
  const playerName = extractString(lookup.get('playername'))

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
    const rows = parseArtifactLogArray(resolveEventCollection(payloadRecord, payload, 'artifacts'), null)
    const command: GearDbArtifactsCommand = { kind: 'gearDbArtifacts', artifacts: rows, playerId, playerName }
    return command
  }
  if (normalized === 'champions') {
    // Params key matches the method name: { champions: GearDbChampionRow[] }.
    // Read the raw array once — champion rows carry an `artifacts` slot map that
    // must be inverted before parseChampionRow strips those extra fields.
    const rawArray = resolveEventCollection(payloadRecord, payload, 'champions')
    const equippedByArtifact = buildEquippedByArtifactMap(rawArray)
    const rows = parseChampionArray(rawArray)
    const command: GearDbChampionsCommand = { kind: 'gearDbChampions', champions: rows, equippedByArtifact, playerId, playerName }
    return command
  }
  if (normalized === 'inboxartifacts') {
    // Params carry ArtifactLog-style rows: { inboxArtifacts: ArtifactLog[] }.
    // Mirrors the artifacts branch — same schema change applies to inbox items.
    // Also check lowercase variant for protocol flexibility.
    const rows = parseArtifactLogArray(resolveEventCollection(payloadRecord, payload, 'inboxArtifacts', 'inboxartifacts'), null)
    const command: GearDbInboxArtifactsCommand = { kind: 'gearDbInboxArtifacts', inboxArtifacts: rows, playerId, playerName }
    return command
  }
  if (normalized === 'lastused') {
    // Params key matches the method name: { lastUsed: GearDbLastUsedRow[] }.
    const rows = parseLastUsedArray(resolveEventCollection(payloadRecord, payload, 'lastUsed', 'lastused'))
    const command: GearDbLastUsedCommand = { kind: 'gearDbLastUsed', lastUsed: rows, playerId, playerName }
    return command
  }

  if (normalized === 'artifactbyheroid') {
    // Params key matches the method name: { ArtifactByHeroID: { championId: { slot: artifactId } } }.
    // This is the ONLY equip feed that tracks gear moves: RSL Helper re-sends `champions`
    // just when a champion changes (vault move, level, ascension), whereas moving gear
    // between champions pushes `ArtifactByHeroID` + `artifacts` alone. Consuming it keeps
    // cID correct instead of showing stale equips until the next champions packet.
    const rawMap = resolveEventCollection(payloadRecord, payload, 'ArtifactByHeroID', 'artifactByHeroID')
    const equippedByArtifact = buildEquippedByArtifactFromHeroMap(rawMap)
    const command: GearDbEquippedCommand = { kind: 'gearDbEquipped', equippedByArtifact, playerId, playerName }
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
  // Monotonically increasing counter incremented by RSL Helper whenever any
  // attribute of the artifact changes.  Used for cheap change detection.
  revision?: unknown
  price?: unknown
  level?: unknown
  rankId?: unknown
  kindId?: unknown
  rarityId?: unknown
  setKindId?: unknown
  requiredFraction?: unknown
  rerollsCount?: unknown
  ascendLevel?: unknown
  // True when the player has locked the item in-game (RSL Helper exposes this as readOnly).
  readOnly?: unknown
  primary?: unknown
  secondary?: unknown
  ascend?: unknown
}

// The `inboxArtifacts` notification has two observed shapes. The flat shape is an
// array of ArtifactLog rows (same as `artifacts`). The nested shape — sent when the
// inbox is delivered as mail items — wraps each row inside an inbox-item envelope:
//   { inboxItemId, typeId, isRead, givenTimeTicks, ..., artifacts: [ <ArtifactLog row> ] }
// An inbox-item envelope is recognised by carrying an `artifacts` array while lacking
// a top-level `kindId` (a real artifact row always has `kindId` and never an
// `artifacts` field). Unwrap such envelopes to their nested rows so the nested shape
// parses identically to the flat one — otherwise parseArtifactLogRow rejects the
// envelope (no id/kindId/rankId/rarityId) and the inbox gear is silently dropped.
const isInboxItemEnvelope = (value: unknown): value is { artifacts: unknown[] } => (
  isObject(value)
  && Array.isArray((value as UnknownRecord).artifacts)
  && toNumber((value as UnknownRecord).kindId) === null
)

const parseArtifactLogArray = (
  value: unknown,
  equippedByArtifact: Map<number, number> | null,
): GearDbArtifactRow[] => {
  const parsed = parseJsonLikeValue(value)
  if (!Array.isArray(parsed)) return []
  const rows: GearDbArtifactRow[] = []
  for (const entry of parsed) {
    // Flatten inbox-item envelopes into their nested ArtifactLog rows; pass flat
    // rows through untouched. An envelope may carry zero or several nested rows.
    const candidates = isInboxItemEnvelope(entry) ? entry.artifacts : [entry]
    for (const candidate of candidates) {
      const row = parseArtifactLogRow(candidate, equippedByArtifact)
      if (!row) continue
      rows.push(row)
    }
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
    // Preserve revision so App.tsx can skip deep snapshot clones for unchanged artifacts.
    revision: toNumber(row.revision) ?? null,
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
    // Carry the player-set lock flag; strict equality avoids treating strings as truthy.
    isLocked: row.readOnly === true,
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

// Invert one champion's { slot → artifactId } map into the shared artifact→champion
// accumulator. SSOT for the inversion: both equip feeds (the `champions` slot maps and
// the `ArtifactByHeroID` id-keyed map) carry the identical inner structure, so the
// per-champion step is defined once here and driven by two different outer walkers.
const addEquippedSlotMap = (
  map: Map<number, number>,
  championId: number,
  slotMap: unknown,
): void => {
  // Guard the champion id and the slot container before walking.
  if (!championId || championId <= 0) return
  if (!isObject(slotMap)) return
  // `slotMap` is { "1": artifactId, "2": artifactId, ... } — slot → artifact.
  for (const artifactId of Object.values(slotMap)) {
    const aid = toNumber(artifactId)
    // Skip null/zero — those slots are empty.
    if (!aid || aid <= 0) continue
    map.set(aid, championId)
  }
}

// Build the artifact→champion inverse map from raw champion array entries.
// Each champion carries an `artifacts` object of shape { "1": artifactId, ... }
// (slot number → artifact id). We invert it so artifact rows can look up which
// champion they belong to and fill their cID field.
const buildEquippedByArtifactMap = (value: unknown): Map<number, number> => {
  const map = new Map<number, number>()
  if (!Array.isArray(value)) return map
  for (const entry of value) {
    if (!isObject(entry)) continue
    // Champion id may be `id` (endpoint) or `ID` (SQL dump) — resolve both.
    const rawId = getValueIgnoreCase(entry as UnknownRecord, 'id')
    const championId = toNumber(rawId)
    // Delegate the inner inversion so both equip feeds stay in step.
    addEquippedSlotMap(map, championId ?? 0, (entry as UnknownRecord).artifacts)
  }
  return map
}

// Build the same artifact→champion inverse map from the `ArtifactByHeroID` payload.
// Shape is { championId: { slot: artifactId } } — an object keyed by champion instance
// id (verified against captures: every key matches a `champions[].id`, never a typeId),
// so the outer walk differs from the champions array but the inner inversion is shared.
const buildEquippedByArtifactFromHeroMap = (value: unknown): Map<number, number> => {
  const map = new Map<number, number>()
  if (!isObject(value)) return map
  for (const [rawChampionId, slotMap] of Object.entries(value as UnknownRecord)) {
    // Keys arrive as JSON object strings; coerce to the numeric champion id.
    const championId = toNumber(rawChampionId)
    addEquippedSlotMap(map, championId ?? 0, slotMap)
  }
  return map
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

// Endpoint field aliases for champion rows.
// The JSON endpoint uses camelCase names that differ from the SQL column names;
// each canonical key maps to the alternate names to try when the primary lookup
// returns undefined.
// Maps each SQL column to the alternate names the WebSocket payload may use.
// Only WebSocket-canonical names are listed — `getValueIgnoreCase` already handles
// case folding, so SQL-shaped names like `EmpLvl` don't need their own alias.
// `Rarity`, `Name` and `Affinity` ship under their canonical capitalisation (the latter
// using the SQL encoding: 1=Magic, 2=Force, 3=Spirit, 4=Void) — no alias needed.
// `BGrade` lives at the nested path `doubleAscend.grade` and is extracted by an
// explicit fallback in `parseChampionRow`, so no flat alias is registered here.
const CHAMPION_FIELD_ALIASES: Partial<Record<keyof GearDbChampionRow, readonly string[]>> = {
  HeroID: ['typeId'],        // WS variant/ascension ID
  Vault:  ['inStorage'],     // WS storage flag (boolean → 1/0)
  EmpLvl: ['empower'],       // WS empowerment 0–4
  Rang:   ['grade'],         // WS current star count (NOT doubleAscend.grade)
  Lvl:    ['level'],         // WS champion XP level 1–60
}

// Try the canonical SQL column name first, then any known endpoint aliases.
const resolveChampionField = (
  record: UnknownRecord,
  key: string,
  aliases: readonly string[] | undefined,
): unknown => {
  // Check the canonical casing first (case-insensitive via getValueIgnoreCase).
  const canonical = getValueIgnoreCase(record, key)
  if (canonical !== undefined) return canonical
  // Fall through each alias so endpoint names resolve to the right column.
  if (aliases) {
    for (const alias of aliases) {
      const aliased = getValueIgnoreCase(record, alias)
      if (aliased !== undefined) return aliased
    }
  }
  return undefined
}

const parseChampionRow = (value: unknown): GearDbChampionRow | null => {
  if (!isObject(value)) return null
  const row: Partial<GearDbChampionRow> = {}
  const record = value as UnknownRecord
  const target = row as Record<string, number | string | null>
  // Iterate the canonical column list so unknown keys get ignored automatically.
  for (const column of CHAMPION_COLUMN_KEYS) {
    const key = column as keyof GearDbChampionRow
    // Resolve via canonical name or any registered alias for this field.
    const candidate = resolveChampionField(record, key as string, CHAMPION_FIELD_ALIASES[key])
    if (candidate === undefined) continue
    if (key === 'Name') {
      // Champs.Name stays string-based; numbers get stringified so helper logs
      // or enum IDs still surface in the UI instead of being dropped.
      row.Name = typeof candidate === 'string' ? candidate : (candidate == null ? null : String(candidate))
      continue
    }
    const normalized = toNumber(candidate)
    target[key as string] = normalized ?? null
  }
  const id = toNumber(row.ID)
  if (!id || id <= 0) return null
  row.ID = id
  // Endpoint path: BaseHeroID is absent; derive it from HeroID (typeId alias).
  // HeroID is the variant/ascension ID (e.g. 2066); the base template ID is the
  // nearest lower multiple of 10 (e.g. 2060), shared with the SQL BaseHeroID column.
  if ((row.BaseHeroID == null || row.BaseHeroID <= 0) && row.HeroID != null && row.HeroID > 0) {
    row.BaseHeroID = Math.floor(row.HeroID / 10) * 10
  }
  // Floor BaseHeroID to the nearest multiple of 10 — idempotent on the SQL path
  // (already multiples of 10) and on the value just derived above.
  if (row.BaseHeroID != null && row.BaseHeroID > 0) {
    row.BaseHeroID = Math.floor(row.BaseHeroID / 10) * 10
  }
  // Nested-path fallback for BGrade: when the flat aliases didn't resolve (e.g. live
  // WebSocket payloads never expose a flat field), check `doubleAscend.grade`. SQL
  // dumps and JSON snapshots that already include a flat `BGrade` key keep their value
  // — the flat loop above set `row.BGrade` first, and we only patch when it's still null.
  if (row.BGrade == null) {
    const doubleAscend = getValueIgnoreCase(record, 'doubleAscend')
    if (isObject(doubleAscend)) {
      const nestedGrade = toNumber(getValueIgnoreCase(doubleAscend as UnknownRecord, 'grade'))
      if (nestedGrade != null) row.BGrade = nestedGrade
    }
  }
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
