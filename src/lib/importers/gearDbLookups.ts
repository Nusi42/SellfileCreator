/**
 * gearDbLookups
 *
 * Shared Champion/LastUsed lookup wiring so both the SQL importer and the raw
 * JSON event path can derive identical metadata for Rule Tester artifacts.
 * Keep the helpers tiny and heavily commented so future schema tweaks only
 * require an edit in this one file.
 */
import type {
  GearDbChampionRow,
  GearDbLastUsedRow,
} from './gearDbNormalizer'
import type { ChampionLookupRecord } from './gearDbNormalizer'
import type { RankValue } from '../types'
import {
  coerceTesterRarity,
} from '../testerDomain'
import { coerceLastUseValue } from './gearDbTime'

export type ChampionLookup = Map<number, ChampionLookupRecord>
export type LastUsedLookup = Map<number, string>

const sanitizeBaseHeroId = (value: unknown): number | null => {
  // Champ rows occasionally include nulls or strings; coerce and clamp them
  // to keep the downstream lookup map pure.
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

const sanitizeRarity = (value: unknown): RankValue | null => {
  // Reuse the tester-domain coercion so JSON snapshots and SQL blobs normalize
  // rarities the exact same way.
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  return coerceTesterRarity(num, 6)
}

/**
 * Convert a Champs row into the normalized lookup entry the Rule Tester uses.
 * Returns `null` when the row lacks a usable ID so callers can skip it.
 */
export const championRowToLookupRecord = (row: GearDbChampionRow): ChampionLookupRecord | null => {
  const id = Number(row.ID)
  if (!Number.isFinite(id) || id <= 0) return null
  const name = typeof row.Name === 'string' ? row.Name.trim() : null
  const rarity = sanitizeRarity(row.Rarity)
  return {
    id,
    name: name && name.length > 0 ? name : null,
    vault: Boolean(Number(row.Vault ?? 0)),
    reserveVault: Boolean(Number(row.RVault ?? 0)),
    baseHeroId: sanitizeBaseHeroId(row.BaseHeroID),
    rarity,
  }
}

export const createChampionLookup = (rows: Iterable<GearDbChampionRow>): ChampionLookup => {
  const map: ChampionLookup = new Map()
  for (const row of rows) {
    // Keep the lookups deterministic by skipping malformed rows quietly;
    // callers already log parse errors before this helper runs.
    const record = championRowToLookupRecord(row)
    if (!record) continue
    map.set(record.id, record)
  }
  return map
}

export const upsertChampionRow = (map: ChampionLookup, row: GearDbChampionRow): ChampionLookupRecord | null => {
  const record = championRowToLookupRecord(row)
  if (!record) return null
  // Replace-in-place so artifacts immediately see the refreshed metadata.
  map.set(record.id, record)
  return record
}

export const removeChampion = (map: ChampionLookup, id: number): void => {
  map.delete(id)
}

const toLastUsedRow = (row: GearDbLastUsedRow): { id: number; timestamp: string } | null => {
  const id = Number(row.id ?? row.ID)
  if (!Number.isFinite(id) || id <= 0) return null
  const timestamp = coerceLastUseValue(row.lastUse)
  if (!timestamp) return null
  return { id, timestamp }
}

export const createLastUsedLookup = (rows: Iterable<GearDbLastUsedRow>): LastUsedLookup => {
  const map: LastUsedLookup = new Map()
  for (const row of rows) {
    const parsed = toLastUsedRow(row)
    if (!parsed) continue
    map.set(parsed.id, parsed.timestamp)
  }
  return map
}

export const upsertLastUsedRow = (map: LastUsedLookup, row: GearDbLastUsedRow): string | null => {
  const parsed = toLastUsedRow(row)
  if (!parsed) return null
  map.set(parsed.id, parsed.timestamp)
  return parsed.timestamp
}

export const removeLastUsed = (map: LastUsedLookup, id: number): void => {
  map.delete(id)
}
