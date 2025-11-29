import initSqlJs, { type SqlJsStatic, type Database } from 'sql.js'
import {
  normalizeGearDbArtifact,
  type GearDbArtifactRow,
  type GearDbChampionRow,
  type NormalizedGearArtifact,
  type ChampionLookupRecord,
  UnsupportedGearDbRowError,
} from './gearDbNormalizer'

const ARTIFACT_COLUMN_KEYS: readonly (keyof GearDbArtifactRow)[] = [
  'ID',
  'price',
  'rank',
  'type',
  'lvl',
  'mid',
  'mlvl',
  'mfl',
  'mlvlid',
  'mgv',
  's1id',
  's1lvl',
  's1fl',
  's1lvlid',
  's1gv',
  's2id',
  's2lvl',
  's2fl',
  's2lvlid',
  's2gv',
  's3id',
  's3lvl',
  's3fl',
  's3lvlid',
  's3gv',
  's4id',
  's4lvl',
  's4fl',
  's4lvlid',
  's4gv',
  'rarity',
  'aset',
  'accset',
  'ss',
  'cID',
  's1mlvlid',
  's2mlvlid',
  's3mlvlid',
  's4mlvlid',
  'sumHP',
  'sumATK',
  'sumDEF',
  'sumSPD',
  'sumCQuote',
  'sumCDMG',
  'sumRES',
  'sumACC',
  'ASCID',
  'ASCLVL',
  'ASCFL',
  'ASCLVLID',
  'ASCGV',
  'ASCLEVEL',
  'REROLLCOUNT',
] as const

const CHAMPION_COLUMN_KEYS: readonly (keyof GearDbChampionRow)[] = [
  'ID',
  'Name',
  'Vault',
  'RVault',
  'BaseHeroID',
] as const

type ChampionLookup = Map<number, ChampionLookupRecord>
type LastUsedLookup = Map<number, string>

type SqlJsInstance = SqlJsStatic

let sqlJsPromise: Promise<SqlJsInstance> | null = null
let wasmLocationPromise: Promise<string> | null = null
let browserWasmUrlPromise: Promise<string> | null = null
let wasmBinaryPromise: Promise<Uint8Array> | null = null

const INLINE_WASM_DATA_URI: string | undefined = typeof __SQL_JS_WASM_INLINE__ !== 'undefined'
  ? __SQL_JS_WASM_INLINE__
  : undefined

