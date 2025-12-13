import { ArtifactSetPieceGroup } from './groups'
import type { ArtifactSetPieceGroup as ArtifactSetPieceGroupValue } from './groups'
import type { ArtifactSetDescription } from '../setDescriptions'
import type { ArtifactSetId } from '../types'
import { setRuntimeGearSetIcon } from '../iconMaps/gearsetIconMap'
const STORAGE_KEY = 'sellfileCreator.runtimeGearSets.v1'
const FILE_VERSION = 1
const FALLBACK_ICON_SIZE = 64

export interface GearSetFileEntry {
  id: number
  name: string
  pieces: number | string
  pieceGroup: ArtifactSetPieceGroupValue
  text: string
  byPieces?: Record<string, string>
  icon?: string
}

export interface GearSetFilePayload {
  version: number
  sets: GearSetFileEntry[]
}

export interface NormalizedGearSetPayload {
  version: number
  sets: GearSetFileEntry[]
  total: number
}

interface RuntimeGearSet {
  id: ArtifactSetId
  canonicalName: string
  pieceGroup: ArtifactSetPieceGroupValue
  description: ArtifactSetDescription
}

interface PersistedGearSet {
  id: number
  name: string
  pieceGroup: ArtifactSetPieceGroupValue
  description: ArtifactSetDescription
  icon?: string
}

type RuntimeIconSetter = (id: ArtifactSetId, dataUrl?: string) => void

let setRuntimeGearSetIconImpl: RuntimeIconSetter = () => {}

if (typeof window !== 'undefined') {
  // Avoid dynamic import here: the single-file release build inlines Rollup chunks, but Vite’s
  // dynamic-import preload helper can be dropped during minification, leaving `__VITE_PRELOAD__`
  // undefined in the shipped `SellfileCreator.html`.
  setRuntimeGearSetIconImpl = setRuntimeGearSetIcon
}

const runtimeSets = new Map<number, RuntimeGearSet>()
const runtimeIcons = new Map<number, string>()
const listeners = new Set<(version: number) => void>()
let catalogVersion = 0

const isDataUrl = (value: string): boolean => /^data:/i.test(value.trim())

const getStorage = (): Storage | null => {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

const notify = () => {
  catalogVersion += 1
  listeners.forEach(listener => {
    try { listener(catalogVersion) } catch { /* ignore */ }
  })
}

const persist = () => {
  const payload = Array.from(runtimeSets.values()).map((entry) => {
    const serialized: PersistedGearSet = {
      id: entry.id,
      name: entry.canonicalName,
      pieceGroup: entry.pieceGroup,
      description: entry.description,
    }
    const icon = runtimeIcons.get(entry.id as number)
    if (icon) serialized.icon = icon
    return serialized
  })
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: FILE_VERSION, sets: payload }))
  } catch {
    /* ignore */
  }
}

function storeIcon(id: number, icon?: string) {
  runtimeIcons.delete(id)
  const dataUrl = icon && isDataUrl(icon) ? icon : buildFallbackIcon(id)
  runtimeIcons.set(id, dataUrl)
  setRuntimeGearSetIconImpl(id as ArtifactSetId, dataUrl)
}

function buildFallbackIcon(id: number): string {
  const label = String(id)
  const shortLabel = label.length > 5 ? label.slice(-5) : label
  const primary = escapeSvg(shortLabel)
  const title = escapeSvg(label)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FALLBACK_ICON_SIZE} ${FALLBACK_ICON_SIZE}" width="${FALLBACK_ICON_SIZE}" height="${FALLBACK_ICON_SIZE}" role="img">`,
    `<title>Set ${title}</title>`,
    `<rect x="1" y="1" width="${FALLBACK_ICON_SIZE - 2}" height="${FALLBACK_ICON_SIZE - 2}" rx="10" ry="10" fill="transparent" stroke="rgba(255,255,255,0.4)" stroke-width="2" />`,
    `<text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-family="Inter,Roboto,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#ffffff">${primary}</text>`,
    `<text x="50%" y="82%" text-anchor="middle" font-family="Inter,Roboto,Helvetica,sans-serif" font-size="10" letter-spacing="0.3" fill="#ffffff">ID</text>`,
    `</svg>`,
  ].join('')
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function escapeSvg(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function readPersisted(): PersistedGearSet[] | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as { version?: number; sets?: PersistedGearSet[] } | null
    if (!data || typeof data !== 'object' || data.version !== FILE_VERSION || !Array.isArray(data.sets)) return null
    const normalized: PersistedGearSet[] = []
    data.sets.forEach((set) => {
      if (!set || typeof set !== 'object') return
      if (typeof set.id !== 'number' || !Number.isFinite(set.id) || set.id <= 0) return
      if (!set.name || typeof set.name !== 'string') return
      if (!set.description || typeof set.description !== 'object') return
      if (typeof set.pieceGroup !== 'string') return
      if (!Object.values(ArtifactSetPieceGroup).includes(set.pieceGroup as ArtifactSetPieceGroupValue)) return
      normalized.push(set)
    })
    return normalized
  } catch {
    return null
  }
}

