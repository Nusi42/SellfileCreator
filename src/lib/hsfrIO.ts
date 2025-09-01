/**
 * HSFR IO Helpers
 *
 * Responsibilities:
 * - Normalize legacy/readable HSFR payloads to the internal StatVariant-based model.
 * - Build readable HSFR payloads (labels, not numeric IDs) from internal state for Save/Copy.
 * - Parse pasted text that may be a single config, an array of configs, or a full HSFR object.
 *
 * This module deliberately contains only HSFR read/write concerns to keep UI code tidy.
 */
import type { BuilderConfig, MinimaTable } from './hsfBuilder'
import type { Metaset } from './metasets'
import {
  artifactSetNames,
  artifactTypeNames,
  factionCodeToName,
  formatRank,
  labelOfVariant,
  parseMainStat,
  parseSubstat,
  StatId,
  variantToSub,
  mainToVariant,
  subToVariant,
  rarityCodeToName,
  factionNames,
} from './types'

// Internal helpers for parsing unknown HSFR shapes
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }
function asNumber(v: unknown): number | undefined { return typeof v === 'number' && Number.isFinite(v) ? v : undefined }
function asStringArray(v: unknown): string[] | undefined { return Array.isArray(v) ? (v as unknown[]).map((s) => String(s)) : undefined }
function asNumberArray(v: unknown): number[] | undefined { return Array.isArray(v) ? (v as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n)) : undefined }
function parseSubstatLike(v: unknown): { id: number; isFlat: boolean } | undefined {
  if (typeof v === 'string') { const parsed = parseSubstat(v); if (parsed) return parsed }
  if (isRecord(v)) { const id = asNumber(v.id); const isFlat = Boolean(v.isFlat); if (typeof id === 'number' && Number.isFinite(id)) return { id, isFlat } }
  return undefined
}
function parseMainStatLike(v: unknown): { id: number; f?: number } | undefined {
  if (typeof v === 'string') { const parsed = parseMainStat(v); if (parsed) return parsed }
  if (isRecord(v)) { const id = asNumber(v.id); const fRaw = (v as Record<string, unknown>)['f']; if (typeof id === 'number' && Number.isFinite(id)) { if (fRaw === undefined) return { id }; const f = Number(fRaw); return Number.isFinite(f) ? { id, f } : { id } } }
  return undefined
}

