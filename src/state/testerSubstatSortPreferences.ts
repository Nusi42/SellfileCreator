/**
 * testerSubstatSortPreferences.ts
 *
 * Persists the Rule Tester "substat sort" UI state (priorities + toggles).
 * This is intentionally UI-only: it changes preview ordering but never affects exports.
 */
import { useCallback } from 'react'
import {
  TESTER_GROUPING_DEFAULT_STATE,
  isDefaultTesterGroupingState,
  normalizeTesterGroupingState,
  type TesterGroupingState,
  TESTER_SORT_KEY_LAST_USAGE,
  TESTER_SORT_WEIGHT_DEFAULT,
  TESTER_SORT_WEIGHT_STEP,
  isNeutralTesterSortWeight,
  normalizeTesterSortWeight,
  type TesterSortKey,
  type TesterSubstatSortDirection,
} from '../lib/testerSort'
import { TESTER_NORMALIZED_PRESET_COUNT, type TesterNormalizedPresetId } from '../lib/testerNormalizedPresets'
import { StatVariant, STAT_VARIANTS_PRIORITY } from '../lib/types'
import { TESTER_SUBSTAT_SORT_KEY } from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

export type TesterSubstatWeightMap = Partial<Record<StatVariant, number>>

export type TesterSubstatSortState = {
  // Priority list: earlier entries win; missing stats are treated as 0.
  priorities: TesterSortKey[]
  direction: TesterSubstatSortDirection
  // Per-key override list: included keys sort opposite of the global direction.
  flipped: TesterSortKey[]
  // When true, sort by the normalized sum of selected substats (priority order is ignored).
  normalized: boolean
  // Optional per-substat weights used by normalized mode (default weight is 1.0).
  // Stored in preferences so users can keep a consistent scoring bias across sessions.
  weights: TesterSubstatWeightMap
  // When true, the "Normalized" sort uses the current tester-grid overlay selection ("Use active").
  normalizedUseActiveOverlay: boolean
  // When true, include the current "custom" weights as one normalized scoring source (shown as [C]).
  normalizedSourceIncludeCustom: boolean
  // Enabled normalized preset sources (when multiple are enabled, sorting uses the best / max score).
  normalizedSourcePresetIds: TesterNormalizedPresetId[]
  // Control how the tester grid groups rows (independent of sort).
  grouping: TesterGroupingState
  // Exclude glyph values by default so "base" rolls remain comparable.
  excludeGlyphs: boolean
}

export const DEFAULT_TESTER_SUBSTAT_SORT_STATE: TesterSubstatSortState = Object.freeze({
  priorities: [],
  direction: 'desc',
  flipped: [],
  normalized: false,
  weights: Object.freeze({}),
  normalizedUseActiveOverlay: false,
  normalizedSourceIncludeCustom: true,
  normalizedSourcePresetIds: [],
  grouping: TESTER_GROUPING_DEFAULT_STATE,
  excludeGlyphs: true,
})

export const isDefaultTesterSubstatSortState = (state: TesterSubstatSortState | null | undefined): boolean => {
  // Restore/autosave stores omit default values. Keep a single SSOT predicate so callers don’t
  // re-encode “default” logic (and drift when defaults change).
  if (!state) return true
  const weights = state.weights ?? {}
  return (state.priorities?.length ?? 0) === 0
    && state.direction === DEFAULT_TESTER_SUBSTAT_SORT_STATE.direction
    && (state.flipped?.length ?? 0) === 0
    && state.normalized === DEFAULT_TESTER_SUBSTAT_SORT_STATE.normalized
    && Object.keys(weights).length === 0
    && state.normalizedUseActiveOverlay === DEFAULT_TESTER_SUBSTAT_SORT_STATE.normalizedUseActiveOverlay
    && state.normalizedSourceIncludeCustom === DEFAULT_TESTER_SUBSTAT_SORT_STATE.normalizedSourceIncludeCustom
    && (state.normalizedSourcePresetIds?.length ?? 0) === 0
    && isDefaultTesterGroupingState(state.grouping)
    && state.excludeGlyphs === DEFAULT_TESTER_SUBSTAT_SORT_STATE.excludeGlyphs
}

