/**
 * gearAnalyticsPreferences.ts
 *
 * "How was I looking at the Gear Analytics dashboard" view state: section collapse,
 * the Not-Equipped grid's sort/simulate/show-fully-equipped toggles, and the Champion
 * Stats chart's location/fully-equipped/include-glyphs filters. These were previously
 * raw localStorage reads (useState-initializer + useEffect-writer) inside the three
 * gear-analytics components; they are now REMEMBERABLE-VIEW stores so the "Remember last view"
 * toggle governs whether they resume on reload (ON, default) or reset to defaults (OFF).
 *
 * All are global (not account-scoped) — how you were viewing the dashboard is a property
 * of the session, not the edited document. Each store replicates the component's exact
 * parse/serialize/default so existing users' persisted values still load unchanged.
 */
import {
  GEAR_ANALYTICS_COLLAPSED_KEY,
  GEAR_ANALYTICS_SORT_MODE_KEY,
  GEAR_ANALYTICS_SIMULATE_SOLD_KEY,
  GEAR_ANALYTICS_SHOW_FULLY_EQUIPPED_KEY,
  GEAR_ANALYTICS_CHAMP_LOCATION_KEY,
  GEAR_ANALYTICS_CHAMP_FULLY_EQUIPPED_KEY,
  GEAR_ANALYTICS_CHAMP_INCLUDE_GLYPHS_KEY,
} from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
// ChampAnalyticsLocation lives in the domain lib (not the component), so importing it here
// creates no cycle — the component imports this store, this store imports only lib + factory.
import type { ChampAnalyticsLocation } from '../lib/champAnalytics'

// Champion sort order for the Not-Equipped grid. 'rank' = in-game roster order (the natural
// default); the others sort by missing count for that slot group. Duplicated as a minimal
// union here (the component's private alias stays for its own use) to keep this module free of
// a component import that would cycle. SSOT for the *values* is this union.
export type GearAnalyticsSortMode = 'rank' | 'all' | 'artifacts' | 'accessories'

// ── Section collapse map ────────────────────────────────────────────────────────
// Kept generically typed as Record<string, boolean> so this store needs neither the section-id
// list nor the component's type (avoids a cycle). The component owns the typed view: it merges
// this partial onto its all-expanded default and casts. parse tolerates any JSON object, keeping
// only boolean-valued keys; serialize round-trips as JSON — byte-identical to the old writer's
// `JSON.stringify(collapsed)`. Fallback {} = "nothing customized" (all sections expanded).
const collapsedStore = createLocalStorageStore<Record<string, boolean>>({
  key: GEAR_ANALYTICS_COLLAPSED_KEY,
  fallback: {},
  parse: (raw) => {
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>
      // Retain only boolean entries — mirrors readCollapsed's `typeof … === 'boolean'` guard.
      const out: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'boolean') out[k] = v
      return out
    } catch {
      return {}
    }
  },
  serialize: (value) => JSON.stringify(value),
  // Deep-compare by serialized form so equal maps don't churn storage (records are re-created
  // on each toggle, so Object.is would always report a change).
  equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  rememberableView: true,
})

// ── Not-Equipped: sort mode ─────────────────────────────────────────────────────
// Default 'rank'. Preserves the legacy 'off' → 'rank' migration: any value that isn't one of the
// four valid modes (including the retired 'off') clamps to the default. serialize is identity —
// matches the old `localStorage.setItem(key, sortMode)` writer.
const sortModeStore = createLocalStorageStore<GearAnalyticsSortMode>({
  key: GEAR_ANALYTICS_SORT_MODE_KEY,
  fallback: 'rank',
  parse: (raw) =>
    raw === 'rank' || raw === 'all' || raw === 'artifacts' || raw === 'accessories' ? raw : 'rank',
  serialize: (value) => value,
  rememberableView: true,
})

// ── Not-Equipped: simulate-sold toggle ──────────────────────────────────────────
// Default false. Backward-compat: the old reader treated ONLY '1' as true (any other value,
// including the old writer's '0', parses to false). We keep parse as raw === '1'; serialize writes
// '1' when on and removes the key (null) when off — cleaner than the old '0' but load-compatible,
// since '0' and an absent key both parse to false.
const simulateSoldStore = createLocalStorageStore<boolean>({
  key: GEAR_ANALYTICS_SIMULATE_SOLD_KEY,
  fallback: false,
  parse: (raw) => raw === '1',
  serialize: (value) => (value ? '1' : null),
  rememberableView: true,
})

// ── Not-Equipped: show-fully-equipped toggle ─────────────────────────────────────
// Same '1'/absent scheme and false default as simulate-sold.
const showFullyEquippedStore = createLocalStorageStore<boolean>({
  key: GEAR_ANALYTICS_SHOW_FULLY_EQUIPPED_KEY,
  fallback: false,
  parse: (raw) => raw === '1',
  serialize: (value) => (value ? '1' : null),
  rememberableView: true,
})

// ── Champion Stats: location filter ──────────────────────────────────────────────
// Default 'collection'. Only 'all' | 'collection' | 'vault' are valid; anything else clamps to
// the default — mirrors readLocation. serialize is identity (old writer stored the value verbatim).
const champLocationStore = createLocalStorageStore<ChampAnalyticsLocation>({
  key: GEAR_ANALYTICS_CHAMP_LOCATION_KEY,
  fallback: 'collection',
  parse: (raw) => (raw === 'all' || raw === 'collection' || raw === 'vault' ? raw : 'collection'),
  serialize: (value) => value,
  rememberableView: true,
})

// ── Champion Stats: fully-equipped-only toggle ───────────────────────────────────
// Default TRUE. Backward-compat: the old writer stored String(bool) → 'true'/'false', and the old
// reader returned the default when the key was absent, else `v === 'true'`. We replicate that:
// parse returns fallback (true) when raw is null, else raw === 'true'. serialize keeps 'true'/'false'
// (the store still auto-removes the key when the value equals the fallback, which parses back to true).
const champFullyEquippedStore = createLocalStorageStore<boolean>({
  key: GEAR_ANALYTICS_CHAMP_FULLY_EQUIPPED_KEY,
  fallback: true,
  parse: (raw) => (raw === null ? true : raw === 'true'),
  serialize: (value) => String(value),
  rememberableView: true,
})

// ── Champion Stats: include-glyphs toggle ────────────────────────────────────────
// Same 'true'/'false' scheme and TRUE default as fully-equipped-only.
const champIncludeGlyphsStore = createLocalStorageStore<boolean>({
  key: GEAR_ANALYTICS_CHAMP_INCLUDE_GLYPHS_KEY,
  fallback: true,
  parse: (raw) => (raw === null ? true : raw === 'true'),
  serialize: (value) => String(value),
  rememberableView: true,
})

// useState-shaped hooks ([value, setter]) — drop-in replacements for the old useState pairs.
export const useGearAnalyticsCollapsedPreference = createLocalStorageStateHook(collapsedStore)
export const useGearAnalyticsSortModePreference = createLocalStorageStateHook(sortModeStore)
export const useGearAnalyticsSimulateSoldPreference = createLocalStorageStateHook(simulateSoldStore)
export const useGearAnalyticsShowFullyEquippedPreference = createLocalStorageStateHook(showFullyEquippedStore)
export const useGearAnalyticsChampLocationPreference = createLocalStorageStateHook(champLocationStore)
export const useGearAnalyticsChampFullyEquippedPreference = createLocalStorageStateHook(champFullyEquippedStore)
export const useGearAnalyticsChampIncludeGlyphsPreference = createLocalStorageStateHook(champIncludeGlyphsStore)