// Normalize HSFR configs to current BuilderConfig (accepts older shapes)
/** Normalize an HSFR config (any accepted historical shape) to BuilderConfig with *V fields. */
export function normalizeConfig(input: unknown): BuilderConfig {
  const rec: Record<string, unknown> = isRecord(input) ? input : {}
  const typeIdByName = new Map<string, number>(Object.entries(artifactTypeNames).map(([k, v]) => [v, Number(k)]))
  const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))

  const rankCompat = (rec as Record<string, unknown>).rank as { kind?: string; value?: unknown } | undefined
  let rankCode: number = typeof rec['rankCode'] === 'number' ? (rec['rankCode'] as number) : 0
  if (rankCode === 0 && rankCompat && typeof rankCompat === 'object') {
    if (rankCompat.kind === 'any') rankCode = 0
    else if (rankCompat.kind === 'min') { const v = Number(rankCompat.value); if (v >= 1 && v <= 5) rankCode = v + 6; else if (v >= 6) rankCode = 6 }
    else if (rankCompat.kind === 'exact') { rankCode = Number(rankCompat.value) || 0 }
  }
  if (typeof rec['Rank'] === 'string') {
    const label = String(rec['Rank']); for (let c = 0; c <= 16; c++) { if (formatRank(c) === label) { rankCode = c; break } }
  }

  const rarityCompat = rec['rarityExact'] as unknown
  let rarityCode: number = typeof rec['rarityCode'] === 'number' ? Number(rec['rarityCode']) : 0
  if (rarityCode === 0 && typeof rarityCompat === 'string') {
    const map: Record<string, number> = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Mythical: 15 }
    rarityCode = map[rarityCompat] ?? 0
  }

  const mainStatRaw = rec['mainStat']
  const mainStat = isRecord(mainStatRaw) ? mainStatRaw : ({ any: true } as { any?: boolean })
  const mainStatsArr: Array<{ id: number; f?: number }> = Array.isArray(rec['mainStats'])
    ? ((rec['mainStats'] as unknown[]).map((x) => parseMainStatLike(x)).filter((x): x is { id: number; f?: number } => Boolean(x)))
    : (((((mainStat as { any?: boolean }).any)) ? [] : [parseMainStatLike(mainStat)]).filter((x): x is { id: number; f?: number } => Boolean(x)))

  const rollMode: BuilderConfig['rollMode'] = (() => {
    const m = rec['rollMode'] as unknown
    if (m === 'off' || m === 'strict' || m === 'potential' || m === 'auto') return m
    if (rec['generateRollPermutations'] === false) return 'off'
    if (rec['potentialKeep'] === true) return 'potential'
    if (rec['generateRollPermutations'] === true) return 'strict'
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
    rankCode,
    rarityCode,
    factionCode: (() => {
      if (typeof rec['factionCode'] === 'number') return Number(rec['factionCode'])
      if (typeof rec['Faction'] === 'string') {
        const byName = new Map<string, number>(Object.entries(factionNames).map(([k, v]) => [v, Number(k)]))
        const code = byName.get(String(rec['Faction']))
        if (typeof code === 'number') return code
      }
      return 0
    })(),
    mainStatsV: mainStatsArr.map(ms => mainToVariant(ms.id, ms.f)) as number[],
    startLevel,
    rollBaseline: (rec['rollBaseline'] === 'upToLevel') ? 'upToLevel' : 'afterStart',
    rollMode,
    substatsV: (Array.isArray(rec['substats']) ? ((rec['substats'] as unknown[]).map((x) => parseSubstatLike(x)).filter((x): x is { id: number; isFlat: boolean } => Boolean(x))) : [])
      .map(s => subToVariant(s.id, s.isFlat)) as number[],
    fixedSubstatsV: (Array.isArray(rec['fixedSubstats']) ? ((rec['fixedSubstats'] as unknown[]).map((x) => parseSubstatLike(x)).filter((x): x is { id: number; isFlat: boolean } => Boolean(x))) : [])
      .map(s => subToVariant(s.id, s.isFlat)) as number[],
    minCount: (() => { const m = rec['minCount']; return (typeof m === 'number' && [0, 1, 2, 3, 4].includes(m)) ? (m as 0 | 1 | 2 | 3 | 4) : 0 })(),
    autoMinCount: Boolean((rec['autoMinCount'] ?? false) as boolean),
  }

  const __srbV = (() => {
    const src = rec['substatRollBounds'] as unknown
    if (!src || typeof src !== 'object') return undefined
    const out: Record<number, { min?: number; max?: number; any?: boolean }> = {}
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      let id: number | undefined
      let isFlat: boolean | undefined
      const token: string = String(k)
      const parts = token.split(':')
      if (parts.length === 2 && /^-?\d+$/.test(parts[0] || '')) { id = Number(parts[0]); isFlat = parts[1] === 'true' }
      else { const parsed = parseSubstat(token as string); if (parsed) { id = parsed.id; isFlat = parsed.isFlat } }
      if (id === undefined) continue
      const min = (v as Record<string, unknown>)['min']
      const max = (v as Record<string, unknown>)['max']
      const any = Boolean((v as Record<string, unknown>)['any'])
      const mv: { min?: number; max?: number; any?: boolean } = {}
      if (typeof min === 'number' && min >= 0) mv.min = Math.min(5, Math.floor(min))
      if (typeof max === 'number' && max >= 0) mv.max = Math.min(5, Math.floor(max))
      if (any) mv.any = true
      const vk = subToVariant(id, isFlat) as number
      if (mv.min !== undefined || mv.max !== undefined || mv.any) out[vk] = mv
    }
    return Object.keys(out).length ? out : undefined
  })()

  const opt: Partial<BuilderConfig> = {}
  if (__srbV !== undefined) opt.substatRollBoundsV = __srbV
  const __artTypes = Array.isArray(rec['artifactTypeNames'])
    ? ((rec['artifactTypeNames'] as unknown[]).map((n) => typeIdByName.get(String(n))).filter((x): x is number => typeof x === 'number'))
    : asNumberArray(rec['artifactTypes'])
  const __artSets = Array.isArray(rec['artifactSetNames'])
    ? ((rec['artifactSetNames'] as unknown[]).map((n) => setIdByName.get(String(n))).filter((x): x is number => typeof x === 'number'))
    : asNumberArray(rec['artifactSets'])
  const __artMetaSets = asStringArray(rec['artifactMetaSets'])
  if (__artTypes !== undefined) opt.artifactTypes = __artTypes
  if (__artSets !== undefined) opt.artifactSets = __artSets
  if (__artMetaSets !== undefined) opt.artifactMetaSets = __artMetaSets
  const normalized: BuilderConfig = { ...baseCfg, ...opt }
  return normalized
}

