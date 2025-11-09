import initSqlJs, { type SqlJsStatic, type Database } from 'sql.js'
import {
  normalizeGearDbArtifact,
  type GearDbArtifactRow,
  type GearDbChampionRow,
  type NormalizedGearArtifact,
  type ChampionLookupRecord,
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
] as const

type ChampionLookup = Map<number, ChampionLookupRecord>

type SqlJsInstance = SqlJsStatic

let sqlJsPromise: Promise<SqlJsInstance> | null = null
let wasmLocationPromise: Promise<string> | null = null
let browserWasmUrlPromise: Promise<string> | null = null

async function resolveBrowserWasmUrl(): Promise<string> {
  if (!browserWasmUrlPromise) {
    browserWasmUrlPromise = import('sql.js/dist/sql-wasm.wasm?url').then((mod) => mod.default)
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
    const locate = await resolveSqlWasmLocation()
    sqlJsPromise = initSqlJs({
      locateFile: () => locate,
    })
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
    const artifacts = await readTable(db, 'Artifacts', 'artifacts', champions, options)
    const inboxArtifacts = tableExists(db, 'InboxArtifacts')
      ? await readTable(db, 'InboxArtifacts', 'inbox', champions, options)
      : []
    return { artifacts, inboxArtifacts }
  } finally {
    try { db?.close() } catch {}
  }
}

function tableExists(db: Database, name: string): boolean {
  const statement = db.prepare(
    'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1',
  )
  try {
    const match = statement.getAsObject(['table', name])
    return Object.keys(match).length > 0
  } catch {
    return false
  } finally {
    statement.free()
  }
}

function readChampions(db: Database): ChampionLookup {
  const map: ChampionLookup = new Map()
  if (!tableExists(db, 'Champs')) return map
  const stmt = db.prepare('SELECT ID, Name, Vault, RVault FROM Champs')
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      const converted = convertChampionRow(row)
      const id = Number(converted.ID)
      if (!Number.isFinite(id) || id <= 0) continue
      const name = typeof converted.Name === 'string' ? converted.Name.trim() : null
      map.set(id, {
        id,
        name: name && name.length > 0 ? name : null,
        vault: Boolean(Number(converted.Vault ?? 0)),
        reserveVault: Boolean(Number(converted.RVault ?? 0)),
      })
    }
  } finally {
    stmt.free()
  }
  return map
}

async function readTable(
  db: Database,
  tableName: string,
  source: 'artifacts' | 'inbox',
  champions: ChampionLookup,
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
      items.push(normalizeGearDbArtifact(typedRow, { source, championLookup: champions }))
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
