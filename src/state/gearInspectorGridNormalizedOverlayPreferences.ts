/**
 * gearInspectorGridNormalizedOverlayPreferences.ts
 *
 * Persists the Gear Inspector grid "Normalized score overlay" presets:
 * - Which presets are enabled (overlay shows the best score across them)
 * - Which substats each preset considers + their per-substat weights
 *
 * This is intentionally UI-only: it affects how items are annotated in the Gear Inspector grid,
 * but it never affects exports or rule evaluation.
 *
 * ── Storage split (LIBRARY vs APPLIED) ────────────────────────────────────────────────────────
 * The state lives in TWO localStorage keys, cleanly separating concerns:
 *   1. PRESETS_KEY (the LIBRARY): the fixed-count array of preset definitions (iconId/variants/weights).
 *      This is a reusable user asset — like sort/filter presets — and persists independently of whether
 *      any preset is currently applied.
 *   2. APPLIED_KEY (the applied selection/flag): useSortWeights + enabledPresetIds + lastEnabledPresetIds.
 *      This is "what is shown right now / last shown", separate from "what the presets are".
 * Both keys are always-persisted (identical behavior to the pre-split combined key).
 *
 * The PUBLIC hook composes the two stores back into ONE `state` object with the SAME shape as before,
 * so consumers are unchanged: they still read `state.presets`, `state.useSortWeights`, etc. Each mutator
 * writes ONLY the store it owns (library mutators → presets store; applied mutators → applied store).
 *
 * A one-time migration (see below) splits the old combined key into the two new keys on first load.
 */
import { useCallback } from 'react'
import {
  GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_APPLIED_KEY,
  GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_KEY,
  GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_PRESETS_KEY,
} from '../lib/constants'
import { safeGetItem, safeRemoveItem, safeSetItem } from '../lib/safeStorage'
import {
  bumpGearInspectorSortWeight,
  GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT,
  isNeutralGearInspectorSortWeight,
  normalizeGearInspectorSortWeight,
} from '../lib/gearInspectorSort'
import { defaultGearInspectorNormalizedPreset, GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT, type GearInspectorNormalizedPresetId } from '../lib/gearInspectorNormalizedPresets'
import { normalizeMetasetIconId, type MetasetIconId } from '../lib/metasetIcons'
import { ANOMALOUS_SUBSTAT_VARIANTS, StatVariant, STAT_VARIANTS_PRIORITY } from '../lib/types'
import { createLocalStorageStore } from './localStorageStore'

export type GearInspectorGridNormalizedPresetId = GearInspectorNormalizedPresetId

export type GearInspectorGridNormalizedPreset = {
  // Optional glyph/icon shown for this preset; 'none' renders as the numeric preset id on the buttons.
  iconId: MetasetIconId
  // Selected substats that participate in the normalized score sum.
  variants: StatVariant[]
  // Optional per-variant weight overrides; missing means 1.0.
  weights: Partial<Record<StatVariant, number>>
}

export type GearInspectorGridNormalizedPresetOverwrite = {
  // Optional: when omitted, the existing preset icon stays unchanged.
  iconId?: MetasetIconId | undefined
  variants: StatVariant[]
  weights: Partial<Record<StatVariant, number>>
}

// APPLIED sub-state (persisted under APPLIED_KEY): "what is shown right now / last shown".
type GearInspectorGridNormalizedOverlayAppliedState = {
  // When true, the overlay uses the current Sort-popout selection + weights (shown as [S]).
  // Exclusive: enabling [S] clears preset selection, and enabling any preset clears [S].
  useSortWeights: boolean
  // Enabled presets; when multiple are enabled we show the best (max) score.
  enabledPresetIds: GearInspectorGridNormalizedPresetId[]
  // Last non-empty preset selection used by the quick "Show Substat Rating" toggle.
  // When the current selection is empty, we restore this snapshot (or fallback to 1..6 on first use).
  lastEnabledPresetIds: GearInspectorGridNormalizedPresetId[]
}

