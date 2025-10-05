/**
 * HSFC IO Helpers
 *
 * Responsibilities:
 * - Normalize readable HSFC payloads to the internal StatVariant-based model.
 * - Build readable HSFC payloads (labels, not numeric IDs) from internal state for Save/Copy.
 * - Parse pasted text that may be a single config, an array of configs, or a full HSFC object.
 *
 * This module deliberately contains only HSFC read/write concerns to keep UI code tidy.
 */
import type { BuilderConfig, MinimaTable, Star } from './hsfBuilder'
import { normalizeKeepMode, normalizeAutoRaritySupplements, isMilestoneThresholdsActive, canEnableSubstatFlex, normalizeSubstatMinTarget } from './keepMode'
import { FINAL_SELL_DEFAULT_LEVELS, RARITY_AUTO_LABEL } from './constants'
import { DEFAULT_METASET_ICON_ID, normalizeMetasetIconId } from './metasetIcons'
import { orderMetasetIds, type Metaset } from './metasets'
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
import { NBSP } from './constants'

type LevelMilestone = 0 | 4 | 8 | 12 | 16

// Internal helpers for parsing unknown HSFC shapes
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }
// no longer used: only label-based parsing is accepted for HSFC
// function asNumber(v: unknown): number | undefined { return typeof v === 'number' && Number.isFinite(v) ? v : undefined }
function asStringArray(v: unknown): string[] | undefined { return Array.isArray(v) ? (v as unknown[]).map((s) => String(s)) : undefined }
// (Legacy helpers removed for HSFC schema simplification)
function parseSubstatLike(v: unknown): number | undefined {
  if (typeof v === 'string') { const vk = variantFromLabel(v); if (vk !== null) return vk as number }
  // Objects like { id, isFlat } are no longer accepted in HSFC; labels only
  return undefined
}
function parseMainStatLike(v: unknown): number | undefined {
  if (typeof v === 'string') { const vk = variantFromLabel(v); if (vk !== null) return vk as number }
  // Objects like { id, f } are no longer accepted in HSFC; labels only
  return undefined
}

function mergeMetasetIds(base: BuilderConfig, metasets: Metaset[], extras: readonly string[] = []): BuilderConfig {
  const baseOrdered = orderMetasetIds(base.artifactMetaSets, metasets)
  const extrasOrdered = extras.length ? orderMetasetIds(extras, metasets) : []
  const merged = extrasOrdered.length ? orderMetasetIds([...baseOrdered, ...extrasOrdered], metasets) : baseOrdered
  if (extrasOrdered.length || Array.isArray(base.artifactMetaSets)) {
    return { ...base, artifactMetaSets: merged }
  }
  if (merged.length > 0) {
    return { ...base, artifactMetaSets: merged }
  }
  return base
}

