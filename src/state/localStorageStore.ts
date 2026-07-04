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
  /** DOCUMENT-VIEW semantics: read localStorage ONCE at store creation, then serve the
   *  in-memory value forever (getSnapshot never re-reads). Writes still persist through to
   *  localStorage so the value survives a reload and a fresh tab boots from it — but a
   *  second tab open on the same key does NOT adopt this tab's mid-session writes (and vice
   *  versa). This is how the restore-dialog "filters" bundle (filter values, applied sort,
   *  builder collapse) behaves: seeded at load, edited live per-tab, saved back, never
   *  live-mirrored between tabs. Default false = the normal re-read-every-snapshot store
   *  (correct for pure chrome/global toggles where cross-tab mirroring is harmless). */
  loadOnce?: boolean
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
  const { key, fallback, parse, serialize, equals, loadOnce = false } = options
  let current: T = fallback
  // Sentinel: undefined means "never read yet". Distinguishes the uninitialized state from a
  // missing localStorage key (which also returns null), so the first readFromStorage() call
  // always runs parse() rather than short-circuiting with the fallback value.
  let currentSerialized: string | null | undefined = undefined
  const listeners = new Set<() => void>()

  const equality: EqualityFn<T> = equals ?? ((a, b) => Object.is(a, b))

  const readFromStorage = (): T => {
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
  // After the initial seed above, a loadOnce store never re-reads storage: it serves the
  // in-memory `current` so a second tab's writes are not adopted mid-session (see loadOnce
  // docs). readCurrent() is the SSOT the read paths (getSnapshot/set/update) go through so
  // the load-once vs re-read choice lives in exactly one place.
  const readCurrent = (): T => (loadOnce ? current : readFromStorage())

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
    const previous = readCurrent()
    if (equality(previous, next)) return
    const previousSerialized = currentSerialized
    current = next
    if (isWindowDefined()) {
      try {
        if (equality(next, fallback)) {
          // Value matches the factory default — remove rather than write so localStorage
          // only holds keys the user has actually customized away from defaults.
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
    const next = updater(readCurrent())
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

  const getSnapshotValue = () => readCurrent()

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