// LIBRARY sub-state (persisted under PRESETS_KEY): the reusable preset definitions themselves.
type GearInspectorGridNormalizedOverlayLibraryState = {
  // All presets (fixed-count array so UI indexes remain stable).
  presets: GearInspectorGridNormalizedPreset[]
}

// Public composed state: exactly the union of the two sub-states above. Kept as a single exported
// type (and single `.state` shape from the hook) so consumers stay unchanged after the storage split.
export type GearInspectorGridNormalizedOverlayState =
  GearInspectorGridNormalizedOverlayAppliedState & GearInspectorGridNormalizedOverlayLibraryState

// Classic substats plus the PROVISIONAL(anomalous) accessory-only ones — hydration
// must not strip weights a user set on anomalous variants (parity with SORT_KEY_SET
// in gearInspectorSubstatSortPreferences.ts).
const VARIANT_SET = new Set<number>(
  [...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS].map((variant) => Number(variant)),
)

const normalizePresetId = (raw: unknown): GearInspectorGridNormalizedPresetId | null => {
  // Preset ids are always array indexes; reject floats/strings that cannot be a safe index.
  const num = Number(raw)
  if (!Number.isFinite(num)) return null
  const int = Math.floor(num)
  if (int !== num) return null
  if (int < 0 || int >= GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT) return null
  return int as GearInspectorGridNormalizedPresetId
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
    const weight = normalizeGearInspectorSortWeight(Number(valueRaw))
    if (!Number.isFinite(weight)) continue
    // Neutral weights are omitted so the stored schema stays compact and unambiguous.
    if (isNeutralGearInspectorSortWeight(weight)) continue
    out[keyNum as StatVariant] = weight
  }
  return out
}

const createDefaultPreset = (presetId: GearInspectorGridNormalizedPresetId): GearInspectorGridNormalizedPreset => {
  // Keep defaults SSOT in `gearInspectorNormalizedPresets.ts`, but clone here so state updates never mutate shared arrays.
  const preset = defaultGearInspectorNormalizedPreset(presetId)
  return {
    iconId: preset.iconId,
    variants: preset.variants.slice(),
    weights: { ...preset.weights },
  }
}

const DEFAULT_LAST_ENABLED_PRESET_IDS: GearInspectorGridNormalizedPresetId[] = Array
  .from({ length: Math.min(6, GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT) })
  .map((_, idx) => idx as GearInspectorGridNormalizedPresetId)

const normalizePresetIdList = (raw: unknown): GearInspectorGridNormalizedPresetId[] => {
  // Enabled/last-enabled lists share the same shape and validation rules.
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: GearInspectorGridNormalizedPresetId[] = []
  raw.forEach((entry) => {
    const id = normalizePresetId(entry)
    if (id == null) return
    if (seen.has(id)) return
    seen.add(id)
    out.push(id)
  })
  out.sort((a, b) => a - b)
  return out
}

// ─── DEFAULT sub-states ───────────────────────────────────────────────────────────────────────
const DEFAULT_APPLIED_STATE: GearInspectorGridNormalizedOverlayAppliedState = {
  // Defaults keep overlay hidden until the user enables at least one preset.
  useSortWeights: false,
  enabledPresetIds: [],
  // First-time quick-toggle fallback: presets 1..6 (or fewer if total preset count is smaller).
  lastEnabledPresetIds: DEFAULT_LAST_ENABLED_PRESET_IDS.slice(),
}

const DEFAULT_LIBRARY_STATE: GearInspectorGridNormalizedOverlayLibraryState = {
  // Presets are fixed-count so indexes remain stable; each entry is a self-contained snapshot.
  presets: Array.from({ length: GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT }).map((_, idx) => (
    createDefaultPreset(idx as GearInspectorGridNormalizedPresetId)
  )),
}

