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
import type { HsfRuleWithRecipe } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import { isAccessorySlot, isDegenerateImprovChance } from './gearInspectorDomain'
import { ACCESSORY_NO_SET_ID } from './constants'
import { getRuleRecipeIndex, resolveMatchRecipeName } from './ruleRecipeIndex'
import { getDaysSince } from './dateDisplay'
import type { ImprovementChanceWasmEntry } from './wasm/wasmRuleEngine'

// Tri-state for handling explicit "Any" fields in rules.
export type AnyMode = 'off' | 'include' | 'only'

export type SubstatMatchMode = 'all' | 'any'

// Compact tri-state toggle used for simple boolean fields in filters.
// 'any' leaves the field unfiltered; 'yes' matches true/enabled; 'no' matches false/disabled.
export type Bool3 = 'any' | 'yes' | 'no'

export type GearInspectorSourceFilter = 'inventory' | 'collection' | 'vault' | 'inbox' | 'manual'
export type GearInspectorChaosFilterMode = 'any' | 'notRerolled' | 'rerolled'
export type GearInspectorGlyphFilterMode = 'any' | 'on' | 'off' | 'selected'
export type GearInspectorRollWildcardMode = 'off' | 'any'

export const GEAR_INSPECTOR_LAST_USE_PRESETS = ['never', 'recent7', 'recent30', 'recent90', 'older90'] as const
export type GearInspectorLastUsePreset = typeof GEAR_INSPECTOR_LAST_USE_PRESETS[number]

export type GearInspectorLastUseCustomFilter = {
  enabled: boolean
  minDays: number
  maxDays: number
}

export type GearInspectorLastUseFilter = {
  presets: GearInspectorLastUsePreset[]
  custom: GearInspectorLastUseCustomFilter
}

export type RuleSourceLabelMap = Record<string, readonly string[]>

export const GEAR_INSPECTOR_ROLL_COUNT_VALUES = [0, 1, 2, 3, 4, 5] as const
export type GearInspectorRollCountValue = typeof GEAR_INSPECTOR_ROLL_COUNT_VALUES[number]

export type GearInspectorRollCountSet = readonly GearInspectorRollCountValue[]

export const normalizeGearInspectorRollCountSelection = (counts: readonly number[]): GearInspectorRollCountSet => (
  normalizeRollCountSet(counts)
)

export type GearInspectorRollFilterRow = {
  stat: StatVariant
  counts: GearInspectorRollCountSet
}

export type GearInspectorRollWildcardFilter = {
  mode: GearInspectorRollWildcardMode
  counts: GearInspectorRollCountSet
}

const DEFAULT_GEAR_INSPECTOR_ROLL_COUNT_SET: GearInspectorRollCountSet = []

export type GearInspectorRollFilterState = {
  wildcard: GearInspectorRollWildcardFilter
  perStat: GearInspectorRollFilterRow[]
}

export const createDefaultGearInspectorRollsState = (): GearInspectorRollFilterState => ({
  wildcard: { mode: 'off', counts: DEFAULT_GEAR_INSPECTOR_ROLL_COUNT_SET },
  perStat: [],
})

export type GearInspectorLevelRange = {
  min: number
  max: number
}

export const GEAR_INSPECTOR_LEVEL_MIN = 0
export const GEAR_INSPECTOR_LEVEL_MAX = 16

export const DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE: GearInspectorLevelRange = Object.freeze({
  min: GEAR_INSPECTOR_LEVEL_MIN,
  max: GEAR_INSPECTOR_LEVEL_MAX,
})

export const GEAR_INSPECTOR_LAST_USE_MIN_DAYS = 0
export const GEAR_INSPECTOR_LAST_USE_MAX_DAYS = 365

const LAST_USE_PRESET_ORDER: readonly GearInspectorLastUsePreset[] = GEAR_INSPECTOR_LAST_USE_PRESETS

const DEFAULT_GEAR_INSPECTOR_LAST_USE_CUSTOM: GearInspectorLastUseCustomFilter = Object.freeze({
  enabled: false,
  minDays: GEAR_INSPECTOR_LAST_USE_MIN_DAYS,
  maxDays: GEAR_INSPECTOR_LAST_USE_MAX_DAYS,
})

export const createDefaultGearInspectorLastUseCustom = (): GearInspectorLastUseCustomFilter => ({
  enabled: DEFAULT_GEAR_INSPECTOR_LAST_USE_CUSTOM.enabled,
  minDays: DEFAULT_GEAR_INSPECTOR_LAST_USE_CUSTOM.minDays,
  maxDays: DEFAULT_GEAR_INSPECTOR_LAST_USE_CUSTOM.maxDays,
})

export const createDefaultGearInspectorLastUseFilter = (): GearInspectorLastUseFilter => ({
  presets: [],
  custom: createDefaultGearInspectorLastUseCustom(),
})

export interface RulesFilterState {
  // Rule-level filters
  rule?: { keep: Bool3; use: Bool3 }
  gearInspectorResult?: { keep: boolean; sell: boolean; matched: boolean; unmatched: boolean }
  sets: { selected: ArtifactSetSelectionEntry[]; metaSelected?: string[]; anyMode: AnyMode; match?: 'any' | 'all' }
  slots: { selected: ArtifactTypeId[]; anyMode: AnyMode }
  // Rank: discrete buttons (1..6) instead of a contiguous range
  rank: { selected: RankValue[]; anyMode: AnyMode }
  // Rarity: discrete buttons (Common..Mythical) instead of a contiguous range
  rarity: { selected: RankValue[]; anyMode: AnyMode }
  level: { selected: LevelMilestone[]; anyMode: AnyMode; gearInspectorRange?: GearInspectorLevelRange }
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
  recipeName?: { query: string }
  gearInspectorSources?: { selected: GearInspectorSourceFilter[] }
  gearInspectorChaos?: { mode: GearInspectorChaosFilterMode }
  gearInspectorGlyphs?: { mode: GearInspectorGlyphFilterMode }
  gearInspectorAscension?: { stars: number[]; stats: StatVariant[] }
  gearInspectorChampions?: { selected: number[] }
  gearInspectorRolls?: GearInspectorRollFilterState
  gearInspectorLastUse?: GearInspectorLastUseFilter
  gearInspectorImprovementChance?: { min: number; max: number; includeUnassessed: boolean }
}

