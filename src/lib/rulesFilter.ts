/**
 * rulesFilter.ts
 *
 * View-only filters for HSF preview table. Does not affect export.
 * The filter state is strictly typed and pure predicate builders are provided
 * so the table can derive a filtered rules array without side effects.
 */
import type { HsfRule } from './hsfTypes'
import type { SellfileExportMode } from './hsfBuilder'
import type { Metaset } from './metasets'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from './gearSets/selection'
import {
  mainToVariant,
  subToVariant,
  type ArtifactTypeId,
  type FactionId,
  StatVariant,
  StatId,
  LEVEL_MILESTONES,
  LEVEL_ANY_SENTINEL,
  type LevelMilestone,
  RANK_VALUES,
  type RankValue,
} from './types'
import { rankCoverage, rarityCoverage } from './hsfTypes'
import type { HsfRuleWithCfg } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import { isAccessorySlot } from './testerDomain'
import { ACCESSORY_NO_SET_ID } from './constants'
import { getRuleConfigIndex, resolveMatchConfigName } from './ruleConfigIndex'
import { getDaysSince } from './dateDisplay'

// Tri-state for handling explicit "Any" fields in rules.
export type AnyMode = 'off' | 'include' | 'only'

export type SubstatMatchMode = 'all' | 'any'

// Compact tri-state toggle used for simple boolean fields in filters.
// 'any' leaves the field unfiltered; 'yes' matches true/enabled; 'no' matches false/disabled.
export type Bool3 = 'any' | 'yes' | 'no'

export type TesterSourceFilter = 'inventory' | 'collection' | 'vault' | 'inbox' | 'manual'
export type TesterChaosFilterMode = 'any' | 'notRerolled' | 'rerolled'
export type TesterGlyphFilterMode = 'any' | 'on' | 'off' | 'selected'
export type TesterRollWildcardMode = 'off' | 'any'

export const TESTER_LAST_USE_PRESETS = ['never', 'recent7', 'recent30', 'recent90', 'older90'] as const
export type TesterLastUsePreset = typeof TESTER_LAST_USE_PRESETS[number]

export type TesterLastUseCustomFilter = {
  enabled: boolean
  minDays: number
  maxDays: number
}

export type TesterLastUseFilter = {
  presets: TesterLastUsePreset[]
  custom: TesterLastUseCustomFilter
}

export type RuleSourceLabelMap = Record<string, readonly string[]>

export const TESTER_ROLL_COUNT_VALUES = [0, 1, 2, 3, 4, 5] as const
export type TesterRollCountValue = typeof TESTER_ROLL_COUNT_VALUES[number]

export type TesterRollCountSet = readonly TesterRollCountValue[]

export const normalizeTesterRollCountSelection = (counts: readonly number[]): TesterRollCountSet => (
  normalizeRollCountSet(counts)
)

export type TesterRollFilterRow = {
  stat: StatVariant
  counts: TesterRollCountSet
}

export type TesterRollWildcardFilter = {
  mode: TesterRollWildcardMode
  counts: TesterRollCountSet
}

const DEFAULT_TESTER_ROLL_COUNT_SET: TesterRollCountSet = []

export type TesterRollFilterState = {
  wildcard: TesterRollWildcardFilter
  perStat: TesterRollFilterRow[]
}

export const createDefaultTesterRollsState = (): TesterRollFilterState => ({
  wildcard: { mode: 'off', counts: DEFAULT_TESTER_ROLL_COUNT_SET },
  perStat: [],
})

export type TesterLevelRange = {
  min: number
  max: number
}

export const TESTER_LEVEL_MIN = 0
export const TESTER_LEVEL_MAX = 16

export const DEFAULT_TESTER_LEVEL_RANGE: TesterLevelRange = Object.freeze({
  min: TESTER_LEVEL_MIN,
  max: TESTER_LEVEL_MAX,
})

export const TESTER_LAST_USE_MIN_DAYS = 0
export const TESTER_LAST_USE_MAX_DAYS = 365

const LAST_USE_PRESET_ORDER: readonly TesterLastUsePreset[] = TESTER_LAST_USE_PRESETS

const DEFAULT_TESTER_LAST_USE_CUSTOM: TesterLastUseCustomFilter = Object.freeze({
  enabled: false,
  minDays: TESTER_LAST_USE_MIN_DAYS,
  maxDays: TESTER_LAST_USE_MAX_DAYS,
})

export const createDefaultTesterLastUseCustom = (): TesterLastUseCustomFilter => ({
  enabled: DEFAULT_TESTER_LAST_USE_CUSTOM.enabled,
  minDays: DEFAULT_TESTER_LAST_USE_CUSTOM.minDays,
  maxDays: DEFAULT_TESTER_LAST_USE_CUSTOM.maxDays,
})

export const createDefaultTesterLastUseFilter = (): TesterLastUseFilter => ({
  presets: [],
  custom: createDefaultTesterLastUseCustom(),
})

export interface RulesFilterState {
  // Rule-level filters
  rule?: { keep: Bool3; use: Bool3 }
  testerResult?: { keep: Bool3; matched: Bool3 }
  sets: { selected: ArtifactSetSelectionEntry[]; metaSelected?: string[]; anyMode: AnyMode; match?: 'any' | 'all' }
  slots: { selected: ArtifactTypeId[]; anyMode: AnyMode }
  // Rank: discrete buttons (1..6) instead of a contiguous range
  rank: { selected: RankValue[]; anyMode: AnyMode }
  // Rarity: discrete buttons (Common..Mythical) instead of a contiguous range
  rarity: { selected: RankValue[]; anyMode: AnyMode }
  level: { selected: LevelMilestone[]; anyMode: AnyMode; testerRange?: TesterLevelRange }
  main: { selected: StatVariant[]; anyMode: AnyMode }
  sub: {
    // "Must have": include rules/items that match these selected substats.
    selected: StatVariant[]
    // "Must not have": exclude rules/items that contain any of these substats.
    notSelected: StatVariant[]
    // When multiple "must have" substats are selected, choose whether to require all or any of them.
    mode: SubstatMatchMode
    // Treat wildcard ("Any") substats as include/hide/only.
    wildcardMode: AnyMode
  }
  faction: { selected: FactionId[]; anyMode: AnyMode }
  configName?: { query: string }
  testerSources?: { selected: TesterSourceFilter[] }
  testerChaos?: { mode: TesterChaosFilterMode }
  testerGlyphs?: { mode: TesterGlyphFilterMode }
  testerAscension?: { stars: number[]; stats: StatVariant[] }
  testerChampions?: { selected: number[] }
  testerRolls?: TesterRollFilterState
  testerLastUse?: TesterLastUseFilter
}

const clampTesterLevelValue = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return TESTER_LEVEL_MIN
  const rounded = Math.round(value)
  if (rounded < TESTER_LEVEL_MIN) return TESTER_LEVEL_MIN
  if (rounded > TESTER_LEVEL_MAX) return TESTER_LEVEL_MAX
  return rounded
}

export function resolveTesterLevelRange(levelState?: RulesFilterState['level']): TesterLevelRange {
  const baseRange = levelState?.testerRange ?? DEFAULT_TESTER_LEVEL_RANGE
  const min = clampTesterLevelValue(baseRange?.min ?? DEFAULT_TESTER_LEVEL_RANGE.min)
  const max = clampTesterLevelValue(baseRange?.max ?? DEFAULT_TESTER_LEVEL_RANGE.max)
  if (min <= max) return { min, max }
  return { min: max, max: min }
}

