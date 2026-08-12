/**
 * builderPreferences.ts
 *
 * Builder-specific persisted preferences.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { BUILDER_AUTO_APPLY_SELECTED_RECIPE_KEY, BUILDER_AUTO_RESET_AFTER_INSERT_KEY, BUILDER_SHOW_TAG_CHIPS_KEY, BUILDER_SHOW_TAGS_IN_CHIPS_KEY, BUILDER_RECIPE_COLLAPSED_KEY, BUILDER_SAFEGUARD_COLLAPSED_KEY } from '../lib/constants'

// 'substats' owns the CLASSIC substat grid; 'substatsAnomalous' owns the anomalous rows.
// The two share one header row (two chevrons) but collapse independently — see BuilderSectionToggle.
export const BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS = Object.freeze(['action', 'rank', 'rarity', 'faction', 'level', 'mainStat', 'substats', 'substatsAnomalous', 'slots', 'sets', 'minRolls', 'requiredSubstats', 'milestoneThresholds'] as const)
export type BuilderPanelCollapsibleSectionId = typeof BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS[number]
export type BuilderPanelCollapsedSections = Record<BuilderPanelCollapsibleSectionId, boolean>

// Sections that start COLLAPSED rather than expanded. Anomalous substats are niche
// (accessory-only, and only for players running Proving Grounds gear), so they stay
// folded away until asked for — the highlighted label advertises when they hold a selection.
const DEFAULT_COLLAPSED_BUILDER_SECTION_IDS: readonly BuilderPanelCollapsibleSectionId[] = Object.freeze(['substatsAnomalous'] as const)

const DEFAULT_BUILDER_PANEL_COLLAPSED: BuilderPanelCollapsedSections = Object.freeze(
  Object.fromEntries(
    BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS.map((k) => [k, DEFAULT_COLLAPSED_BUILDER_SECTION_IDS.includes(k)]),
  ) as BuilderPanelCollapsedSections,
)

// Exported so autosave/restore logic can create default snapshots without re-declaring them.
export const cloneDefaultBuilderPanelCollapsed = (): BuilderPanelCollapsedSections => ({ ...DEFAULT_BUILDER_PANEL_COLLAPSED })

/**
 * True while EITHER substat sub-group is open. Both builder panels gate their substat
 * override badge on this — the badge lives inside the rows, so it must hide only once both
 * halves are folded away. One definition so the two hand-parallel panels cannot drift.
 */
export const isAnySubstatSectionExpanded = (collapsed: BuilderPanelCollapsedSections): boolean =>
  !collapsed.substats || !collapsed.substatsAnomalous

// Exported for equality checks in autosave signature computation.
export const builderPanelCollapsedEquals = (a: BuilderPanelCollapsedSections, b: BuilderPanelCollapsedSections): boolean =>
  BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS.every((k) => Boolean(a[k]) === Boolean(b[k]))

// Exported so useAutosaveRestore can parse the raw JSON value from autosave payload.
export const parseBuilderPanelCollapsedFromRaw = (raw: unknown): BuilderPanelCollapsedSections => {
  const next = cloneDefaultBuilderPanelCollapsed()
  if (!raw || typeof raw !== 'object') return next
  const rec = raw as Record<string, unknown>
  // Copy only the known section IDs; unknown keys are discarded.
  for (const k of BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS) {
    const val = rec[k]
    if (typeof val === 'boolean') next[k] = val
  }
  return next
}

// localStorage variant: JSON.parse, then the SAME merge the autosave path uses. Delegating
// means the "copy known ids, discard unknown, fall back to defaults" rule has one definition —
// the two previously spelled out identical loops.
const parseBuilderPanelCollapsed = (raw: string | null): BuilderPanelCollapsedSections => {
  if (!raw) return cloneDefaultBuilderPanelCollapsed()
  try {
    return parseBuilderPanelCollapsedFromRaw(JSON.parse(raw) as unknown)
  } catch {
    // Corrupt JSON is treated exactly like an absent key: fall back to defaults.
    return cloneDefaultBuilderPanelCollapsed()
  }
}

const serializeBuilderPanelCollapsed = (value: BuilderPanelCollapsedSections): string =>
  JSON.stringify(value)

