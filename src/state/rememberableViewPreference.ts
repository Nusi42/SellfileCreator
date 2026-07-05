/**
 * rememberableViewPreference.ts
 *
 * The "Remember last view" master toggle + the machinery that lets REMEMBERABLE-VIEW stores
 * (filter, sort, section collapse, builder/preview mode, gear-analytics view) flip between
 * persisted and ephemeral at RUNTIME.
 *
 * Why a runtime flip (not a fixed store option): stores are created once at module load, so a
 * per-store `sessionOnly` boolean can't respond to a user toggle. Instead a store marks itself
 * `rememberableView: true` and the factory consults THIS module's live predicate on every read/write:
 *  - toggle ON  → the store behaves like a normal persisted localStorage store (resumes on reload),
 *  - toggle OFF → the store behaves ephemerally (in-memory only, reset to defaults each load).
 *
 * Dependency direction: localStorageStore.ts must NOT import this module (that would cycle —
 * this module builds its own toggle store via the factory). Instead this module INJECTS the
 * predicate into the factory via setRememberableViewPersistGetter() at load, and the factory
 * exposes registerRememberableViewReset for stores to self-register their resets. The factory
 * holds the predicate behind indirection and never imports back.
 *
 * Default ON: preserves today's behavior (builder/preview mode + gear-analytics already
 * persisted; the store-backed view state now joins them). A user who prefers always-fresh
 * turns it OFF, which clears the persisted rememberable-view keys and resets the live view.
 */
import { REMEMBER_LAST_VIEW_KEY } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore, registerRememberableViewReset, setRememberableViewPersistGetter } from './localStorageStore'

// The master flag is itself ALWAYS persisted (never a rememberable-view store) so the choice
// survives reloads. Default true = "remember" (no regression from today's persisted states).
const REMEMBER_DEFAULT = true

const rememberLastViewStore = createLocalStorageStore<boolean>({
  key: REMEMBER_LAST_VIEW_KEY,
  fallback: REMEMBER_DEFAULT,
  // Explicit 'true'/'false' so an OFF choice is distinguishable from unset (which defaults ON).
  parse: (raw) => (raw === 'false' ? false : raw === 'true' ? true : REMEMBER_DEFAULT),
  serialize: (value) => (value ? 'true' : 'false'),
})

// Reactive read for the popout toggle row.
export const useRememberLastViewPreference = createLocalStorageStateHook(rememberLastViewStore)

// Live predicate the store factory calls to decide persist-vs-ephemeral for rememberable-view stores.
export const shouldPersistRememberableView = (): boolean => rememberLastViewStore.getSnapshot()

// Wire the factory's indirection to this module (predicate + reset registry) exactly once at load.
setRememberableViewPersistGetter(shouldPersistRememberableView)

/**
 * Flip "remember last view". Turning it OFF clears every persisted rememberable-view key AND resets
 * each rememberable-view store's live value to its default, so "off" means "always start fresh" both
 * now and on the next load. Turning it ON simply starts persisting from this point.
 */
export const setRememberLastView = (on: boolean): void => {
  const wasOn = rememberLastViewStore.getSnapshot()
  rememberLastViewStore.set(on)
  // Only the ON→OFF transition needs the clear+reset; OFF→ON just resumes persisting.
  if (wasOn && !on) resetAllRememberableViewStores()
}

// Reset every registered rememberable-view store to its default (clears storage + in-memory value).
// The registrations live in the factory (each rememberable-view store registers its own reset on
// creation); we just trigger them here so the toggle owns the semantics.
const resetAllRememberableViewStores = (): void => { registerRememberableViewReset.runAll() }
