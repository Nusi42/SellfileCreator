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
import {
  mainToVariant,
  subToVariant,
  type ArtifactSetId,
  type ArtifactTypeId,
  type FactionId,
  StatVariant,
  StatId,
  LEVEL_ANY_SENTINEL,
  type LevelMilestone,
  type RankValue,
} from './types'
import { rankCoverage, rarityCoverage } from './hsfTypes'
import type { HsfRuleWithCfg } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import { isAccessorySlot } from './testerDomain'
import { ACCESSORY_NO_SET_ID } from './constants'

// Tri-state for handling explicit "Any" fields in rules.
export type AnyMode = 'off' | 'include' | 'only'

export type SubstatMatchMode = 'all' | 'any'

// Compact tri-state toggle used for simple boolean fields in filters.
// 'any' leaves the field unfiltered; 'yes' matches true/enabled; 'no' matches false/disabled.
export type Bool3 = 'any' | 'yes' | 'no'

export type TesterSourceFilter = 'inventory' | 'collection' | 'vault' | 'inbox' | 'manual'
export type TesterChaosFilterMode = 'any' | 'notRerolled' | 'rerolled'
export type TesterGlyphFilterMode = 'any' | 'on' | 'off' | 'selected'
export type TesterRollComparator = 'eq' | 'gte' | 'lte'
export type TesterRollWildcardMode = 'off' | 'any' | 'selected'

export type TesterRollFilterRow = {
  stat: StatVariant
  comparator: TesterRollComparator
  value: number
}

export type TesterRollWildcardFilter = {
  mode: TesterRollWildcardMode
  comparator: TesterRollComparator
  value: number
}

export type TesterRollFilterState = {
  wildcard: TesterRollWildcardFilter
  perStat: TesterRollFilterRow[]
}