const clampGearInspectorLevelValue = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GEAR_INSPECTOR_LEVEL_MIN
  const rounded = Math.round(value)
  if (rounded < GEAR_INSPECTOR_LEVEL_MIN) return GEAR_INSPECTOR_LEVEL_MIN
  if (rounded > GEAR_INSPECTOR_LEVEL_MAX) return GEAR_INSPECTOR_LEVEL_MAX
  return rounded
}

export function resolveGearInspectorLevelRange(levelState?: RulesFilterState['level']): GearInspectorLevelRange {
  const baseRange = levelState?.gearInspectorRange ?? DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE
  const min = clampGearInspectorLevelValue(baseRange?.min ?? DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE.min)
  const max = clampGearInspectorLevelValue(baseRange?.max ?? DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE.max)
  if (min <= max) return { min, max }
  return { min: max, max: min }
}

export const DEFAULT_RULES_FILTER_STATE: RulesFilterState = {
  rule: { keep: 'any', use: 'any' },
  gearInspectorResult: { keep: false, sell: false, matched: false, unmatched: false },
  sets: { selected: [], anyMode: 'include', match: 'any' },
  slots: { selected: [], anyMode: 'include' },
  rank: { selected: [], anyMode: 'include' },
  rarity: { selected: [], anyMode: 'include' },
  level: { selected: [], anyMode: 'include', gearInspectorRange: { ...DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE } },
  main: { selected: [], anyMode: 'include' },
  sub: { selected: [], notSelected: [], mode: 'all', wildcardMode: 'include' },
  faction: { selected: [], anyMode: 'include' },
  recipeName: { query: '' },
  gearInspectorSources: { selected: [] },
  gearInspectorChaos: { mode: 'any' },
  gearInspectorGlyphs: { mode: 'any' },
  gearInspectorAscension: { stars: [], stats: [] },
  gearInspectorChampions: { selected: [] },
  gearInspectorRolls: createDefaultGearInspectorRollsState(),
  gearInspectorLastUse: createDefaultGearInspectorLastUseFilter(),
  gearInspectorImprovementChance: { min: 0, max: 100, includeUnassessed: true },
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

const GEAR_INSPECTOR_SOURCE_FILTERS = Object.freeze(['inventory', 'collection', 'vault', 'inbox', 'manual'] as const)
const GEAR_INSPECTOR_CHAOS_MODES = Object.freeze(['any', 'notRerolled', 'rerolled'] as const)
const GEAR_INSPECTOR_GLYPH_MODES = Object.freeze(['any', 'on', 'off', 'selected'] as const)

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
    const candidate = isRecord(rec['gearInspectorResult']) ? (rec['gearInspectorResult'] as UnknownRecord) : null
    // Backward compat: old format stored Bool3 strings ('any'|'yes'|'no'); new format uses booleans.
    const rawKeep = candidate?.['keep']
    const rawSell = candidate?.['sell']
    const rawMatched = candidate?.['matched']
    const rawUnmatched = candidate?.['unmatched']
    let keep: boolean, sell: boolean, matched: boolean, unmatched: boolean
    if (typeof rawKeep === 'string') {
      // Old Bool3 → boolean pair
      keep = rawKeep === 'yes'
      sell = rawKeep === 'no'
    } else {
      keep = Boolean(rawKeep)
      sell = Boolean(rawSell)
    }
    if (typeof rawMatched === 'string') {
      // Old Bool3 → boolean pair
      matched = rawMatched === 'yes'
      unmatched = rawMatched === 'no'
    } else {
      matched = Boolean(rawMatched)
      unmatched = Boolean(rawUnmatched)
    }
    next.gearInspectorResult = { keep, sell, matched, unmatched }
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
    const gearInspectorRangeRaw = isRecord(candidate?.['gearInspectorRange']) ? (candidate?.['gearInspectorRange'] as UnknownRecord) : null
    const baseRange = resolveGearInspectorLevelRange({
      selected: [],
      anyMode: 'include',
      gearInspectorRange: {
        min: Number(gearInspectorRangeRaw?.['min'] ?? DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE.min),
        max: Number(gearInspectorRangeRaw?.['max'] ?? DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE.max),
      },
    })
    next.level = {
      selected: sanitizeUniqueNumberArrayFromSet(candidate?.['selected'], LEVEL_MILESTONES),
      anyMode: sanitizeStringEnum(candidate?.['anyMode'], ['off', 'include', 'only'] as const, next.level.anyMode),
      gearInspectorRange: baseRange,
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
    const candidate = isRecord(rec['recipeName']) ? (rec['recipeName'] as UnknownRecord) : null
    const query = typeof candidate?.['query'] === 'string' ? candidate['query'] : next.recipeName?.query ?? ''
    next.recipeName = { query }
  }
  {
    const candidate = isRecord(rec['gearInspectorSources']) ? (rec['gearInspectorSources'] as UnknownRecord) : null
    next.gearInspectorSources = {
      selected: sanitizeUniqueStringArray(candidate?.['selected']).filter(
        (value): value is GearInspectorSourceFilter => GEAR_INSPECTOR_SOURCE_FILTERS.includes(value as GearInspectorSourceFilter),
      ),
    }
  }
  {
    const candidate = isRecord(rec['gearInspectorChaos']) ? (rec['gearInspectorChaos'] as UnknownRecord) : null
    next.gearInspectorChaos = {
      mode: sanitizeStringEnum(candidate?.['mode'], GEAR_INSPECTOR_CHAOS_MODES, next.gearInspectorChaos?.mode ?? 'any'),
    }
  }
  {
    const candidate = isRecord(rec['gearInspectorGlyphs']) ? (rec['gearInspectorGlyphs'] as UnknownRecord) : null
    next.gearInspectorGlyphs = {
      mode: sanitizeStringEnum(candidate?.['mode'], GEAR_INSPECTOR_GLYPH_MODES, next.gearInspectorGlyphs?.mode ?? 'any'),
    }
  }
  {
    const candidate = isRecord(rec['gearInspectorAscension']) ? (rec['gearInspectorAscension'] as UnknownRecord) : null
    const stars = sanitizeUniqueNumberArray(candidate?.['stars'])
      .map((value) => Math.round(value))
      .filter((value) => value >= 0 && value <= 6)
    const uniqueStars = Array.from(new Set(stars)).sort((a, b) => a - b)
    next.gearInspectorAscension = {
      stars: uniqueStars,
      stats: sanitizeUniqueNumberArray(candidate?.['stats']) as StatVariant[],
    }
  }
  {
    const candidate = isRecord(rec['gearInspectorChampions']) ? (rec['gearInspectorChampions'] as UnknownRecord) : null
    next.gearInspectorChampions = {
      selected: sanitizeUniqueNumberArray(candidate?.['selected']).map((value) => Math.round(value)),
    }
  }

  // Legacy + partial shapes are handled by the existing normalizers.
  next.gearInspectorRolls = normalizeGearInspectorRollsState(isRecord(rec['gearInspectorRolls']) ? (rec['gearInspectorRolls'] as GearInspectorRollFilterState) : undefined)
  next.gearInspectorLastUse = normalizeGearInspectorLastUseFilter(rec['gearInspectorLastUse'] as RulesFilterState['gearInspectorLastUse'])
  {
    const raw = isRecord(rec['gearInspectorImprovementChance']) ? rec['gearInspectorImprovementChance'] as Record<string, unknown> : null
    const rawMin = typeof raw?.['min'] === 'number' ? raw['min'] : 0
    const rawMax = typeof raw?.['max'] === 'number' ? raw['max'] : 100
    const clampedMin = Math.max(0, Math.min(100, Math.round(rawMin / 5) * 5))
    const clampedMax = Math.max(0, Math.min(100, Math.round(rawMax / 5) * 5))
    const includeUnassessed = raw?.['includeUnassessed'] !== false
    next.gearInspectorImprovementChance = {
      min: Math.min(clampedMin, clampedMax),
      max: Math.max(clampedMin, clampedMax),
      includeUnassessed,
    }
  }

  return next
}