// Normalize HSFC configs (readable schema) to current BuilderConfig
/** Normalize a readable HSFC config to BuilderConfig with *V fields. */
export function normalizeConfig(input: unknown): BuilderConfig {
  const rec: Record<string, unknown> = isRecord(input) ? input : {}
  const configs = rec['Configs']
  if (Array.isArray(configs) && configs.length > 0) {
    const first = configs[0]
    if (isRecord(first)) return normalizeConfig(first)
  }
  const typeIdByName = new Map<string, number>(Object.entries(artifactTypeNames).map(([k, v]) => [v, Number(k)]))
  const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))

  let rankCode: number = typeof rec['rankCode'] === 'number' ? (rec['rankCode'] as number) : 0
  if (typeof rec['Rank'] === 'string') {
    const raw = String(rec['Rank']).trim()
    // Normalize spaces, ASCII operators, and ASCII star to their canonical forms used in labels.
    const label = raw
      .replace(new RegExp(NBSP, 'g'), ' ')
      .replace(/\*/g, '★')
      .replace(/>=\s*/g, '≥ ')
      .replace(/<=\s*/g, '≤ ')
    if (label.length === 0 || /^(any)$/i.test(label)) {
      rankCode = 0
    } else {
      for (let c = 0; c <= 16; c++) { if (formatRank(c).replace(new RegExp(NBSP, 'g'), ' ') === label) { rankCode = c; break } }
    }
  }

  // Rarity parsing: support numeric `rarityCode`, human-readable labels (e.g., "≥ Epic"), and "Auto".
  let rarityCode: number = typeof rec['rarityCode'] === 'number' ? Number(rec['rarityCode']) : 0
  let rarityMode: 'auto' | 'code' = 'code'
  if (typeof rec['Rarity'] === 'string') {
    const raw = String(rec['Rarity']).trim()
    // Normalize spaces and ASCII operators to their canonical forms used in labels.
    const label = raw
      .replace(new RegExp(NBSP, 'g'), ' ')
      .replace(/>=\s*/g, '≥ ')
      .replace(/<=\s*/g, '≤ ')
    if (label.length === 0 || /^(any)$/i.test(label)) {
      rarityCode = 0
    } else if (label.toLowerCase() === RARITY_AUTO_LABEL.toLowerCase()) {
      rarityMode = 'auto'
    } else {
      // Find the code whose name matches the provided label (exact match)
      for (let c = 0; c <= 16; c++) {
        if (rarityCodeToName(c).replace(new RegExp(NBSP, 'g'), ' ') === label) { rarityCode = c; break }
      }
    }
  }

  const mainStatsVParsed: number[] = Array.isArray(rec['mainStats'])
    ? ((rec['mainStats'] as unknown[]).map((x) => parseMainStatLike(x)).filter((x): x is number => typeof x === 'number'))
    : []

  const rollModeRaw = rec['rollMode'] as unknown
  const rollModeWasOff = rollModeRaw === 'off'
  const rollMode: BuilderConfig['rollMode'] = (() => {
    if (rollModeRaw === 'strict' || rollModeRaw === 'potential' || rollModeRaw === 'auto') return rollModeRaw
    return 'potential'
  })()

  const startLevelRaw = rec['startLevel'] as unknown
  const startLevelWasAny = startLevelRaw === 'any'
  const startLevel: LevelMilestone = ((): LevelMilestone => {
    if (typeof startLevelRaw === 'number' && [0, 4, 8, 12, 16].includes(startLevelRaw)) {
      return startLevelRaw as LevelMilestone
    }
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
    autoSubstatFlex: rec['autoSubstatFlex'] === true,
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
  // Optional: Auto rarity supplements threshold (Late + Auto behavior)
  const ar = rec['autoRarityThreshold']
  if (typeof ar === 'string') {
    const v = ar.trim().toLowerCase()
    if (v.startsWith('uncom')) opt.autoRaritySupplementsThreshold = 'uncommon'
    else if (v.startsWith('rare')) opt.autoRaritySupplementsThreshold = 'rare'
    else if (v.startsWith('epic')) opt.autoRaritySupplementsThreshold = 'epic'
  }
  // New: min/max level window parsing (prefer these when present)
  const parseLevel = (v: unknown): LevelMilestone | undefined => {
    const n = Number(v)
    return ([0,4,8,12,16].includes(n) ? (n as LevelMilestone) : undefined)
  }
  let minLevel = parseLevel(rec['minLevel'])
  let maxLevel = parseLevel(rec['maxLevel'])
  if (rollModeWasOff) {
    minLevel = startLevel
    maxLevel = startLevel
  } else if (startLevelWasAny) {
    minLevel = 0
    maxLevel = 16
  }
  if (minLevel === undefined) minLevel = startLevel
  if (maxLevel === undefined) maxLevel = 16
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
  let normalized: BuilderConfig = { ...baseCfg, ...opt }

  // Post-normalization to align HSFC with in-app invariants:
  // - Conflicting bounds: when min/max are present, drop 'any' (UI cannot represent both simultaneously).
  // - Clamp numeric bounds to valid ranges (already clamped above; re-apply defensively).
  try {
    const subsV: number[] = Array.isArray(normalized.substatsV) ? normalized.substatsV.slice() : []
    const fixedV: number[] = Array.isArray(normalized.fixedSubstatsV) ? normalized.fixedSubstatsV.slice() : []
    // Ensure fixed are included in selected
    const union = Array.from(new Set<number>([...subsV, ...fixedV]))
    const bV: Record<number, { min?: number; max?: number; any?: boolean }> = { ...(normalized.substatRollBoundsV ?? {}) }
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
    // Ensure wildcard for selected substats lacking bounds (UI default is ★)
    for (const v of union) {
      if (!bV[v]) bV[v] = { any: true }
    }
    // Apply union back to selection
    normalized.substatsV = union
    // If bounds emptied entirely, delete the key to satisfy exactOptionalPropertyTypes
    if (Object.keys(bV).length) {
      normalized.substatRollBoundsV = bV
    } else {
      delete (normalized as unknown as Record<string, unknown>)['substatRollBoundsV']
    }
  } catch {}

  if (!canEnableSubstatFlex(normalized)) {
    normalized.autoSubstatFlex = false
  }

  // Coerce keep mode to 'early' when thresholds are inactive to match UI behavior
  normalized = normalizeKeepMode(normalized)
  normalized = normalizeSubstatMinTarget(normalized)
  // Remove auto rarity supplements flag when not applicable (not Auto, not Late, or thresholds inactive)
  normalized = normalizeAutoRaritySupplements(normalized)
  return normalized
}

/** Normalize HSFC Minima (label-keyed) to variant-keyed tables used internally. */
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
  const fallbackRaw = s['anyRankDefaultsTo']
  const coerceFallback = (): Star => {
    if (typeof fallbackRaw === 'number' && fallbackRaw >= 1 && fallbackRaw <= 6) return fallbackRaw as Star
    if (typeof fallbackRaw === 'string') {
      const lower = fallbackRaw.toLowerCase()
      if (lower === 'six' || lower === '6') return 6
      if (lower === 'five' || lower === '5') return 5
      if (lower === 'four' || lower === '4') return 4
      if (lower === 'three' || lower === '3') return 3
      if (lower === 'two' || lower === '2') return 2
      if (lower === 'one' || lower === '1') return 1
    }
    return 6
  }
  return {
    one: coerceStar(s['one']),
    two: coerceStar(s['two']),
    three: coerceStar(s['three']),
    four: coerceStar(s['four']),
    five: coerceStar(s['five']),
    six: coerceStar(s['six']),
    anyRankDefaultsTo: coerceFallback(),
  }
}