export const DEFAULT_RULES_FILTER_STATE: RulesFilterState = {
  rule: { keep: 'any', use: 'any' },
  testerResult: { keep: 'any', matched: 'any' },
  sets: { selected: [], anyMode: 'include', match: 'any' },
  slots: { selected: [], anyMode: 'include' },
  rank: { selected: [], anyMode: 'include' },
  rarity: { selected: [], anyMode: 'include' },
  level: { selected: [], anyMode: 'include', testerRange: { ...DEFAULT_TESTER_LEVEL_RANGE } },
  main: { selected: [], anyMode: 'include' },
  sub: { selected: [], notSelected: [], mode: 'all', wildcardMode: 'include' },
  faction: { selected: [], anyMode: 'include' },
  configName: { query: '' },
  testerSources: { selected: [] },
  testerChaos: { mode: 'any' },
  testerGlyphs: { mode: 'any' },
  testerAscension: { stars: [], stats: [] },
  testerChampions: { selected: [] },
  testerRolls: createDefaultTesterRollsState(),
  testerLastUse: createDefaultTesterLastUseFilter(),
}

/**
 * Deep clone of `DEFAULT_RULES_FILTER_STATE`.
 *
 * Why: the filter panel mutates nested arrays/objects; callers need a safe,
 * independent copy so edits never leak through shared references.
 */
export const cloneDefaultRulesFilterState = (): RulesFilterState => (
  JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState
)

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object'
)

const sanitizeStringEnum = <T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T => (
  (typeof raw === 'string' && allowed.includes(raw as T)) ? (raw as T) : fallback
)

const sanitizeUniqueStringArray = (raw: unknown): string[] => {
  // Strings may come from older builds or manual edits; keep them trimmed + unique.
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    next.push(trimmed)
  }
  return next
}

const sanitizeUniqueNumberArray = (raw: unknown): number[] => {
  // Storage may contain strings for numbers (e.g. `"12"`), so coerce cautiously.
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const next: number[] = []
  for (const value of raw) {
    if (typeof value !== 'number' && typeof value !== 'string') continue
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || seen.has(numeric)) continue
    seen.add(numeric)
    next.push(numeric)
  }
  return next
}

const sanitizeUniqueNumberArrayFromSet = <T extends number>(
  raw: unknown,
  allowed: readonly T[],
): T[] => {
  // Keeps only numbers from an explicit whitelist (Rank, Level milestone, etc).
  const set = new Set<number>(allowed)
  const next: T[] = []
  for (const value of sanitizeUniqueNumberArray(raw)) {
    if (!set.has(value)) continue
    next.push(value as T)
  }
  return next
}

const TESTER_SOURCE_FILTERS = Object.freeze(['inventory', 'collection', 'vault', 'inbox', 'manual'] as const)
const TESTER_CHAOS_MODES = Object.freeze(['any', 'notRerolled', 'rerolled'] as const)
const TESTER_GLYPH_MODES = Object.freeze(['any', 'on', 'off', 'selected'] as const)

/**
 * Sanitize arbitrary input back into a complete `RulesFilterState`.
 *
 * Why: localStorage values can be partially written, out of date, or manually
 * edited. The filter logic assumes required sub-objects exist, so we clamp every
 * field back to a safe default shape.
 */
export const sanitizeRulesFilterState = (raw: unknown): RulesFilterState => {
  const fallback = cloneDefaultRulesFilterState()
  if (!isRecord(raw)) return fallback

  const next: RulesFilterState = fallback
  const rec = raw as UnknownRecord

  // Rule-level toggles are optional, but normalize them so UI logic can read freely.
  {
    const candidate = isRecord(rec['rule']) ? (rec['rule'] as UnknownRecord) : null
    next.rule = {
      keep: sanitizeStringEnum(candidate?.['keep'], ['any', 'yes', 'no'] as const, next.rule?.keep ?? 'any'),
      use: sanitizeStringEnum(candidate?.['use'], ['any', 'yes', 'no'] as const, next.rule?.use ?? 'any'),
    }
  }
  {
    const candidate = isRecord(rec['testerResult']) ? (rec['testerResult'] as UnknownRecord) : null
    next.testerResult = {
      keep: sanitizeStringEnum(candidate?.['keep'], ['any', 'yes', 'no'] as const, next.testerResult?.keep ?? 'any'),
      matched: sanitizeStringEnum(
        candidate?.['matched'],
        ['any', 'yes', 'no'] as const,
        next.testerResult?.matched ?? 'any',
      ),
    }
  }

  // Core required sections: always rebuild them so `.map()` calls remain safe.
  {
    const candidate = isRecord(rec['sets']) ? (rec['sets'] as UnknownRecord) : null
    const metaSelected = sanitizeUniqueStringArray(candidate?.['metaSelected'])
    // Normalize set entries so legacy number arrays still load cleanly.
    const selected = normalizeArtifactSetSelections(candidate?.['selected'])
    next.sets = {
      selected,
      ...(metaSelected.length > 0 ? { metaSelected } : {}),
      anyMode: sanitizeStringEnum(candidate?.['anyMode'], ['off', 'include', 'only'] as const, next.sets.anyMode),
      match: sanitizeStringEnum(candidate?.['match'], ['any', 'all'] as const, next.sets.match ?? 'any'),
    }
  }
  {
    const candidate = isRecord(rec['slots']) ? (rec['slots'] as UnknownRecord) : null
    next.slots = {
      selected: sanitizeUniqueNumberArray(candidate?.['selected']) as ArtifactTypeId[],
      anyMode: sanitizeStringEnum(candidate?.['anyMode'], ['off', 'include', 'only'] as const, next.slots.anyMode),
    }
  }
  {
    const candidate = isRecord(rec['rank']) ? (rec['rank'] as UnknownRecord) : null
    next.rank = {
      selected: sanitizeUniqueNumberArrayFromSet(candidate?.['selected'], RANK_VALUES),
      anyMode: sanitizeStringEnum(candidate?.['anyMode'], ['off', 'include', 'only'] as const, next.rank.anyMode),
    }
  }
  {
    const candidate = isRecord(rec['rarity']) ? (rec['rarity'] as UnknownRecord) : null
    next.rarity = {
      selected: sanitizeUniqueNumberArrayFromSet(candidate?.['selected'], RANK_VALUES),
      anyMode: sanitizeStringEnum(candidate?.['anyMode'], ['off', 'include', 'only'] as const, next.rarity.anyMode),
    }
  }
  {
    const candidate = isRecord(rec['level']) ? (rec['level'] as UnknownRecord) : null
    const testerRangeRaw = isRecord(candidate?.['testerRange']) ? (candidate?.['testerRange'] as UnknownRecord) : null
    const baseRange = resolveTesterLevelRange({
      selected: [],
      anyMode: 'include',
      testerRange: {
        min: Number(testerRangeRaw?.['min'] ?? DEFAULT_TESTER_LEVEL_RANGE.min),
        max: Number(testerRangeRaw?.['max'] ?? DEFAULT_TESTER_LEVEL_RANGE.max),
      },
    })
    next.level = {
      selected: sanitizeUniqueNumberArrayFromSet(candidate?.['selected'], LEVEL_MILESTONES),
      anyMode: sanitizeStringEnum(candidate?.['anyMode'], ['off', 'include', 'only'] as const, next.level.anyMode),
      testerRange: baseRange,
    }
  }
  {
    const candidate = isRecord(rec['main']) ? (rec['main'] as UnknownRecord) : null
    next.main = {
      selected: sanitizeUniqueNumberArray(candidate?.['selected']) as StatVariant[],
      anyMode: sanitizeStringEnum(candidate?.['anyMode'], ['off', 'include', 'only'] as const, next.main.anyMode),
    }
  }
  {
    const candidate = isRecord(rec['sub']) ? (rec['sub'] as UnknownRecord) : null
    next.sub = {
      selected: sanitizeUniqueNumberArray(candidate?.['selected']) as StatVariant[],
      notSelected: sanitizeUniqueNumberArray(candidate?.['notSelected']) as StatVariant[],
      mode: sanitizeStringEnum(candidate?.['mode'], ['all', 'any'] as const, next.sub.mode),
      wildcardMode: sanitizeStringEnum(
        candidate?.['wildcardMode'],
        ['off', 'include', 'only'] as const,
        next.sub.wildcardMode,
      ),
    }
  }
  {
    const candidate = isRecord(rec['faction']) ? (rec['faction'] as UnknownRecord) : null
    next.faction = {
      selected: sanitizeUniqueNumberArray(candidate?.['selected']) as FactionId[],
      anyMode: sanitizeStringEnum(candidate?.['anyMode'], ['off', 'include', 'only'] as const, next.faction.anyMode),
    }
  }

  // Optional sections: keep defaults when missing so consumers can assume shape.
  {
    const candidate = isRecord(rec['configName']) ? (rec['configName'] as UnknownRecord) : null
    const query = typeof candidate?.['query'] === 'string' ? candidate['query'] : next.configName?.query ?? ''
    next.configName = { query }
  }
  {
    const candidate = isRecord(rec['testerSources']) ? (rec['testerSources'] as UnknownRecord) : null
    next.testerSources = {
      selected: sanitizeUniqueStringArray(candidate?.['selected']).filter(
        (value): value is TesterSourceFilter => TESTER_SOURCE_FILTERS.includes(value as TesterSourceFilter),
      ),
    }
  }
  {
    const candidate = isRecord(rec['testerChaos']) ? (rec['testerChaos'] as UnknownRecord) : null
    next.testerChaos = {
      mode: sanitizeStringEnum(candidate?.['mode'], TESTER_CHAOS_MODES, next.testerChaos?.mode ?? 'any'),
    }
  }
  {
    const candidate = isRecord(rec['testerGlyphs']) ? (rec['testerGlyphs'] as UnknownRecord) : null
    next.testerGlyphs = {
      mode: sanitizeStringEnum(candidate?.['mode'], TESTER_GLYPH_MODES, next.testerGlyphs?.mode ?? 'any'),
    }
  }
  {
    const candidate = isRecord(rec['testerAscension']) ? (rec['testerAscension'] as UnknownRecord) : null
    const stars = sanitizeUniqueNumberArray(candidate?.['stars'])
      .map((value) => Math.round(value))
      .filter((value) => value >= 1 && value <= 6)
    const uniqueStars = Array.from(new Set(stars)).sort((a, b) => a - b)
    next.testerAscension = {
      stars: uniqueStars,
      stats: sanitizeUniqueNumberArray(candidate?.['stats']) as StatVariant[],
    }
  }
  {
    const candidate = isRecord(rec['testerChampions']) ? (rec['testerChampions'] as UnknownRecord) : null
    next.testerChampions = {
      selected: sanitizeUniqueNumberArray(candidate?.['selected']).map((value) => Math.round(value)),
    }
  }

  // Legacy + partial shapes are handled by the existing normalizers.
  next.testerRolls = normalizeTesterRollsState(isRecord(rec['testerRolls']) ? (rec['testerRolls'] as TesterRollFilterState) : undefined)
  next.testerLastUse = normalizeTesterLastUseFilter(rec['testerLastUse'] as RulesFilterState['testerLastUse'])

  return next
}

