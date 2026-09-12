/**
 * gearInspectorSelectionModePreference.ts
 *
 * SSOT for the Gear Inspector's selection mode (single-select vs multi-select).
 *
 * The mode picker lives on the grid's selection toolbar, but the mode is ALSO part of the
 * outbound `selectArtifacts` payload (App.tsx stamps `multiSelect` alongside the ids), so
 * the flag cannot stay as component-local `useState`: two consumers reading the same
 * localStorage key independently would drift the moment one of them re-renders and the
 * other does not. A shared store keeps the grid's toolbar and the WebSocket push reading
 * one live value.
 *
 * Stored as '1'/'0' — the exact encoding the grid used before the lift, so existing
 * installs keep their choice with no migration.
 */
import { useCallback } from 'react'
import { GEAR_INSPECTOR_SINGLE_SELECT_KEY } from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

// Multi-select is the factory default; single-select is the opt-in mode.
const DEFAULT_SINGLE_SELECT_MODE = false

const gearInspectorSelectionModeStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_SINGLE_SELECT_KEY,
  fallback: DEFAULT_SINGLE_SELECT_MODE,
  // Only the literal '1' means single-select; anything else (absent, junk) is multi-select.
  parse: (raw) => raw === '1',
  serialize: (value) => (value ? '1' : '0'),
  // Write '0' rather than removing the key: the pre-store implementation always persisted
  // both states, and an explicit '0' keeps "chose multi-select" distinct from "never chose".
  persistDefault: true,
})

/** Read the mode outside React (e.g. when building a WebSocket payload in a callback). */
export const getGearInspectorSingleSelectMode = (): boolean => gearInspectorSelectionModeStore.getSnapshot()

export function useGearInspectorSelectionModePreference() {
  const singleSelectMode = gearInspectorSelectionModeStore.useValue()
  // Setting an explicit mode is the only mutation the UI needs: the toolbar's two-button
  // group names the mode each button represents, so re-picking the active one must be a
  // no-op. A flip-style toggle would instead switch away from the mode just clicked.
  // Writes go through the store so every subscriber (grid toolbar, selection push) re-reads
  // the same value.
  const setSingleSelectMode = useCallback((value: boolean) => {
    gearInspectorSelectionModeStore.update(() => value)
  }, [])
  return { singleSelectMode, setSingleSelectMode }
}