// ─── APPLIED normalize (owns the [S]-vs-presets exclusivity + lastEnabled bootstrap) ────────────
const normalizeAppliedState = (raw: unknown): GearInspectorGridNormalizedOverlayAppliedState => {
  // Stored JSON can be missing or partially valid; normalize field-by-field to keep hydration resilient.
  if (!raw || typeof raw !== 'object') return DEFAULT_APPLIED_STATE
  const obj = raw as Record<string, unknown>

  const useSortWeights = obj.useSortWeights === true

  const enabledPresetIds = normalizePresetIdList(obj.enabledPresetIds)
  const lastEnabledPresetIds = (() => {
    // Restore explicit history when present; otherwise bootstrap from current selection or 1..6 fallback.
    const parsed = normalizePresetIdList(obj.lastEnabledPresetIds)
    if (parsed.length > 0) return parsed
    if (enabledPresetIds.length > 0) return enabledPresetIds
    return DEFAULT_LAST_ENABLED_PRESET_IDS.slice()
  })()

  // Enforce exclusivity between [S] and [1..9] at hydration time so UI remains deterministic.
  return useSortWeights
    ? { useSortWeights: true, enabledPresetIds: [], lastEnabledPresetIds }
    : { useSortWeights: false, enabledPresetIds, lastEnabledPresetIds }
}

// ─── LIBRARY normalize (independent of the applied group) ───────────────────────────────────────
const normalizeLibraryState = (raw: unknown): GearInspectorGridNormalizedOverlayLibraryState => {
  // Accept either a bare presets array or an object with a `presets` field; missing entries fall back
  // to factory defaults for that slot. Tolerant of both shapes so the migration can hand us either.
  const rawPresets = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).presets)
        ? (raw as Record<string, unknown>).presets as unknown[]
        : [])
  const presets: GearInspectorGridNormalizedPreset[] = []
  for (let idx = 0; idx < GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT; idx += 1) {
    const fallback = createDefaultPreset(idx as GearInspectorGridNormalizedPresetId)
    const rawPreset = rawPresets[idx]
    if (!rawPreset || typeof rawPreset !== 'object') {
      presets.push(fallback)
      continue
    }
    const presetObj = rawPreset as Record<string, unknown>
    const iconId = normalizeMetasetIconId(presetObj.iconId) as MetasetIconId
    const variants = normalizeVariants(presetObj.variants)
    // Selection is the SSOT for scoring, but weights may be preserved across deselection for UX convenience.
    const weights = normalizeWeights(presetObj.weights)
    presets.push({ iconId: iconId || fallback.iconId, variants, weights })
  }
  return { presets }
}

// ─── One-time migration: split the legacy combined key into the two new keys ────────────────────
// Runs at module load, BEFORE the stores first read their keys. If the OLD combined key exists and
// NEITHER new key does, read+parse the old blob, write `presets` to PRESETS_KEY and the applied trio
// to APPLIED_KEY, then delete the old key. A fresh install (no old key) is a no-op → stores get
// DEFAULT_* for each. All storage access is guarded (window-undefined / storage-throws → no-op).
const migrateLegacyCombinedKey = (): void => {
  const legacyRaw = safeGetItem(GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_KEY)
  // Nothing to migrate — fresh install or already migrated (old key was deleted).
  if (legacyRaw === null) return
  // Never clobber already-split state: if either new key is present the split already happened.
  if (safeGetItem(GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_PRESETS_KEY) !== null) return
  if (safeGetItem(GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_APPLIED_KEY) !== null) return

  let parsed: unknown
  try {
    parsed = JSON.parse(legacyRaw) as unknown
  } catch {
    // Corrupt legacy blob — drop it so we don't retry every load; stores fall back to defaults.
    safeRemoveItem(GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_KEY)
    return
  }

  // Normalize each half through its own normalizer so the written values are already canonical.
  const applied = normalizeAppliedState(parsed)
  const library = normalizeLibraryState(parsed)
  safeSetItem(GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_APPLIED_KEY, JSON.stringify(applied))
  safeSetItem(GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_PRESETS_KEY, JSON.stringify(library))
  // Old key is now fully superseded; remove it so future loads take the fresh/already-split path.
  safeRemoveItem(GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_KEY)
}

// Migrate before the stores below call readFromStorage() at construction time.
migrateLegacyCombinedKey()