// Build a readable config object for HSFC export/copy (labels, not numeric IDs)
/** Build a single readable HSFC config from internal BuilderConfig state. */
export function buildReadableConfig(cfg: BuilderConfig, metasets: Metaset[]) {
  // Metasets are included in the HSFC payload separately; configs now reference
  // metasets by ID. We keep the parameter for call‑site symmetry and future use.
  void metasets
  const mainV = (cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []
  const subV = (cfg as (BuilderConfig & { substatsV?: number[] })).substatsV ?? []
  const fixedV = (cfg as (BuilderConfig & { fixedSubstatsV?: number[] })).fixedSubstatsV ?? []
  // Canonicalize label order for HSFC: use preferred stat order via compareVariants.
  const mainLabels = mainV.slice().sort(compareVariants).map(labelOfVariant)
  const subLabels = subV.slice().sort(compareVariants).map((v) => labelOfVariant(v))
  const fixedLabels = fixedV.slice().sort(compareVariants).map((v) => labelOfVariant(v))
  return {
    name: cfg.name,
    keep: cfg.keep,
    enabled: cfg.enabled !== false,
    // For readability in HSFC/clipboard, render Auto or explicit labels. "Any" when code is 0.
    Rank: (cfg.rankCode === 0 ? 'Any' : formatRank(cfg.rankCode)),
    Rarity: (cfg.rarityMode === 'auto' ? RARITY_AUTO_LABEL : (cfg.rarityCode === 0 ? 'Any' : rarityCodeToName(cfg.rarityCode))),
    Faction: ((cfg.factionCode ?? 0) === 0 ? 'Any' : factionCodeToName(cfg.factionCode ?? 0)),
    mainStats: mainLabels,
    // New schema: emit explicit level window and omit legacy roll fields
    minLevel: ((cfg as BuilderConfig).minLevel ?? 0),
    maxLevel: ((cfg as BuilderConfig).maxLevel ?? 16),
    ...(cfg.earlyKeepMode === 'late' ? { earlyKeepMode: 'late' as const } : {}),
    substats: subLabels,
    fixedSubstats: fixedLabels,
    // Include only when applicable: Rarity=Auto and thresholds active in Late mode
    ...((cfg.rarityMode === 'auto' && cfg.earlyKeepMode === 'late' && isMilestoneThresholdsActive(cfg))
      ? { autoRarityThreshold: (cfg.autoRaritySupplementsThreshold ?? 'rare') }
      : {}),
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
    ...(cfg.autoSubstatFlex && canEnableSubstatFlex(cfg) ? { autoSubstatFlex: true as const } : {}),
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
/** Convert variant-keyed Minima tables to label-keyed maps for HSFC export. */
export function minimaToReadable(minima: MinimaTable) {
  const conv = (rec: Record<number, number>) => {
    const out: Record<string, number> = {}
    for (const [vk, val] of Object.entries(rec)) { out[labelOfVariant(Number(vk))] = val as number }
    return out
  }
  const fallbackLabel = (() => {
    if (!minima.anyRankDefaultsTo) return 'six'
    switch (minima.anyRankDefaultsTo) {
      case 1: return 'one'
      case 2: return 'two'
      case 3: return 'three'
      case 4: return 'four'
      case 5: return 'five'
      default: return 'six'
    }
  })()
  return {
    one: conv(minima.one as Record<number, number>),
    two: conv(minima.two as Record<number, number>),
    three: conv(minima.three as Record<number, number>),
    four: conv(minima.four as Record<number, number>),
    five: conv(minima.five as Record<number, number>),
    six: conv(minima.six as Record<number, number>),
    anyRankDefaultsTo: fallbackLabel,
  }
}

// Parse text that may be a single config, an array, or an HSFC object with Configs
/** Parse text as HSFC content: returns normalized configs array on success, [] on failure. */
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
        return mergeMetasetIds(base, metas, metaIds)
      })
    }
    if (isRecord(parsed)) {
      const cfgs = Array.isArray(parsed['Configs']) ? (parsed['Configs'] as unknown[]) : []
      const metas = metasFromObj(parsed) ?? metasetsForNames ?? []
      if (cfgs.length) {
        return cfgs.map((raw) => {
          const base = normalizeConfig(raw)
          const metaIds = metas.length ? resolveMetaIds(raw, metas) : []
          return mergeMetasetIds(base, metas, metaIds)
        })
      }
      const base = normalizeConfig(parsed)
      const metaIds = metas.length ? resolveMetaIds(parsed, metas) : []
      return [mergeMetasetIds(base, metas, metaIds)]
    }
  } catch {
    // ignore
  }
  return []
}