// Back-compat helpers: accept legacy range shapes (min/max) if present
export function isRulesFilterActive(f: RulesFilterState, options?: { includeTesterRange?: boolean }): boolean {
  const includeTesterRange = options?.includeTesterRange ?? false
  let testerRangeActive = false
  if (includeTesterRange) {
    const { min, max } = resolveTesterLevelRange(f.level)
    testerRangeActive = min > DEFAULT_TESTER_LEVEL_RANGE.min || max < DEFAULT_TESTER_LEVEL_RANGE.max
  }
  const ra = (f.rule?.keep ?? 'any') !== 'any' || (f.rule?.use ?? 'any') !== 'any'
  const tr = (f.testerResult?.keep ?? 'any') !== 'any' || (f.testerResult?.matched ?? 'any') !== 'any'
  const a = (f.sets?.selected?.length ?? 0) > 0 || ((f.sets?.metaSelected)?.length ?? 0) > 0 || (f.sets?.anyMode ?? 'include') !== 'include' || f.sets?.match === 'all'
  const b = (f.slots?.selected?.length ?? 0) > 0 || (f.slots?.anyMode ?? 'include') !== 'include'
  const c = ((f.rank?.selected?.length ?? 0) > 0) || ((f.rank?.anyMode) ?? 'include') !== 'include'
  const d = ((f.rarity?.selected?.length ?? 0) > 0) || ((f.rarity?.anyMode) ?? 'include') !== 'include'
  const e = (f.level?.selected?.length ?? 0) > 0 || (f.level?.anyMode ?? 'include') !== 'include' || testerRangeActive
  const g = (f.main?.selected?.length ?? 0) > 0 || (f.main?.anyMode ?? 'include') !== 'include'
  const h = (f.sub?.selected?.length ?? 0) > 0
    || (f.sub?.notSelected?.length ?? 0) > 0
    || (f.sub?.wildcardMode ?? 'include') !== 'include'
    || (f.sub?.mode ?? 'all') !== 'all'
  const i = (f.faction?.selected?.length ?? 0) > 0 || (f.faction?.anyMode ?? 'include') !== 'include'
  const j = Boolean(f.configName && typeof f.configName.query === 'string' && f.configName.query.length > 0)
  const k = (f.testerSources?.selected?.length ?? 0) > 0
  const l = (f.testerChaos?.mode ?? 'any') !== 'any'
  const m = (f.testerGlyphs?.mode ?? 'any') !== 'any'
  const p = isTesterRollFilterActive(f.testerRolls)
  const n = ((f.testerAscension?.stars?.length ?? 0) > 0) || ((f.testerAscension?.stats?.length ?? 0) > 0)
  const o = (f.testerChampions?.selected?.length ?? 0) > 0
  const q = isTesterLastUseFilterActive(f.testerLastUse)
  return ra || tr || a || b || c || d || e || g || h || i || j || k || l || m || p || n || o || q
}

// Coverage helpers for Rank and Rarity codes (map rule code -> set of underlying values 1..6).
// Rank/Rarity coverage moved to shared helpers (single source of truth)

// Predicate builders

function matchesAnyModeForArrayField<T extends number>(field: T[] | undefined, anyMode: AnyMode): boolean | null {
  const isAny = !field || field.length === 0
  if (anyMode === 'only') return isAny
  if (anyMode === 'off') return !isAny
  return null // include => no decision, defer to other filters
}

export interface FilterHsfRulesResult<T extends HsfRule = HsfRule> {
  rules: T[]
  matchingConfigIndices: Set<number>
  configRuleCounts: Map<number, number>
}

