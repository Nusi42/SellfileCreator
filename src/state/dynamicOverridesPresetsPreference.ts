/**
 * dynamicOverridesPresetsPreference.ts
 *
 * Stores user-named snapshots of the note dialog's dynamic-overrides answers
 * (recipe + safeguard prompt selections). These are explicit "presets" (not
 * autosave), so they live outside the SFC payload and must never participate in
 * the Restore Autosave dialog. Mirrors filterPresetsPreference / sortPresetsPreference
 * so the save/load/delete UX and persistence model stay consistent (SSOT).
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import {
  sanitizePresetId,
  sanitizePresetName,
  sanitizePresetSavedAt,
} from './presetUtils'
import {
  normalizeNoteRecipeOverridesAnswers,
  type NoteRecipeOverridesAnswers,
} from '../lib/noteRecipeOverrides'
import {
  normalizeNoteSafeguardOverridesAnswers,
  type NoteSafeguardOverridesAnswers,
} from '../lib/noteSafeguardOverrides'

export const DYNAMIC_OVERRIDES_PRESETS_STORAGE_KEY = 'sellfileCreator.dynamicOverridesPresets.v1'

/**
 * Human-readable question title and option label map captured at save time.
 * Stored per-question so the flyout can show meaningful text if the question
 * later disappears from the note (question IDs are opaque hashes, unusable alone).
 */
export type DynamicOverridesPresetLabelEntry = {
  // Question title (first line of the prompt, subtext stripped) in the UI language at save time.
  title: string
  // Option id → display label at save time. Only option IDs that existed in the note are present.
  options: Record<string, string>
}

/**
 * Label snapshots for all questions in both override domains at save time.
 * Keyed by question id. Optional on the preset so old saves (without this field) still load.
 */
export type DynamicOverridesPresetSavedLabels = {
  recipe: Record<string, DynamicOverridesPresetLabelEntry>
  safeguard: Record<string, DynamicOverridesPresetLabelEntry>
}

/**
 * A saved dynamic-overrides set: both the recipe answers and the safeguard answers
 * are captured so loading restores the full prompt state, matching the disable-confirm
 * "apply" path which also applies both answer maps together.
 */
export type DynamicOverridesPreset = {
  id: string
  name: string
  savedAt: string
  // Recipe-overrides prompt selections (question ID → selected option IDs).
  recipeAnswers: NoteRecipeOverridesAnswers
  // Safeguard-overrides prompt selections (question ID → selected option IDs).
  safeguardAnswers: NoteSafeguardOverridesAnswers
  // Human-readable question titles + option labels captured at save time. Absent on old presets
  // (saved before this field was introduced) — the flyout omits the unavailable section in that case.
  savedLabels?: DynamicOverridesPresetSavedLabels
}

// ---------------------------------------------------------------------------
// Parse / serialize
// ---------------------------------------------------------------------------

const sanitizeSavedLabels = (raw: unknown): DynamicOverridesPresetSavedLabels | undefined => {
  // Labels are display-only — if the shape is wrong, silently omit rather than rejecting the preset.
  if (!raw || typeof raw !== 'object') return undefined
  return raw as DynamicOverridesPresetSavedLabels
}

/**
 * Validate one raw record into a preset, or null when unusable. Exported because
 * the file import/export module must apply exactly these rules (SSOT) — a second
 * validator would let a hand-edited export file smuggle shapes localStorage rejects.
 */
export const sanitizeDynamicOverridesPreset = (raw: unknown): DynamicOverridesPreset | null => {
  // Top-level record validation prevents partially-written localStorage from breaking the menu.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const id = sanitizePresetId(rec['id'])
  if (!id) return null
  const name = sanitizePresetName(rec['name'])
  if (!name) return null
  // Both answer maps reuse the canonical normalizers so the same drop-empties /
  // keep-explicit-empty rules apply here as on autosave restore (SSOT).
  const recipeAnswers = normalizeNoteRecipeOverridesAnswers(rec['recipeAnswers']) ?? {}
  const safeguardAnswers = normalizeNoteSafeguardOverridesAnswers(rec['safeguardAnswers']) ?? {}
  const savedLabels = sanitizeSavedLabels(rec['savedLabels'])
  return {
    id,
    name,
    savedAt: sanitizePresetSavedAt(rec['savedAt']),
    recipeAnswers,
    safeguardAnswers,
    // Spread only when defined — exactOptionalPropertyTypes disallows { prop: undefined }.
    ...(savedLabels !== undefined ? { savedLabels } : {}),
  }
}

const parsePresets = (raw: string | null): DynamicOverridesPreset[] => {
  // Empty storage on first run: no built-in dynamic-overrides presets ship with the app.
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const sanitized: DynamicOverridesPreset[] = []
    parsed.forEach((entry) => {
      const preset = sanitizeDynamicOverridesPreset(entry)
      if (!preset) return
      sanitized.push(preset)
    })
    return sanitized
  } catch {
    return []
  }
}

const serializePresets = (value: DynamicOverridesPreset[]): string | null => {
  // Keep storage clean: prefer removing the key when there's nothing to save.
  if (!Array.isArray(value) || value.length === 0) return null
  return JSON.stringify(value)
}

const presetsStore = createLocalStorageStore<DynamicOverridesPreset[]>({
  key: DYNAMIC_OVERRIDES_PRESETS_STORAGE_KEY,
  fallback: [],
  parse: parsePresets,
  serialize: serializePresets,
})

export const useDynamicOverridesPresetsPreference = createLocalStorageStateHook(presetsStore)

export const getDynamicOverridesPresetsSnapshot = (): readonly DynamicOverridesPreset[] => presetsStore.getSnapshot()
