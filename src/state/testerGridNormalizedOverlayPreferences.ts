/**
 * testerGridNormalizedOverlayPreferences.ts
 *
 * Persists the Rule Tester grid "Normalized score overlay" presets:
 * - Which presets are enabled (overlay shows the best score across them)
 * - Which substats each preset considers + their per-substat weights
 *
 * This is intentionally UI-only: it affects how items are annotated in the tester grid,
 * but it never affects exports or rule evaluation.
 */
import { useCallback } from 'react'
import { TESTER_GRID_NORMALIZED_OVERLAY_KEY } from '../lib/constants'
import {
  TESTER_SORT_WEIGHT_DEFAULT,
  TESTER_SORT_WEIGHT_STEP,
  isNeutralTesterSortWeight,
  normalizeTesterSortWeight,
} from '../lib/testerSort'
import { defaultTesterNormalizedPreset, TESTER_NORMALIZED_PRESET_COUNT, type TesterNormalizedPresetId } from '../lib/testerNormalizedPresets'
import { normalizeMetasetIconId, type MetasetIconId } from '../lib/metasetIcons'
import { StatVariant, STAT_VARIANTS_PRIORITY } from '../lib/types'
import { createLocalStorageStore } from './localStorageStore'

export type TesterGridNormalizedPresetId = TesterNormalizedPresetId

export type TesterGridNormalizedPreset = {
  // Optional glyph/icon shown for this preset; 'none' renders as the numeric preset id on the buttons.
  iconId: MetasetIconId
  // Selected substats that participate in the normalized score sum.
  variants: StatVariant[]
  // Optional per-variant weight overrides; missing means 1.0.
  weights: Partial<Record<StatVariant, number>>
}

export type TesterGridNormalizedPresetOverwrite = {
  // Optional: when omitted, the existing preset icon stays unchanged.
  iconId?: MetasetIconId | undefined
  variants: StatVariant[]
  weights: Partial<Record<StatVariant, number>>
}

export type TesterGridNormalizedOverlayState = {
  // When true, the overlay uses the current Sort-popout selection + weights (shown as [S]).
  // Exclusive: enabling [S] clears preset selection, and enabling any preset clears [S].
  useSortWeights: boolean
  // Enabled presets; when multiple are enabled we show the best (max) score.
  enabledPresetIds: TesterGridNormalizedPresetId[]
  // All presets (fixed-count array so UI indexes remain stable).
  presets: TesterGridNormalizedPreset[]
}

const VARIANT_SET = new Set<number>(STAT_VARIANTS_PRIORITY.map((variant) => Number(variant)))

const normalizePresetId = (raw: unknown): TesterGridNormalizedPresetId | null => {
  // Preset ids are always array indexes; reject floats/strings that cannot be a safe index.
  const num = Number(raw)
  if (!Number.isFinite(num)) return null
  const int = Math.floor(num)
  if (int !== num) return null
  if (int < 0 || int >= TESTER_NORMALIZED_PRESET_COUNT) return null
  return int as TesterGridNormalizedPresetId
}

const normalizeVariants = (raw: unknown): StatVariant[] => {
  // Variants are user-controlled via persistence, so normalize defensively.
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: StatVariant[] = []
  raw.forEach((entry) => {
    const num = Number(entry)
    if (!Number.isFinite(num)) return
    if (!VARIANT_SET.has(num)) return
    if (seen.has(num)) return
    seen.add(num)
    out.push(num as StatVariant)
  })
  return out
}

const normalizeWeights = (raw: unknown): Partial<Record<StatVariant, number>> => {
  // Weights are keyed by StatVariant numeric encoding.
  // Note: weights may exist for unselected variants so users can toggle a stat off/on without losing the last value.
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const out: Partial<Record<StatVariant, number>> = {}
  for (const [keyRaw, valueRaw] of Object.entries(obj)) {
    const keyNum = Number(keyRaw)
    if (!Number.isFinite(keyNum)) continue
    if (!VARIANT_SET.has(keyNum)) continue
    const weight = normalizeTesterSortWeight(Number(valueRaw))
    if (!Number.isFinite(weight)) continue
    // Neutral weights are omitted so the stored schema stays compact and unambiguous.
    if (isNeutralTesterSortWeight(weight)) continue
    out[keyNum as StatVariant] = weight
  }
  return out
}

const createDefaultPreset = (presetId: TesterGridNormalizedPresetId): TesterGridNormalizedPreset => {
  // Keep defaults SSOT in `testerNormalizedPresets.ts`, but clone here so state updates never mutate shared arrays.
  const preset = defaultTesterNormalizedPreset(presetId)
  return {
    iconId: preset.iconId,
    variants: preset.variants.slice(),
    weights: { ...preset.weights },
  }
}

