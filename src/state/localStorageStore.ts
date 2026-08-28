/**
 * localStorageStore.ts
 *
 * Exposes a tiny localStorage-backed store that cooperates with React via
 * `useSyncExternalStore`. Callers can subscribe to a key, update it, and keep
 * React state in sync without ad-hoc Effects.
 *
 * Cross-window sync via the `storage` event is intentionally NOT supported.
 * The SFC autosave (the document being edited) does not live-sync across
 * windows; keeping preferences isolated per-window matches that behavior and
 * avoids confusing interactions when two windows are open simultaneously.
 */
import { useCallback, useSyncExternalStore } from 'react'

type EqualityFn<T> = (a: T, b: T) => boolean

// ─── Session-view persistence hooks (injected by rememberableViewPreference.ts) ──────────
// REMEMBERABLE-VIEW stores (rememberableView: true) persist only while the "Remember last view" toggle
// is ON. We can't import that toggle here (it builds its own store via this factory — a cycle),
// so rememberableViewPreference.ts INJECTS a live predicate + collects each store's reset callback.
// Until injected (e.g. isolated unit tests that never import the toggle), the default predicate
// returns false → rememberable-view stores behave ephemerally, the safe pre-toggle default.
let rememberableViewPersistGetter: () => boolean = () => false
// Register the predicate. Called once by rememberableViewPreference.ts at load.
export const setRememberableViewPersistGetter = (getter: () => boolean): void => { rememberableViewPersistGetter = getter }

// Reset registry: every rememberable-view store registers a callback that clears its storage and
// resets its in-memory value to fallback. runAll() is triggered when the toggle flips ON→OFF so
// "start fresh" applies immediately, not just on the next reload.
const rememberableViewResetCallbacks = new Set<() => void>()
export const registerRememberableViewReset = {
  add: (cb: () => void): void => { rememberableViewResetCallbacks.add(cb) },
  runAll: (): void => { for (const cb of rememberableViewResetCallbacks) cb() },
}

type LocalStorageStoreOptions<T> = {
  key: string
  fallback: T
  parse: (raw: string | null) => T
  /** Return a string representation of value, or null to remove the key from storage.
   *  The store also calls removeItem automatically when value equals the fallback (via
   *  the equals function), so returning null is only needed for non-default "empty" states
   *  (e.g. an empty presets array whose fallback equality isn't captured by Object.is). */
  serialize: (value: T) => string | null
  equals?: EqualityFn<T>
  /** REMEMBERABLE-VIEW store: this is view-only "where was I / how was I looking" state (filter,
   *  sort, section collapse, builder/preview mode, gear-analytics view). Its persistence is
   *  governed at RUNTIME by the "Remember last view" toggle (state/rememberableViewPreference.ts):
   *   - toggle ON  → behaves like a normal persisted store (resumes on reload),
   *   - toggle OFF → behaves ephemerally (in-memory only, reset to defaults each load).
   *  The store consults the injected predicate on every read/write, so flipping the toggle
   *  changes behavior live without recreating the store. It also registers a reset callback so
   *  the ON→OFF flip clears its storage + in-memory value immediately. `key`/`parse`/`serialize`
   *  stay required (used whenever persistence is active). Default false = an always-persisted
   *  store (theme, display prefs, presets) unaffected by the toggle. */
  rememberableView?: boolean
  /** Keep writing the value even when it equals `fallback`, instead of removing the key.
   *
   *  Required whenever `fallback` is not a constant across sessions — the RSLH flag defaults
   *  to ON under `?simple` and OFF otherwise (state/themeModePreference.ts). With the normal
   *  remove-on-default behavior, a simple-mode user turning RSLH ON writes a value equal to
   *  that session's fallback, so the key is DELETED; the next launch re-resolves the absent
   *  key through whatever fallback applies then, and the choice silently reverts. Persisting
   *  the value makes "chosen" distinguishable from "never chosen", which is the whole point
   *  of such a store's 'true'/'false' serializer.
   *
   *  Leave false for stores whose fallback is a true constant, so storage keeps holding only
   *  keys the user has customized away from the default. */
  persistDefault?: boolean
}

type LocalStorageStore<T> = {
  useValue(): T
  set(next: T): void
  update(updater: (prev: T) => T): void
  /** Like update() but skips localStorage.setItem(). Notifies subscribers so React
   *  re-renders, but the value is not persisted and will be lost on reload. */
  updateTransient(updater: (prev: T) => T): void
  getSnapshot(): T
}

const isWindowDefined = (): boolean => typeof window !== 'undefined'

