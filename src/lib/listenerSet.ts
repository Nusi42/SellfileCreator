/**
 * listenerSet.ts
 *
 * Single definition of the plain subscribe/notify primitive used by module-level stores
 * that feed `useSyncExternalStore` (accounts registry, client name, RSL Helper port).
 * React-free on purpose: the stores that use it are exercised by node:test unit tests.
 */

export type ListenerSet = {
  // Register a listener; returns the unsubscribe (the useSyncExternalStore `subscribe` shape).
  subscribe: (listener: () => void) => () => void
  // Invoke every registered listener in registration order.
  notify: () => void
  // Drop every listener (test-only module resets).
  clear: () => void
}

// Create an independent listener registry. Each store owns exactly one.
export const createListenerSet = (): ListenerSet => {
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    notify: () => {
      for (const listener of listeners) listener()
    },
    clear: () => { listeners.clear() },
  }
}