// Check whether any filter field deviates from the default (empty) state.
export function isRulesFilterActive(f: RulesFilterState, options?: { includeGearInspectorRange?: boolean }): boolean {
  const includeGearInspectorRange = options?.includeGearInspectorRange ?? false
  let gearInspectorRangeActive = false
  if (includeGearInspectorRange) {
    const { min, max } = resolveGearInspectorLevelRange(f.level)
    gearInspectorRangeActive = min > DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE.min || max < DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE.max
  }
  const ra = (f.rule?.keep ?? 'any') !== 'any' || (f.rule?.use ?? 'any') !== 'any'
  const tr = Boolean(f.gearInspectorResult?.keep) || Boolean(f.gearInspectorResult?.sell)
    || Boolean(f.gearInspectorResult?.matched) || Boolean(f.gearInspectorResult?.unmatched)
  const a = (f.sets?.selected?.length ?? 0) > 0 || ((f.sets?.metaSelected)?.length ?? 0) > 0 || (f.sets?.anyMode ?? 'include') !== 'include' || f.sets?.match === 'all'
  const b = (f.slots?.selected?.length ?? 0) > 0 || (f.slots?.anyMode ?? 'include') !== 'include'
  const c = ((f.rank?.selected?.length ?? 0) > 0) || ((f.rank?.anyMode) ?? 'include') !== 'include'
  const d = ((f.rarity?.selected?.length ?? 0) > 0) || ((f.rarity?.anyMode) ?? 'include') !== 'include'
  const e = (f.level?.selected?.length ?? 0) > 0 || (f.level?.anyMode ?? 'include') !== 'include' || gearInspectorRangeActive
  const g = (f.main?.selected?.length ?? 0) > 0 || (f.main?.anyMode ?? 'include') !== 'include'
  const h = (f.sub?.selected?.length ?? 0) > 0
    || (f.sub?.notSelected?.length ?? 0) > 0
    || (f.sub?.wildcardMode ?? 'include') !== 'include'
    || (f.sub?.mode ?? 'all') !== 'all'
  const i = (f.faction?.selected?.length ?? 0) > 0 || (f.faction?.anyMode ?? 'include') !== 'include'
  const j = Boolean(f.recipeName && typeof f.recipeName.query === 'string' && f.recipeName.query.length > 0)
  const k = (f.gearInspectorSources?.selected?.length ?? 0) > 0
  const l = (f.gearInspectorChaos?.mode ?? 'any') !== 'any'
  const m = (f.gearInspectorGlyphs?.mode ?? 'any') !== 'any'
  const p = isGearInspectorRollFilterActive(f.gearInspectorRolls)
  const n = ((f.gearInspectorAscension?.stars?.length ?? 0) > 0) || ((f.gearInspectorAscension?.stats?.length ?? 0) > 0)
  const o = (f.gearInspectorChampions?.selected?.length ?? 0) > 0
  const q = isGearInspectorLastUseFilterActive(f.gearInspectorLastUse)
  const ic = f.gearInspectorImprovementChance
  const r = (ic?.min ?? 0) > 0 || (ic?.max ?? 100) < 100 || ic?.includeUnassessed === false
  return ra || tr || a || b || c || d || e || g || h || i || j || k || l || m || p || n || o || q || r
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
  matchingRecipeIndices: Set<number>
  recipeRuleCounts: Map<number, number>
}