export function filterHsfRules<T extends HsfRule>(
  rules: T[],
  f: RulesFilterState,
  metasets?: Metaset[],
  options?: {
    configNames?: Array<string | null | undefined>
    configTags?: Array<string[] | null | undefined>
    configModes?: SellfileExportMode[]
    specialRuleLabels?: RuleSourceLabelMap
  },
): FilterHsfRulesResult<T> {
  // Split include/exclude entries so rules can be filtered accordingly.
  const setSelection = splitArtifactSetSelections(f.sets?.selected ?? [])
  const selectedSets = new Set(setSelection.included.map(Number))
  const excludedSets = new Set(setSelection.excluded.map(Number))
  // Unroll metaset selections into explicit set IDs for filtering
  if (metasets && (f.sets?.metaSelected?.length ?? 0) > 0) {
    const metaSet = new Set<string>(f.sets!.metaSelected!)
    for (const m of metasets) {
      if (metaSet.has(m.id)) {
        for (const s of m.sets) selectedSets.add(Number(s))
      }
    }
  }
  const selectedSlots = new Set((f.slots?.selected ?? []).map(Number))
  const selectedLevels = new Set<LevelMilestone>(f.level?.selected ?? [])
  const selectedMain = new Set((f.main?.selected ?? []).map(Number))
  const selectedSub = new Set((f.sub?.selected ?? []).map(Number))
  const excludedSub = new Set((f.sub?.notSelected ?? []).map(Number))
  const selectedFactions = new Set((f.faction?.selected ?? []).map(Number))

  const selectedRanks = new Set(f.rank?.selected ?? [])
  const selectedRarities = new Set(f.rarity?.selected ?? [])

  const filtered: T[] = []
  const matchingConfigIndices = new Set<number>()
  const configRuleCounts = new Map<number, number>()

  const configNameQuery = f.configName?.query ?? ''
  const configNameFilterActive = configNameQuery.length > 0
  let configNameRegex: RegExp | null = null
  let configNameRegexValid = true
  if (configNameFilterActive) {
    try {
      configNameRegex = new RegExp(configNameQuery, 'i')
    } catch {
      configNameRegexValid = false
      configNameRegex = null
    }
  }

  const shouldIncludeRule = (r: T): boolean => {
    const withCfg = r as unknown as HsfRuleWithCfg
    const cfgIdx = getRuleConfigIndex(withCfg)
    // Rule-level: Keep/Sell and Enabled/Disabled
    {
      const keepMode = f.rule?.keep ?? 'any'
      if (keepMode === 'yes') { if (r.Keep !== true) return false }
      else if (keepMode === 'no') { if (r.Keep === true) return false }
      // Note: missing Keep is treated as Sell in UI; the above logic matches that by requiring true for Keep-only
      const useMode = f.rule?.use ?? 'any'
      if (useMode === 'yes') { if ((r as HsfRule).Use === false) return false }
      else if (useMode === 'no') { if ((r as HsfRule).Use !== false) return false }
    }
    // Sets
    {
      const isAny = !r.ArtifactSet || (r.ArtifactSet.length === 0)
      const mode = f.sets.anyMode
      if (mode === 'only') {
        if (!isAny) return false
        // isAny passes; no further set matching needed
      } else if (mode === 'off') {
        if (isAny) return false
        // specified sets: proceed to selection matching (if any selected)
      }
      if (!isAny && excludedSets.size > 0) {
        const ruleSets = new Set((r.ArtifactSet || []).map(Number))
        for (const s of excludedSets) { if (ruleSets.has(s)) return false }
      }
      if (!isAny && selectedSets.size > 0) {
        // Hide "All Currently Known" remainder rows when a specific Set filter is applied
        if ((r as unknown as { __allKnownSets?: boolean }).__allKnownSets) return false
        const ruleSets = new Set((r.ArtifactSet || []).map(Number))
        if ((f.sets.match ?? 'any') === 'all') {
          for (const s of selectedSets) { if (!ruleSets.has(s)) return false }
        } else {
          let ok = false
          for (const s of selectedSets) { if (ruleSets.has(s)) { ok = true; break } }
          if (!ok) return false
        }
      }
    }

    if (configNameFilterActive) {
      if (!configNameRegexValid) return false
      const resolvedName = resolveMatchConfigName(cfgIdx ?? null, options?.configNames ?? null, withCfg)
      const ruleSource = (withCfg as Partial<HsfRuleWithCfg> | null | undefined)?.__source ?? null
      const sourceAliases = ruleSource
        ? options?.specialRuleLabels?.[ruleSource] ?? []
        : []
      const candidateNames: string[] = []
      if (resolvedName) candidateNames.push(resolvedName)
      // Also allow config tags to satisfy the name filter.
      if (cfgIdx != null && cfgIdx >= 0 && Array.isArray(options?.configTags)) {
        const tagList = options.configTags[cfgIdx]
        if (Array.isArray(tagList)) {
          for (const tag of tagList) {
            const trimmed = typeof tag === 'string' ? tag.trim() : ''
            if (trimmed.length > 0) candidateNames.push(trimmed)
          }
        }
      }
      for (const alias of sourceAliases) {
        if (alias && alias.length > 0) candidateNames.push(alias)
      }
      if (candidateNames.length === 0) return false
      if (!candidateNames.some((name) => configNameRegex!.test(name))) return false
    }

    // Slots
    {
      const slotsAnyDecision = matchesAnyModeForArrayField(r.ArtifactType, f.slots.anyMode)
      if (slotsAnyDecision === false) return false
      const isAnySlot = !r.ArtifactType || r.ArtifactType.length === 0
      const shouldMatchSelectedSlots = selectedSlots.size > 0 && (!isAnySlot || f.slots.anyMode === 'off')
      if (shouldMatchSelectedSlots) {
        const ruleSlots = new Set((r.ArtifactType || []).map(Number))
        let ok = false
        for (const s of selectedSlots) { if (ruleSlots.has(s)) { ok = true; break } }
        if (!ok) return false
      }
    }

    // Rank (intersects selected discrete set)
    const rankCode = Number(r.Rank ?? 0)
    if (f.rank.anyMode === 'only') { if (rankCode !== 0) return false }
    else if (f.rank.anyMode === 'off') { if (rankCode === 0) return false }
    if (selectedRanks.size > 0) {
      const cov = rankCoverage(rankCode)
      let has = false
      for (const v of selectedRanks) { if (cov.has(v)) { has = true; break } }
      if (!has) return false
    }

    // Rarity (intersects selected discrete set)
    const rarityCode = Number(r.Rarity ?? 0)
    if (f.rarity.anyMode === 'only') { if (rarityCode !== 0) return false }
    else if (f.rarity.anyMode === 'off') { if (rarityCode === 0) return false }
    if (selectedRarities.size > 0) {
      const cov = rarityCoverage(rarityCode)
      let has = false
      for (const v of selectedRarities) { if (cov.has(v)) { has = true; break } }
      if (!has) return false
    }

    // Level
    {
      const lvl = Number(r.LVLForCheck ?? LEVEL_ANY_SENTINEL)
      const isAnyLevel = lvl === LEVEL_ANY_SENTINEL
      if (f.level.anyMode === 'only') { if (!isAnyLevel) return false }
      else if (f.level.anyMode === 'off') { if (isAnyLevel) return false }
      if (selectedLevels.size > 0) {
        if (!isAnyLevel && !selectedLevels.has(lvl as LevelMilestone)) return false
      }
    }

    // Main stat
    {
      const isAnyMain = (r.MainStatID ?? StatId.Any) === StatId.Any
      if (f.main.anyMode === 'only') {
        if (!isAnyMain) return false
        // Only unspecified mainstat allowed; ignore concrete selection
      } else if (f.main.anyMode === 'off') {
        if (isAnyMain) return false
        // Proceed to selection matching for specified mainstats
        if (selectedMain.size > 0) {
          const mv = mainToVariant(r.MainStatID, r.MainStatF)
          if (!selectedMain.has(Number(mv))) return false
        }
      } else { // include
        if (selectedMain.size > 0) {
          if (!isAnyMain) {
            const mv = mainToVariant(r.MainStatID, r.MainStatF)
            if (!selectedMain.has(Number(mv))) return false
          }
          // When include + isAnyMain, allow it to pass regardless of selection
        }
      }
    }

    // Substats
    const subs = (r.Substats || []).filter(s => !s.NotAvailable)
    const hasWildcard = subs.some(s => s.ID === StatId.Any)
    if (f.sub.wildcardMode === 'only') { if (!hasWildcard) return false }
    else if (f.sub.wildcardMode === 'off') { if (hasWildcard) return false }

    if (selectedSub.size > 0 || excludedSub.size > 0) {
      // Substat presence evaluation is based on the variant-keyed rule substats.
      // This keeps the filter behavior consistent with the UI's StatVariant toggles.
      const ruleSubs = new Set(subs.map(s => Number(subToVariant(s.ID, s.IsFlat))))
      if (excludedSub.size > 0) {
        for (const v of excludedSub) { if (ruleSubs.has(v)) return false }
      }
      if (selectedSub.size > 0) {
        if (f.sub.mode === 'all') {
          for (const v of selectedSub) { if (!ruleSubs.has(v)) return false }
        } else {
          let hit = false
          for (const v of selectedSub) { if (ruleSubs.has(v)) { hit = true; break } }
          if (!hit) return false
        }
      }
    }

    // Faction
    {
      const factionCode = Number(r.Faction ?? 0)
      if (f.faction.anyMode === 'only') { if (factionCode !== 0) return false }
      else if (f.faction.anyMode === 'off') { if (factionCode === 0) return false }
      if (selectedFactions.size > 0 && (factionCode !== 0 || f.faction.anyMode === 'off')) {
        if (!selectedFactions.has(factionCode)) return false
      }
    }

    return true
  }

  for (const r of rules) {
    if (!shouldIncludeRule(r)) continue
    filtered.push(r)
    const cfgIdx = getRuleConfigIndex(r as unknown as HsfRuleWithCfg)
    if (cfgIdx !== null) {
      matchingConfigIndices.add(cfgIdx)
      configRuleCounts.set(cfgIdx, (configRuleCounts.get(cfgIdx) ?? 0) + 1)
    }
  }

  const ensureConfigEntries = (indices: Iterable<number>) => {
    for (const idx of indices) {
      matchingConfigIndices.add(idx)
      if (!configRuleCounts.has(idx)) configRuleCounts.set(idx, 0)
    }
  }

  const filtersActive = isRulesFilterActive(f)
  if (!filtersActive) {
    const total = Math.max(
      options?.configModes?.length ?? 0,
      options?.configNames?.length ?? 0,
      options?.configTags?.length ?? 0,
    )
    if (total > 0) {
      ensureConfigEntries(Array.from({ length: total }, (_, i) => i))
    }
  }

  if (configNameFilterActive && configNameRegexValid) {
    const nameLimit = Array.isArray(options?.configNames) ? options.configNames.length : 0
    const tagLimit = Array.isArray(options?.configTags) ? options.configTags.length : 0
    const limit = Math.max(nameLimit, tagLimit)
    for (let idx = 0; idx < limit; idx += 1) {
      const candidateNames: string[] = []
      if (Array.isArray(options?.configNames)) {
        const name = options.configNames[idx] ?? ''
        if (typeof name === 'string' && name.trim().length > 0) candidateNames.push(name)
      }
      if (Array.isArray(options?.configTags)) {
        const tagList = options.configTags[idx]
        if (Array.isArray(tagList)) {
          for (const tag of tagList) {
            const trimmed = typeof tag === 'string' ? tag.trim() : ''
            if (trimmed.length > 0) candidateNames.push(trimmed)
          }
        }
      }
      if (!candidateNames.some((name) => configNameRegex!.test(name))) continue
      if (!matchingConfigIndices.has(idx)) matchingConfigIndices.add(idx)
      if (!configRuleCounts.has(idx)) configRuleCounts.set(idx, 0)
    }
  }

  return { rules: filtered, matchingConfigIndices, configRuleCounts }
}

