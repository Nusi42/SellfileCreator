/**
 * builderPreferences.ts
 *
 * Builder-specific persisted preferences.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { BUILDER_AUTO_APPLY_SELECTED_RECIPE_KEY, BUILDER_AUTO_RESET_AFTER_INSERT_KEY, BUILDER_SHOW_TAG_CHIPS_KEY, BUILDER_RECIPE_COLLAPSED_KEY, BUILDER_SAFEGUARD_COLLAPSED_KEY } from '../lib/constants'

export const BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS = Object.freeze(['action', 'rank', 'rarity', 'faction', 'level', 'mainStat', 'substats', 'slots', 'sets', 'minRolls', 'requiredSubstats', 'milestoneThresholds'] as const)
export type BuilderPanelCollapsibleSectionId = typeof BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS[number]
export type BuilderPanelCollapsedSections = Record<BuilderPanelCollapsibleSectionId, boolean>

const DEFAULT_BUILDER_PANEL_COLLAPSED: BuilderPanelCollapsedSections = Object.freeze(
  Object.fromEntries(BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS.map((k) => [k, false])) as BuilderPanelCollapsedSections,
)

// Exported so autosave/restore logic can create default snapshots without re-declaring them.
export const cloneDefaultBuilderPanelCollapsed = (): BuilderPanelCollapsedSections => ({ ...DEFAULT_BUILDER_PANEL_COLLAPSED })

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

const parseBuilderPanelCollapsed = (raw: string | null): BuilderPanelCollapsedSections => {
  if (!raw) return { ...DEFAULT_BUILDER_PANEL_COLLAPSED }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_BUILDER_PANEL_COLLAPSED }
    const next = { ...DEFAULT_BUILDER_PANEL_COLLAPSED }
    for (const k of BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS) {
      const val = parsed[k]
      if (typeof val === 'boolean') next[k] = val
    }
    return next
  } catch {
    return { ...DEFAULT_BUILDER_PANEL_COLLAPSED }
  }
}

const serializeBuilderPanelCollapsed = (value: BuilderPanelCollapsedSections): string | null => {
  const anyCollapsed = BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS.some((k) => Boolean(value?.[k]))
  return anyCollapsed ? JSON.stringify(value) : null
}

const builderRecipeCollapsedStore = createLocalStorageStore<BuilderPanelCollapsedSections>({
  key: BUILDER_RECIPE_COLLAPSED_KEY,
  fallback: { ...DEFAULT_BUILDER_PANEL_COLLAPSED },
  parse: parseBuilderPanelCollapsed,
  serialize: serializeBuilderPanelCollapsed,
  equals: builderPanelCollapsedEquals,
})

const builderSafeguardCollapsedStore = createLocalStorageStore<BuilderPanelCollapsedSections>({
  key: BUILDER_SAFEGUARD_COLLAPSED_KEY,
  fallback: { ...DEFAULT_BUILDER_PANEL_COLLAPSED },
  parse: parseBuilderPanelCollapsed,
  serialize: serializeBuilderPanelCollapsed,
  equals: builderPanelCollapsedEquals,
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

// Builder-only: control whether tag chips render beside the Tags button.
const showTagsStore = createLocalStorageStore<boolean>({
  key: BUILDER_SHOW_TAG_CHIPS_KEY,
  // Default off to keep the header compact until users opt in.
  fallback: false,
  parse: (raw) => raw === 'true',
  // Store as a compact string for parity with other toggles.
  serialize: (value) => String(value),
})

export const useShowTagsChipsPreference = createLocalStorageStateHook(showTagsStore)