export function filterHsfRules<T extends HsfRule>(
  rules: T[],
  f: RulesFilterState,
  metasets?: Metaset[],
  options?: {
    recipeNames?: Array<string | null | undefined>
    recipeTags?: Array<string[] | null | undefined>
    recipeModes?: SellfileExportMode[]
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
      if (metaSet.has(m.name)) {
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
  const matchingRecipeIndices = new Set<number>()
  const recipeRuleCounts = new Map<number, number>()

  const recipeNameQuery = f.recipeName?.query ?? ''
  const recipeNameFilterActive = recipeNameQuery.length > 0
  let recipeNameRegex: RegExp | null = null
  let recipeNameRegexValid = true
  if (recipeNameFilterActive) {
    try {
      recipeNameRegex = new RegExp(recipeNameQuery, 'i')
    } catch {
      recipeNameRegexValid = false
      recipeNameRegex = null
    }
  }

  const shouldIncludeRule = (r: T): boolean => {
    const withRecipe = r as unknown as HsfRuleWithRecipe
    const recipeIdx = getRuleRecipeIndex(withRecipe)
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

    if (recipeNameFilterActive) {
      if (!recipeNameRegexValid) return false
      const resolvedName = resolveMatchRecipeName(recipeIdx ?? null, options?.recipeNames ?? null, withRecipe)
      const ruleSource = (withRecipe as Partial<HsfRuleWithRecipe> | null | undefined)?.__source ?? null
      const sourceAliases = ruleSource
        ? options?.specialRuleLabels?.[ruleSource] ?? []
        : []
      const candidateNames: string[] = []
      if (resolvedName) candidateNames.push(resolvedName)
      // Also allow recipe tags to satisfy the name filter.
      if (recipeIdx != null && recipeIdx >= 0 && Array.isArray(options?.recipeTags)) {
        const tagList = options.recipeTags[recipeIdx]
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
      if (!candidateNames.some((name) => recipeNameRegex!.test(name))) return false
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
    const recipeIdx = getRuleRecipeIndex(r as unknown as HsfRuleWithRecipe)
    if (recipeIdx !== null) {
      matchingRecipeIndices.add(recipeIdx)
      recipeRuleCounts.set(recipeIdx, (recipeRuleCounts.get(recipeIdx) ?? 0) + 1)
    }
  }

  const ensureRecipeEntries = (indices: Iterable<number>) => {
    for (const idx of indices) {
      matchingRecipeIndices.add(idx)
      if (!recipeRuleCounts.has(idx)) recipeRuleCounts.set(idx, 0)
    }
  }

  const filtersActive = isRulesFilterActive(f)
  if (!filtersActive) {
    const total = Math.max(
      options?.recipeModes?.length ?? 0,
      options?.recipeNames?.length ?? 0,
      options?.recipeTags?.length ?? 0,
    )
    if (total > 0) {
      ensureRecipeEntries(Array.from({ length: total }, (_, i) => i))
    }
  }

  if (recipeNameFilterActive && recipeNameRegexValid) {
    const nameLimit = Array.isArray(options?.recipeNames) ? options.recipeNames.length : 0
    const tagLimit = Array.isArray(options?.recipeTags) ? options.recipeTags.length : 0
    const limit = Math.max(nameLimit, tagLimit)
    for (let idx = 0; idx < limit; idx += 1) {
      const candidateNames: string[] = []
      if (Array.isArray(options?.recipeNames)) {
        const name = options.recipeNames[idx] ?? ''
        if (typeof name === 'string' && name.trim().length > 0) candidateNames.push(name)
      }
      if (Array.isArray(options?.recipeTags)) {
        const tagList = options.recipeTags[idx]
        if (Array.isArray(tagList)) {
          for (const tag of tagList) {
            const trimmed = typeof tag === 'string' ? tag.trim() : ''
            if (trimmed.length > 0) candidateNames.push(trimmed)
          }
        }
      }
      if (!candidateNames.some((name) => recipeNameRegex!.test(name))) continue
      if (!matchingRecipeIndices.has(idx)) matchingRecipeIndices.add(idx)
      if (!recipeRuleCounts.has(idx)) recipeRuleCounts.set(idx, 0)
    }
  }

  return { rules: filtered, matchingRecipeIndices, recipeRuleCounts }
}

export type GearInspectorFilterRowMatch = {
  keep: boolean
  recipeIdx: number | null
  recipeName?: string | null
  ruleSource?: string | null
}

export type GearInspectorFilterRow = {
  artifact: NormalizedGearArtifact
  match: GearInspectorFilterRowMatch | null
  matchingRecipeIndices?: number[]
}

export interface FilterGearInspectorItemsOptions {
  recipeNames?: Array<string | null | undefined>
  recipeTags?: Array<string[] | null | undefined>
  specialRuleLabels?: RuleSourceLabelMap
  improvementChanceByArtifactId?: Map<number, ImprovementChanceWasmEntry> | null
}

/** Opacity group for each gear card in Matched/Unmatched context mode. */
export type GearInspectorContextGroup = 'primary' | 'companion' | 'other'

/**
 * Companion key for a gear item used to find set-mates of sell-tagged pieces.
 * Returns null when the item has no possible companions (regular no-set gear, set ID 0).
 * Accessories companion by set + slot + faction; armor companions by set + slot only.
 * No-set accessories (set ID −99) companion each other within the same slot + faction.
 */
function computeGearCompanionKey(artifact: NormalizedGearArtifact): string | null {
  const setId = Number(artifact.set)
  const slotId = Number(artifact.slot)
  // Regular no-set gear (set ID 0) has no companions per spec.
  if (setId === 0) return null
  if (isAccessorySlot(slotId)) {
    // Accessories match by set + slot + faction (includes no-set accessories, set ID −99).
    return `${setId}:${slotId}:${Number(artifact.faction ?? 0)}`
  }
  // Armor matches by set + slot.
  return `${setId}:${slotId}`
}

export interface FilterGearInspectorItemsResult<T extends GearInspectorFilterRow> {
  items: T[]
  matchingRecipeIndices: Set<number>
  /** Populated in context mode (Matched or Unmatched active); maps artifact ID → display group. */
  contextGroupById?: Map<number, GearInspectorContextGroup>
}

export function filterGearInspectorItems<T extends GearInspectorFilterRow>(
  rows: readonly T[],
  f: RulesFilterState,
  metasets?: Metaset[],
  options?: FilterGearInspectorItemsOptions,
): FilterGearInspectorItemsResult<T> {
  if (!rows.length) return { items: [], matchingRecipeIndices: new Set() }

  const gearInspectorRolls = normalizeGearInspectorRollsState(f.gearInspectorRolls)
  const gearInspectorRollsActive = isGearInspectorRollFilterActive(gearInspectorRolls)

  // Result filter button state (four independent boolean toggles).
  const keepActive = Boolean(f.gearInspectorResult?.keep)
  const sellActive = Boolean(f.gearInspectorResult?.sell)
  const matchedActive = Boolean(f.gearInspectorResult?.matched)
  const unmatchedActive = Boolean(f.gearInspectorResult?.unmatched)
  // Context mode activates when Matched is pressed, OR when Unmatched is combined with Keep/Sell.
  // Unmatched alone (no Keep/Sell/Matched) stays a plain filter: show only unmatched items.
  const contextModeActive = matchedActive || (unmatchedActive && (keepActive || sellActive))
  // Split include/exclude entries for Gear Inspector filtering.
  const setSelection = splitArtifactSetSelections(f.sets?.selected ?? [])
  const selectedSets = new Set(setSelection.included.map(Number))
  const excludedSets = new Set(setSelection.excluded.map(Number))
  if (metasets && (f.sets?.metaSelected?.length ?? 0) > 0) {
    const metaSet = new Set<string>(f.sets!.metaSelected!)
    for (const m of metasets) {
      if (metaSet.has(m.name)) {
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
  const selectedChampionIds = new Set((f.gearInspectorChampions?.selected ?? []).map(Number))
  const gearInspectorLevelRange = resolveGearInspectorLevelRange(f.level)
  const gearInspectorExactLevelRangeActive =
    gearInspectorLevelRange.min > DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE.min || gearInspectorLevelRange.max < DEFAULT_GEAR_INSPECTOR_LEVEL_RANGE.max
  const gearInspectorLastUse = normalizeGearInspectorLastUseFilter(f.gearInspectorLastUse)
  const gearInspectorLastUsePresetSet = new Set<GearInspectorLastUsePreset>(gearInspectorLastUse.presets)
  const gearInspectorLastUsePresetsActive = gearInspectorLastUsePresetSet.size > 0
  const gearInspectorLastUseCustom = gearInspectorLastUse.custom
  const gearInspectorLastUseCustomActive = gearInspectorLastUseCustom.enabled

  const subMode = f.sub?.mode ?? 'all'
  const subWildcardMode = f.sub?.wildcardMode ?? 'include'

  let recipeNameRegex: RegExp | null = null
  let recipeNameRegexValid = true
  const recipeNameQuery = f.recipeName?.query ?? ''
  const recipeNameFilterActive = recipeNameQuery.length > 0
  if (recipeNameFilterActive) {
    try {
      recipeNameRegex = new RegExp(recipeNameQuery, 'i')
    } catch {
      recipeNameRegex = null
      recipeNameRegexValid = false
    }
  }

  const matchingRecipeIndices = new Set<number>()
  const selectedSources = new Set<GearInspectorSourceFilter>(f.gearInspectorSources?.selected ?? [])
  const sourceScope = selectedSources.size > 0
  // When sell + sources + context mode are all active, item-level filters (rank, rarity,
  // level, substats, ascension, champions, last-used) are deferred to the second pass so
  // keep-tagged companions of matching primaries are not discarded before grouping.
  const deferItemFilters = contextModeActive && sellActive && sourceScope
  const chaosMode = f.gearInspectorChaos?.mode ?? 'any'
  const glyphMode = f.gearInspectorGlyphs?.mode ?? 'any'
  const ascensionStars = new Set<number>(f.gearInspectorAscension?.stars ?? [])
  const ascensionStats = new Set((f.gearInspectorAscension?.stats ?? []).map(Number))
  const improvChanceMin = f.gearInspectorImprovementChance?.min ?? 0
  const improvChanceMax = f.gearInspectorImprovementChance?.max ?? 100
  const improvChanceIncludeUnassessed = f.gearInspectorImprovementChance?.includeUnassessed !== false
  const improvChanceFilterActive = improvChanceMin > 0 || improvChanceMax < 100 || !improvChanceIncludeUnassessed
  // First pass: collect candidates passing all non-gearInspectorResult filters.
  // gearInspectorResult is resolved in a second pass so companion keys can be computed
  // across the full candidate set before any item is excluded.
  const candidates: T[] = []

  for (const row of rows) {
    const artifact = row.artifact
    const match = row.match

    if (recipeNameFilterActive) {
      if (!recipeNameRegexValid) continue
      const candidateNames: string[] = []
      const recipeIdx = match?.recipeIdx
      if (recipeIdx != null && recipeIdx >= 0 && Array.isArray(options?.recipeNames)) {
        const rawName = options.recipeNames[recipeIdx]
        const trimmedName = typeof rawName === 'string' ? rawName.trim() : ''
        if (trimmedName.length > 0) candidateNames.push(trimmedName)
      }
      if (recipeIdx != null && recipeIdx >= 0 && Array.isArray(options?.recipeTags)) {
        const tagList = options.recipeTags[recipeIdx]
        if (Array.isArray(tagList)) {
          for (const tag of tagList) {
            const trimmed = typeof tag === 'string' ? tag.trim() : ''
            if (trimmed.length > 0) candidateNames.push(trimmed)
          }
        }
      }
      const explicitMatchName = typeof match?.recipeName === 'string' ? match.recipeName.trim() : ''
      if (explicitMatchName.length > 0) candidateNames.push(explicitMatchName)
      const ruleSource = match?.ruleSource ?? null
      if (ruleSource && options?.specialRuleLabels?.[ruleSource]) {
        for (const alias of options.specialRuleLabels[ruleSource]!) {
          if (alias && alias.length > 0) candidateNames.push(alias)
        }
      }
      if (candidateNames.length === 0) continue
      if (!candidateNames.some((name) => recipeNameRegex!.test(name))) continue
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

    if (!deferItemFilters) {
      const rankMode = f.rank?.anyMode ?? 'include'
      const rank = Number(artifact.rank)
      if (rankMode === 'only') {
        continue
      } else if (rankMode === 'off') {
        // Rank is always specified for the Gear Inspector queue.
      }
      if (selectedRanks.size > 0 && !selectedRanks.has(rank as RankValue)) continue
    }

    if (!deferItemFilters) {
      const rarityMode = f.rarity?.anyMode ?? 'include'
      const rarity = Number(artifact.rarity)
      if (rarityMode === 'only') {
        continue
      } else if (rarityMode === 'off') {
        // Rarity always specified.
      }
      if (selectedRarities.size > 0 && !selectedRarities.has(rarity as RankValue)) continue
    }

    if (!deferItemFilters) {
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
      const exactLevel = clampGearInspectorLevelValue(rawExactLevel)
      if (gearInspectorExactLevelRangeActive) {
        if (exactLevel < gearInspectorLevelRange.min || exactLevel > gearInspectorLevelRange.max) continue
      }
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
    const rollCounts = gearInspectorRollsActive ? new Map<number, number>() : null
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
    if (!deferItemFilters) {
      // subWildcardMode stays a first-pass gate (structural, not item-specific).
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
    }

    const factionMode = f.faction?.anyMode ?? 'include'
    const faction = Number(artifact.faction ?? 0)
    if (factionMode === 'only') {
      if (faction !== 0) continue
    } else if (factionMode === 'off') {
      if (faction === 0 && isAccessorySlot(slotId)) continue
    }
    if (selectedFactions.size > 0 && !selectedFactions.has(faction)) continue

    // When context mode is active and sources are selected, sources are applied in the
    // second pass as a reference constraint (companions may come from any source).
    // In all other cases, sources remain a strict first-pass inclusion gate.
    if (!contextModeActive && selectedSources.size > 0) {
      const category = determineGearInspectorSourceCategory(artifact)
      if (!selectedSources.has(category)) continue
    }

    if (!deferItemFilters && selectedChampionIds.size > 0) {
      const championId = artifact.equippedChampion?.id
      if (championId == null || !selectedChampionIds.has(Number(championId))) continue
    }

    if (!deferItemFilters && (gearInspectorLastUsePresetsActive || gearInspectorLastUseCustomActive)) {
      const timestamp = typeof artifact.lastUseLocalTimestamp === 'string' ? artifact.lastUseLocalTimestamp : null
      const hasTimestamp = Boolean(timestamp)
      const daysSince = hasTimestamp ? getDaysSince(timestamp) : null

      if (gearInspectorLastUsePresetsActive || gearInspectorLastUseCustomActive) {
        // Evaluate presets/custom as a union so the row survives if either path wins.
        let presetMatch: boolean | null = null
        if (gearInspectorLastUsePresetsActive) {
          // Presets boil down to discrete buckets, so null timestamps only pass if "never" is active.
          presetMatch = false
          if (!hasTimestamp || daysSince == null) {
            presetMatch = gearInspectorLastUsePresetSet.has('never')
          } else {
            for (const preset of gearInspectorLastUsePresetSet) {
              if (preset === 'never') continue
              if (matchesGearInspectorLastUsePreset(daysSince, preset)) {
                presetMatch = true
                break
              }
            }
          }
        }

        let customMatch: boolean | null = null
        if (gearInspectorLastUseCustomActive) {
          // Custom ranges only check timestamped gear; null timestamps route through the "Never used" preset.
          if (!hasTimestamp || daysSince == null) customMatch = false
          else {
            customMatch =
              daysSince >= gearInspectorLastUseCustom.minDays && daysSince <= gearInspectorLastUseCustom.maxDays
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

    if (!deferItemFilters && (ascensionStars.size > 0 || ascensionStats.size > 0)) {
      const asc = artifact.ascension
      const starLevel = Math.max(0, Math.min(6, Math.round(asc?.rolls ?? 0)))
      if (ascensionStars.size > 0 && !ascensionStars.has(starLevel)) continue
      if (ascensionStats.size > 0) {
        const variant = asc?.variant
        if (!variant || variant === StatVariant.Any || !ascensionStats.has(Number(variant))) continue
      }
    }

    if (gearInspectorRollsActive) {
      if (!rollCounts || !passesGearInspectorRollFilters({
        filters: gearInspectorRolls,
        rollCounts,
      })) continue
    }

    if (improvChanceFilterActive) {
      const entry = options?.improvementChanceByArtifactId?.get(Number(artifact.id))
      // Treat the +16/100% degenerate case as "no data" — same exclusion as the overlay and sort.
      const hasData = Boolean(entry?.hasMatchingSafeguard)
        && !isDegenerateImprovChance(entry?.chancePercent ?? 0, Number(artifact.level))
      if (hasData) {
        // Item has improvement chance data — filter by range.
        if (entry!.chancePercent < improvChanceMin || entry!.chancePercent > improvChanceMax) continue
      } else {
        // No improvement chance data (or degenerate) — keep only if includeUnassessed.
        if (!improvChanceIncludeUnassessed) continue
      }
    }

    candidates.push(row)
  }

  // Second pass: apply gearInspectorResult filter / context mode on candidates.
  const filtered: T[] = []
  let contextGroupById: Map<number, GearInspectorContextGroup> | undefined

  if (contextModeActive) {
    // sourceScope is hoisted above the first pass; companions may come from any source
    // while only reference-source sell-tagged items anchor companion keys or act as primaries.

    // Re-evaluates the item-level filters that were skipped in the first pass when
    // deferItemFilters is true. Called only for sell-tagged reference-source items.
    const passesDeferredFilters = (artifact: NormalizedGearArtifact): boolean => {
      if (selectedRanks.size > 0 && !selectedRanks.has(Number(artifact.rank) as RankValue)) return false
      if (selectedRarities.size > 0 && !selectedRarities.has(Number(artifact.rarity) as RankValue)) return false
      const level = Number(artifact.level)
      if (selectedLevels.size > 0 && !selectedLevels.has(level as LevelMilestone)) return false
      if (gearInspectorExactLevelRangeActive) {
        const rawExactLevel = typeof artifact.exactLevel === 'number' && Number.isFinite(artifact.exactLevel)
          ? Number(artifact.exactLevel) : level
        const exactLevel = clampGearInspectorLevelValue(rawExactLevel)
        if (exactLevel < gearInspectorLevelRange.min || exactLevel > gearInspectorLevelRange.max) return false
      }
      if (selectedSubVariants.size > 0 || excludedSubVariants.size > 0) {
        const subVars = new Set(
          artifact.substats.filter(s => s.variant !== StatVariant.Any).map(s => Number(s.variant))
        )
        for (const v of excludedSubVariants) if (subVars.has(v)) return false
        if (subMode === 'all') {
          for (const v of selectedSubVariants) if (!subVars.has(v)) return false
        } else if (selectedSubVariants.size > 0) {
          let ok = false
          for (const v of selectedSubVariants) if (subVars.has(v)) { ok = true; break }
          if (!ok) return false
        }
      }
      if (ascensionStars.size > 0 || ascensionStats.size > 0) {
        const starLevel = Math.max(0, Math.min(6, Math.round(artifact.ascension?.rolls ?? 0)))
        if (ascensionStars.size > 0 && !ascensionStars.has(starLevel)) return false
        if (ascensionStats.size > 0) {
          const variant = artifact.ascension?.variant
          if (!variant || variant === StatVariant.Any || !ascensionStats.has(Number(variant))) return false
        }
      }
      if (selectedChampionIds.size > 0) {
        const championId = artifact.equippedChampion?.id
        if (championId == null || !selectedChampionIds.has(Number(championId))) return false
      }
      if (gearInspectorLastUsePresetsActive || gearInspectorLastUseCustomActive) {
        const timestamp = typeof artifact.lastUseLocalTimestamp === 'string' ? artifact.lastUseLocalTimestamp : null
        const hasTimestamp = Boolean(timestamp)
        const daysSince = hasTimestamp ? getDaysSince(timestamp) : null
        let presetMatch: boolean | null = null
        if (gearInspectorLastUsePresetsActive) {
          presetMatch = false
          if (!hasTimestamp || daysSince == null) {
            presetMatch = gearInspectorLastUsePresetSet.has('never')
          } else {
            for (const preset of gearInspectorLastUsePresetSet) {
              if (preset === 'never') continue
              if (matchesGearInspectorLastUsePreset(daysSince, preset)) { presetMatch = true; break }
            }
          }
        }
        let customMatch: boolean | null = null
        if (gearInspectorLastUseCustomActive) {
          if (!hasTimestamp || daysSince == null) customMatch = false
          else customMatch = daysSince >= gearInspectorLastUseCustom.minDays && daysSince <= gearInspectorLastUseCustom.maxDays
        }
        if (!((presetMatch ?? false) || (customMatch ?? false))) return false
      }
      return true
    }

    // Build companion keys from sell-tagged reference-source candidates only.
    const sellCompanionKeys = new Set<string>()
    for (const row of candidates) {
      if (row.match?.keep === false) {
        // Non-reference items don't anchor companion keys in source-scope mode.
        if (sourceScope && !selectedSources.has(determineGearInspectorSourceCategory(row.artifact))) continue
        // Companion keys are anchored only by primaries that pass the deferred item filters.
        if (deferItemFilters && !passesDeferredFilters(row.artifact)) continue
        const key = computeGearCompanionKey(row.artifact)
        if (key !== null) sellCompanionKeys.add(key)
      }
    }

    // Keep focus: companions are primary (100%), sell-tagged reference items are companion (intermediate%).
    // Sell focus (default, including Matched alone): sell-tagged reference items are primary (100%), companions are companion (intermediate%).
    // Both Keep+Sell: sell-tagged reference items + companions are both primary (100%).
    // Companion elevation only applies when Matched is active; without Matched, companions render at 25% like other.
    const keepFocused = keepActive && !sellActive
    const bothFocused = keepActive && sellActive

    contextGroupById = new Map<number, GearInspectorContextGroup>()
    for (const row of candidates) {
      const isSell = row.match?.keep === false
      // In source-scope mode only reference-source items can be primary; outside-reference
      // items may still surface as companions if their set+slot matches a primary's key.
      const isInReference = !sourceScope || selectedSources.has(determineGearInspectorSourceCategory(row.artifact))
      // In deferred-filter mode, primaries must also pass rank/rarity/level/substats/ascension/champions/last-use.
      const isPrimaryCandidate = isSell && isInReference &&
        (!deferItemFilters || passesDeferredFilters(row.artifact))
      // Sell-tagged reference items that failed deferred filters are excluded entirely —
      // not demoted to companion — to avoid semantic ambiguity.
      const isExcludedPrimary = deferItemFilters && isSell && isInReference && !isPrimaryCandidate
      const cKey = (isPrimaryCandidate || isExcludedPrimary) ? null : computeGearCompanionKey(row.artifact)
      const isCompanion = cKey !== null && sellCompanionKeys.has(cKey)

      let group: GearInspectorContextGroup
      if (keepFocused) {
        // Keep focus: companions = primary, sell-tagged reference items = companion, rest = other.
        if (isCompanion) group = 'primary'
        else if (isSell && isInReference) group = 'companion'
        else group = 'other'
      } else if (bothFocused) {
        // Both active: sell-tagged reference items + companions share primary; others are other.
        if (isPrimaryCandidate || isCompanion) group = 'primary'
        else group = 'other'
      } else {
        // Sell focus (sell-only or neither, Matched-alone defaults to sell focus).
        if (isPrimaryCandidate) group = 'primary'
        else if (isCompanion) group = 'companion'
        else group = 'other'
      }
      // Without Matched, companions lose elevation and merge with the other group at 25%.
      if (!matchedActive && group === 'companion') group = 'other'
      contextGroupById.set(row.artifact.id, group)

      // In Matched-only mode the "Other Group" is hidden; Unmatched mode shows it at 25%.
      if (group === 'other' && !unmatchedActive) continue

      filtered.push(row)
      if (row.match?.recipeIdx != null && row.match.recipeIdx >= 0) {
        matchingRecipeIndices.add(row.match.recipeIdx)
      }
    }
  } else {
    // Plain filter mode: each button independently narrows the visible set.
    for (const row of candidates) {
      const match = row.match
      if (keepActive && !sellActive) {
        // Keep-only: show only keep-tagged items.
        if (match?.keep !== true) continue
      } else if (sellActive && !keepActive) {
        // Sell-only: show only sell-tagged items.
        if (match?.keep !== false) continue
      } else if (keepActive && sellActive) {
        // Both: show all matched items (keep or sell combined).
        if (match === null) continue
      } else if (unmatchedActive) {
        // Unmatched alone (no Matched, no Keep, no Sell): show only unmatched items.
        if (match !== null) continue
      }
      // Neither active: show everything (no restriction).

      filtered.push(row)
      if (match?.recipeIdx != null && match.recipeIdx >= 0) {
        matchingRecipeIndices.add(match.recipeIdx)
      }
    }
  }

  // exactOptionalPropertyTypes: omit the key entirely when context mode was not active.
  return contextGroupById != null
    ? { items: filtered, matchingRecipeIndices, contextGroupById }
    : { items: filtered, matchingRecipeIndices }
}

export const determineGearInspectorSourceCategory = (artifact: NormalizedGearArtifact): GearInspectorSourceFilter => {
  if (artifact.source === 'manual') return 'manual'
  if (artifact.source === 'inbox') return 'inbox'
  if (artifact.equippedChampion?.id != null) {
    const loc = artifact.equippedChampion?.location
    return loc === 'vault' || loc === 'reserveVault' ? 'vault' : 'collection'
  }
  return 'inventory'
}

const GEAR_INSPECTOR_DISABLED_ANY_FIELDS = ['main', 'level', 'slots', 'rank', 'rarity'] as const

export type GearInspectorIncompatibleAnyField = typeof GEAR_INSPECTOR_DISABLED_ANY_FIELDS[number]

/**
 * Gear Inspector mode hides the "Any" toggles for select fields, so the sellfile preview's
 * stricter interpretations (Only Any / Hide Any) should not leak into Gear Inspector results.
 * Create a shallow clone of the filter state with those sections forced back to
 * the neutral `'include'` mode so the Gear Inspector behaves consistently across locales.
 */
export function normalizeRulesFilterForGearInspector(filter: RulesFilterState): RulesFilterState {
  let normalized: RulesFilterState | null = null

  const ensureInclude = <K extends GearInspectorIncompatibleAnyField>(field: K) => {
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

  for (const field of GEAR_INSPECTOR_DISABLED_ANY_FIELDS) {
    ensureInclude(field)
  }

  return normalized ?? filter
}

type RollFilterEvalArgs = {
  filters: GearInspectorRollFilterState
  rollCounts: Map<number, number>
}

export function isGearInspectorRollFilterActive(rolls?: GearInspectorRollFilterState): boolean {
  if (!rolls) return false
  const wildcard = rolls.wildcard ?? createDefaultGearInspectorRollsState().wildcard
  const wildcardMode = wildcard.mode ?? 'off'
  const wildcardActive = wildcardMode !== 'off' && (wildcard.counts?.length ?? 0) > 0
  if (wildcardActive) return true
  return Boolean(rolls.perStat?.some((row) => (row?.counts?.length ?? 0) > 0))
}

const normalizeGearInspectorRollFilterRow = (row: GearInspectorRollFilterRow | null | undefined): GearInspectorRollFilterRow | null => {
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

const normalizeRollMode = (mode?: GearInspectorRollWildcardMode | string): GearInspectorRollWildcardMode => {
  if (mode === 'any' || mode === 'selected') return 'any'
  return 'off'
}

const normalizeGearInspectorRollsState = (input?: GearInspectorRollFilterState): GearInspectorRollFilterState => {
  const base = input ?? createDefaultGearInspectorRollsState()
  const wildcard = base.wildcard ?? createDefaultGearInspectorRollsState().wildcard
  const rows = Array.isArray(base.perStat) ? base.perStat : []
  return {
    wildcard: {
      mode: normalizeRollMode(wildcard.mode),
      counts: resolveRollCountSet(wildcard),
    },
    perStat: rows
      .map((row) => normalizeGearInspectorRollFilterRow(row))
      .filter((row): row is GearInspectorRollFilterRow => Boolean(row)),
  }
}

type RollCountCarrier = {
  counts?: unknown
}

function resolveRollCountSet(carrier: RollCountCarrier | null | undefined): GearInspectorRollCountSet {
  // Only the current 'counts' array format is accepted; older shapes are ignored.
  return normalizeRollCountSet(carrier?.counts)
}

function normalizeRollCountSet(input: unknown): GearInspectorRollCountSet {
  if (!Array.isArray(input)) return []
  const seen = new Set<number>()
  const next: GearInspectorRollCountValue[] = []
  for (const raw of input) {
    if (typeof raw !== 'number' && typeof raw !== 'string') continue
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) continue
    const clamped = clampRollTarget(numeric) as GearInspectorRollCountValue
    if (seen.has(clamped)) continue
    seen.add(clamped)
    next.push(clamped)
  }
  next.sort((a, b) => a - b)
  return next
}

const passesGearInspectorRollFilters = ({ filters, rollCounts }: RollFilterEvalArgs): boolean => {
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
  if (typeof value !== 'number' || !Number.isFinite(value)) return GEAR_INSPECTOR_LAST_USE_MIN_DAYS
  if (value < GEAR_INSPECTOR_LAST_USE_MIN_DAYS) return GEAR_INSPECTOR_LAST_USE_MIN_DAYS
  if (value > GEAR_INSPECTOR_LAST_USE_MAX_DAYS) return GEAR_INSPECTOR_LAST_USE_MAX_DAYS
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

const GEAR_INSPECTOR_LAST_USE_RECENT_PRESETS: GearInspectorLastUsePreset[] = ['recent7', 'recent30', 'recent90']
const RECENT_PRESET_PRIORITY = new Map(
  GEAR_INSPECTOR_LAST_USE_RECENT_PRESETS.map((preset, index) => [preset, index]),
)

/**
 * Collapse redundant preset selections so only the widest "recent" range sticks
 * around while orthogonal tokens (Never, Older) remain untouched. This lets the
 * UI expose toggle-like affordances without pushing duplicated predicates into
 * the core filter logic.
 */
export const sanitizeGearInspectorLastUsePresets = (
  rawPresets: Iterable<GearInspectorLastUsePreset>,
): GearInspectorLastUsePreset[] => {
  const base = new Set<GearInspectorLastUsePreset>()
  let widestRecent: GearInspectorLastUsePreset | null = null
  for (const preset of rawPresets) {
    if (GEAR_INSPECTOR_LAST_USE_RECENT_PRESETS.includes(preset)) {
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
export const toggleGearInspectorLastUsePresetSelection = (
  current: readonly GearInspectorLastUsePreset[],
  preset: GearInspectorLastUsePreset,
): GearInspectorLastUsePreset[] => {
  const draft = new Set<GearInspectorLastUsePreset>(current)
  if (draft.has(preset)) {
    draft.delete(preset)
  } else {
    if (GEAR_INSPECTOR_LAST_USE_RECENT_PRESETS.includes(preset)) {
      for (const recent of GEAR_INSPECTOR_LAST_USE_RECENT_PRESETS) draft.delete(recent)
    }
    draft.add(preset)
  }
  return sanitizeGearInspectorLastUsePresets(draft)
}

export const normalizeGearInspectorLastUseFilter = (
  input?: RulesFilterState['gearInspectorLastUse'] | null,
): GearInspectorLastUseFilter => {
  if (!input) return createDefaultGearInspectorLastUseFilter()
  const rawPresets = Array.isArray(input.presets) ? input.presets : []
  const seen = new Set<GearInspectorLastUsePreset>()
  const presets: GearInspectorLastUsePreset[] = []
  for (const raw of rawPresets) {
    if (GEAR_INSPECTOR_LAST_USE_PRESETS.includes(raw as GearInspectorLastUsePreset)) {
      const value = raw as GearInspectorLastUsePreset
      if (seen.has(value)) continue
      seen.add(value)
      presets.push(value)
    }
  }
  const collapsedPresets = sanitizeGearInspectorLastUsePresets(presets)
  const baseCustom = input.custom ?? DEFAULT_GEAR_INSPECTOR_LAST_USE_CUSTOM
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

export const isGearInspectorLastUseFilterActive = (value?: RulesFilterState['gearInspectorLastUse']): boolean => {
  const filter = normalizeGearInspectorLastUseFilter(value)
  if (filter.presets.length > 0) return true
  if (!filter.custom.enabled) return false
  if (filter.custom.minDays > GEAR_INSPECTOR_LAST_USE_MIN_DAYS) return true
  if (filter.custom.maxDays < GEAR_INSPECTOR_LAST_USE_MAX_DAYS) return true
  return false
}

const matchesGearInspectorLastUsePreset = (days: number, preset: GearInspectorLastUsePreset): boolean => {
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
