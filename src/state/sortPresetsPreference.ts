/**
 * sortPresetsPreference.ts
 *
 * Stores user-named snapshots of the Gear Inspector substat sort configuration.
 * Parallel to filterPresetsPreference but scoped to sort state only, so users
 * can save/restore sort setups independently of filter presets.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import {
  sanitizePresetId,
  sanitizePresetName,
  sanitizePresetSavedAt,
  sanitizePresetColor,
  sanitizePresetIconId,
  resolveBuiltinIconPin,
  buildBuiltinIconPinStub,
} from './presetUtils'
import type { MetasetIconId } from '../lib/metasetIcons'
import {
  DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
  normalizeGearInspectorSubstatSortState,
  type GearInspectorSubstatSortState,
} from './gearInspectorSubstatSortPreferences'
import {
  sanitizeFilterPresetSnapshot,
  type FilterPresetSnapshot,
} from './filterPresetsPreference'
import { StatVariant } from '../lib/types'
import {
  GEAR_INSPECTOR_SORT_KEY_LAST_USAGE,
  GEAR_INSPECTOR_SORT_KEY_NEWEST,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_BUCKET_RANK,
} from '../lib/gearInspectorSort'

export const SORT_PRESETS_STORAGE_KEY = 'sellfileCreator.sortPresets.v1'

export type SortPreset = {
  id: string
  name: string
  savedAt: string
  // Full sort configuration captured at save time.
  snapshot: GearInspectorSubstatSortState
  // Optional filter snapshot captured at save time; absent means "don't overwrite the current filter on apply".
  filterSnapshot?: FilterPresetSnapshot
  // Optional #RRGGBB text color applied to the preset label in the menu.
  color?: string
  // Optional glyph-catalog icon shown beside the name and as the pinned button face.
  iconId?: MetasetIconId
  // When true, the preset renders as a quick-toggle button next to the Sort button.
  pinned?: true
  // When true, the preset is non-deletable (shipped with the app) but can be freely reordered.
  builtin?: true
  // When true, the preset is hidden from the menu unless the user toggles show-hidden.
  hidden?: true
  // When true, applying the preset REPLACES the entire sort (legacy behavior). When absent (the
  // default), applying ORs/stacks the preset's sort levels onto the current sort, and a pinned
  // button toggles by subtracting them again.
  exclusive?: true
}

// ---------------------------------------------------------------------------
// Built-in sort presets
// Must be defined before sanitizePreset/parsePresets so the map is available.
// ---------------------------------------------------------------------------

/**
 * Flat grouping: one "Artifacts" bucket + one "Accessories" bucket, no set/slot/faction sub-groups.
 * Used by time-based presets (Newest, Latest Used) where chronological order spans all types.
 */
const FLAT_TYPE_GROUPING = {
  artifacts:   { bySet: false, bySlot: false },
  accessories: { byFaction: false, bySet: false, bySlot: false },
  hideHeaders: false,
} as const

/**
 * Hide all headers: a single continuous list with no set/slot/faction headers at all.
 * Used by the Newest preset so the most recently acquired gear reads as one uninterrupted stream.
 */
const HIDE_ALL_HEADERS_GROUPING = {
  artifacts:   { bySet: false, bySlot: false },
  accessories: { byFaction: false, bySet: false, bySlot: false },
  hideHeaders: true,
} as const

/**
 * Shipped sort presets shown at the top of the sort preset menu by default.
 * They are non-deletable (`builtin: true`) but can be freely reordered.
 */
