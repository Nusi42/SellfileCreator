/**
 * builderPreferences.ts
 *
 * Builder-specific persisted preferences.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { BUILDER_AUTO_APPLY_SELECTED_RECIPE_KEY, BUILDER_AUTO_RESET_AFTER_INSERT_KEY, BUILDER_SHOW_TAG_CHIPS_KEY, BUILDER_RECIPE_COLLAPSED_KEY, BUILDER_SAFEGUARD_COLLAPSED_KEY } from '../lib/constants'

export const BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS = Object.freeze(['rank', 'rarity', 'faction', 'mainStat', 'substats', 'slots', 'sets', 'minRolls', 'requiredSubstats', 'milestoneThresholds'] as const)
export type BuilderPanelCollapsibleSectionId = typeof BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS[number]
export type BuilderPanelCollapsedSections = Record<BuilderPanelCollapsibleSectionId, boolean>

const DEFAULT_BUILDER_PANEL_COLLAPSED: BuilderPanelCollapsedSections = Object.freeze(
  Object.fromEntries(BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS.map((k) => [k, false])) as BuilderPanelCollapsedSections,
)

const builderPanelCollapsedEquals = (a: BuilderPanelCollapsedSections, b: BuilderPanelCollapsedSections): boolean =>
  BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS.every((k) => Boolean(a[k]) === Boolean(b[k]))

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

export const useAutoApplySelectedRecipePreference = createLocalStorageStateHook(autoApplyStore)

// Builder-only: control whether tag chips render beside the Tags button.
const showTagsStore = createLocalStorageStore<boolean>({
  key: BUILDER_SHOW_TAG_CHIPS_KEY,
  // Default off to keep the header compact until users opt in.
  fallback: false,
  // Parse boolean-ish strings to support legacy storage tweaks.
  parse: (raw) => raw === 'true' || raw === '1',
  // Store as a compact string for parity with other toggles.
  serialize: (value) => String(value),
})

export const useShowTagsChipsPreference = createLocalStorageStateHook(showTagsStore)