export function ensureRuntimeGearSetsLoaded() {
  // Legacy no-op; runtime gear sets hydrate only when explicitly requested.
}

/**
 * Build a case-insensitive lookup map of persisted runtime set names -> IDs.
 *
 * Why: Autosave drafts store readable `artifactSetNames`. When runtime sets are
 * dormant (per restore-checkbox rules), we still need a way to resolve those
 * names during restore preview without activating the runtime catalog.
 */
export function getPersistedRuntimeGearSetNameMap(): Map<string, number> {
  const map = new Map<string, number>()
  // Read the persisted payload directly; this has zero side effects.
  const persisted = readPersisted()
  if (!persisted) return map
  for (const entry of persisted) {
    // Only accept stable, non-empty names.
    const rawName = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!rawName) continue
    // Normalize to lower-case for case-insensitive matching.
    // Why: HSFC/autosave names come from user text.
    const key = rawName.toLowerCase()
    // First writer wins so duplicates stay deterministic.
    if (!map.has(key)) map.set(key, entry.id)
  }
  return map
}

function coerceByPieces(source?: ArtifactSetDescription['byPieces']): Record<string, string> | undefined {
  if (!source) return undefined
  const entries = Object.entries(source)
  if (!entries.length) return undefined
  const out: Record<string, string> = {}
  entries.forEach(([key, value]) => {
    if (!value || typeof value !== 'string') return
    const trimmed = key.trim()
    if (!trimmed) return
    out[trimmed] = value
  })
  return Object.keys(out).length ? out : undefined
}

function upsertRuntimeSet(entry: RuntimeGearSet, icon?: string) {
  runtimeSets.set(entry.id as number, entry)
  storeIcon(entry.id as number, icon)
}

function normalizePayload(raw: unknown): NormalizedGearSetPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  const version = Number(payload.version)
  const setsRaw = payload.sets
  if (!Number.isFinite(version) || version !== FILE_VERSION || !Array.isArray(setsRaw)) {
    return null
  }
  const normalized = setsRaw
    .map(validateEntry)
    .filter((entry): entry is GearSetFileEntry => Boolean(entry))
  return {
    version: FILE_VERSION,
    sets: normalized,
    total: setsRaw.length,
  }
}

function runtimeSetToFileEntry(entry: RuntimeGearSet): GearSetFileEntry {
  const byPieces = coerceByPieces(entry.description.byPieces)
  const serialized: GearSetFileEntry = {
    id: entry.id as number,
    name: entry.canonicalName,
    pieceGroup: entry.pieceGroup,
    pieces: entry.description.pieces,
    text: entry.description.text,
  }
  if (byPieces) serialized.byPieces = byPieces
  const icon = runtimeIcons.get(entry.id as number)
  if (icon) serialized.icon = icon
  return serialized
}

export function serializeRuntimeGearSets(): GearSetFilePayload | null {
  ensureRuntimeGearSetsLoaded()
  if (runtimeSets.size === 0) return null
  const sets = Array.from(runtimeSets.values()).map(runtimeSetToFileEntry)
  return {
    version: FILE_VERSION,
    sets,
  }
}

export function normalizeRuntimeGearSetFilePayload(raw: unknown): GearSetFilePayload | null {
  const normalized = normalizePayload(raw)
  if (!normalized) return null
  if (normalized.sets.length === 0) return { version: FILE_VERSION, sets: [] }
  return { version: FILE_VERSION, sets: normalized.sets }
}