export const BUILTIN_SORT_PRESETS: readonly SortPreset[] = [
  {
    id: 'builtin:newest',
    name: 'Newest',
    savedAt: '',
    builtin: true,
    // Monochrome sparkles glyph evokes freshly-acquired gear; pinned by default as a quick-toggle button.
    iconId: 'glyph.sparkles',
    pinned: true,
    // Sort by acquisition date descending; hide all headers so newest items read as one global stream.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [GEAR_INSPECTOR_SORT_KEY_NEWEST],
      grouping: HIDE_ALL_HEADERS_GROUPING,
    },
  },
  {
    id: 'builtin:latest-used',
    name: 'Latest Used',
    savedAt: '',
    builtin: true,
    // Monochrome hourglass glyph evokes recency/time.
    iconId: 'glyph.hourglass',
    // Sort by most recently equipped descending; flat type groups so recently touched items float up.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [GEAR_INSPECTOR_SORT_KEY_LAST_USAGE],
      grouping: FLAT_TYPE_GROUPING,
    },
  },
  {
    id: 'builtin:spd',
    name: 'SPD',
    savedAt: '',
    builtin: true,
    // Monochrome lightning glyph evokes speed; pinned by default as a quick-toggle button.
    iconId: 'glyph.lightning',
    pinned: true,
    // Single-stat priority: Speed descending, all other settings at default.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [StatVariant.SPD],
    },
  },
  {
    id: 'builtin:spd-per-slot',
    name: 'SPD – per Slot',
    savedAt: '',
    builtin: true,
    // Monochrome grid glyph evokes the per-slot bucketing (and keeps it unique across built-ins).
    iconId: 'glyph.grid',
    // Speed descending, grouped by slot only (no set grouping so each slot
    // bucket shows its fastest gear regardless of which set it belongs to).
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [StatVariant.SPD],
      grouping: {
        artifacts:   { bySet: false, bySlot: true },
        accessories: { byFaction: false, bySet: false, bySlot: true },
        hideHeaders: false,
      },
    },
  },
  {
    id: 'builtin:improvement-chance',
    name: 'Improvement Chance',
    savedAt: '',
    builtin: true,
    // Monochrome potion glyph evokes the upgrade/improvement chance.
    iconId: 'glyph.potion',
    // Sort by safeguard improvement chance descending; flat type groups so highest-chance items float up globally.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE],
      grouping: FLAT_TYPE_GROUPING,
    },
  },
  {
    id: 'builtin:safeguard-group-rank',
    name: 'Safeguard Bucket Rank',
    savedAt: '',
    builtin: true,
    // Monochrome shield glyph evokes safeguard protection.
    iconId: 'glyph.shield',
    // Sort by safeguard bucket rank ascending: bucket rank #1 (best within its bucket) floats first; unranked last.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_BUCKET_RANK],
      direction: 'asc',
      grouping: FLAT_TYPE_GROUPING,
    },
  },
  {
    id: 'builtin:sort-ascending',
    name: 'Ascending',
    savedAt: '',
    builtin: true,
    // Bar-chart glyph evokes ordering/ranking direction.
    iconId: 'glyph.chart',
    // Direction-only preset: flips the global sort direction to ascending; stacks onto any sort.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      direction: 'asc',
    },
  },
  {
    id: 'builtin:group-top-level',
    name: 'By category',
    savedAt: '',
    builtin: true,
    pinned: true,
    // Banner glyph evokes the faction banners the accessories bucket splits by.
    iconId: 'glyph.banner',
    // Grouping-only preset: artifacts ungrouped, accessories grouped by faction (top-level buckets).
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      grouping: {
        artifacts: { bySet: false, bySlot: false },
        accessories: { byFaction: true, bySet: false, bySlot: false },
        hideHeaders: false,
      },
    },
  },
]

/** Fast ID → preset lookup used by sanitizePreset to resolve stored built-in stubs. */
const BUILTIN_SORT_PRESET_MAP = new Map(BUILTIN_SORT_PRESETS.map((p) => [p.id, p]))

// ---------------------------------------------------------------------------
// Parse / serialize
// ---------------------------------------------------------------------------