/**
 * Parse a full HSFC text payload and return normalized state slices.
 * Accepts a previous snapshot for metasets/minima/allExplicit defaults.
 */
export function parseHsfcText(
  text: string,
  prev: { metasets: Metaset[]; minima: MinimaTable },
): { cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; selectedIndex: number | null; note?: string; finalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> } } {
  const parsed = JSON.parse(text) as unknown
  return parseHsfcObject(parsed, prev)
}

/** Parse an HSFC object (readable schema) into normalized slices. */
export function parseHsfcObject(
  parsed: unknown,
  prev: { metasets: Metaset[]; minima: MinimaTable },
): { cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; selectedIndex: number | null; note?: string; finalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> } } {
  const parsedRec = (typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {})
  let rawCfgs = Array.isArray(parsed) ? parsed : (Array.isArray(parsedRec['Configs']) ? (parsedRec['Configs'] as unknown[]) : [])
  // Convenience: accept a single readable-config object (tests/fixtures/*.hsfc use this minimal shape).
  // Why: Developers often drag these fixtures into the app while validating builder output. The shape
  // matches what parseHsfcText expects for each config, so when no `Configs` array is present but we
  // detect the usual readable config keys, treat the payload as a one-item Configs array.
  if (rawCfgs.length === 0 && parsedRec && typeof parsedRec === 'object') {
    const hasReadableConfigKey = (() => {
      const keys = new Set(Object.keys(parsedRec))
      // Heuristic: any of these readable HSFC config keys indicates a single-config payload
      const hints = [
        'substats', 'fixedSubstats', 'mainStats', 'Rank', 'Rarity', 'Faction',
        'artifactTypeNames', 'artifactSetNames', 'artifactMetaSetNames',
        'minLevel', 'maxLevel', 'minCount', 'minRequiredRolls', 'substatRollBounds',
      ]
      for (const k of hints) if (keys.has(k)) return true
      return false
    })()
    if (hasReadableConfigKey) rawCfgs = [parsedRec]
  }
  const metasets: Metaset[] = (() => {
    const raws = parsedRec['Metasets']
    if (!Array.isArray(raws)) return prev.metasets
    const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))
    return raws.map((m: unknown) => {
      const mRec = (m || {}) as Record<string, unknown>
      const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
      const sets = names.map((n: unknown) => setIdByName.get(String(n))).filter((x: unknown): x is number => typeof x === 'number')
      const iconId = normalizeMetasetIconId(mRec['iconId'])
      return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false, iconId }
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
    return mergeMetasetIds(base, metasets, resolvedIds)
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

/** Read a `.hsfc`/JSON file and parse with the same semantics as parseHsfcText. */
export async function readHsfcFile(
  file: File,
  prev: { metasets: Metaset[]; minima: MinimaTable },
): Promise<{ cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; selectedIndex: number | null; note?: string; finalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> } }>
{
  const text = await file.text()
  return parseHsfcText(text, prev)
}

/** Parse an internal autosave payload (not HSFC); expects variant-keyed minima and full BuilderConfig objects. */

/**
 * Build a full, readable HSFC payload object for Save/Copy, given current state.
 */
export function buildHsfcPayload(args: {
  version: string,
  metasets: Metaset[],
  minima: MinimaTable,
  configs: BuilderConfig[],
  finalSellRemainder?: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> },
  selectedConfigIndex: number | null,
  note?: string,
  }): { Version: string; Metasets: Array<{ id: string; name: string; setNames: string[]; show?: boolean }>; Minima: unknown; Configs: unknown[]; FinalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }; SelectedConfigIndex?: number; Note?: string } {
  const { version, metasets, minima, configs, finalSellRemainder, selectedConfigIndex, note } = args
  const metasOut = metasets.map(m => {
    const iconId = normalizeMetasetIconId(m.iconId)
    return {
      id: m.id,
      name: m.name,
      setNames: m.sets.slice().sort(compareArtifactSets)
        .map((id) => artifactSetNames[Number(id)])
        .filter((x): x is string => Boolean(x)),
      show: m.show !== false,
      ...(iconId !== DEFAULT_METASET_ICON_ID ? { iconId } : {}),
    }
  })
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

/** Convert an HSFC payload object to a Blob ready to download. */
export function hsfcToBlob(payload: unknown): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}