// Guardrail: only allow known, UI-visible sort keys into the persisted lists.
// Why: prevents old/invalid localStorage values from leaking into sorting logic.
const SORT_KEY_SET = new Set<number>([
  ...STAT_VARIANTS_PRIORITY.map((variant) => Number(variant)),
  TESTER_SORT_KEY_LAST_USAGE,
])

const WEIGHT_KEY_SET = new Set<number>(
  // Weights are only for real substat variants (not synthetic keys like Last Used).
  STAT_VARIANTS_PRIORITY.map((variant) => Number(variant)),
)

const normalizeSortKeys = (raw: unknown): TesterSortKey[] => {
  // Persisted priorities are user-driven, so treat anything non-array as "no priorities".
  if (!Array.isArray(raw)) return []
  // Avoid duplicates so priority numbers stay compact and deterministic.
  const seen = new Set<number>()
  const normalized: TesterSortKey[] = []
  raw.forEach((value) => {
    const num = Number(value)
    // Missing/garbage inputs should never break hydration; drop them silently.
    if (!Number.isFinite(num)) return
    // Unknown variants are ignored so the UI doesn't render phantom badges.
    if (!SORT_KEY_SET.has(num)) return
    if (seen.has(num)) return
    seen.add(num)
    normalized.push(num as TesterSortKey)
  })
  return normalized
}

const countSelectedSubstats = (priorities: readonly TesterSortKey[]): number => (
  // "Substat" means the real StatVariant keys; synthetic keys do not participate in normalized sums.
  priorities.filter((key) => Number(key) !== TESTER_SORT_KEY_LAST_USAGE).length
)

const stripSyntheticKeys = (keys: readonly TesterSortKey[]): TesterSortKey[] => (
  // Normalized sorting is explicitly about substat values, so drop synthetic keys like "Last Used".
  keys.filter((key) => Number(key) !== TESTER_SORT_KEY_LAST_USAGE)
)

const normalizePresetIds = (raw: unknown): TesterNormalizedPresetId[] => {
  // Preset ids are compact [0..8] integers; normalize defensively to survive stale localStorage.
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: TesterNormalizedPresetId[] = []
  raw.forEach((entry) => {
    const num = Number(entry)
    if (!Number.isFinite(num)) return
    const int = Math.floor(num)
    if (int !== num) return
    if (int < 0 || int >= TESTER_NORMALIZED_PRESET_COUNT) return
    if (seen.has(int)) return
    seen.add(int)
    out.push(int as TesterNormalizedPresetId)
  })
  // Stable ordering keeps the toggle row deterministic.
  out.sort((a, b) => a - b)
  return out
}

const normalizeWeights = (raw: unknown): TesterSubstatWeightMap => {
  // Missing weight map is the common case; keep the empty object stable.
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const out: Partial<Record<StatVariant, number>> = {}
  for (const [keyRaw, valueRaw] of Object.entries(obj)) {
    const keyNum = Number(keyRaw)
    if (!Number.isFinite(keyNum)) continue
    if (!WEIGHT_KEY_SET.has(keyNum)) continue
    const weight = normalizeTesterSortWeight(Number(valueRaw))
    if (isNeutralTesterSortWeight(weight)) continue
    out[keyNum as StatVariant] = weight
  }
  return out
}