const sanitizePreset = (raw: unknown): SortPreset | null => {
  // Top-level validation keeps partially-written localStorage from breaking the menu.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const id = sanitizePresetId(rec['id'])
  if (!id) return null
  // Built-in stubs store only { id, builtin: true } plus any user overrides; resolve to full preset data.
  if (rec['builtin'] === true) {
    const builtin = BUILTIN_SORT_PRESET_MAP.get(id) ?? null
    if (!builtin) return null
    const result: SortPreset = { ...builtin }
    // Restore the hidden flag persisted in the compact stub.
    if (rec['hidden'] === true) result.hidden = true
    // icon/pin resolve from the definition unless the stub carries an explicit override.
    const { iconId, pinned } = resolveBuiltinIconPin(builtin, rec)
    delete result.iconId
    delete result.pinned
    if (iconId) result.iconId = iconId
    if (pinned) result.pinned = true
    return result
  }
  const name = sanitizePresetName(rec['name'])
  if (!name) return null
  // exactOptionalPropertyTypes: spread filterSnapshot only when present so the property
  // stays absent (not undefined) for presets saved without filter state.
  const filterRaw = rec['filterSnapshot']
  const filterField: Pick<SortPreset, 'filterSnapshot'> = filterRaw !== undefined
    ? { filterSnapshot: sanitizeFilterPresetSnapshot(filterRaw) }
    : {}
  // exactOptionalPropertyTypes: spread color only when present so the field stays absent for uncolored presets.
  const color = sanitizePresetColor(rec['color'])
  const colorField: Pick<SortPreset, 'color'> = color !== undefined ? { color } : {}
  // exactOptionalPropertyTypes: spread iconId only when valid so iconless presets stay field-absent.
  const iconId = sanitizePresetIconId(rec['iconId'])
  const iconField: Pick<SortPreset, 'iconId'> = iconId !== undefined ? { iconId } : {}
  // exactOptionalPropertyTypes: spread pinned only when explicitly true.
  const pinnedField: Pick<SortPreset, 'pinned'> = rec['pinned'] === true ? { pinned: true } : {}
  // exactOptionalPropertyTypes: spread hidden only when explicitly true.
  const hiddenField: Pick<SortPreset, 'hidden'> = rec['hidden'] === true ? { hidden: true } : {}
  // exactOptionalPropertyTypes: spread exclusive only when explicitly true (absent = OR/stack).
  const exclusiveField: Pick<SortPreset, 'exclusive'> = rec['exclusive'] === true ? { exclusive: true } : {}
  return {
    id,
    name,
    savedAt: sanitizePresetSavedAt(rec['savedAt']),
    // Reuse the existing normalizer; it handles all schema evolution for sort state.
    snapshot: normalizeGearInspectorSubstatSortState(rec['snapshot']),
    ...filterField,
    ...colorField,
    ...iconField,
    ...pinnedField,
    ...hiddenField,
    ...exclusiveField,
  }
}

const parsePresets = (raw: string | null): SortPreset[] => {
  // Empty storage on first run: seed with all built-ins at default order.
  if (!raw) return [...BUILTIN_SORT_PRESETS]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...BUILTIN_SORT_PRESETS]
    const out: SortPreset[] = []
    parsed.forEach((entry) => {
      const preset = sanitizePreset(entry)
      if (!preset) return
      out.push(preset)
    })
    // Append any built-ins absent from stored order at the END (e.g. ones added in a later version),
    // so existing users get new built-ins last without disturbing their saved order/customizations.
    const storedIds = new Set(out.map((p) => p.id))
    const missing = BUILTIN_SORT_PRESETS.filter((p) => !storedIds.has(p.id))
    return [...out, ...missing]
  } catch {
    return [...BUILTIN_SORT_PRESETS]
  }
}

const serializePresets = (value: SortPreset[]): string | null => {
  // Remove the key entirely when the list is empty to keep storage tidy.
  if (!Array.isArray(value) || value.length === 0) return null
  // Built-ins are stored as compact stubs so snapshot data isn't duplicated in localStorage.
  // Include hidden + any icon/pin override in the stub so user customizations survive a reload.
  const toStore = value.map((p) => {
    if (!p.builtin) return p
    const stub: Record<string, unknown> = { id: p.id, builtin: true }
    if (p.hidden) stub.hidden = true
    // Persist icon/pin only when they differ from the shipped definition (compact + lossless).
    Object.assign(stub, buildBuiltinIconPinStub(p, BUILTIN_SORT_PRESET_MAP.get(p.id) ?? {}))
    return stub
  })
  return JSON.stringify(toStore)
}

const presetsStore = createLocalStorageStore<SortPreset[]>({
  key: SORT_PRESETS_STORAGE_KEY,
  fallback: [],
  parse: parsePresets,
  serialize: serializePresets,
})

export const useSortPresetsPreference = createLocalStorageStateHook(presetsStore)

export const getSortPresetsSnapshot = (): readonly SortPreset[] => presetsStore.getSnapshot()

/**
 * Structural equality between two sort states, used to decide whether a pinned sort
 * preset is the currently-active state (Apply ⇄ Clear toggle). Both sides pass through
 * normalizeGearInspectorSubstatSortState so key order and schema defaults are deterministic.
 */
export const sortPresetSnapshotsEqual = (a: GearInspectorSubstatSortState, b: GearInspectorSubstatSortState): boolean =>
  JSON.stringify(normalizeGearInspectorSubstatSortState(a)) === JSON.stringify(normalizeGearInspectorSubstatSortState(b))
