/**
 * HSFR IO Helpers
 *
 * Responsibilities:
 * - Normalize readable HSFR payloads to the internal StatVariant-based model.
 * - Build readable HSFR payloads (labels, not numeric IDs) from internal state for Save/Copy.
 * - Parse pasted text that may be a single config, an array of configs, or a full HSFR object.
 *
 * This module deliberately contains only HSFR read/write concerns to keep UI code tidy.
 */
import type { BuilderConfig, MinimaTable } from './hsfBuilder'
import { FINAL_SELL_DEFAULT_LEVELS, RARITY_AUTO_LABEL } from './constants'
import type { Metaset } from './metasets'
import {
  artifactSetNames,
  artifactTypeNames,
  factionCodeToName,
  formatRank,
  labelOfVariant,
  rarityCodeToName,
  factionNames,
  variantFromLabel,
  compareArtifactSets,
  compareArtifactTypes,
  compareVariants,
} from './types'

// Internal helpers for parsing unknown HSFR shapes
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }
// no longer used: only label-based parsing is accepted for HSFR
// function asNumber(v: unknown): number | undefined { return typeof v === 'number' && Number.isFinite(v) ? v : undefined }
function asStringArray(v: unknown): string[] | undefined { return Array.isArray(v) ? (v as unknown[]).map((s) => String(s)) : undefined }
// (Legacy helpers removed for HSFR schema simplification)
function parseSubstatLike(v: unknown): number | undefined {
  if (typeof v === 'string') { const vk = variantFromLabel(v); if (vk !== null) return vk as number }
  // Objects like { id, isFlat } are no longer accepted in HSFR; labels only
  return undefined
}
function parseMainStatLike(v: unknown): number | undefined {
  if (typeof v === 'string') { const vk = variantFromLabel(v); if (vk !== null) return vk as number }
  // Objects like { id, f } are no longer accepted in HSFR; labels only
  return undefined
}

