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
/**
 * Field-level merge for two raw champion rows. When the incoming row omits a field
 * (`undefined` — "the payload did not include this column"), the prior row's value is
 * carried forward. An explicit `null`/`0` on the incoming row is respected as a real
 * value and clears the field.
 *
 * SSOT: this is the single definition of "which champion columns survive a sparse
 * update." Both the raw-parts accumulator (App.tsx) and the record-level
 * {@link upsertChampionRow} delegate here so the protected-field set can never drift
 * between the two layers.
 */
export const mergeChampionRowFields = (
  incoming: GearDbChampionRow,
  prior: GearDbChampionRow,
): GearDbChampionRow => {
  // Start from the incoming row so explicitly-set values always win.
  const merged: GearDbChampionRow = { ...incoming }
  // For each column absent on the incoming row, fall back to the prior value.
  if (incoming.Name === undefined && prior.Name != null) merged.Name = prior.Name
  if (incoming.HeroID === undefined && prior.HeroID != null) merged.HeroID = prior.HeroID
  if (incoming.Vault === undefined && prior.Vault != null) merged.Vault = prior.Vault
  if (incoming.RVault === undefined && prior.RVault != null) merged.RVault = prior.RVault
  if (incoming.BaseHeroID === undefined && prior.BaseHeroID != null) merged.BaseHeroID = prior.BaseHeroID
  if (incoming.Rarity === undefined && prior.Rarity != null) merged.Rarity = prior.Rarity
  if (incoming.EmpLvl === undefined && prior.EmpLvl != null) merged.EmpLvl = prior.EmpLvl
  if (incoming.Affinity === undefined && prior.Affinity != null) merged.Affinity = prior.Affinity
  if (incoming.BGrade === undefined && prior.BGrade != null) merged.BGrade = prior.BGrade
  if (incoming.Rang === undefined && prior.Rang != null) merged.Rang = prior.Rang
  if (incoming.Lvl === undefined && prior.Lvl != null) merged.Lvl = prior.Lvl
  return merged
}

/**
 * Merge a whole incoming champion burst over the previously accumulated rows.
 * RSL Helper repeats `champions` several times per sync. Current Helper builds send
 * full metadata every time, but the merge stays: rosters rebuilt from restored UI
 * items are legitimately sparse, and older Helper versions omitted Rarity/Name/Affinity
 * on the repeats. Omitted fields are preserved per-field via {@link mergeChampionRowFields}
 * (the SSOT for the protected-field set), and champions present only in `existing` are
 * carried forward so a partial roster push never drops known champions.
 * Shared by App's raw-parts accumulator AND the background account-push flow.
 */
export const mergeChampionRows = (
  incoming: GearDbChampionRow[],
  existing: GearDbChampionRow[] | null,
): GearDbChampionRow[] => {
  if (!existing || existing.length === 0) return incoming
  // Index prior rows by champion ID for O(1) lookup during merge.
  const byId = new Map(existing.map((r) => [r.ID, r]))
  const merged: GearDbChampionRow[] = incoming.map((row) => {
    const prior = byId.get(row.ID)
    // Mark the prior row consumed so it is not re-appended as a carry-forward below.
    if (prior) byId.delete(row.ID)
    return prior ? mergeChampionRowFields(row, prior) : row
  })
  // Any prior champion not present in the incoming burst is retained as-is so a
  // sparse roster push cannot drop champions known from an earlier message.
  for (const leftover of byId.values()) merged.push(leftover)
  return merged
}

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
  const baseHeroId = sanitizeBaseHeroId(row.BaseHeroID)
  // Rarity/Affinity/Name now ship on every WebSocket `champions` row, so a missing value
  // means the row genuinely lacks it (e.g. a baseline rebuilt from restored UI items) and
  // is reported as null. The per-field merge in upsertChampionRow carries the last known
  // value forward for those sparse rows — see its "Why" note.
  return {
    id,
    name: name && name.length > 0 ? name : null,
    location,
    baseHeroId,
    rarity,
    ascensionLevel,
    empowermentLevel,
    affinity,
    blessingGrade,
    starGrade,
    experienceLevel,
  }
}

