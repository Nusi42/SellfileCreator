/**
 * previewBuilderModePreferences.ts
 *
 * "Where was I" view state: the last-active PREVIEW mode (Sellfile Preview vs Gear Inspector)
 * and BUILDER mode (Recipe vs Safeguard). These were previously raw localStorage reads in
 * App.tsx (always persisted); they are now REMEMBERABLE-VIEW stores so the "Remember last view"
 * toggle governs whether they resume on reload (ON, default) or reset to defaults (OFF).
 *
 * Both are global (not account-scoped) — which builder/preview surface you were on is a
 * property of the session, not the document.
 */
import { PREVIEW_MODE_STORAGE_KEY, BUILDER_MODE_STORAGE_KEY } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type PreviewMode = 'rules' | 'gearInspector'
export type BuilderMode = 'recipe' | 'safeguard'

// Preview mode — default 'rules' (the Sellfile Preview). Only 'gearInspector' is a valid
// non-default; anything else clamps to 'rules'.
const previewModeStore = createLocalStorageStore<PreviewMode>({
  key: PREVIEW_MODE_STORAGE_KEY,
  fallback: 'rules',
  parse: (raw) => (raw === 'gearInspector' ? 'gearInspector' : 'rules'),
  serialize: (value) => value,
  rememberableView: true,
})

// Builder mode — default 'recipe'. Only 'safeguard' is a valid non-default.
const builderModeStore = createLocalStorageStore<BuilderMode>({
  key: BUILDER_MODE_STORAGE_KEY,
  fallback: 'recipe',
  parse: (raw) => (raw === 'safeguard' ? 'safeguard' : 'recipe'),
  serialize: (value) => value,
  rememberableView: true,
})

export const usePreviewModePreference = createLocalStorageStateHook(previewModeStore)
export const useBuilderModePreference = createLocalStorageStateHook(builderModeStore)