export type TesterFilterRowMatch = {
  keep: boolean
  cfgIdx: number | null
  cfgName?: string | null
  ruleSource?: string | null
}

export type TesterFilterRow = {
  artifact: NormalizedGearArtifact
  match: TesterFilterRowMatch | null
  matchingCfgIndices?: number[]
}

export interface FilterTesterItemsOptions {
  configNames?: Array<string | null | undefined>
  configTags?: Array<string[] | null | undefined>
  specialRuleLabels?: RuleSourceLabelMap
}

export interface FilterTesterItemsResult<T extends TesterFilterRow> {
  items: T[]
  matchingConfigIndices: Set<number>
}

export function filterTesterItems<T extends TesterFilterRow>(
  rows: readonly T[],
  f: RulesFilterState,
  metasets?: Metaset[],
  options?: FilterTesterItemsOptions,
): FilterTesterItemsResult<T> {
  if (!rows.length) return { items: [], matchingConfigIndices: new Set() }

  const testerRolls = normalizeTesterRollsState(f.testerRolls)
  const testerRollsActive = isTesterRollFilterActive(testerRolls)

  const testerKeepMode = f.testerResult?.keep ?? 'any'
  const testerMatchedMode = f.testerResult?.matched ?? 'any'
  // Split include/exclude entries for tester filtering.
  const setSelection = splitArtifactSetSelections(f.sets?.selected ?? [])
  const selectedSets = new Set(setSelection.included.map(Number))
  const excludedSets = new Set(setSelection.excluded.map(Number))
  if (metasets && (f.sets?.metaSelected?.length ?? 0) > 0) {
    const metaSet = new Set<string>(f.sets!.metaSelected!)
    for (const m of metasets) {
      if (metaSet.has(m.id)) {
        for (const s of m.sets) selectedSets.add(Number(s))
      }
    }
  }
  const selectedSlots = new Set((f.slots?.selected ?? []).map(Number))
  const selectedRanks = new Set((f.rank?.selected ?? []).map(Number))
  const selectedRarities = new Set((f.rarity?.selected ?? []).map(Number))
  const selectedLevels = new Set<LevelMilestone>(f.level?.selected ?? [])
  const selectedMainVariants = new Set((f.main?.selected ?? []).map(Number))
  const selectedSubVariants = new Set((f.sub?.selected ?? []).map(Number))
  const excludedSubVariants = new Set((f.sub?.notSelected ?? []).map(Number))
  const selectedFactions = new Set((f.faction?.selected ?? []).map(Number))
  const selectedChampionIds = new Set((f.testerChampions?.selected ?? []).map(Number))
  const testerLevelRange = resolveTesterLevelRange(f.level)
  const testerExactLevelRangeActive =
    testerLevelRange.min > DEFAULT_TESTER_LEVEL_RANGE.min || testerLevelRange.max < DEFAULT_TESTER_LEVEL_RANGE.max
  const testerLastUse = normalizeTesterLastUseFilter(f.testerLastUse)
  const testerLastUsePresetSet = new Set<TesterLastUsePreset>(testerLastUse.presets)
  const testerLastUsePresetsActive = testerLastUsePresetSet.size > 0
  const testerLastUseCustom = testerLastUse.custom
  const testerLastUseCustomActive = testerLastUseCustom.enabled

  const subMode = f.sub?.mode ?? 'all'
  const subWildcardMode = f.sub?.wildcardMode ?? 'include'

  let configNameRegex: RegExp | null = null
  let configNameRegexValid = true
  const configNameQuery = f.configName?.query ?? ''
  const configNameFilterActive = configNameQuery.length > 0
  if (configNameFilterActive) {
    try {
      configNameRegex = new RegExp(configNameQuery, 'i')
    } catch {
      configNameRegex = null
      configNameRegexValid = false
    }
  }

  const matchingConfigIndices = new Set<number>()
  const selectedSources = new Set<TesterSourceFilter>(f.testerSources?.selected ?? [])
  const chaosMode = f.testerChaos?.mode ?? 'any'
  const glyphMode = f.testerGlyphs?.mode ?? 'any'
  const ascensionStars = new Set<number>(f.testerAscension?.stars ?? [])
  const ascensionStats = new Set((f.testerAscension?.stats ?? []).map(Number))
  const filtered: T[] = []

  for (const row of rows) {
    const artifact = row.artifact
    const match = row.match

    if (testerMatchedMode === 'yes') {
      if (!match) continue
    } else if (testerMatchedMode === 'no') {
      if (match) continue
    }
    if (testerKeepMode === 'yes') {
      if (match?.keep !== true) continue
    } else if (testerKeepMode === 'no') {
      if (match?.keep !== false) continue
    }

    if (configNameFilterActive) {
      if (!configNameRegexValid) continue
      const candidateNames: string[] = []
      const cfgIdx = match?.cfgIdx
      if (cfgIdx != null && cfgIdx >= 0 && Array.isArray(options?.configNames)) {
        const rawName = options.configNames[cfgIdx]
        const trimmedName = typeof rawName === 'string' ? rawName.trim() : ''
        if (trimmedName.length > 0) candidateNames.push(trimmedName)
      }
      if (cfgIdx != null && cfgIdx >= 0 && Array.isArray(options?.configTags)) {
        const tagList = options.configTags[cfgIdx]
        if (Array.isArray(tagList)) {
          for (const tag of tagList) {
            const trimmed = typeof tag === 'string' ? tag.trim() : ''
            if (trimmed.length > 0) candidateNames.push(trimmed)
          }
        }
      }
      const explicitMatchName = typeof match?.cfgName === 'string' ? match.cfgName.trim() : ''
      if (explicitMatchName.length > 0) candidateNames.push(explicitMatchName)
      const ruleSource = match?.ruleSource ?? null
      if (ruleSource && options?.specialRuleLabels?.[ruleSource]) {
        for (const alias of options.specialRuleLabels[ruleSource]!) {
          if (alias && alias.length > 0) candidateNames.push(alias)
        }
      }
      if (candidateNames.length === 0) continue
      if (!candidateNames.some((name) => configNameRegex!.test(name))) continue
    }

    const slotId = Number(artifact.slot)
    const setId = Number(artifact.set)

    const setsMode = f.sets?.anyMode ?? 'include'
    if (setsMode === 'only') {
      const noSet = setId === 0 || (isAccessorySlot(slotId) && setId === ACCESSORY_NO_SET_ID)
      if (!noSet) continue
    } else if (setsMode === 'off') {
      const noSet = setId === 0 || (isAccessorySlot(slotId) && setId === ACCESSORY_NO_SET_ID)
      if (noSet) continue
    }
    if (excludedSets.size > 0 && excludedSets.has(setId)) continue
    if (selectedSets.size > 0) {
      if (!selectedSets.has(setId)) continue
    }

    const slotsMode = f.slots?.anyMode ?? 'include'
    if (slotsMode === 'only') {
      // Imported gear always specifies a slot; nothing matches "Only Any".
      continue
    }
    if (selectedSlots.size > 0 && !selectedSlots.has(slotId)) continue

    const rankMode = f.rank?.anyMode ?? 'include'
    const rank = Number(artifact.rank)
    if (rankMode === 'only') {
      continue
    } else if (rankMode === 'off') {
      // Rank is always specified for the Rule Tester queue.
    }
    if (selectedRanks.size > 0 && !selectedRanks.has(rank as RankValue)) continue

    const rarityMode = f.rarity?.anyMode ?? 'include'
    const rarity = Number(artifact.rarity)
    if (rarityMode === 'only') {
      continue
    } else if (rarityMode === 'off') {
      // Rarity always specified.
    }
    if (selectedRarities.size > 0 && !selectedRarities.has(rarity as RankValue)) continue

    const levelMode = f.level?.anyMode ?? 'include'
    const level = Number(artifact.level)
    if (levelMode === 'only') {
      continue
    } else if (levelMode === 'off') {
      // Level always specified.
    }
    if (selectedLevels.size > 0 && !selectedLevels.has(level as LevelMilestone)) continue
    const rawExactLevel = ((): number => {
      const candidate = artifact.exactLevel
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return Number(candidate)
      return level
    })()
    const exactLevel = clampTesterLevelValue(rawExactLevel)
    if (testerExactLevelRangeActive) {
      if (exactLevel < testerLevelRange.min || exactLevel > testerLevelRange.max) continue
    }

    const mainMode = f.main?.anyMode ?? 'include'
    const mainVariant = artifact.mainStat?.variant ?? StatVariant.Any
    if (mainMode === 'only') {
      if (mainVariant !== StatVariant.Any) continue
    } else if (mainMode === 'off') {
      if (mainVariant === StatVariant.Any) continue
    }
    if (selectedMainVariants.size > 0) {
      if (mainVariant === StatVariant.Any) continue
      if (!selectedMainVariants.has(Number(mainVariant))) continue
    }

    const subVariants = new Set<number>()
    const glyphedVariants = new Set<number>()
    let hasGlyph = false
    const rollCounts = testerRollsActive ? new Map<number, number>() : null
    for (const stat of artifact.substats) {
      if (stat.variant !== StatVariant.Any) {
        const variantNumber = Number(stat.variant)
        subVariants.add(variantNumber)
        const glyphValue = Math.abs(stat.glyphValue ?? 0)
        if (glyphValue > 0) {
          hasGlyph = true
          glyphedVariants.add(variantNumber)
        }
        if (rollCounts) {
          const baseRolls = Number(stat.rolls ?? 0)
          const mythBonus = Math.abs(Number(stat.mythValue ?? 0)) > 0 ? 1 : 0
          const rollCount = clampRollTarget(baseRolls + mythBonus)
          rollCounts.set(variantNumber, rollCount)
        }
      }
    }
    const hasSubstats = subVariants.size > 0
    if (subWildcardMode === 'only') {
      if (hasSubstats) continue
    } else if (subWildcardMode === 'off') {
      if (!hasSubstats) continue
    }
    if (selectedSubVariants.size > 0 || excludedSubVariants.size > 0) {
      // "Must not have" is evaluated first: any overlap removes the row.
      if (excludedSubVariants.size > 0) {
        let hit = false
        for (const variant of excludedSubVariants) {
          if (subVariants.has(variant)) { hit = true; break }
        }
        if (hit) continue
      }
      // "Must have" respects the existing match mode semantics.
      if (selectedSubVariants.size > 0) {
        if (subMode === 'all') {
          let ok = true
          for (const variant of selectedSubVariants) {
            if (!subVariants.has(variant)) { ok = false; break }
          }
          if (!ok) continue
        } else {
          let ok = false
          for (const variant of selectedSubVariants) {
            if (subVariants.has(variant)) { ok = true; break }
          }
          if (!ok) continue
        }
      }
    }

    const factionMode = f.faction?.anyMode ?? 'include'
    const faction = Number(artifact.faction ?? 0)
    if (factionMode === 'only') {
      if (faction !== 0) continue
    } else if (factionMode === 'off') {
      if (faction === 0 && isAccessorySlot(slotId)) continue
    }
    if (selectedFactions.size > 0 && !selectedFactions.has(faction)) continue

    if (selectedSources.size > 0) {
      const category = determineTesterSourceCategory(artifact)
      if (!selectedSources.has(category)) continue
    }

    if (selectedChampionIds.size > 0) {
      const championId = artifact.equippedToChampionId
      if (championId == null || !selectedChampionIds.has(Number(championId))) continue
    }

    if (testerLastUsePresetsActive || testerLastUseCustomActive) {
      const timestamp = typeof artifact.lastUseLocalTimestamp === 'string' ? artifact.lastUseLocalTimestamp : null
      const hasTimestamp = Boolean(timestamp)
      const daysSince = hasTimestamp ? getDaysSince(timestamp) : null

      if (testerLastUsePresetsActive || testerLastUseCustomActive) {
        // Evaluate presets/custom as a union so the row survives if either path wins.
        let presetMatch: boolean | null = null
        if (testerLastUsePresetsActive) {
          // Presets boil down to discrete buckets, so null timestamps only pass if "never" is active.
          presetMatch = false
          if (!hasTimestamp || daysSince == null) {
            presetMatch = testerLastUsePresetSet.has('never')
          } else {
            for (const preset of testerLastUsePresetSet) {
              if (preset === 'never') continue
              if (matchesTesterLastUsePreset(daysSince, preset)) {
                presetMatch = true
                break
              }
            }
          }
        }

        let customMatch: boolean | null = null
        if (testerLastUseCustomActive) {
          // Custom ranges only check timestamped gear; null timestamps route through the "Never used" preset.
          if (!hasTimestamp || daysSince == null) customMatch = false
          else {
            customMatch =
              daysSince >= testerLastUseCustom.minDays && daysSince <= testerLastUseCustom.maxDays
          }
        }

        const passesPreset = presetMatch ?? false
        const passesCustom = customMatch ?? false
        if (!(passesPreset || passesCustom)) continue
      }
    }

    if (chaosMode === 'notRerolled') {
      if (artifact.rerollCount > 0) continue
    } else if (chaosMode === 'rerolled') {
      if (artifact.rerollCount === 0) continue
    }

    if (glyphMode !== 'any') {
      if (glyphMode === 'on' && !hasGlyph) continue
      if (glyphMode === 'off' && hasGlyph) continue
      if (glyphMode === 'selected') {
        let ok = true
        for (const variant of selectedSubVariants) {
          if (!glyphedVariants.has(variant)) {
            ok = false
            break
          }
        }
        if (!ok) continue
      }
    }

    if (ascensionStars.size > 0 || ascensionStats.size > 0) {
      const asc = artifact.ascension
      const starLevel = Math.max(0, Math.min(6, Math.round(asc?.rolls ?? 0)))
      if (ascensionStars.size > 0 && !ascensionStars.has(starLevel)) continue
      if (ascensionStats.size > 0) {
        const variant = asc?.variant
        if (!variant || variant === StatVariant.Any || !ascensionStats.has(Number(variant))) continue
      }
    }

    if (testerRollsActive) {
      if (!rollCounts || !passesTesterRollFilters({
        filters: testerRolls,
        rollCounts,
      })) continue
    }

    if (match?.cfgIdx != null && match.cfgIdx >= 0) {
      matchingConfigIndices.add(match.cfgIdx)
    }

    filtered.push(row)
  }

  return { items: filtered, matchingConfigIndices }
}