/**
 * Build a champion lookup from raw rows.
 *
 * When `previous` is supplied, each incoming row is merged over the previously known
 * record via {@link upsertChampionRow} so a sparse update (e.g. RSL Helper's
 * metadata-free second burst, or an out-of-order push after a restart) cannot wipe
 * fields the prior snapshot already established — name, baseHeroId (icon source),
 * rarity, affinity, location, etc. Champions present only in `previous` are carried
 * forward unchanged so a partial roster push never drops known champions.
 */
export const createChampionLookup = (
  rows: Iterable<GearDbChampionRow>,
  previous?: ReadonlyMap<number, ChampionLookupRecord>,
): ChampionLookup => {
  // Seed from the previous lookup so omitted/absent champions survive sparse pushes;
  // upsertChampionRow then merges each incoming row's populated fields over the seed.
  const map: ChampionLookup = previous ? new Map(previous) : new Map()
  for (const row of rows) {
    // Keep the lookups deterministic by skipping malformed rows quietly;
    // callers already log parse errors before this helper runs.
    if (previous) {
      // Field-level merge against the seeded baseline (see upsertChampionRow).
      upsertChampionRow(map, row)
    } else {
      const record = championRowToLookupRecord(row)
      if (!record) continue
      map.set(record.id, record)
    }
  }
  return map
}

/**
 * Field-level merge for upsert. When the new row's source key is `undefined`
 * (the payload did not include this field at all), we keep the value the
 * existing record already had. Distinct from "the new row explicitly set it
 * to null/0" — that case lets the new value through and clears the field.
 *
 * Why: not every source carries every column. Live WebSocket `champions` rows now do
 * include `Affinity`/`Rarity`/`Name`, but baselines rebuilt from restored UI items omit
 * `Affinity`/`EmpLvl`/`BGrade` entirely, and older Helper builds omitted the intrinsics on
 * repeat sends — without this, such a refresh would null out already-known values. The
 * protection applies to every champion-intrinsic field that may be absent from a payload.
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

/**
 * Merge an incoming lastUsed lookup over a previous one so that artifacts absent
 * from the new feed (sparse endpoint payload) retain their previously known timestamp.
 * Incoming entries always win when present; the previous lookup is used as a fallback
 * for any id not present in `incoming`.
 */
export const mergeLastUsedLookup = (
  incoming: LastUsedLookup,
  previous: LastUsedLookup,
): LastUsedLookup => {
  // Start from previous so every known timestamp is preserved by default.
  const merged = new Map(previous)
  // Overlay incoming entries — they represent fresher data and always take precedence.
  for (const [id, ts] of incoming) merged.set(id, ts)
  return merged
}

/**
 * Merge two raw lastUsed row arrays. Incoming rows win per id; ids present only in
 * `prior` are retained so a sparse/out-of-order lastUsed push (or a restored-session
 * baseline) does not drop timestamps the new feed omitted. Rows with an unparseable
 * id are skipped. Mirrors {@link mergeLastUsedLookup} one layer up (raw rows vs.
 * normalized lookup) — kept in sync so both layers preserve the same data.
 */
export const mergeLastUsedRows = (
  incoming: readonly GearDbLastUsedRow[],
  prior: readonly GearDbLastUsedRow[],
): GearDbLastUsedRow[] => {
  // Key by id so incoming entries overwrite prior ones for the same artifact.
  const byId = new Map<number, GearDbLastUsedRow>()
  const keyOf = (row: GearDbLastUsedRow): number => Number(row.id ?? row.ID)
  // Seed with prior rows first; incoming rows then overwrite matching ids.
  for (const row of prior) {
    const id = keyOf(row)
    if (Number.isFinite(id) && id > 0) byId.set(id, row)
  }
  for (const row of incoming) {
    const id = keyOf(row)
    if (Number.isFinite(id) && id > 0) byId.set(id, row)
  }
  return Array.from(byId.values())
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