// ─── APPLIED store ──────────────────────────────────────────────────────────────────────────────
const gearInspectorGridNormalizedOverlayAppliedStore = createLocalStorageStore<GearInspectorGridNormalizedOverlayAppliedState>({
  key: GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_APPLIED_KEY,
  fallback: DEFAULT_APPLIED_STATE,
  parse: (raw) => {
    // Empty storage is the first-run path; keep the fast path obvious.
    if (!raw) return DEFAULT_APPLIED_STATE
    try {
      return normalizeAppliedState(JSON.parse(raw) as unknown)
    } catch {
      return DEFAULT_APPLIED_STATE
    }
  },
  serialize: (value) => JSON.stringify(value),
})

// ─── LIBRARY (presets) store ─────────────────────────────────────────────────────────────────────
const gearInspectorGridNormalizedOverlayPresetsStore = createLocalStorageStore<GearInspectorGridNormalizedOverlayLibraryState>({
  key: GEAR_INSPECTOR_GRID_NORMALIZED_OVERLAY_PRESETS_KEY,
  fallback: DEFAULT_LIBRARY_STATE,
  parse: (raw) => {
    if (!raw) return DEFAULT_LIBRARY_STATE
    try {
      return normalizeLibraryState(JSON.parse(raw) as unknown)
    } catch {
      return DEFAULT_LIBRARY_STATE
    }
  },
  serialize: (value) => JSON.stringify(value),
})