export const determineTesterSourceCategory = (artifact: NormalizedGearArtifact): TesterSourceFilter => {
  if (artifact.source === 'tester') return 'manual'
  if (artifact.source === 'inbox') return 'inbox'
  if (artifact.equippedToChampionId != null) {
    const loc = artifact.equippedChampionLocation
    return loc === 'vault' || loc === 'reserveVault' ? 'vault' : 'collection'
  }
  return 'inventory'
}

const TESTER_DISABLED_ANY_FIELDS = ['main', 'level', 'slots', 'rank', 'rarity'] as const

export type TesterIncompatibleAnyField = typeof TESTER_DISABLED_ANY_FIELDS[number]

/**
 * Tester mode hides the "Any" toggles for select fields, so the sellfile preview's
 * stricter interpretations (Only Any / Hide Any) should not leak into tester results.
 * Create a shallow clone of the filter state with those sections forced back to
 * the neutral `'include'` mode so the tester behaves consistently across locales.
 */
export function normalizeRulesFilterForTester(filter: RulesFilterState): RulesFilterState {
  let normalized: RulesFilterState | null = null

  const ensureInclude = <K extends TesterIncompatibleAnyField>(field: K) => {
    const base = (normalized ?? filter)[field]
    const current: RulesFilterState[K] = (base ?? DEFAULT_RULES_FILTER_STATE[field]) as RulesFilterState[K]
    const anyMode = current.anyMode ?? DEFAULT_RULES_FILTER_STATE[field].anyMode
    if (anyMode === 'include') return
    if (!normalized) {
      normalized = { ...filter }
    }
    normalized[field] = {
      ...current,
      anyMode: 'include',
    }
  }

  for (const field of TESTER_DISABLED_ANY_FIELDS) {
    ensureInclude(field)
  }

  return normalized ?? filter
}