const validateEntry = (entry: unknown): GearSetFileEntry | null => {
  if (!entry || typeof entry !== 'object') return null
  const data = entry as Record<string, unknown>
  const id = Number(data.id)
  if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id) return null
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  if (!name) return null
  const pieceGroup = typeof data.pieceGroup === 'string' ? data.pieceGroup : ''
  if (!Object.values(ArtifactSetPieceGroup).includes(pieceGroup as ArtifactSetPieceGroup)) return null
  const pieces = typeof data.pieces === 'number' || typeof data.pieces === 'string' ? data.pieces : ''
  if (pieces === '') return null
  const text = typeof data.text === 'string' ? data.text : ''
  if (!text) return null
  const byPieces = (() => {
    if (!data.byPieces || typeof data.byPieces !== 'object') return undefined
    const acc: Record<string, string> = {}
    Object.entries(data.byPieces as Record<string, unknown>).forEach(([key, val]) => {
      if (typeof val === 'string' && key.trim()) acc[key.trim()] = val
    })
    return Object.keys(acc).length ? acc : undefined
  })()
  const icon = typeof data.icon === 'string' && isDataUrl(data.icon) ? data.icon : undefined
  const normalizedEntry: GearSetFileEntry = {
    id,
    name,
    pieces,
    pieceGroup: pieceGroup as ArtifactSetPieceGroupValue,
    text,
  }
  if (byPieces) normalizedEntry.byPieces = byPieces
  if (icon) normalizedEntry.icon = icon
  return normalizedEntry
}

export interface RegisterRuntimeGearSetsResult {
  appliedIds: number[]
  total: number
  rejected: number
}

export function registerRuntimeGearSetsPayload(raw: unknown): RegisterRuntimeGearSetsResult {
  const normalized = normalizePayload(raw)
  if (!normalized) throw new Error('Invalid gear set file')
  if (!normalized.sets.length) {
    return { appliedIds: [], total: 0, rejected: normalized.total - normalized.sets.length }
  }
  const applied: number[] = []
  normalized.sets.forEach((entry) => {
    const description: ArtifactSetDescription = {
      pieces: typeof entry.pieces === 'number' ? entry.pieces : entry.pieces,
      text: entry.text,
      ...(entry.byPieces ? { byPieces: entry.byPieces } : {}),
    }
    const runtime: RuntimeGearSet = {
      id: entry.id,
      canonicalName: entry.name,
      pieceGroup: entry.pieceGroup,
      description,
    }
    upsertRuntimeSet(runtime, entry.icon)
    applied.push(entry.id as number)
  })
  persist()
  notify()
  return { appliedIds: applied, total: normalized.sets.length, rejected: normalized.total - normalized.sets.length }
}

export function getRuntimeGearSet(id: ArtifactSetId): RuntimeGearSet | undefined {
  ensureRuntimeGearSetsLoaded()
  return runtimeSets.get(Number(id))
}

export function listRuntimeGearSets(): RuntimeGearSet[] {
  ensureRuntimeGearSetsLoaded()
  return Array.from(runtimeSets.values())
}

export function getRuntimeGearSetIcon(id: ArtifactSetId): string | undefined {
  ensureRuntimeGearSetsLoaded()
  return runtimeIcons.get(Number(id))
}

export function getRuntimeGearSetVersion(): number {
  return catalogVersion
}

export function subscribeRuntimeGearSets(listener: (version: number) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Test-only helper to reset in-memory state.
export function __dangerous__resetRuntimeGearSets_forTests(): void {
  runtimeSets.clear()
  runtimeIcons.clear()
  catalogVersion = 0
  notify()
}

function hydrateFromPersisted(sets: PersistedGearSet[], options?: { replace?: boolean }) {
  if (options?.replace !== false) {
    runtimeSets.clear()
    runtimeIcons.clear()
  }
  sets.forEach((set) => {
    const runtime: RuntimeGearSet = {
      id: set.id as ArtifactSetId,
      canonicalName: set.name,
      pieceGroup: set.pieceGroup,
      description: set.description,
    }
    upsertRuntimeSet(runtime, set.icon)
  })
  notify()
}

export function clearRuntimeGearSets(options?: { persist?: boolean }): void {
  const hadEntries = runtimeSets.size > 0 || runtimeIcons.size > 0
  runtimeSets.clear()
  runtimeIcons.clear()
  if (options?.persist) persist()
  if (hadEntries) notify()
}

export function loadRuntimeGearSetsFromStorage(options?: { replace?: boolean }): number {
  const persisted = readPersisted()
  if (!persisted || persisted.length === 0) {
    if (options?.replace !== false) {
      clearRuntimeGearSets({ persist: false })
    }
    return 0
  }
  hydrateFromPersisted(persisted, options)
  return persisted.length
}

export function getPersistedRuntimeGearSetCount(): number {
  const persisted = readPersisted()
  return persisted ? persisted.length : 0
}

export function persistRuntimeGearSetsSnapshot(): void {
  persist()
}