export const createDefaultTesterRollsState = (): TesterRollFilterState => ({
  wildcard: { mode: 'off', comparator: 'eq', value: 2 },
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

export interface RulesFilterState {
  // Rule-level filters
  rule?: { keep: Bool3; use: Bool3 }
  testerResult?: { keep: Bool3; matched: Bool3 }
  sets: { selected: ArtifactSetId[]; metaSelected?: string[]; anyMode: AnyMode; match?: 'any' | 'all' }
  slots: { selected: ArtifactTypeId[]; anyMode: AnyMode }
  // Rank: discrete buttons (1..6) instead of a contiguous range
  rank: { selected: RankValue[]; anyMode: AnyMode }
  // Rarity: discrete buttons (Common..Mythical) instead of a contiguous range
  rarity: { selected: RankValue[]; anyMode: AnyMode }
  level: { selected: LevelMilestone[]; anyMode: AnyMode; testerRange?: TesterLevelRange }
  main: { selected: StatVariant[]; anyMode: AnyMode }
  sub: { selected: StatVariant[]; mode: SubstatMatchMode; wildcardMode: AnyMode }
  faction: { selected: FactionId[]; anyMode: AnyMode }
  configName?: { query: string }
  testerSources?: { selected: TesterSourceFilter[] }
  testerChaos?: { mode: TesterChaosFilterMode }
  testerGlyphs?: { mode: TesterGlyphFilterMode }
  testerAscension?: { stars: number[]; stats: StatVariant[] }
  testerChampions?: { selected: number[] }
  testerRolls?: TesterRollFilterState
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
  sub: { selected: [], mode: 'all', wildcardMode: 'include' },
  faction: { selected: [], anyMode: 'include' },
  configName: { query: '' },
  testerSources: { selected: [] },
  testerChaos: { mode: 'any' },
  testerGlyphs: { mode: 'any' },
  testerAscension: { stars: [], stats: [] },
  testerChampions: { selected: [] },
  testerRolls: createDefaultTesterRollsState(),
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
  const h = (f.sub?.selected?.length ?? 0) > 0 || (f.sub?.wildcardMode ?? 'include') !== 'include' || (f.sub?.mode ?? 'all') !== 'all'
  const i = (f.faction?.selected?.length ?? 0) > 0 || (f.faction?.anyMode ?? 'include') !== 'include'
  const j = Boolean(f.configName && typeof f.configName.query === 'string' && f.configName.query.length > 0)
  const k = (f.testerSources?.selected?.length ?? 0) > 0
  const l = (f.testerChaos?.mode ?? 'any') !== 'any'
  const m = (f.testerGlyphs?.mode ?? 'any') !== 'any'
  const p = isTesterRollFilterActive(f.testerRolls)
  const n = ((f.testerAscension?.stars?.length ?? 0) > 0) || ((f.testerAscension?.stats?.length ?? 0) > 0)
  const o = (f.testerChampions?.selected?.length ?? 0) > 0
  return ra || tr || a || b || c || d || e || g || h || i || j || k || l || m || p || n || o
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
  options?: { configNames?: Array<string | null | undefined>; configModes?: SellfileExportMode[] },
): FilterHsfRulesResult<T> {
  const selectedSets = new Set((f.sets?.selected ?? []).map(Number))
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
    const cfgIdx = withCfg.__cfgIdx
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
      if (typeof cfgIdx !== 'number' || !Number.isFinite(cfgIdx)) return false
      const rawName = options?.configNames?.[cfgIdx] ?? ''
      const candidate = typeof rawName === 'string' ? rawName : ''
      if (!configNameRegex!.test(candidate)) return false
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

    if (selectedSub.size > 0) {
      const ruleSubs = new Set(subs.map(s => Number(subToVariant(s.ID, s.IsFlat))))
      if (f.sub.mode === 'all') {
        for (const v of selectedSub) { if (!ruleSubs.has(v)) return false }
      } else {
        let hit = false
        for (const v of selectedSub) { if (ruleSubs.has(v)) { hit = true; break } }
        if (!hit) return false
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
    const cfgIdx = (r as unknown as HsfRuleWithCfg).__cfgIdx
    if (typeof cfgIdx === 'number' && Number.isFinite(cfgIdx)) {
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
    )
    if (total > 0) {
      ensureConfigEntries(Array.from({ length: total }, (_, i) => i))
    }
  }

  if (configNameFilterActive && configNameRegexValid && Array.isArray(options?.configNames)) {
    const limit = options.configNames.length
    for (let idx = 0; idx < limit; idx += 1) {
      const name = options.configNames[idx] ?? ''
      if (configNameRegex!.test(typeof name === 'string' ? name : '')) {
        if (!matchingConfigIndices.has(idx)) matchingConfigIndices.add(idx)
        if (!configRuleCounts.has(idx)) configRuleCounts.set(idx, 0)
      }
    }
  }

  return { rules: filtered, matchingConfigIndices, configRuleCounts }
}

export type TesterFilterRow = {
  artifact: NormalizedGearArtifact
  match: { keep: boolean; cfgIdx: number | null } | null
  matchingCfgIndices?: number[]
}

export interface FilterTesterItemsOptions {
  configNames?: Array<string | null | undefined>
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
  const selectedSets = new Set((f.sets?.selected ?? []).map(Number))
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
  const selectedFactions = new Set((f.faction?.selected ?? []).map(Number))
  const selectedChampionIds = new Set((f.testerChampions?.selected ?? []).map(Number))
  const testerLevelRange = resolveTesterLevelRange(f.level)
  const testerExactLevelRangeActive =
    testerLevelRange.min > DEFAULT_TESTER_LEVEL_RANGE.min || testerLevelRange.max < DEFAULT_TESTER_LEVEL_RANGE.max

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
      const cfgIdx = match?.cfgIdx
      if (cfgIdx == null || cfgIdx < 0) continue
      const rawName = options?.configNames?.[cfgIdx]
      const candidate = typeof rawName === 'string' ? rawName : ''
      if (!configNameRegex!.test(candidate)) continue
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
    if (selectedSets.size > 0) {
      if (!selectedSets.has(setId)) continue
    }

    const slotsMode = f.slots?.anyMode ?? 'include'
    if (slotsMode === 'only') {
      // Tester items always specify a slot; nothing matches "Only Any".
      continue
    }
    if (selectedSlots.size > 0 && !selectedSlots.has(slotId)) continue

    const rankMode = f.rank?.anyMode ?? 'include'
    const rank = Number(artifact.rank)
    if (rankMode === 'only') {
      continue
    } else if (rankMode === 'off') {
      // Rank is always specified for tester items.
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
          const rollCount = clampRollTarget(stat.rolls ?? 0)
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
        selectedVariants: selectedSubVariants,
        selectedMode: subMode,
      })) continue
    }

    if (match?.cfgIdx != null && match.cfgIdx >= 0) {
      matchingConfigIndices.add(match.cfgIdx)
    }

    filtered.push(row)
  }

  return { items: filtered, matchingConfigIndices }
}

