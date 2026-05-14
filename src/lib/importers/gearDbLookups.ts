/**
 * gearDbLookups
 *
 * Shared Champion/LastUsed lookup wiring so both the SQL importer and the raw
 * JSON event path can derive identical metadata for Gear Inspector artifacts.
 * Keep the helpers tiny and heavily commented so future schema tweaks only
 * require an edit in this one file.
 */
import type {
  GearDbChampionRow,
  GearDbLastUsedRow,
} from './gearDbNormalizer'
import type { ChampionLookupRecord, ChampionLocation } from './gearDbNormalizer'
import type { RankValue } from '../types'
import {
  coerceGearInspectorRarity,
} from '../gearInspectorDomain'
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
  // Reuse the Gear Inspector domain coercion so JSON snapshots and SQL blobs normalize
  // rarities the exact same way.
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  return coerceGearInspectorRarity(num, 6)
}

/**
 * Compute the champion's ascension level from the DB row.
 * Ascension level = HeroID − BaseHeroID (0–6): 0 means unascended, 6 means fully ascended.
 * Returns null when either ID is missing, which causes the UI to treat all slots
 * as available (graceful degradation for older DB dumps without HeroID).
 */
const computeAscensionLevel = (heroId: unknown, baseHeroId: unknown): number | null => {
  const hero = typeof heroId === 'number' ? heroId : Number(heroId)
  const base = typeof baseHeroId === 'number' ? baseHeroId : Number(baseHeroId)
  if (!Number.isFinite(hero) || !Number.isFinite(base) || base <= 0) return null
  const diff = hero - base
  if (!Number.isFinite(diff)) return null
  return Math.min(6, Math.max(0, Math.round(diff)))
}

/**
 * Coerce a raw value to a non-negative integer (0 inclusive). Use for fields where
 * 0 is a meaningful value — e.g. unempowered champions (`EmpLvl=0`) or unblessed
 * champions (`BGrade=0`). Returns null when missing or unparseable.
 */
const sanitizeNonNegativeInt = (value: unknown): number | null => {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.round(num))
}

/**
 * Coerce a raw value to a positive integer (≥1). Use for 1-based codes and ranges:
 * `Affinity` (1–4), `Rang` (1–6 stars), `Lvl` (1–60). Returns null when missing,
 * unparseable, or zero/negative — the comparator then sorts the champion after
 * every champion with a known value.
 */
const sanitizePositiveInt = (value: unknown): number | null => {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  const rounded = Math.round(num)
  if (rounded <= 0) return null
  return rounded
}

/**
 * Convert a Champs row into the normalized lookup entry the Gear Inspector uses.
 * Returns `null` when the row lacks a usable ID so callers can skip it.
 */
export const championRowToLookupRecord = (row: GearDbChampionRow): ChampionLookupRecord | null => {
  const id = Number(row.ID)
  if (!Number.isFinite(id) || id <= 0) return null
  const name = typeof row.Name === 'string' ? row.Name.trim() : null
  const rarity = sanitizeRarity(row.Rarity)
  // Ascension level = HeroID − BaseHeroID (0–6); null in older dumps without HeroID.
  const ascensionLevel = computeAscensionLevel(row.HeroID, row.BaseHeroID)
  // Empowerment level — null in dumps that predate the EmpLvl column.
  // Empowerment (0–4) and blessing grade (0–6) accept 0 = unempowered / unblessed.
  const empowermentLevel = sanitizeNonNegativeInt(row.EmpLvl)
  const blessingGrade = sanitizeNonNegativeInt(row.BGrade)
  // Affinity (1–4 code), star grade (1–6) and XP level (1–60) are 1-based; reject 0.
  const affinity = sanitizePositiveInt(row.Affinity)
  const starGrade = sanitizePositiveInt(row.Rang)
  const experienceLevel = sanitizePositiveInt(row.Lvl)
  // Champion location is one-of-three; the SQL dump uses two flags but exactly one
  // can be true at a time. RVault wins over Vault when both flags are set in malformed
  // dumps, matching the precedence used elsewhere in the codebase.
  const location: ChampionLocation = Number(row.RVault ?? 0) > 0
    ? 'reserveVault'
    : (Number(row.Vault ?? 0) > 0 ? 'vault' : 'collection')
  return {
    id,
    name: name && name.length > 0 ? name : null,
    location,
    baseHeroId: sanitizeBaseHeroId(row.BaseHeroID),
    rarity,
    ascensionLevel,
    empowermentLevel,
    affinity,
    blessingGrade,
    starGrade,
    experienceLevel,
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

/**
 * Field-level merge for upsert. When the new row's source key is `undefined`
 * (the payload did not include this field at all), we keep the value the
 * existing record already had. Distinct from "the new row explicitly set it
 * to null/0" — that case lets the new value through and clears the field.
 *
 * Why: live WebSocket updates do not currently include `Affinity`, so a refresh
 * after an initial SQL/JSON-snapshot load would otherwise null out the affinity.
 * The same protection applies to every champion-intrinsic field that may be
 * absent from a given payload (rarity, blessing grade, etc).
 */
export const upsertChampionRow = (map: ChampionLookup, row: GearDbChampionRow): ChampionLookupRecord | null => {
  const record = championRowToLookupRecord(row)
  if (!record) return null
  const previous = map.get(record.id)
  if (previous) {
    // For each source column that's undefined on the incoming row, prefer the
    // previously-known value. Numeric columns: undefined → keep. Name and location
    // are also preserved.
    if (row.Name === undefined && previous.name !== null) record.name = previous.name
    // Location is derived from the two flags; if neither flag was present in the
    // incoming row, keep the previous location.
    if (row.Vault === undefined && row.RVault === undefined) record.location = previous.location
    if (row.BaseHeroID === undefined) record.baseHeroId = previous.baseHeroId
    if (row.Rarity === undefined) record.rarity = previous.rarity
    // Ascension is derived from HeroID+BaseHeroID; if either is missing, keep previous.
    if (row.HeroID === undefined || row.BaseHeroID === undefined) record.ascensionLevel = previous.ascensionLevel
    if (row.EmpLvl === undefined) record.empowermentLevel = previous.empowermentLevel
    if (row.Affinity === undefined) record.affinity = previous.affinity
    if (row.BGrade === undefined) record.blessingGrade = previous.blessingGrade
    if (row.Rang === undefined) record.starGrade = previous.starGrade
    if (row.Lvl === undefined) record.experienceLevel = previous.experienceLevel
  }
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