// Normalize HSFR configs (readable schema) to current BuilderConfig
/** Normalize a readable HSFR config to BuilderConfig with *V fields. */
export function normalizeConfig(input: unknown): BuilderConfig {
  const rec: Record<string, unknown> = isRecord(input) ? input : {}
  const typeIdByName = new Map<string, number>(Object.entries(artifactTypeNames).map(([k, v]) => [v, Number(k)]))
  const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))

  let rankCode: number = typeof rec['rankCode'] === 'number' ? (rec['rankCode'] as number) : 0
  if (typeof rec['Rank'] === 'string') {
    const label = String(rec['Rank']).trim()
    if (label.length === 0 || /^(any)$/i.test(label)) {
      rankCode = 0
    } else {
      for (let c = 0; c <= 16; c++) { if (formatRank(c) === label) { rankCode = c; break } }
    }
  }

  // Rarity parsing: support numeric `rarityCode`, human-readable labels (e.g., "≥ Epic"), and "Auto".
  let rarityCode: number = typeof rec['rarityCode'] === 'number' ? Number(rec['rarityCode']) : 0
  let rarityMode: 'auto' | 'code' = 'code'
  if (typeof rec['Rarity'] === 'string') {
    const label = String(rec['Rarity']).trim()
    if (label.length === 0 || /^(any)$/i.test(label)) {
      rarityCode = 0
    } else if (label.toLowerCase() === RARITY_AUTO_LABEL.toLowerCase()) {
      rarityMode = 'auto'
    } else {
      // Find the code whose name matches the provided label (exact match)
      for (let c = 0; c <= 16; c++) {
        if (rarityCodeToName(c) === label) { rarityCode = c; break }
      }
    }
  }

  const mainStatsVParsed: number[] = Array.isArray(rec['mainStats'])
    ? ((rec['mainStats'] as unknown[]).map((x) => parseMainStatLike(x)).filter((x): x is number => typeof x === 'number'))
    : []

  const rollMode: BuilderConfig['rollMode'] = (() => {
    const m = rec['rollMode'] as unknown
    if (m === 'off' || m === 'strict' || m === 'potential' || m === 'auto') return m
    return 'potential'
  })()

  const startLevel: BuilderConfig['startLevel'] = ((): BuilderConfig['startLevel'] => {
    const raw = rec['startLevel'] as unknown
    if (rollMode === 'off' && raw === 'any') return 'any'
    if (typeof raw === 'number' && [0, 4, 8, 12, 16].includes(raw)) return raw as 0 | 4 | 8 | 12 | 16
    return 0
  })()

  const baseCfg: BuilderConfig = {
    name: typeof rec['name'] === 'string' ? String(rec['name']) : '',
    keep: Boolean((rec['keep'] ?? true) as boolean),
    enabled: rec['enabled'] !== false,
    // Prefer explicit min/max window when present; validated below and assigned into opt
    rankCode,
    rarityCode,
    ...(rarityMode === 'auto' ? { rarityMode: 'auto' as const } : {}),
    factionCode: (() => {
      if (typeof rec['factionCode'] === 'number') return Number(rec['factionCode'])
      if (typeof rec['Faction'] === 'string') {
        const fLabel = String(rec['Faction']).trim()
        if (fLabel.length === 0 || /^(any)$/i.test(fLabel)) return 0
        const byName = new Map<string, number>(Object.entries(factionNames).map(([k, v]) => [v, Number(k)]))
        const code = byName.get(fLabel)
        if (typeof code === 'number') return code
      }
      return 0
    })(),
    mainStatsV: mainStatsVParsed as number[],
    startLevel,
    rollBaseline: (rec['rollBaseline'] === 'upToLevel') ? 'upToLevel' : 'afterStart',
    rollMode,
    // Accept both new ('early'|'late') and legacy ('progressive'|'reachable') spellings.
    earlyKeepMode: ((): 'early' | 'late' => {
      const m = rec['earlyKeepMode'] as unknown
      if (m === 'late' || m === 'reachable') return 'late'
      return 'early'
    })(),
    substatsV: (Array.isArray(rec['substats']) ? ((rec['substats'] as unknown[]).map((x) => parseSubstatLike(x)).filter((x): x is number => typeof x === 'number')) : []) as number[],
    fixedSubstatsV: (Array.isArray(rec['fixedSubstats']) ? ((rec['fixedSubstats'] as unknown[]).map((x) => parseSubstatLike(x)).filter((x): x is number => typeof x === 'number')) : []) as number[],
    minCount: (() => { const m = rec['minCount']; return (typeof m === 'number' && [0, 1, 2, 3, 4].includes(m)) ? (m as 0 | 1 | 2 | 3 | 4) : 0 })(),
    autoMinCount: Boolean((rec['autoMinCount'] ?? false) as boolean),
    minRequiredRolls: (() => { const r = rec['minRequiredRolls']; return (typeof r === 'number' && [0,1,2,3,4,5].includes(r)) ? (r as 0|1|2|3|4|5) : 0 })(),
    autoMinRequiredRolls: Boolean((rec['autoMinRequiredRolls'] ?? true) as boolean),
  }

  const __srbV = (() => {
    const src = rec['substatRollBounds'] as unknown
    if (!src || typeof src !== 'object') return undefined
    const out: Record<number, { min?: number; max?: number; any?: boolean }> = {}
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const vk = variantFromLabel(String(k))
      if (vk === null) continue
      const min = (v as Record<string, unknown>)['min']
      const max = (v as Record<string, unknown>)['max']
      const any = Boolean((v as Record<string, unknown>)['any'])
      const mv: { min?: number; max?: number; any?: boolean } = {}
      if (typeof min === 'number' && min >= 0) mv.min = Math.min(5, Math.floor(min))
      // Cap per-substat max at 4; 5 is redundant and omitted
      if (typeof max === 'number' && max >= 0) mv.max = Math.min(4, Math.floor(max))
      if (any) mv.any = true
      if (mv.min !== undefined || mv.max !== undefined || mv.any) out[vk as number] = mv
    }
    return Object.keys(out).length ? out : undefined
  })()

  const opt: Partial<BuilderConfig> = {}
  // New: min/max level window parsing (prefer these when present)
  const parseLevel = (v: unknown): 0|4|8|12|16 | undefined => {
    const n = Number(v)
    return ([0,4,8,12,16].includes(n) ? (n as 0|4|8|12|16) : undefined)
  }
  const minLevel = parseLevel(rec['minLevel'])
  const maxLevel = parseLevel(rec['maxLevel'])
  if (minLevel !== undefined && maxLevel !== undefined && minLevel <= maxLevel) {
    opt.minLevel = minLevel
    opt.maxLevel = maxLevel
  }
  if (__srbV !== undefined) opt.substatRollBoundsV = __srbV
  // Optional: target scope for aggregate min rolls
  const mrt = rec['minRollsTarget']
  if (typeof mrt === 'string') {
    const v = mrt.toLowerCase()
    if (v.startsWith('lock')) opt.substatMinTarget = 'locked'
    else if (v.startsWith('sel')) opt.substatMinTarget = 'selected'
  }
  const __artTypes = Array.isArray(rec['artifactTypeNames'])
    ? ((rec['artifactTypeNames'] as unknown[]).map((n) => typeIdByName.get(String(n))).filter((x): x is number => typeof x === 'number'))
    : undefined
  const __artSets = Array.isArray(rec['artifactSetNames'])
    ? ((rec['artifactSetNames'] as unknown[]).map((n) => setIdByName.get(String(n))).filter((x): x is number => typeof x === 'number'))
    : undefined
  const __artMetaSets = asStringArray(rec['artifactMetaSets'])
  if (__artTypes !== undefined) opt.artifactTypes = __artTypes
  if (__artSets !== undefined) opt.artifactSets = __artSets
  if (__artMetaSets !== undefined) opt.artifactMetaSets = __artMetaSets
  // Assemble normalized base
  const normalized: BuilderConfig = { ...baseCfg, ...opt }

  // Post-normalization to align HSFR with in-app invariants:
  // - Fixed substats are a subset of selected substats. Ensure inclusion.
  // - Selected substats with no explicit bounds default to wildcard (any: true).
  // - Conflicting bounds: when min/max are present, drop 'any' (UI cannot represent both simultaneously).
  // - Clamp numeric bounds to valid ranges (already clamped above; re-apply defensively).
  try {
    const subsV: number[] = Array.isArray(normalized.substatsV) ? normalized.substatsV.slice() : []
    const fixedV: number[] = Array.isArray(normalized.fixedSubstatsV) ? normalized.fixedSubstatsV.slice() : []
    // Ensure fixed are included in selected
    const union = Array.from(new Set<number>([...subsV, ...fixedV]))
    // Start from existing bounds or empty
    const bV: Record<number, { min?: number; max?: number; any?: boolean }> = { ...(normalized.substatRollBoundsV ?? {}) }
    // Ensure wildcard for selected substats lacking bounds
    for (const v of union) {
      if (!bV[v]) bV[v] = { any: true }
    }
    // Sanitize each bounds entry
    for (const [k, raw] of Object.entries(bV)) {
      const v = Number(k)
      const m = raw ?? {}
      const out: { min?: number; max?: number; any?: boolean } = {}
      if (typeof m.min === 'number' && Number.isFinite(m.min)) out.min = Math.max(0, Math.min(5, Math.floor(m.min)))
      if (typeof m.max === 'number' && Number.isFinite(m.max)) out.max = Math.max(0, Math.min(4, Math.floor(m.max)))
      // Drop 'any' when min/max present; keep only one form to avoid ambiguous states.
      const hasNumeric = (out.min !== undefined) || (out.max !== undefined)
      if (!hasNumeric && (m.any === true)) out.any = true
      bV[v] = out
      // Prune empty entries (defensive)
      if (out.min === undefined && out.max === undefined && !out.any) delete bV[v]
    }
    normalized.substatsV = union
    // If bounds emptied entirely, delete the key to satisfy exactOptionalPropertyTypes
    if (Object.keys(bV).length) {
      normalized.substatRollBoundsV = bV
    } else {
      delete (normalized as unknown as Record<string, unknown>)['substatRollBoundsV']
    }
  } catch {}

  return normalized
}