/** Normalize HSFR Minima (label- or legacy-keyed) to variant-keyed tables used internally. */
export function normalizeMinima(src: unknown): MinimaTable {
  const coerceStar = (rec: unknown): Record<number, number> => {
    const out: Record<number, number> = {}
    if (!rec || typeof rec !== 'object') return out
    for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
      let vk: number | null = null
      if (/^-?\d+$/.test(k)) { vk = Number(k) }
      else if (k.includes(':')) { const [idStr, flatStr] = k.split(':'); const id = Number(idStr); const isFlat = flatStr === 'true'; vk = subToVariant(id, isFlat) as number }
      else { const parsed = parseSubstat(k); if (parsed) vk = subToVariant(parsed.id, parsed.isFlat) as number }
      const num = Number(v)
      if (vk !== null && Number.isFinite(num)) out[vk] = num
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
  const mainV = (cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []
  const subV = (cfg as (BuilderConfig & { substatsV?: number[] })).substatsV ?? []
  const fixedV = (cfg as (BuilderConfig & { fixedSubstatsV?: number[] })).fixedSubstatsV ?? []
  const mainLabels = mainV.map(labelOfVariant)
  const subLabels = subV.map(v => { const o = variantToSub(v); return `${o.id === StatId.HP || o.id === StatId.ATK || o.id === StatId.DEF ? (o.isFlat ? (o.id === StatId.HP ? 'HP' : o.id === StatId.ATK ? 'ATK' : 'DEF') : (o.id === StatId.HP ? 'HP%' : o.id === StatId.ATK ? 'ATK%' : 'DEF%')) : labelOfVariant(v)}` }).map(s => s)
  const fixedLabels = fixedV.map(v => { const o = variantToSub(v); return `${o.id === StatId.HP || o.id === StatId.ATK || o.id === StatId.DEF ? (o.isFlat ? (o.id === StatId.HP ? 'HP' : o.id === StatId.ATK ? 'ATK' : 'DEF') : (o.id === StatId.HP ? 'HP%' : o.id === StatId.ATK ? 'ATK%' : 'DEF%')) : labelOfVariant(v)}` }).map(s => s)
  return {
    name: cfg.name,
    keep: cfg.keep,
    enabled: cfg.enabled !== false,
    Rank: formatRank(cfg.rankCode),
    Rarity: rarityCodeToName(cfg.rarityCode),
    Faction: factionCodeToName(cfg.factionCode ?? 0),
    mainStats: mainLabels,
    startLevel: cfg.startLevel,
    rollBaseline: cfg.rollBaseline,
    rollMode: cfg.rollMode,
    substats: subLabels,
    fixedSubstats: fixedLabels,
    substatRollBounds: (() => {
      const srcV = (cfg as (BuilderConfig & { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> })).substatRollBoundsV ?? {}
      const out: Record<string, { min?: number; max?: number; any?: boolean }> = {}
      for (const [vk, v] of Object.entries(srcV)) {
        const o = variantToSub(Number(vk))
        const n = labelOfVariant(Number(vk))
        // Prefer labelOfVariant; fallback to formatSubstat-like naming only for HP/ATK/DEF percent/flat
        const label = (o.id === StatId.HP || o.id === StatId.ATK || o.id === StatId.DEF)
          ? (o.isFlat ? (o.id === StatId.HP ? 'HP' : o.id === StatId.ATK ? 'ATK' : 'DEF') : (o.id === StatId.HP ? 'HP%' : o.id === StatId.ATK ? 'ATK%' : 'DEF%'))
          : n
        out[label] = v as { min?: number; max?: number; any?: boolean }
      }
      return Object.keys(out).length ? out : undefined
    })(),
    minCount: cfg.minCount,
    autoMinCount: cfg.autoMinCount,
    artifactTypeNames: (cfg.artifactTypes ?? []).map(t => artifactTypeNames[Number(t)]).filter(Boolean),
    artifactSetNames: (cfg.artifactSets ?? []).map(s => artifactSetNames[Number(s)]).filter(Boolean),
    artifactMetaSetNames: (cfg.artifactMetaSets ?? []).map(id => metasets.find(m => m.id === id)?.name || id),
  }
}

// Convert Minima (variant-keyed) to label-keyed maps for readability
/** Convert variant-keyed Minima tables to label-keyed maps for HSFR export. */
export function minimaToReadable(minima: MinimaTable) {
  const conv = (rec: Record<number, number>) => {
    const out: Record<string, number> = {}
    for (const [vk, val] of Object.entries(rec)) {
      const o = variantToSub(Number(vk))
      const n = labelOfVariant(Number(vk))
      const label = (o.id === StatId.HP || o.id === StatId.ATK || o.id === StatId.DEF)
        ? (o.isFlat ? (o.id === StatId.HP ? 'HP' : o.id === StatId.ATK ? 'ATK' : 'DEF') : (o.id === StatId.HP ? 'HP%' : o.id === StatId.ATK ? 'ATK%' : 'DEF%'))
        : n
      out[label] = val as number
    }
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
export function parseConfigsFromText(text: string): BuilderConfig[] {
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) return parsed.map(normalizeConfig)
    if (isRecord(parsed)) {
      const cfgs = Array.isArray(parsed['Configs']) ? (parsed['Configs'] as unknown[]) : []
      return cfgs.length ? cfgs.map(normalizeConfig) : [normalizeConfig(parsed)]
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
  prev: { metasets: Metaset[]; minima: MinimaTable; includeAllExplicitMeta: boolean },
): { cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; includeAllExplicitMeta: boolean; selectedIndex: number | null } {
  const parsed = JSON.parse(text) as unknown
  return parseHsfrObject(parsed, prev)
}

/** Parse an HSFR object (or legacy forms) into normalized slices. */
export function parseHsfrObject(
  parsed: unknown,
  prev: { metasets: Metaset[]; minima: MinimaTable; includeAllExplicitMeta: boolean },
): { cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; includeAllExplicitMeta: boolean; selectedIndex: number | null } {
  const parsedRec = (typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {})
  const rawCfgs = Array.isArray(parsed) ? parsed : (Array.isArray(parsedRec['Configs']) ? (parsedRec['Configs'] as unknown[]) : [])
  const cfgs = rawCfgs.map(normalizeConfig)
  const metasets: Metaset[] = (() => {
    const raws = parsedRec['Metasets']
    if (!Array.isArray(raws)) return prev.metasets
    const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))
    return raws.map((m: unknown) => {
      const mRec = (m || {}) as Record<string, unknown>
      const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
      const sets = Array.isArray(mRec['sets']) ? (mRec['sets'] as number[]) : names.map((n: unknown) => setIdByName.get(String(n))).filter((x: unknown): x is number => typeof x === 'number')
      return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false }
    })
  })()
  const minima: MinimaTable = (!Array.isArray(parsed) && parsedRec['Minima']) ? normalizeMinima(parsedRec['Minima']) : prev.minima
  const includeAllExplicitMeta: boolean = (!Array.isArray(parsed) && typeof parsedRec['IncludeAllExplicitMeta'] === 'boolean') ? Boolean(parsedRec['IncludeAllExplicitMeta']) : prev.includeAllExplicitMeta
  const savedSel = (!Array.isArray(parsed) && typeof parsedRec['SelectedConfigIndex'] === 'number') ? (parsedRec['SelectedConfigIndex'] as number) : (cfgs.length ? cfgs.length - 1 : null)
  const selectedIndex = (savedSel !== null && savedSel >= 0 && savedSel < cfgs.length) ? savedSel : (cfgs.length ? cfgs.length - 1 : null)
  return { cfgs, metasets, minima, includeAllExplicitMeta, selectedIndex }
}

/** Read a `.hsfr`/JSON file and parse with the same semantics as parseHsfrText. */
export async function readHsfrFile(
  file: File,
  prev: { metasets: Metaset[]; minima: MinimaTable; includeAllExplicitMeta: boolean },
): Promise<{ cfgs: BuilderConfig[]; metasets: Metaset[]; minima: MinimaTable; includeAllExplicitMeta: boolean; selectedIndex: number | null }>
{
  const text = await file.text()
  return parseHsfrText(text, prev)
}

/**
 * Build a full, readable HSFR payload object for Save/Copy, given current state.
 */
export function buildHsfrPayload(args: {
  version: string,
  metasets: Metaset[],
  minima: MinimaTable,
  configs: BuilderConfig[],
  includeAllExplicitMeta: boolean,
  selectedConfigIndex: number | null,
}): { Version: string; Metasets: Array<{ id: string; name: string; setNames: string[]; show?: boolean }>; Minima: unknown; Configs: unknown[]; IncludeAllExplicitMeta: boolean; SelectedConfigIndex?: number } {
  const { version, metasets, minima, configs, includeAllExplicitMeta, selectedConfigIndex } = args
  const metasOut = metasets.map(m => ({
    id: m.id,
    name: m.name,
    setNames: m.sets
      .map((id) => artifactSetNames[Number(id)])
      .filter((x): x is string => Boolean(x)),
    show: m.show !== false,
  }))
  return {
    Version: version,
    Metasets: metasOut,
    Minima: minimaToReadable(minima),
    Configs: configs.map(cfg => buildReadableConfig(cfg, metasets)),
    IncludeAllExplicitMeta: includeAllExplicitMeta,
    ...(selectedConfigIndex != null ? { SelectedConfigIndex: selectedConfigIndex } : (configs.length ? { SelectedConfigIndex: configs.length - 1 } : {})),
  }
}

/** Convert an HSFR payload object to a Blob ready to download. */
export function hsfrToBlob(payload: unknown): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}