export const normalizeTesterSubstatSortState = (raw: unknown): TesterSubstatSortState => {
  // Snapshots may come from localStorage presets or the preference store itself; normalize both identically.
  if (!raw || typeof raw !== 'object') return DEFAULT_TESTER_SUBSTAT_SORT_STATE
  const obj = raw as Record<string, unknown>
  // Defensive normalization keeps preferences stable across future format tweaks.
  const direction: TesterSubstatSortDirection = obj.direction === 'asc' ? 'asc' : 'desc'
  // Grouping uses the new artifact/accessory schema; invalid shapes fall back to defaults.
  const grouping = normalizeTesterGroupingState(obj.grouping)
  const excludeGlyphs = obj.excludeGlyphs === false ? false : true
  const rawPriorities = normalizeSortKeys(obj.priorities)
  // Persist the user's intent even when only one substat is selected; the UI/sort logic can disable it temporarily.
  const normalized = obj.normalized === true
  const priorities = normalized ? stripSyntheticKeys(rawPriorities) : rawPriorities
  // Weights are normalized independently; they only apply when normalized sorting is effective.
  const weights = normalizeWeights(obj.weights)
  // Normalized "source" toggles are UI-only but intentionally persist even when Normalized is off.
  // Why: users can pick a preset first to immediately enable Normalized sorting.
  const normalizedUseActiveOverlay = obj.normalizedUseActiveOverlay === true
  const normalizedSourceIncludeCustom = obj.normalizedSourceIncludeCustom !== false
  const normalizedSourcePresetIds = normalizePresetIds(obj.normalizedSourcePresetIds)
  // Flipped keys are only meaningful for keys that are currently selected as priorities.
  const rawFlipped = normalizeSortKeys(obj.flipped).filter((key) => priorities.some((v) => Number(v) === Number(key)))
  const flipped = normalized ? stripSyntheticKeys(rawFlipped) : rawFlipped
  // Drop weights for keys that are not currently selected; avoids stale junk from old presets.
  const selectedKeySet = new Set<number>(priorities.map((key) => Number(key)))
  const prunedWeights: Partial<Record<StatVariant, number>> = {}
  for (const [variant, weight] of Object.entries(weights)) {
    const key = Number(variant)
    if (!selectedKeySet.has(key)) continue
    prunedWeights[key as StatVariant] = weight
  }
  return {
    priorities,
    direction,
    flipped,
    normalized,
    weights: prunedWeights,
    normalizedUseActiveOverlay,
    normalizedSourceIncludeCustom,
    normalizedSourcePresetIds,
    grouping,
    excludeGlyphs,
  }
}

const testerSubstatSortStore = createLocalStorageStore<TesterSubstatSortState>({
  key: TESTER_SUBSTAT_SORT_KEY,
  // Factory defaults keep sections, exclude glyphs, and apply a descending sort once priorities are chosen.
  fallback: DEFAULT_TESTER_SUBSTAT_SORT_STATE,
  parse: (raw) => {
    // Empty storage is the common case for first run; keep the fast path obvious.
    if (!raw) return DEFAULT_TESTER_SUBSTAT_SORT_STATE
    try {
      const parsed = JSON.parse(raw) as unknown
      return normalizeTesterSubstatSortState(parsed)
    } catch {
      return DEFAULT_TESTER_SUBSTAT_SORT_STATE
    }
  },
  // JSON keeps the schema flexible while still being human-debuggable in devtools.
  serialize: (value) => JSON.stringify(value),
})

export function setTesterSubstatSortState(next: TesterSubstatSortState) {
  // Preset application needs a direct setter so callers don't have to reimplement per-field updates.
  testerSubstatSortStore.set(normalizeTesterSubstatSortState(next))
}