type RollFilterEvalArgs = {
  filters: TesterRollFilterState
  rollCounts: Map<number, number>
}

export function isTesterRollFilterActive(rolls?: TesterRollFilterState): boolean {
  if (!rolls) return false
  const wildcard = rolls.wildcard ?? createDefaultTesterRollsState().wildcard
  const wildcardMode = wildcard.mode ?? 'off'
  const wildcardActive = wildcardMode !== 'off' && (wildcard.counts?.length ?? 0) > 0
  if (wildcardActive) return true
  return Boolean(rolls.perStat?.some((row) => (row?.counts?.length ?? 0) > 0))
}

const normalizeTesterRollFilterRow = (row: TesterRollFilterRow | null | undefined): TesterRollFilterRow | null => {
  if (!row) return null
  const stat = Number(row.stat)
  if (!Number.isFinite(stat) || stat <= 0) return null
  const counts = resolveRollCountSet(row)
  if (counts.length === 0) return null
  return {
    stat: stat as StatVariant,
    counts,
  }
}

const normalizeRollMode = (mode?: TesterRollWildcardMode | string): TesterRollWildcardMode => {
  if (mode === 'any' || mode === 'selected') return 'any'
  return 'off'
}

const normalizeTesterRollsState = (input?: TesterRollFilterState): TesterRollFilterState => {
  const base = input ?? createDefaultTesterRollsState()
  const wildcard = base.wildcard ?? createDefaultTesterRollsState().wildcard
  const rows = Array.isArray(base.perStat) ? base.perStat : []
  return {
    wildcard: {
      mode: normalizeRollMode(wildcard.mode),
      counts: resolveRollCountSet(wildcard),
    },
    perStat: rows
      .map((row) => normalizeTesterRollFilterRow(row))
      .filter((row): row is TesterRollFilterRow => Boolean(row)),
  }
}