async function resolveBrowserWasmUrl(): Promise<string> {
  if (!browserWasmUrlPromise) {
    browserWasmUrlPromise = (async () => {
      if (INLINE_WASM_DATA_URI) return INLINE_WASM_DATA_URI
      try {
        const mod = await import('sql.js/dist/sql-wasm.wasm?inline')
        return mod.default
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Failed to load SQL.js WASM bundle (${message})`)
      }
    })()
  }
  return browserWasmUrlPromise
}

async function resolveSqlWasmLocation(): Promise<string> {
  if (!wasmLocationPromise) {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      wasmLocationPromise = resolveBrowserWasmUrl()
    } else {
      const url = new URL(
        /* @vite-ignore */ '../../../../../node_modules/sql.js/dist/sql-wasm.wasm',
        import.meta.url,
      )
      const location = normalizeFileUrlPath(url)
      wasmLocationPromise = Promise.resolve(location)
    }
  }
  return wasmLocationPromise
}

async function resolveBrowserWasmBinary(): Promise<Uint8Array> {
  if (!wasmBinaryPromise) {
    wasmBinaryPromise = (async () => {
      const wasmUrl = await resolveBrowserWasmUrl()
      if (isDataUrl(wasmUrl)) {
        return decodeInlineDataUrl(wasmUrl)
      }
      if (typeof fetch !== 'function') {
        throw new Error('Cannot load SQL.js WASM: fetch is unavailable in this environment.')
      }
      const response = await fetch(wasmUrl)
      if (!response.ok) {
        throw new Error(`Failed to load SQL.js WASM (${response.status} ${response.statusText})`)
      }
      const buffer = await response.arrayBuffer()
      return new Uint8Array(buffer)
    })()
  }
  return wasmBinaryPromise
}

function normalizeFileUrlPath(url: URL): string {
  if (url.protocol !== 'file:') return url.toString()
  let pathname = decodeURIComponent(url.pathname)
  if (/^\/[a-zA-Z]:/.test(pathname)) {
    pathname = pathname.slice(1)
  }
  if (/^[a-zA-Z]:\//.test(pathname)) {
    pathname = pathname.replace(/\//g, '\\')
  }
  return pathname
}

async function loadSqlJs(): Promise<SqlJsInstance> {
  if (!sqlJsPromise) {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const wasmBinary = await resolveBrowserWasmBinary()
      sqlJsPromise = initSqlJs({ wasmBinary })
    } else {
      const locate = await resolveSqlWasmLocation()
      sqlJsPromise = initSqlJs({
        locateFile: () => locate,
      })
    }
  }
  return sqlJsPromise
}

const CHUNK_YIELD_COUNT = 250

export type GearDbImportResult = {
  artifacts: NormalizedGearArtifact[]
  inboxArtifacts: NormalizedGearArtifact[]
}

export type GearDbImportOptions = {
  onProgress?: (processed: number, total: number, table: 'artifacts' | 'inbox') => void
}

export async function importGearDatabaseFromFile(file: File, options?: GearDbImportOptions): Promise<GearDbImportResult> {
  const buffer = await file.arrayBuffer()
  return importGearDatabaseFromArrayBuffer(buffer, options)
}

export async function importGearDatabaseFromArrayBuffer(buffer: ArrayBufferLike, options?: GearDbImportOptions): Promise<GearDbImportResult> {
  const SQL = await loadSqlJs()
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let db: Database | null = null
  try {
    db = new SQL.Database(bytes)
    const champions = tableExists(db, 'Champs')
      ? readChampions(db)
      : new Map<number, ChampionLookupRecord>()
    const lastUsed = tableExists(db, 'LastUsedArtifacts')
      ? readLastUsedArtifacts(db)
      : new Map<number, string>()
    const artifacts = await readTable(db, 'Artifacts', 'artifacts', champions, lastUsed, options)
    const inboxArtifacts = tableExists(db, 'InboxArtifacts')
      ? await readTable(db, 'InboxArtifacts', 'inbox', champions, lastUsed, options)
      : []
    return { artifacts, inboxArtifacts }
  } finally {
    try { db?.close() } catch {}
  }
}

function tableExists(db: Database, name: string): boolean {
  const safeName = name.replace(/'/g, "''")
  const statement = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '${safeName}' LIMIT 1`,
  )
  try {
    return statement.step()
  } catch {
    return false
  } finally {
    statement.free()
  }
}

function readChampions(db: Database): ChampionLookup {
  const map: ChampionLookup = new Map()
  if (!tableExists(db, 'Champs')) return map
  const stmt = db.prepare('SELECT ID, Name, Vault, RVault, BaseHeroID FROM Champs')
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      const converted = convertChampionRow(row)
      const id = Number(converted.ID)
      if (!Number.isFinite(id) || id <= 0) continue
      const name = typeof converted.Name === 'string' ? converted.Name.trim() : null
      const baseHeroIdRaw = converted.BaseHeroID == null ? null : Number(converted.BaseHeroID)
      const baseHeroId = (baseHeroIdRaw != null && Number.isFinite(baseHeroIdRaw) && baseHeroIdRaw > 0) ? baseHeroIdRaw : null
      map.set(id, {
        id,
        name: name && name.length > 0 ? name : null,
        vault: Boolean(Number(converted.Vault ?? 0)),
        reserveVault: Boolean(Number(converted.RVault ?? 0)),
        baseHeroId,
      })
    }
  } finally {
    stmt.free()
  }
  return map
}

const getRowValueIgnoreCase = (row: Record<string, unknown>, target: string): unknown => {
  const lower = target.toLowerCase()
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower) return row[key]
  }
  return undefined
}

// SQL.js mirrors SQLite's typing rules, so REAL date columns surface as Julian
// day floats when Helper stores timestamps as REAL.
const SQLITE_JULIAN_UNIX_EPOCH = 2440587.5
const MS_PER_DAY = 24 * 60 * 60 * 1000
const JULIAN_MIN = 1_700_000
const JULIAN_MAX = 3_000_000

const padNumber = (value: number, size: number): string => {
  // Preserve leading zeros for calendar fields (hours, minutes, etc.).
  return `${Math.abs(value)}`.padStart(size, '0')
}