/** Normalize HSFR Minima (label-keyed) to variant-keyed tables used internally. */
export function normalizeMinima(src: unknown): MinimaTable {
  const coerceStar = (rec: unknown): Record<number, number> => {
    const out: Record<number, number> = {}
    if (!rec || typeof rec !== 'object') return out
    for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
      const vk = variantFromLabel(k)
      if (vk === null) continue
      const num = Number(v)
      if (Number.isFinite(num)) out[vk as number] = num
    }
    return out
  }
  const s = (src && typeof src === 'object') ? (src as Record<string, unknown>) : {}
  return {
    one: coerceStar(s['one']),
    two: coerceStar(s['two']),
    three: coerceStar(s['three']),
    four: coerceStar(s['four']),
    five: coerceStar(s['five']),
    six: coerceStar(s['six']),
  }
}

// Build a readable config object for HSFR export/copy (labels, not numeric IDs)
/** Build a single readable HSFR config from internal BuilderConfig state. */
export function buildReadableConfig(cfg: BuilderConfig, metasets: Metaset[]) {
  // Metasets are included in the HSFR payload separately; configs now reference
  // metasets by ID. We keep the parameter for call‑site symmetry and future use.
  void metasets
  const mainV = (cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []
  const subV = (cfg as (BuilderConfig & { substatsV?: number[] })).substatsV ?? []
  const fixedV = (cfg as (BuilderConfig & { fixedSubstatsV?: number[] })).fixedSubstatsV ?? []
  // Canonicalize label order for HSFR: use preferred stat order via compareVariants.
  const mainLabels = mainV.slice().sort(compareVariants).map(labelOfVariant)
  const subLabels = subV.slice().sort(compareVariants).map((v) => labelOfVariant(v))
  const fixedLabels = fixedV.slice().sort(compareVariants).map((v) => labelOfVariant(v))
  return {
    name: cfg.name,
    keep: cfg.keep,
    enabled: cfg.enabled !== false,
    // For readability in HSFR/clipboard, render Auto or explicit labels. "Any" when code is 0.
    Rank: (cfg.rankCode === 0 ? 'Any' : formatRank(cfg.rankCode)),
    Rarity: (cfg.rarityMode === 'auto' ? RARITY_AUTO_LABEL : (cfg.rarityCode === 0 ? 'Any' : rarityCodeToName(cfg.rarityCode))),
    Faction: ((cfg.factionCode ?? 0) === 0 ? 'Any' : factionCodeToName(cfg.factionCode ?? 0)),
    mainStats: mainLabels,
    // New schema: emit explicit level window and omit legacy roll fields
    minLevel: ((cfg as BuilderConfig).minLevel ?? (typeof cfg.startLevel === 'number' ? cfg.startLevel : 0)),
    maxLevel: ((cfg as BuilderConfig).maxLevel ?? 16),
    ...(cfg.earlyKeepMode === 'late' ? { earlyKeepMode: 'late' as const } : {}),
    substats: subLabels,
    fixedSubstats: fixedLabels,
    substatRollBounds: (() => {
      const srcV = (cfg as (BuilderConfig & { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> })).substatRollBoundsV ?? {}
      const out: Record<string, { min?: number; max?: number; any?: boolean }> = {}
      for (const [vk, v] of Object.entries(srcV)) {
        const label = labelOfVariant(Number(vk))
        out[label] = v as { min?: number; max?: number; any?: boolean }
      }
      return Object.keys(out).length ? out : undefined
    })(),
    minCount: cfg.minCount,
    autoMinCount: cfg.autoMinCount,
    minRequiredRolls: (cfg.minRequiredRolls ?? 0),
    autoMinRequiredRolls: (cfg.autoMinRequiredRolls ?? true),
    ...(cfg.substatMinTarget === 'locked' ? { minRollsTarget: 'Locked' as const } : {}),
    artifactTypeNames: (cfg.artifactTypes ?? []).slice().sort(compareArtifactTypes).map(t => artifactTypeNames[Number(t)]).filter(Boolean),
    artifactSetNames: (cfg.artifactSets ?? []).slice().sort(compareArtifactSets).map(s => artifactSetNames[Number(s)]).filter(Boolean),
    // Write compact metaset references by ID for smaller files. Names remain
    // available under Metasets[].name and are not duplicated here.
    artifactMetaSetIds: (cfg.artifactMetaSets ?? []).slice(),
  }
}

// Convert Minima (variant-keyed) to label-keyed maps for readability
/** Convert variant-keyed Minima tables to label-keyed maps for HSFR export. */
export function minimaToReadable(minima: MinimaTable) {
  const conv = (rec: Record<number, number>) => {
    const out: Record<string, number> = {}
    for (const [vk, val] of Object.entries(rec)) { out[labelOfVariant(Number(vk))] = val as number }
    return out
  }
  return {
    one: conv(minima.one as Record<number, number>),
    two: conv(minima.two as Record<number, number>),
    three: conv(minima.three as Record<number, number>),
    four: conv(minima.four as Record<number, number>),
    five: conv(minima.five as Record<number, number>),
    six: conv(minima.six as Record<number, number>),
  }
}

// Parse text that may be a single config, an array, or an HSFR object with Configs
/** Parse text as HSFR content: returns normalized configs array on success, [] on failure. */
export function parseConfigsFromText(text: string, metasetsForNames?: Metaset[]): BuilderConfig[] {
  try {
    const parsed = JSON.parse(text) as unknown
    const resolveMetaIds = (rawCfg: unknown, metas: Metaset[]): string[] => {
      const rec = (rawCfg && typeof rawCfg === 'object') ? (rawCfg as Record<string, unknown>) : {}
      // Prefer explicit IDs when present
      const ids = Array.isArray(rec['artifactMetaSetIds']) ? (rec['artifactMetaSetIds'] as unknown[]).map(String) : []
      if (ids.length) return ids
      // Backward compatibility: map names to IDs
      const names = Array.isArray(rec['artifactMetaSetNames']) ? (rec['artifactMetaSetNames'] as unknown[]).map(String) : []
      if (!names.length) return []
      const byName = new Map<string, string>(metas.map(m => [m.name, m.id]))
      return names.map(n => byName.get(String(n))).filter((x): x is string => typeof x === 'string')
    }
    const metasFromObj = (obj: Record<string, unknown>): Metaset[] | null => {
      const raws = obj['Metasets']
      if (!Array.isArray(raws)) return null
      const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))
      try {
        return (raws as unknown[]).map((m) => {
          const mRec = (m || {}) as Record<string, unknown>
          const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
          const sets = names.map((n: unknown) => setIdByName.get(String(n))).filter((x: unknown): x is number => typeof x === 'number')
          return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false }
        })
      } catch { return null }
    }
    if (Array.isArray(parsed)) {
      const metas = metasetsForNames ?? []
      return parsed.map((raw) => {
        const base = normalizeConfig(raw)
        const metaIds = metas.length ? resolveMetaIds(raw, metas) : []
        return metaIds.length ? { ...base, artifactMetaSets: Array.from(new Set([...(base.artifactMetaSets ?? []), ...metaIds])) } : base
      })
    }
    if (isRecord(parsed)) {
      const cfgs = Array.isArray(parsed['Configs']) ? (parsed['Configs'] as unknown[]) : []
      const metas = metasFromObj(parsed) ?? metasetsForNames ?? []
      if (cfgs.length) {
        return cfgs.map((raw) => {
          const base = normalizeConfig(raw)
          const metaIds = metas.length ? resolveMetaIds(raw, metas) : []
          return metaIds.length ? { ...base, artifactMetaSets: Array.from(new Set([...(base.artifactMetaSets ?? []), ...metaIds])) } : base
        })
      }
      const base = normalizeConfig(parsed)
      const metaIds = metas.length ? resolveMetaIds(parsed, metas) : []
      return metaIds.length ? [{ ...base, artifactMetaSets: Array.from(new Set([...(base.artifactMetaSets ?? []), ...metaIds])) }] : [base]
    }
  } catch {
    // ignore
  }
  return []
}