export function createLocalStorageStore<T>(options: LocalStorageStoreOptions<T>): LocalStorageStore<T> {
  const { key, fallback, parse, serialize, equals, rememberableView = false, persistDefault = false } = options
  // Does THIS store persist right now? Always for a normal store; for a rememberable-view store,
  // only while the "Remember last view" toggle is ON (evaluated live on each access).
  const persistsNow = (): boolean => !rememberableView || rememberableViewPersistGetter()
  let current: T = fallback
  // Sentinel: undefined means "never read yet". Distinguishes the uninitialized state from a
  // missing localStorage key (which also returns null), so the first readFromStorage() call
  // always runs parse() rather than short-circuiting with the fallback value.
  let currentSerialized: string | null | undefined = undefined
  const listeners = new Set<() => void>()

  const equality: EqualityFn<T> = equals ?? ((a, b) => Object.is(a, b))

  // Single definition of the guarded raw read. Returns null both for "key absent" and for
  // "storage unreachable" (SSR, private mode, blocked cookies) — every caller treats those
  // the same way, so collapsing them keeps one error contract instead of two.
  const readRawKey = (): string | null => {
    if (!isWindowDefined()) return null
    try { return window.localStorage.getItem(key) } catch { return null }
  }

  const readFromStorage = (): T => {
    // When persistence is off (a rememberable-view store with the toggle OFF) the in-memory
    // `current` IS the value — never touch storage.
    if (!persistsNow()) return current
    if (!isWindowDefined()) return current

    let raw: string | null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      currentSerialized = null
      current = fallback
      return current
    }

    if (raw === currentSerialized) {
      return current
    }

    try {
      const parsed = parse(raw)
      currentSerialized = raw
      if (equality(current, parsed)) {
        return current
      }
      current = parsed
      return current
    } catch {
      currentSerialized = raw
      current = fallback
      return current
    }
  }

  current = readFromStorage()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  // Subscribe/unsubscribe for useSyncExternalStore. The `storage` event is
  // intentionally not listened to — cross-window sync is not supported.
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  const getSnapshot = () => readFromStorage()
  const getServerSnapshot = () => fallback

  const useValue = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const set = (next: T) => {
    const previous = readFromStorage()
    // A persistDefault store must also treat "same value, but nothing on disk yet" as a real
    // write. readFromStorage() reports the session fallback for an absent key, so without
    // this the very act of CHOOSING the current default would look like a no-op and the
    // choice would never be recorded — leaving the next session free to resolve a different
    // default. For ordinary stores an equal value genuinely is a no-op.
    //
    // Probed only when the value is unchanged: that is the sole case where the answer can
    // change the outcome, so a normal changed-value write skips the extra storage read.
    if (equality(previous, next)) {
      const needsFirstWrite = persistDefault && persistsNow() && readRawKey() === null
      if (!needsFirstWrite) return
    }
    const previousSerialized = currentSerialized
    current = next
    // When persistence is off (rememberable-view store, toggle OFF) hold the value in memory only.
    if (!persistsNow()) {
      notify()
      return
    }
    if (isWindowDefined()) {
      try {
        if (equality(next, fallback) && !persistDefault) {
          // Value matches the factory default — remove rather than write so localStorage
          // only holds keys the user has actually customized away from defaults. Skipped for
          // persistDefault stores, whose fallback varies by session: there, removing the key
          // would let the next launch resolve a DIFFERENT default and silently discard the
          // user's explicit choice (see the persistDefault docs).
          window.localStorage.removeItem(key)
          currentSerialized = null
        } else {
          const serialized = serialize(next)
          if (serialized === null) {
            window.localStorage.removeItem(key)
          } else {
            window.localStorage.setItem(key, serialized)
          }
          currentSerialized = serialized
        }
      } catch {
        currentSerialized = previousSerialized
      }
    } else {
      currentSerialized = null
    }
    notify()
  }

  const update = (updater: (prev: T) => T) => {
    const next = updater(readFromStorage())
    set(next)
  }

  const updateTransient = (updater: (prev: T) => T) => {
    // Compute next without re-reading localStorage — current already reflects
    // in-memory state (which may itself be a prior transient value).
    const next = updater(current)
    if (equality(current, next)) return
    // Update in-memory only; currentSerialized stays pointing at the last persisted
    // value so readFromStorage() still returns this in-memory current on the next call
    // (raw === currentSerialized → short-circuit branch).
    current = next
    notify()
  }

  const getSnapshotValue = () => readFromStorage()

  // Reset to the factory default: clear persisted storage (if any) and the in-memory value,
  // then notify. Registered by rememberable-view stores so the "Remember last view" ON→OFF flip can
  // wipe them live (see rememberableViewPreference.ts). Runs regardless of current persist state so
  // it also clears a key left behind from when the toggle was ON.
  const resetToDefault = (): void => {
    if (isWindowDefined()) { try { window.localStorage.removeItem(key) } catch { /* storage unavailable */ } }
    currentSerialized = null
    if (equality(current, fallback)) return
    current = fallback
    notify()
  }
  if (rememberableView) registerRememberableViewReset.add(resetToDefault)

  return {
    useValue,
    set,
    update,
    updateTransient,
    getSnapshot: getSnapshotValue,
  }
}

export function createLocalStorageStateHook<T>(
  store: LocalStorageStore<T>,
): () => [T, (next: T | ((prev: T) => T)) => void] {
  return function useLocalStorageState() {
    const value = store.useValue()
    const setValue = useCallback((next: T | ((prev: T) => T)) => {
      if (typeof next === 'function') {
        store.update(next as (prev: T) => T)
      } else {
        store.set(next)
      }
    }, [])
    return [value, setValue]
  }
}