export function useGearInspectorGridNormalizedOverlayPreferences() {
  // Compose the two stores back into ONE `state` of the historical combined shape. Subscribing to
  // both keeps consumers unchanged: they read `state.presets`, `state.useSortWeights`, etc. as before.
  const applied = gearInspectorGridNormalizedOverlayAppliedStore.useValue()
  const library = gearInspectorGridNormalizedOverlayPresetsStore.useValue()
  const state: GearInspectorGridNormalizedOverlayState = { ...applied, ...library }

  const toggleUseSortWeights = useCallback(() => {
    // [S] is exclusive: enabling it clears presets; disabling it keeps presets cleared.
    // APPLIED mutator → writes only the applied store.
    gearInspectorGridNormalizedOverlayAppliedStore.update((prev) => {
      const enabling = !prev.useSortWeights
      return enabling
        ? {
            ...prev,
            useSortWeights: true,
            enabledPresetIds: [],
            // Preserve current selection as the "last used" target for quick restore.
            lastEnabledPresetIds: prev.enabledPresetIds.length > 0
              ? prev.enabledPresetIds
              : prev.lastEnabledPresetIds,
          }
        : { ...prev, useSortWeights: false }
    })
  }, [])

  const togglePresetEnabled = useCallback((presetId: GearInspectorGridNormalizedPresetId) => {
    // Toggling is the primary interaction: selection drives whether the overlay renders at all.
    // APPLIED mutator → writes only the applied store.
    gearInspectorGridNormalizedOverlayAppliedStore.update((prev) => {
      // Enabling any preset implicitly disables [S] so selection stays exclusive.
      const useSortWeights = false
      const enabled = new Set<number>(prev.enabledPresetIds.map((id) => Number(id)))
      if (enabled.has(presetId)) {
        enabled.delete(presetId)
      } else {
        enabled.add(presetId)
      }
      const enabledPresetIds = [...enabled].sort((a, b) => a - b).map((id) => id as GearInspectorGridNormalizedPresetId)
      return {
        ...prev,
        useSortWeights,
        enabledPresetIds,
        // Only update history when selection remains non-empty; empty means "temporarily hidden."
        lastEnabledPresetIds: enabledPresetIds.length > 0 ? enabledPresetIds : prev.lastEnabledPresetIds,
      }
    })
  }, [])

  const toggleEnabledPresetsFromLastUsed = useCallback(() => {
    // Quick toggle behavior:
    // - if any presets are enabled: hide all presets;
    // - if none are enabled: restore last non-empty selection (or first-run 1..6 fallback).
    // APPLIED mutator → writes only the applied store.
    gearInspectorGridNormalizedOverlayAppliedStore.update((prev) => {
      if (prev.enabledPresetIds.length > 0) {
        return {
          ...prev,
          useSortWeights: false,
          enabledPresetIds: [],
          lastEnabledPresetIds: prev.enabledPresetIds,
        }
      }
      const restore = prev.lastEnabledPresetIds.length > 0
        ? prev.lastEnabledPresetIds
        : DEFAULT_LAST_ENABLED_PRESET_IDS
      return {
        ...prev,
        useSortWeights: false,
        enabledPresetIds: restore.slice(),
        lastEnabledPresetIds: restore.slice(),
      }
    })
  }, [])

  const toggleVariant = useCallback((presetId: GearInspectorGridNormalizedPresetId, variant: StatVariant) => {
    // Variant selection is the "include / exclude" semantics (weights never use a 0 sentinel).
    gearInspectorGridNormalizedOverlayPresetsStore.update((prev) => {
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

  const setPresetIconId = useCallback((presetId: GearInspectorGridNormalizedPresetId, iconIdRaw: MetasetIconId) => {
    // Icon selection is purely cosmetic; normalize against the shared metaset icon catalog.
    const iconId = normalizeMetasetIconId(iconIdRaw) as MetasetIconId
    gearInspectorGridNormalizedOverlayPresetsStore.update((prev) => {
      const presets = prev.presets.slice()
      const preset = presets[presetId] ?? createDefaultPreset(presetId)
      presets[presetId] = { ...preset, iconId }
      return { ...prev, presets }
    })
  }, [])

  const setWeight = useCallback((presetId: GearInspectorGridNormalizedPresetId, variant: StatVariant, nextRaw: number) => {
    // Weights are clamped/stepped to match the Sort UI and prevent float drift in persistence.
    gearInspectorGridNormalizedOverlayPresetsStore.update((prev) => {
      const presets = prev.presets.slice()
      const preset = presets[presetId] ?? createDefaultPreset(presetId)
      const selected = preset.variants.some((v) => Number(v) === Number(variant))
      if (!selected) return prev
      const weight = normalizeGearInspectorSortWeight(nextRaw)
      const weights = { ...preset.weights }
      if (isNeutralGearInspectorSortWeight(weight)) {
        delete weights[variant]
      } else {
        weights[variant] = weight
      }
      presets[presetId] = { ...preset, weights }
      return { ...prev, presets }
    })
  }, [])

  const bumpWeight = useCallback((presetId: GearInspectorGridNormalizedPresetId, variant: StatVariant, deltaSteps: number) => {
    // Bumping uses the same step size as Sort, but only applies when the variant is selected.
    gearInspectorGridNormalizedOverlayPresetsStore.update((prev) => {
      const presets = prev.presets.slice()
      const preset = presets[presetId] ?? createDefaultPreset(presetId)
      const selected = preset.variants.some((v) => Number(v) === Number(variant))
      if (!selected) return prev
      const current = preset.weights?.[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT
      const next = bumpGearInspectorSortWeight(current, deltaSteps)
      const weights = { ...preset.weights }
      if (isNeutralGearInspectorSortWeight(next)) {
        delete weights[variant]
      } else {
        weights[variant] = next
      }
      presets[presetId] = { ...preset, weights }
      return { ...prev, presets }
    })
  }, [])

  const resetPreset = useCallback((presetId: GearInspectorGridNormalizedPresetId) => {
    // Reset is a convenience for experimentation; it restores the factory preset for that slot.
    gearInspectorGridNormalizedOverlayPresetsStore.update((prev) => {
      const presets = prev.presets.slice()
      presets[presetId] = createDefaultPreset(presetId)
      return { ...prev, presets }
    })
  }, [])

  const overwritePreset = useCallback((presetId: GearInspectorGridNormalizedPresetId, next: GearInspectorGridNormalizedPresetOverwrite) => {
    // Overwrite is used by the Sort popout to snapshot current "custom" weights into a numbered preset.
    gearInspectorGridNormalizedOverlayPresetsStore.update((prev) => {
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
    toggleEnabledPresetsFromLastUsed,
    toggleVariant,
    setPresetIconId,
    setWeight,
    bumpWeight,
    resetPreset,
    overwritePreset,
  }
}