/**
 * Parse a full HSFR text payload and return normalized state slices.
 * Accepts a previous snapshot for metasets/minima/allExplicit defaults.
 */
export function parseHsfrText(
  text: string,
  prev: { metasets: Metaset[]; minima: MinimaTable },
): { cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; selectedIndex: number | null; note?: string; finalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> } } {
  const parsed = JSON.parse(text) as unknown
  return parseHsfrObject(parsed, prev)
}

/** Parse an HSFR object (readable schema) into normalized slices. */
export function parseHsfrObject(
  parsed: unknown,
  prev: { metasets: Metaset[]; minima: MinimaTable },
): { cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; selectedIndex: number | null; note?: string; finalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> } } {
  const parsedRec = (typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {})
  const rawCfgs = Array.isArray(parsed) ? parsed : (Array.isArray(parsedRec['Configs']) ? (parsedRec['Configs'] as unknown[]) : [])
  const metasets: Metaset[] = (() => {
    const raws = parsedRec['Metasets']
    if (!Array.isArray(raws)) return prev.metasets
    const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))
    return raws.map((m: unknown) => {
      const mRec = (m || {}) as Record<string, unknown>
      const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
      const sets = names.map((n: unknown) => setIdByName.get(String(n))).filter((x: unknown): x is number => typeof x === 'number')
      return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false }
    })
  })()
  const minima: MinimaTable = (!Array.isArray(parsed) && parsedRec['Minima']) ? normalizeMinima(parsedRec['Minima']) : prev.minima
  const cfgs: BuilderConfig[] = rawCfgs.map((raw) => {
    const base = normalizeConfig(raw)
    const rec = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}
    // Prefer explicit IDs, fallback to names
    const ids = Array.isArray(rec['artifactMetaSetIds']) ? (rec['artifactMetaSetIds'] as unknown[]).map(String) : []
    let resolvedIds = ids
    if (!resolvedIds.length) {
      const names = Array.isArray(rec['artifactMetaSetNames']) ? (rec['artifactMetaSetNames'] as unknown[]).map(String) : []
      if (names.length) {
        const byName = new Map<string, string>(metasets.map(m => [m.name, m.id]))
        resolvedIds = names.map(n => byName.get(String(n))).filter((x): x is string => typeof x === 'string')
      }
    }
    if (!resolvedIds.length) return base
    const existing = Array.isArray(base.artifactMetaSets) ? base.artifactMetaSets : []
    const union = Array.from(new Set<string>([...existing, ...resolvedIds]))
    return { ...base, artifactMetaSets: union }
  })
  // Optional Final Sell configuration
  const fsr = (() => {
    const DEFAULT_LEVELS: Array<0|4|8|12|16> = FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>
    if (Array.isArray(parsed)) return { artifacts: false, accessories: false, levels: DEFAULT_LEVELS }
    const v = parsedRec['FinalSellRemainder']
    if (!v || typeof v !== 'object') return { artifacts: false, accessories: false, levels: DEFAULT_LEVELS }
    const rec = v as Record<string, unknown>
    const artifacts = rec['artifacts'] === true ? true : false
    const accessories = rec['accessories'] === true ? true : false
    const levelsRaw = Array.isArray(rec['levels']) ? (rec['levels'] as unknown[]) : []
    const allowed = new Set([0,4,8,12,16])
    const levels = levelsRaw.map(x => Number(x)).filter((l): l is 0|4|8|12|16 => allowed.has(Number(l)))
    const finalLevels = (levels.length === 0 ? DEFAULT_LEVELS : Array.from(new Set(levels)).sort((a,b)=>a-b) as Array<0|4|8|12|16>)
    return { artifacts, accessories, levels: finalLevels }
  })()
  const savedSel = (!Array.isArray(parsed) && typeof parsedRec['SelectedConfigIndex'] === 'number') ? (parsedRec['SelectedConfigIndex'] as number) : (cfgs.length ? cfgs.length - 1 : null)
  const selectedIndex = (savedSel !== null && savedSel >= 0 && savedSel < cfgs.length) ? savedSel : (cfgs.length ? cfgs.length - 1 : null)
  const note = (!Array.isArray(parsed) && typeof parsedRec['Note'] === 'string') ? String(parsedRec['Note']) : undefined
  return { cfgs, metasets, minima, selectedIndex, ...(note ? { note } : {}), finalSellRemainder: fsr }
}

