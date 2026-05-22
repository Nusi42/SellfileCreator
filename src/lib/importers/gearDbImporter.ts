import initSqlJs, { type SqlJsStatic, type Database } from 'sql.js'
import {
  normalizeGearDbArtifact,
  type GearDbArtifactRow,
  type GearDbChampionRow,
  type GearDbLastUsedRow,
  type NormalizedGearArtifact,
  UnsupportedGearDbRowError,
} from './gearDbNormalizer'
import {
  CHAMPION_COLUMN_KEYS,
  ARTIFACT_COLUMN_KEYS,
} from './gearDbSchema'
import {
  createChampionLookup,
  createLastUsedLookup,
  type ChampionLookup,
  type LastUsedLookup,
} from './gearDbLookups'

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
        throw new Error(`Failed to load SQL.js WASM bundle (${message})`, { cause: err })
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
      // Prefer cwd-based resolution so compiled tests still reach repo node_modules.
      const cwdLocation = resolveNodeWasmFromCwd()
      if (cwdLocation) {
        wasmLocationPromise = Promise.resolve(cwdLocation)
      } else {
        const url = new URL(
          /* @vite-ignore */ '../../../../../node_modules/sql.js/dist/sql-wasm.wasm',
          import.meta.url,
        )
        const location = normalizeFileUrlPath(url)
        wasmLocationPromise = Promise.resolve(location)
      }
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

function resolveNodeWasmFromCwd(): string | null {
  // Use globalThis to avoid Node-only type declarations in browser builds.
  if (typeof globalThis === 'undefined' || !('process' in globalThis)) return null
  const maybeProcess = (globalThis as { process?: { cwd?: () => string } }).process
  const cwd = maybeProcess?.cwd?.()
  if (!cwd) return null
  // Build a file URL so Windows paths normalize via normalizeFileUrlPath.
  const cwdUrl = new URL(`file://${cwd.replace(/\\/g, '/')}/`)
  const wasmUrl = new URL('node_modules/sql.js/dist/sql-wasm.wasm', cwdUrl)
  return normalizeFileUrlPath(wasmUrl)
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
    // Eagerly mirror both lookup tables so snapshot/delta JSON shares the same path.
    const champions = readChampions(db)
    const lastUsed = readLastUsedArtifacts(db)
    const artifacts = await readTable(db, 'Artifacts', 'artifacts', champions, lastUsed, options)
    const inboxArtifacts = tableExists(db, 'InboxArtifacts')
      ? await readTable(db, 'InboxArtifacts', 'inbox', champions, lastUsed, options)
      : []
    return { artifacts, inboxArtifacts }
  } finally {
    // db.close() calls sqlite3_close_v2 + FS.unlink to free SQLite's internal pages
    // and the emscripten file backing.  The WASM linear memory itself does not shrink.
    try { db?.close() } catch {}
    // Release the module-level sql.js instance so its WASM linear memory (~200 MB for a
    // 68 MB database) becomes GC-eligible.  dlmalloc fragmentation inside the emscripten
    // heap means freed SQLite pages cannot always be reused for the next import, causing
    // memory.grow on every call and permanent linear-memory growth across rapid imports.
    // Dropping the reference lets Chrome GC the old WASM instance during the settle wait
    // (30+ s) before the next import allocates a fresh, unfragmented module.
    // wasmBinaryPromise is kept so the compiled module binary is not re-fetched.
    sqlJsPromise = null
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
  if (!tableExists(db, 'Champs')) return createChampionLookup([])
  const rows: GearDbChampionRow[] = []
  // HeroID − BaseHeroID encodes the champion's ascension level (0–6); amulet unlocks at 5, banner at 6.
  const stmt = db.prepare('SELECT ID, HeroID, Name, Vault, RVault, BaseHeroID, Rarity, EmpLvl, Affinity, BGrade, Rang, Lvl FROM Champs')
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      rows.push(convertChampionRow(row))
    }
  } finally {
    stmt.free()
  }
  return createChampionLookup(rows)
}

const getRowValueIgnoreCase = (row: Record<string, unknown>, target: string): unknown => {
  const lower = target.toLowerCase()
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower) return row[key]
  }
  return undefined
}

// LastUsedArtifacts stores `{ id, lastUse }` rows with local timestamps so we
// can annotate Gear Inspector entries with “last equipped” metadata.
function readLastUsedArtifacts(db: Database): LastUsedLookup {
  if (!tableExists(db, 'LastUsedArtifacts')) return createLastUsedLookup([])
  const rows: GearDbLastUsedRow[] = []
  const stmt = db.prepare('SELECT id, lastUse FROM LastUsedArtifacts')
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      const idValue = getRowValueIgnoreCase(row, 'id')
      const tsValue = getRowValueIgnoreCase(row, 'lastUse')
      const idNumber = typeof idValue === 'number' ? idValue : Number(idValue)
      if (!Number.isFinite(idNumber) || idNumber <= 0) continue
      const normalizedTimestamp = (() => {
        if (typeof tsValue === 'string') return tsValue
        if (typeof tsValue === 'number') return tsValue
        if (typeof tsValue === 'bigint') return Number(tsValue)
        return null
      })()
      // Store a trimmed union shape; conversion into Gear Inspector timestamps happens
      // inside `gearDbTime` so both SQL + JSON flows share the same formatting.
      rows.push({ id: idNumber, lastUse: normalizedTimestamp })
    }
  } finally {
    stmt.free()
  }
  return createLastUsedLookup(rows)
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