const determineTesterSourceCategory = (artifact: NormalizedGearArtifact): TesterSourceFilter => {
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
  selectedVariants: Set<number>
  selectedMode: SubstatMatchMode
}

export function isTesterRollFilterActive(rolls?: TesterRollFilterState): boolean {
  if (!rolls) return false
  const wildcardMode = rolls.wildcard?.mode ?? 'off'
  if (wildcardMode !== 'off') return true
  return (rolls.perStat?.length ?? 0) > 0
}

const normalizeTesterRollFilterRow = (row: TesterRollFilterRow | null | undefined): TesterRollFilterRow | null => {
  if (!row) return null
  const stat = Number(row.stat)
  if (!Number.isFinite(stat) || stat <= 0) return null
  return {
    stat: stat as StatVariant,
    comparator: normalizeRollComparator(row.comparator),
    value: clampRollTarget(row.value),
  }
}

const normalizeRollComparator = (comparator?: TesterRollComparator): TesterRollComparator => {
  if (comparator === 'gte' || comparator === 'lte') return comparator
  return 'eq'
}

const normalizeRollMode = (mode?: TesterRollWildcardMode): TesterRollWildcardMode => {
  if (mode === 'any' || mode === 'selected') return mode
  return 'off'
}

const normalizeTesterRollsState = (input?: TesterRollFilterState): TesterRollFilterState => {
  const base = input ?? createDefaultTesterRollsState()
  const wildcard = base.wildcard ?? createDefaultTesterRollsState().wildcard
  const rows = Array.isArray(base.perStat) ? base.perStat : []
  return {
    wildcard: {
      mode: normalizeRollMode(wildcard.mode),
      comparator: normalizeRollComparator(wildcard.comparator),
      value: clampRollTarget(wildcard.value),
    },
    perStat: rows
      .map((row) => normalizeTesterRollFilterRow(row))
      .filter((row): row is TesterRollFilterRow => Boolean(row)),
  }
}

const passesTesterRollFilters = ({ filters, rollCounts, selectedVariants, selectedMode }: RollFilterEvalArgs): boolean => {
  const wildcard = filters.wildcard
  if (wildcard.mode === 'any') {
    let ok = false
    for (const count of rollCounts.values()) {
      if (compareRollCount(count, wildcard.comparator, wildcard.value)) {
        ok = true
        break
      }
    }
    if (!ok) return false
  } else if (wildcard.mode === 'selected') {
    if (selectedVariants.size > 0) {
      if (selectedMode === 'all') {
        for (const variant of selectedVariants) {
          const count = rollCounts.get(variant) ?? 0
          if (!compareRollCount(count, wildcard.comparator, wildcard.value)) return false
        }
      } else {
        let ok = false
        for (const variant of selectedVariants) {
          const count = rollCounts.get(variant) ?? 0
          if (compareRollCount(count, wildcard.comparator, wildcard.value)) {
            ok = true
            break
          }
        }
        if (!ok) return false
      }
    }
  }

  if (filters.perStat.length > 0) {
    for (const row of filters.perStat) {
      const variant = Number(row.stat)
      if (!Number.isFinite(variant) || variant <= 0) continue
      const count = rollCounts.get(variant) ?? 0
      if (!compareRollCount(count, row.comparator, row.value)) return false
    }
  }

  return true
}

const compareRollCount = (rollCount: number, comparator: TesterRollComparator, target: number): boolean => {
  if (comparator === 'gte') return rollCount >= target
  if (comparator === 'lte') return rollCount <= target
  return rollCount === target
}

const clampRollTarget = (value: number | null | undefined): number => {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(5, Math.round(numeric)))
}