const DEFAULT_STATE: TesterGridNormalizedOverlayState = {
  // Defaults keep overlay hidden until the user enables at least one preset.
  useSortWeights: false,
  enabledPresetIds: [],
  // Presets are fixed-count so indexes remain stable; each entry is a self-contained snapshot.
  presets: Array.from({ length: TESTER_NORMALIZED_PRESET_COUNT }).map((_, idx) => (
    createDefaultPreset(idx as TesterGridNormalizedPresetId)
  )),
}

export const normalizeTesterGridNormalizedOverlayState = (raw: unknown): TesterGridNormalizedOverlayState => {
  // Stored JSON can be missing or partially valid; normalize field-by-field to keep hydration resilient.
  if (!raw || typeof raw !== 'object') return DEFAULT_STATE
  const obj = raw as Record<string, unknown>

  const useSortWeights = obj.useSortWeights === true

  const enabledPresetIds: TesterGridNormalizedPresetId[] = (() => {
    // Enabled list is the user’s "show these scores" selection; ignore garbage values silently.
    if (!Array.isArray(obj.enabledPresetIds)) return []
    const seen = new Set<number>()
    const out: TesterGridNormalizedPresetId[] = []
    obj.enabledPresetIds.forEach((entry) => {
      const id = normalizePresetId(entry)
      if (id == null) return
      if (seen.has(id)) return
      seen.add(id)
      out.push(id)
    })
    // Keep ordering stable so UI renders deterministically across sessions.
    out.sort((a, b) => a - b)
    return out
  })()

  const presets: TesterGridNormalizedPreset[] = (() => {
    // Presets are fixed-count; missing entries fall back to the factory defaults for that slot.
    const rawPresets = Array.isArray(obj.presets) ? obj.presets : []
    const out: TesterGridNormalizedPreset[] = []
    for (let idx = 0; idx < TESTER_NORMALIZED_PRESET_COUNT; idx += 1) {
      const fallback = createDefaultPreset(idx as TesterGridNormalizedPresetId)
      const rawPreset = rawPresets[idx]
      if (!rawPreset || typeof rawPreset !== 'object') {
        out.push(fallback)
        continue
      }
      const presetObj = rawPreset as Record<string, unknown>
      const iconId = normalizeMetasetIconId(presetObj.iconId) as MetasetIconId
      const variants = normalizeVariants(presetObj.variants)
      // Selection is the SSOT for scoring, but weights may be preserved across deselection for UX convenience.
      const weights = normalizeWeights(presetObj.weights)
      out.push({ iconId: iconId || fallback.iconId, variants, weights })
    }
    return out
  })()

  // Enforce exclusivity between [S] and [1..9] at hydration time so UI remains deterministic.
  return useSortWeights
    ? { useSortWeights: true, enabledPresetIds: [], presets }
    : { useSortWeights: false, enabledPresetIds, presets }
}

const testerGridNormalizedOverlayStore = createLocalStorageStore<TesterGridNormalizedOverlayState>({
  key: TESTER_GRID_NORMALIZED_OVERLAY_KEY,
  fallback: DEFAULT_STATE,
  parse: (raw) => {
    // Empty storage is the first-run path; keep the fast path obvious.
    if (!raw) return DEFAULT_STATE
    try {
      return normalizeTesterGridNormalizedOverlayState(JSON.parse(raw) as unknown)
    } catch {
      return DEFAULT_STATE
    }
  },
  serialize: (value) => JSON.stringify(value),
})

