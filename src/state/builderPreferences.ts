/**
 * builderPreferences.ts
 *
 * Builder-specific persisted preferences.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { BUILDER_AUTO_APPLY_SELECTED_CONFIG_KEY, BUILDER_AUTO_RESET_AFTER_INSERT_KEY, BUILDER_SHOW_TAG_CHIPS_KEY } from '../lib/constants'

const autoResetStore = createLocalStorageStore<boolean>({
  key: BUILDER_AUTO_RESET_AFTER_INSERT_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => String(value),
})

export const useAutoResetAfterInsertPreference = createLocalStorageStateHook(autoResetStore)

const autoApplyStore = createLocalStorageStore<boolean>({
  key: BUILDER_AUTO_APPLY_SELECTED_CONFIG_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => String(value),
})

export const useAutoApplySelectedConfigPreference = createLocalStorageStateHook(autoApplyStore)

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
