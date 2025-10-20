/**
 * localStorageStore.ts
 *
 * Exposes a tiny localStorage-backed store that cooperates with React via
 * `useSyncExternalStore`. Callers can subscribe to a key, update it, and keep
 * React state in sync without ad-hoc Effects.
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
  const listeners = new Set<() => void>()
  let storageListenerAttached = false

  const equality: EqualityFn<T> = equals ?? ((a, b) => Object.is(a, b))

  const read = (): T => {
    if (!isWindowDefined()) return current
    try {
      const raw = window.localStorage.getItem(key)
      const parsed = parse(raw)
      current = parsed
      return current
    } catch {
      current = fallback
      return current
    }
  }

  current = read()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  const handleStorage = (event: StorageEvent) => {
    if (!isWindowDefined()) return
    if (event.storageArea !== window.localStorage) return
    if (event.key !== key) return
    current = parse(event.newValue ?? null)
    notify()
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    if (!storageListenerAttached && isWindowDefined()) {
      window.addEventListener('storage', handleStorage)
      storageListenerAttached = true
    }
    return () => {
      listeners.delete(listener)
      if (storageListenerAttached && listeners.size === 0 && isWindowDefined()) {
        window.removeEventListener('storage', handleStorage)
        storageListenerAttached = false
      }
    }
  }

  const getSnapshot = () => read()
  const getServerSnapshot = () => fallback

  const useValue = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const set = (next: T) => {
    const previous = read()
    if (equality(previous, next)) return
    current = next
    if (isWindowDefined()) {
      try {
        const serialized = serialize(next)
        if (serialized === null) {
          window.localStorage.removeItem(key)
        } else {
          window.localStorage.setItem(key, serialized)
        }
      } catch {
        // Ignore persistence failures (private browsing, quota, etc.)
      }
    }
    notify()
  }

  const update = (updater: (prev: T) => T) => {
    const next = updater(read())
    set(next)
  }

  const getSnapshotValue = () => read()

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