export function useTesterGridNormalizedOverlayPreferences() {
  const state = testerGridNormalizedOverlayStore.useValue()

  const toggleUseSortWeights = useCallback(() => {
    // [S] is exclusive: enabling it clears presets; disabling it keeps presets cleared.
    testerGridNormalizedOverlayStore.update((prev) => {
      const enabling = !prev.useSortWeights
      return enabling
        ? { ...prev, useSortWeights: true, enabledPresetIds: [] }
        : { ...prev, useSortWeights: false }
    })
  }, [])

  const togglePresetEnabled = useCallback((presetId: TesterGridNormalizedPresetId) => {
    // Toggling is the primary interaction: selection drives whether the overlay renders at all.
    testerGridNormalizedOverlayStore.update((prev) => {
      // Enabling any preset implicitly disables [S] so selection stays exclusive.
      const useSortWeights = false
      const enabled = new Set<number>(prev.enabledPresetIds.map((id) => Number(id)))
      if (enabled.has(presetId)) {
        enabled.delete(presetId)
      } else {
        enabled.add(presetId)
      }
      const enabledPresetIds = [...enabled].sort((a, b) => a - b).map((id) => id as TesterGridNormalizedPresetId)
      return { ...prev, useSortWeights, enabledPresetIds }
    })
  }, [])

  const toggleVariant = useCallback((presetId: TesterGridNormalizedPresetId, variant: StatVariant) => {
    // Variant selection is the "include / exclude" semantics (weights never use a 0 sentinel).
    testerGridNormalizedOverlayStore.update((prev) => {
      const presets = prev.presets.slice()
      const preset = presets[presetId] ?? createDefaultPreset(presetId)
      const existing = preset.variants.some((v) => Number(v) === Number(variant))
      const variants = existing
        ? preset.variants.filter((v) => Number(v) !== Number(variant))
        : [...preset.variants, variant]
      // Keep stored weights even when a variant is deselected so toggling it back on restores the last value.
      presets[presetId] = { ...preset, variants }
      return { ...prev, presets }
    })
  }, [])

  const setPresetIconId = useCallback((presetId: TesterGridNormalizedPresetId, iconIdRaw: MetasetIconId) => {
    // Icon selection is purely cosmetic; normalize against the shared metaset icon catalog.
    const iconId = normalizeMetasetIconId(iconIdRaw) as MetasetIconId
    testerGridNormalizedOverlayStore.update((prev) => {
      const presets = prev.presets.slice()
      const preset = presets[presetId] ?? createDefaultPreset(presetId)
      presets[presetId] = { ...preset, iconId }
      return { ...prev, presets }
    })
  }, [])

  const setWeight = useCallback((presetId: TesterGridNormalizedPresetId, variant: StatVariant, nextRaw: number) => {
    // Weights are clamped/stepped to match the Sort UI and prevent float drift in persistence.
    testerGridNormalizedOverlayStore.update((prev) => {
      const presets = prev.presets.slice()
      const preset = presets[presetId] ?? createDefaultPreset(presetId)
      const selected = preset.variants.some((v) => Number(v) === Number(variant))
      if (!selected) return prev
      const weight = normalizeTesterSortWeight(nextRaw)
      const weights = { ...preset.weights }
      if (isNeutralTesterSortWeight(weight)) {
        delete weights[variant]
      } else {
        weights[variant] = weight
      }
      presets[presetId] = { ...preset, weights }
      return { ...prev, presets }
    })
  }, [])

  const bumpWeight = useCallback((presetId: TesterGridNormalizedPresetId, variant: StatVariant, deltaSteps: number) => {
    // Bumping uses the same step size as Sort, but only applies when the variant is selected.
    testerGridNormalizedOverlayStore.update((prev) => {
      const presets = prev.presets.slice()
      const preset = presets[presetId] ?? createDefaultPreset(presetId)
      const selected = preset.variants.some((v) => Number(v) === Number(variant))
      if (!selected) return prev
      const current = preset.weights?.[variant] ?? TESTER_SORT_WEIGHT_DEFAULT
      const next = normalizeTesterSortWeight(current + (deltaSteps * TESTER_SORT_WEIGHT_STEP))
      const weights = { ...preset.weights }
      if (isNeutralTesterSortWeight(next)) {
        delete weights[variant]
      } else {
        weights[variant] = next
      }
      presets[presetId] = { ...preset, weights }
      return { ...prev, presets }
    })
  }, [])

  const resetPreset = useCallback((presetId: TesterGridNormalizedPresetId) => {
    // Reset is a convenience for experimentation; it restores the factory preset for that slot.
    testerGridNormalizedOverlayStore.update((prev) => {
      const presets = prev.presets.slice()
      presets[presetId] = createDefaultPreset(presetId)
      return { ...prev, presets }
    })
  }, [])

  const overwritePreset = useCallback((presetId: TesterGridNormalizedPresetId, next: TesterGridNormalizedPresetOverwrite) => {
    // Overwrite is used by the Sort popout to snapshot current "custom" weights into a numbered preset.
    testerGridNormalizedOverlayStore.update((prev) => {
      const presets = prev.presets.slice()
      const fallback = presets[presetId] ?? createDefaultPreset(presetId)
      presets[presetId] = {
        iconId: next.iconId ?? fallback.iconId,
        variants: Array.isArray(next.variants) ? next.variants.slice() : [],
        weights: next.weights ? { ...next.weights } : {},
      }
      return { ...prev, presets }
    })
  }, [])

  return {
    state,
    toggleUseSortWeights,
    togglePresetEnabled,
    toggleVariant,
    setPresetIconId,
    setWeight,
    bumpWeight,
    resetPreset,
    overwritePreset,
  }
}
