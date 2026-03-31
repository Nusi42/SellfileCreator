/**
 * localStorageStore.ts
 *
 * Exposes a tiny localStorage-backed store that cooperates with React via
 * `useSyncExternalStore`. Callers can subscribe to a key, update it, and keep
 * React state in sync without ad-hoc Effects.
 *
 * Cross-window sync via the `storage` event is intentionally NOT supported.
 * The SFR autosave (the document being edited) does not live-sync across
 * windows; keeping preferences isolated per-window matches that behavior and
 * avoids confusing interactions when two windows are open simultaneously.
 */
import { useCallback, useSyncExternalStore } from 'react'

type EqualityFn<T> = (a: T, b: T) => boolean

type LocalStorageStoreOptions<T> = {
  key: string
  fallback: T
  parse: (raw: string | null) => T
  serialize: (value: T) => string | null
  equals?: EqualityFn<T>
}

type LocalStorageStore<T> = {
  useValue(): T
  set(next: T): void
  update(updater: (prev: T) => T): void
  getSnapshot(): T
}

const isWindowDefined = (): boolean => typeof window !== 'undefined'

export function createLocalStorageStore<T>(options: LocalStorageStoreOptions<T>): LocalStorageStore<T> {
  const { key, fallback, parse, serialize, equals } = options
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
    if (equality(previous, next)) return
    const previousSerialized = currentSerialized
    current = next
    if (isWindowDefined()) {
      try {
        const serialized = serialize(next)
        if (serialized === null) {
          window.localStorage.removeItem(key)
        } else {
          window.localStorage.setItem(key, serialized)
        }
        currentSerialized = serialized
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

  const getSnapshotValue = () => readFromStorage()

  return {
    useValue,
    set,
    update,
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