const formatDateAsLocalTimestamp = (date: Date): string | null => {
  // Format the JS Date into the `YYYY-MM-DD HH:MM:SS.mmm` string our UI/tooltips
  // already expect so downstream logic stays string-based.
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = padNumber(date.getMonth() + 1, 2)
  const day = padNumber(date.getDate(), 2)
  const hours = padNumber(date.getHours(), 2)
  const minutes = padNumber(date.getMinutes(), 2)
  const seconds = padNumber(date.getSeconds(), 2)
  const millis = padNumber(date.getMilliseconds(), 3)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`
}

const fromJulianDay = (value: number): string | null => {
  // SQL.js exposes raw REAL payloads (Julian days) for DATE/TIME columns when
  // tables store floats instead of strings. Convert those numbers back to local
  // timestamps so downstream filters still get the human-readable payload.
  if (value < JULIAN_MIN || value > JULIAN_MAX) return null
  const msSinceEpoch = (value - SQLITE_JULIAN_UNIX_EPOCH) * MS_PER_DAY
  if (!Number.isFinite(msSinceEpoch)) return null
  return formatDateAsLocalTimestamp(new Date(msSinceEpoch))
}

const coerceLastUseValue = (value: unknown): string | null => {
  // Accept textual timestamps or Julian-day REAL payloads.
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  const numeric = typeof value === 'bigint' ? Number(value) : value
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return null
  return fromJulianDay(numeric)
}

// LastUsedArtifacts stores `{ id, lastUse }` rows with local timestamps so we
// can annotate tester entries with “last equipped” metadata.
function readLastUsedArtifacts(db: Database): LastUsedLookup {
  const map: LastUsedLookup = new Map()
  if (!tableExists(db, 'LastUsedArtifacts')) return map
  const stmt = db.prepare('SELECT id, lastUse FROM LastUsedArtifacts')
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      const idValue = getRowValueIgnoreCase(row, 'id')
      const tsValue = getRowValueIgnoreCase(row, 'lastUse')
      const idNumber = typeof idValue === 'number' ? idValue : Number(idValue)
      if (!Number.isFinite(idNumber) || idNumber <= 0) continue
      const timestamp = coerceLastUseValue(tsValue)
      if (!timestamp) continue
      map.set(idNumber, timestamp)
    }
  } finally {
    stmt.free()
  }
  return map
}

function isDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

function decodeInlineDataUrl(dataUrl: string): Uint8Array {
  const base64Index = dataUrl.indexOf('base64,')
  if (base64Index === -1) {
    throw new Error('Unsupported SQL.js WASM data URL format.')
  }
  const base64Content = dataUrl.slice(base64Index + 'base64,'.length)
  return base64ToBytes(base64Content)
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  const globalBuffer = (globalThis as { Buffer?: { from(input: string, encoding: string): Uint8Array } }).Buffer
  if (globalBuffer) {
    return globalBuffer.from(base64, 'base64')
  }
  throw new Error('No base64 decoder is available to load SQL.js WASM.')
}

async function readTable(
  db: Database,
  tableName: string,
  source: 'artifacts' | 'inbox',
  champions: ChampionLookup,
  lastUsed: LastUsedLookup,
  options?: GearDbImportOptions,
): Promise<NormalizedGearArtifact[]> {
  const total = countRows(db, tableName)
  const items: NormalizedGearArtifact[] = []
  const stmt = db.prepare(`SELECT * FROM ${tableName}`)
  let processed = 0
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      const typedRow = convertRow(row)
      const artifactId = Number(typedRow.ID)
      // Helper dumps inject sentinel rows (ID <= 0) for internal metadata; drop them upfront.
      if (!Number.isFinite(artifactId) || artifactId <= 0) continue
      typedRow.ID = artifactId
      const lastUseValue = lastUsed.get(artifactId) ?? null
      try {
        items.push(normalizeGearDbArtifact(typedRow, {
          source,
          championLookup: champions,
          lastUseLocalTimestamp: lastUseValue,
        }))
      } catch (err) {
        if (err instanceof UnsupportedGearDbRowError) {
          // Unknown slot/type also indicates helper metadata, so skip without failing the import.
          continue
        }
        throw err
      }
      processed += 1
      if (processed % CHUNK_YIELD_COUNT === 0) {
        options?.onProgress?.(processed, total, source)
        await tick()
      }
    }
  } finally {
    stmt.free()
  }
  options?.onProgress?.(processed, total, source)
  return items
}

function convertRow(row: Record<string, unknown>): GearDbArtifactRow {
  const result: Partial<GearDbArtifactRow> = {}
  const target = result as Record<string, number | null>
  for (const key of ARTIFACT_COLUMN_KEYS) {
    const value = row[key as string]
    if (typeof value === 'number') {
      target[key as string] = value
    } else if (value == null) {
      target[key as string] = null
    } else if (typeof value === 'bigint') {
      target[key as string] = Number(value)
    } else if (typeof value === 'string') {
      const trimmed = value.trim()
      target[key as string] = trimmed === '' ? null : Number(trimmed)
    } else {
      target[key as string] = null
    }
  }
  return result as GearDbArtifactRow
}

function convertChampionRow(row: Record<string, unknown>): GearDbChampionRow {
  const result: Partial<GearDbChampionRow> = {}
  const target = result as Record<string, number | string | null>
  for (const key of CHAMPION_COLUMN_KEYS) {
    const value = row[key as string]
    if (typeof value === 'number') {
      target[key as string] = value
    } else if (value == null) {
      target[key as string] = null
    } else if (typeof value === 'bigint') {
      target[key as string] = Number(value)
    } else if (typeof value === 'string') {
      target[key as string] = value
    } else {
      target[key as string] = null
    }
  }
  return result as GearDbChampionRow
}

function countRows(db: Database, table: string): number {
  try {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${table}`)
    try {
      if (stmt.step()) {
        const value = stmt.getAsObject() as Record<string, unknown>
        const count = value.count
        if (typeof count === 'number') return count
        if (typeof count === 'bigint') return Number(count)
        if (typeof count === 'string') return Number(count)
      }
    } finally {
      stmt.free()
    }
  } catch {
    // fall back to manual iteration when count fails (e.g., missing table)
  }
  const stmt = db.prepare(`SELECT rowid FROM ${table}`)
  let result = 0
  try {
    while (stmt.step()) result += 1
  } finally {
    stmt.free()
  }
  return result
}

function tick(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}