// Builder section collapse is REMEMBERABLE-VIEW state, governed by the "Remember last view" toggle
// (rememberableViewPreference.ts) — ON resumes on reload, OFF is ephemeral. Not saved to the .sfc
// file either way. Keeps cross-component sharing (RecipeBuilderPanel/SafeguardBuilderPanel
// write it). Legacy .sfc `Filters.builder*Collapsed` is tolerated and ignored on load.
const builderRecipeCollapsedStore = createLocalStorageStore<BuilderPanelCollapsedSections>({
  key: BUILDER_RECIPE_COLLAPSED_KEY,
  fallback: { ...DEFAULT_BUILDER_PANEL_COLLAPSED },
  parse: parseBuilderPanelCollapsed,
  serialize: serializeBuilderPanelCollapsed,
  equals: builderPanelCollapsedEquals,
  rememberableView: true,
})

const builderSafeguardCollapsedStore = createLocalStorageStore<BuilderPanelCollapsedSections>({
  key: BUILDER_SAFEGUARD_COLLAPSED_KEY,
  fallback: { ...DEFAULT_BUILDER_PANEL_COLLAPSED },
  parse: parseBuilderPanelCollapsed,
  serialize: serializeBuilderPanelCollapsed,
  equals: builderPanelCollapsedEquals,
  rememberableView: true,
})

export const useBuilderRecipeCollapsedPreference = createLocalStorageStateHook(builderRecipeCollapsedStore)
export const useBuilderSafeguardCollapsedPreference = createLocalStorageStateHook(builderSafeguardCollapsedStore)

// Imperative writers for restore — mirror the pattern used by rulesFilterPersistence.ts.
// These update the underlying store directly so both App-level hooks and panel hooks react.
export function setBuilderRecipeCollapsed(value: BuilderPanelCollapsedSections): void {
  builderRecipeCollapsedStore.update((prev) => builderPanelCollapsedEquals(prev, value) ? prev : { ...value })
}
export function setBuilderSafeguardCollapsed(value: BuilderPanelCollapsedSections): void {
  builderSafeguardCollapsedStore.update((prev) => builderPanelCollapsedEquals(prev, value) ? prev : { ...value })
}
// Resets both builder panels to defaults, called by the pre-dialog reset useLayoutEffect.
export function resetBuilderCollapsedPreferences(): void {
  builderRecipeCollapsedStore.set(cloneDefaultBuilderPanelCollapsed())
  builderSafeguardCollapsedStore.set(cloneDefaultBuilderPanelCollapsed())
}

// Shape of the builder-collapsed snapshot taken before the tutorial overwrites state.
export type BuilderCollapsedPreferencesSnapshot = {
  recipe: BuilderPanelCollapsedSections
  safeguard: BuilderPanelCollapsedSections
}

/** Capture current builder collapsed state before tutorial overwrite. */
export function snapshotBuilderCollapsedPreferences(): BuilderCollapsedPreferencesSnapshot {
  return {
    recipe: { ...builderRecipeCollapsedStore.getSnapshot() },
    safeguard: { ...builderSafeguardCollapsedStore.getSnapshot() },
  }
}

/** Restore builder collapsed state from a previously captured snapshot. */
export function restoreBuilderCollapsedPreferencesSnapshot(snapshot: BuilderCollapsedPreferencesSnapshot): void {
  builderRecipeCollapsedStore.set({ ...snapshot.recipe })
  builderSafeguardCollapsedStore.set({ ...snapshot.safeguard })
}

const autoResetStore = createLocalStorageStore<boolean>({
  key: BUILDER_AUTO_RESET_AFTER_INSERT_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => String(value),
})

export const useAutoResetAfterInsertPreference = createLocalStorageStateHook(autoResetStore)

const autoApplyStore = createLocalStorageStore<boolean>({
  key: BUILDER_AUTO_APPLY_SELECTED_RECIPE_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => String(value),
})

/** Shared auto-apply toggle for both the recipe and safeguard builder panels. */
export const useAutoApplyBuilderPreference = createLocalStorageStateHook(autoApplyStore)

// Builder-only: control whether tag chips render beside the Tags button in the form header.
// parse returns true for null (absent key) so new users start with tags visible.
const showTagsStore = createLocalStorageStore<boolean>({
  key: BUILDER_SHOW_TAG_CHIPS_KEY,
  fallback: true,
  parse: (raw) => raw === null ? true : raw === 'true',
  serialize: (value) => String(value),
})

export const useShowTagsChipsPreference = createLocalStorageStateHook(showTagsStore)

// Controls whether tags render inline on each chip in the chips list (both recipe and safeguard).
// Separate from useShowTagsChipsPreference so builder-form and chip-list display are independent.
// Toggled from the chips right-click context menu in both panels.
const showTagsInChipsStore = createLocalStorageStore<boolean>({
  key: BUILDER_SHOW_TAGS_IN_CHIPS_KEY,
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => String(value),
})

export const useShowTagsInChipsPreference = createLocalStorageStateHook(showTagsInChipsStore)