/** Read a `.hsfr`/JSON file and parse with the same semantics as parseHsfrText. */
export async function readHsfrFile(
  file: File,
  prev: { metasets: Metaset[]; minima: MinimaTable },
): Promise<{ cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; selectedIndex: number | null; note?: string; finalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> } }>
{
  const text = await file.text()
  return parseHsfrText(text, prev)
}

/** Parse an internal autosave payload (not HSFR); expects variant-keyed minima and full BuilderConfig objects. */

/**
 * Build a full, readable HSFR payload object for Save/Copy, given current state.
 */
export function buildHsfrPayload(args: {
  version: string,
  metasets: Metaset[],
  minima: MinimaTable,
  configs: BuilderConfig[],
  finalSellRemainder?: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> },
  selectedConfigIndex: number | null,
  note?: string,
  }): { Version: string; Metasets: Array<{ id: string; name: string; setNames: string[]; show?: boolean }>; Minima: unknown; Configs: unknown[]; FinalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }; SelectedConfigIndex?: number; Note?: string } {
  const { version, metasets, minima, configs, finalSellRemainder, selectedConfigIndex, note } = args
  const metasOut = metasets.map(m => ({
    id: m.id,
    name: m.name,
    setNames: m.sets.slice().sort(compareArtifactSets)
      .map((id) => artifactSetNames[Number(id)])
      .filter((x): x is string => Boolean(x)),
    show: m.show !== false,
  }))
  return {
    Version: version,
    Metasets: metasOut,
    Minima: minimaToReadable(minima),
    Configs: configs.map((cfg, i) => ({ __cfgIdx_ignoredWhenRead: i + 1, ...buildReadableConfig(cfg, metasets) })),
    FinalSellRemainder: (finalSellRemainder ?? { artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> }),
    ...(selectedConfigIndex != null ? { SelectedConfigIndex: selectedConfigIndex } : (configs.length ? { SelectedConfigIndex: configs.length - 1 } : {})),
    ...(note ? { Note: note } : {}),
  }
}

/** Convert an HSFR payload object to a Blob ready to download. */
export function hsfrToBlob(payload: unknown): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}