type LegacyTesterRollComparator = 'eq' | 'gte' | 'lte'

type RollCountCarrier = {
  counts?: unknown
  comparator?: LegacyTesterRollComparator
  value?: number
}

function resolveRollCountSet(carrier: RollCountCarrier | null | undefined): TesterRollCountSet {
  const normalized = normalizeRollCountSet(carrier?.counts)
  if (normalized.length > 0) return normalized
  if (carrier && 'value' in (carrier as Record<string, unknown>)) {
    return deriveLegacyRollCountSet(carrier?.comparator, carrier?.value)
  }
  return []
}

function normalizeRollCountSet(input: unknown): TesterRollCountSet {
  if (!Array.isArray(input)) return []
  const seen = new Set<number>()
  const next: TesterRollCountValue[] = []
  for (const raw of input) {
    if (typeof raw !== 'number' && typeof raw !== 'string') continue
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) continue
    const clamped = clampRollTarget(numeric) as TesterRollCountValue
    if (seen.has(clamped)) continue
    seen.add(clamped)
    next.push(clamped)
  }
  next.sort((a, b) => a - b)
  return next
}

function deriveLegacyRollCountSet(
  comparator?: LegacyTesterRollComparator,
  value?: number | null,
): TesterRollCountSet {
  const normalizedComparator: LegacyTesterRollComparator =
    comparator === 'gte' || comparator === 'lte' ? comparator : 'eq'
  const clamped = clampRollTarget(value ?? 0) as TesterRollCountValue
  if (normalizedComparator === 'gte') {
    return TESTER_ROLL_COUNT_VALUES.filter((candidate) => candidate >= clamped)
  }
  if (normalizedComparator === 'lte') {
    return TESTER_ROLL_COUNT_VALUES.filter((candidate) => candidate <= clamped)
  }
  return [clamped]
}
const passesTesterRollFilters = ({ filters, rollCounts }: RollFilterEvalArgs): boolean => {
  const wildcard = filters.wildcard
  const wildcardCounts = new Set<number>(wildcard.counts ?? [])
  if (wildcard.mode === 'any' && wildcardCounts.size > 0) {
    let ok = false
    for (const count of rollCounts.values()) {
      if (wildcardCounts.has(count)) {
        ok = true
        break
      }
    }
    if (!ok) return false
  }

  if (filters.perStat.length > 0) {
    for (const row of filters.perStat) {
      const variant = Number(row.stat)
      if (!Number.isFinite(variant) || variant <= 0) continue
      const counts = new Set<number>(row.counts ?? [])
      if (counts.size === 0) continue
      const count = rollCounts.get(variant) ?? 0
      if (!counts.has(count)) return false
    }
  }

  return true
}

const clampRollTarget = (value: number | null | undefined): number => {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(5, Math.round(numeric)))
}

const clampLastUseDays = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return TESTER_LAST_USE_MIN_DAYS
  if (value < TESTER_LAST_USE_MIN_DAYS) return TESTER_LAST_USE_MIN_DAYS
  if (value > TESTER_LAST_USE_MAX_DAYS) return TESTER_LAST_USE_MAX_DAYS
  return Math.round(value)
}

const normalizeLastUseRange = (
  rawMin?: number | null,
  rawMax?: number | null,
): { min: number; max: number } => {
  const min = clampLastUseDays(rawMin)
  const max = clampLastUseDays(rawMax)
  if (min <= max) return { min, max }
  return { min: max, max: min }
}

const TESTER_LAST_USE_RECENT_PRESETS: TesterLastUsePreset[] = ['recent7', 'recent30', 'recent90']
const RECENT_PRESET_PRIORITY = new Map(
  TESTER_LAST_USE_RECENT_PRESETS.map((preset, index) => [preset, index]),
)

/**
 * Collapse redundant preset selections so only the widest "recent" range sticks
 * around while orthogonal tokens (Never, Older) remain untouched. This lets the
 * UI expose toggle-like affordances without pushing duplicated predicates into
 * the core filter logic.
 */
export const sanitizeTesterLastUsePresets = (
  rawPresets: Iterable<TesterLastUsePreset>,
): TesterLastUsePreset[] => {
  const base = new Set<TesterLastUsePreset>()
  let widestRecent: TesterLastUsePreset | null = null
  for (const preset of rawPresets) {
    if (TESTER_LAST_USE_RECENT_PRESETS.includes(preset)) {
      const currentRank = RECENT_PRESET_PRIORITY.get(widestRecent ?? preset) ?? -1
      const nextRank = RECENT_PRESET_PRIORITY.get(preset) ?? -1
      if (nextRank >= currentRank) widestRecent = preset
      continue
    }
    base.add(preset)
  }
  if (widestRecent) base.add(widestRecent)
  return Array.from(base).sort(
    (a, b) => LAST_USE_PRESET_ORDER.indexOf(a) - LAST_USE_PRESET_ORDER.indexOf(b),
  )
}

/**
 * Toggle helper used by the filter UI to add/remove presets while enforcing the
 * sanitized shape described above (only one "recent" bucket at a time).
 */
export const toggleTesterLastUsePresetSelection = (
  current: readonly TesterLastUsePreset[],
  preset: TesterLastUsePreset,
): TesterLastUsePreset[] => {
  const draft = new Set<TesterLastUsePreset>(current)
  if (draft.has(preset)) {
    draft.delete(preset)
  } else {
    if (TESTER_LAST_USE_RECENT_PRESETS.includes(preset)) {
      for (const recent of TESTER_LAST_USE_RECENT_PRESETS) draft.delete(recent)
    }
    draft.add(preset)
  }
  return sanitizeTesterLastUsePresets(draft)
}

export const normalizeTesterLastUseFilter = (
  input?: RulesFilterState['testerLastUse'] | null,
): TesterLastUseFilter => {
  if (!input) return createDefaultTesterLastUseFilter()
  const rawPresets = Array.isArray(input.presets) ? input.presets : []
  const seen = new Set<TesterLastUsePreset>()
  const presets: TesterLastUsePreset[] = []
  for (const raw of rawPresets) {
    if (TESTER_LAST_USE_PRESETS.includes(raw as TesterLastUsePreset)) {
      const value = raw as TesterLastUsePreset
      if (seen.has(value)) continue
      seen.add(value)
      presets.push(value)
    }
  }
  const collapsedPresets = sanitizeTesterLastUsePresets(presets)
  const baseCustom = input.custom ?? DEFAULT_TESTER_LAST_USE_CUSTOM
  const range = normalizeLastUseRange(baseCustom.minDays, baseCustom.maxDays)
  return {
    presets: collapsedPresets,
    custom: {
      enabled: Boolean(baseCustom.enabled),
      minDays: range.min,
      maxDays: range.max,
    },
  }
}

export const isTesterLastUseFilterActive = (value?: RulesFilterState['testerLastUse']): boolean => {
  const filter = normalizeTesterLastUseFilter(value)
  if (filter.presets.length > 0) return true
  if (!filter.custom.enabled) return false
  if (filter.custom.minDays > TESTER_LAST_USE_MIN_DAYS) return true
  if (filter.custom.maxDays < TESTER_LAST_USE_MAX_DAYS) return true
  return false
}

const matchesTesterLastUsePreset = (days: number, preset: TesterLastUsePreset): boolean => {
  switch (preset) {
    case 'recent7':
      return days <= 7
    case 'recent30':
      return days <= 30
    case 'recent90':
      return days <= 90
    case 'older90':
      return days > 90
    default:
      return false
  }
}