export function useTesterSubstatSortPreferences() {
  // Store read: subscribed so the preview header + grid stay in sync without extra effects.
  const state = testerSubstatSortStore.useValue()

  const clear = useCallback(() => {
    // "Clear" is the popover's [default] action: remove priorities and restore all toggles.
    testerSubstatSortStore.set(DEFAULT_TESTER_SUBSTAT_SORT_STATE)
  }, [])

  const setDirection = useCallback((direction: TesterSubstatSortDirection) => {
    // Direction is normalized so callers can pass any string without risking invalid state.
    testerSubstatSortStore.update((prev) => ({ ...prev, direction: direction === 'asc' ? 'asc' : 'desc' }))
  }, [])

  const toggleArtifactGroupBySet = useCallback(() => {
    // Toggle the set level while preserving any slot grouping choice.
    testerSubstatSortStore.update((prev) => ({
      ...prev,
      grouping: {
        ...prev.grouping,
        artifacts: {
          ...prev.grouping.artifacts,
          bySet: !prev.grouping.artifacts.bySet,
        },
      },
    }))
  }, [])

  const toggleArtifactGroupBySlot = useCallback(() => {
    // Toggle the slot level while preserving any set grouping choice.
    testerSubstatSortStore.update((prev) => ({
      ...prev,
      grouping: {
        ...prev.grouping,
        artifacts: {
          ...prev.grouping.artifacts,
          bySlot: !prev.grouping.artifacts.bySlot,
        },
      },
    }))
  }, [])

  const toggleAccessoryGroupByFaction = useCallback(() => {
    // Toggle the faction level while preserving set/slot grouping choices.
    testerSubstatSortStore.update((prev) => ({
      ...prev,
      grouping: {
        ...prev.grouping,
        accessories: {
          ...prev.grouping.accessories,
          byFaction: !prev.grouping.accessories.byFaction,
        },
      },
    }))
  }, [])

  const toggleAccessoryGroupBySet = useCallback(() => {
    // Toggle the set level while preserving faction/slot grouping choices.
    testerSubstatSortStore.update((prev) => ({
      ...prev,
      grouping: {
        ...prev.grouping,
        accessories: {
          ...prev.grouping.accessories,
          bySet: !prev.grouping.accessories.bySet,
        },
      },
    }))
  }, [])

  const toggleAccessoryGroupBySlot = useCallback(() => {
    // Toggle the slot level while preserving faction/set grouping choices.
    testerSubstatSortStore.update((prev) => ({
      ...prev,
      grouping: {
        ...prev.grouping,
        accessories: {
          ...prev.grouping.accessories,
          bySlot: !prev.grouping.accessories.bySlot,
        },
      },
    }))
  }, [])

  const toggleHideHeaders = useCallback(() => {
    // Header toggles keep grouping choices intact so users can restore them instantly.
    testerSubstatSortStore.update((prev) => ({
      ...prev,
      grouping: { ...prev.grouping, hideHeaders: !prev.grouping.hideHeaders },
    }))
  }, [])

  const toggleExcludeGlyphs = useCallback(() => {
    // Glyph toggle affects which stat value is used: base-only vs base+glyph.
    testerSubstatSortStore.update((prev) => ({ ...prev, excludeGlyphs: !prev.excludeGlyphs }))
  }, [])

  const toggleNormalized = useCallback(() => {
    // Normalized mode can be driven by the current selection (custom) and/or enabled presets.
    testerSubstatSortStore.update((prev) => {
      const selectedSubstats = countSelectedSubstats(prev.priorities)
      const hasPresetSources = (prev.normalizedSourcePresetIds?.length ?? 0) > 0
      const hasCustomSource = prev.normalizedSourceIncludeCustom && selectedSubstats > 0
      const hasAnySource = hasPresetSources || hasCustomSource || prev.normalizedUseActiveOverlay
      // Do not enable a state that can never sort; users can configure sources first.
      if (!prev.normalized && !hasAnySource) return prev
      const enabling = !prev.normalized
      if (!enabling) return { ...prev, normalized: false }
      // Synthetic keys do not participate in normalized sums, so drop them proactively.
      const priorities = stripSyntheticKeys(prev.priorities)
      const flipped = stripSyntheticKeys(prev.flipped)
      return { ...prev, normalized: true, priorities, flipped }
    })
  }, [])

  const togglePriorityKey = useCallback((key: TesterSortKey) => {
    // Generalized toggle used by the sort popover for both stat variants and synthetic keys.
    testerSubstatSortStore.update((prev) => {
      const already = prev.priorities.some((v) => Number(v) === Number(key))
      if (!already) return { ...prev, priorities: [...prev.priorities, key] }
      const priorities = prev.priorities.filter((v) => Number(v) !== Number(key))
      const flipped = prev.flipped.filter((v) => Number(v) !== Number(key))
      // Remove weights for deselected keys so the chip UI doesn't "remember" invisible state.
      const weights = { ...prev.weights }
      delete weights[Number(key) as StatVariant]
      // Preserve the user's normalized intent; UI/sort logic will deactivate it when <=1 substat is selected.
      return { ...prev, priorities, flipped, weights }
    })
  }, [])

  const toggleFlipped = useCallback((key: TesterSortKey) => {
    // "Flipped" means "opposite of the global direction" so the UI can show two simple glyph buttons.
    testerSubstatSortStore.update((prev) => {
      const selected = prev.priorities.some((v) => Number(v) === Number(key))
      if (!selected) return prev
      const already = prev.flipped.some((v) => Number(v) === Number(key))
      if (!already) return { ...prev, flipped: [...prev.flipped, key] }
      return { ...prev, flipped: prev.flipped.filter((v) => Number(v) !== Number(key)) }
    })
  }, [])

  const setWeight = useCallback((variant: StatVariant, nextRaw: number) => {
    // Weight updates are always clamped/stepped so UI controls remain stable across sessions.
    testerSubstatSortStore.update((prev) => {
      const selected = prev.priorities.some((v) => Number(v) === Number(variant))
      if (!selected) return prev
      const weight = normalizeTesterSortWeight(nextRaw)
      const weights = { ...prev.weights }
      if (isNeutralTesterSortWeight(weight)) {
        delete weights[Number(variant) as StatVariant]
      } else {
        weights[Number(variant) as StatVariant] = weight
      }
      return { ...prev, weights }
    })
  }, [])

  const bumpWeight = useCallback((variant: StatVariant, deltaSteps: number) => {
    // Bumping weights is used by the +/- hold buttons; treat missing weights as neutral.
    testerSubstatSortStore.update((prev) => {
      const selected = prev.priorities.some((v) => Number(v) === Number(variant))
      if (!selected) return prev
      const current = prev.weights?.[variant] ?? TESTER_SORT_WEIGHT_DEFAULT
      const next = normalizeTesterSortWeight(current + (deltaSteps * TESTER_SORT_WEIGHT_STEP))
      const weights = { ...prev.weights }
      if (isNeutralTesterSortWeight(next)) {
        delete weights[Number(variant) as StatVariant]
      } else {
        weights[Number(variant) as StatVariant] = next
      }
      return { ...prev, weights }
    })
  }, [])

  const toggleNormalizedUseActiveOverlay = useCallback(() => {
    // "Use active" routes normalized scoring through the tester-grid overlay selection.
    testerSubstatSortStore.update((prev) => ({ ...prev, normalizedUseActiveOverlay: !prev.normalizedUseActiveOverlay }))
  }, [])

  const toggleNormalizedSourceIncludeCustom = useCallback(() => {
    // [C] controls whether the current selection+weights participate as one scoring source.
    testerSubstatSortStore.update((prev) => ({ ...prev, normalizedSourceIncludeCustom: !prev.normalizedSourceIncludeCustom }))
  }, [])

  const toggleNormalizedSourcePresetId = useCallback((presetId: TesterNormalizedPresetId) => {
    // Preset toggles allow multi-select; normalized scoring uses the best (max) score across enabled sources.
    testerSubstatSortStore.update((prev) => {
      const enabled = new Set<number>((prev.normalizedSourcePresetIds ?? []).map((id) => Number(id)))
      if (enabled.has(presetId)) {
        enabled.delete(presetId)
      } else {
        enabled.add(presetId)
      }
      const normalizedSourcePresetIds = [...enabled].sort((a, b) => a - b).map((id) => id as TesterNormalizedPresetId)
      return { ...prev, normalizedSourcePresetIds }
    })
  }, [])

  return {
    state,
    clear,
    setDirection,
    toggleArtifactGroupBySet,
    toggleArtifactGroupBySlot,
    toggleAccessoryGroupByFaction,
    toggleAccessoryGroupBySet,
    toggleAccessoryGroupBySlot,
    toggleHideHeaders,
    toggleExcludeGlyphs,
    toggleNormalized,
    togglePriorityKey,
    toggleFlipped,
    setWeight,
    bumpWeight,
    toggleNormalizedUseActiveOverlay,
    toggleNormalizedSourceIncludeCustom,
    toggleNormalizedSourcePresetId,
  }
}
