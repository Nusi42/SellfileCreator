/**
 * safeStorage.ts
 *
 * SSOT wrappers around window.localStorage that never throw.
 *
 * Why: accessing localStorage is not always safe. In Chrome incognito on a
 * file:// origin (exactly how the packaged app is launched, e.g.
 * `chrome.exe --incognito "file://…/dist.app/index.html?simple="`), the origin
 * is opaque and storage is blocked — *any* access (even the `window.localStorage`
 * getter) throws `SecurityError`. An unguarded read on the render path then takes
 * the whole app down to a blank screen. These helpers degrade to a safe default
 * instead, so a storage-less environment loses persistence but still renders.
 *
 * loadAutosave (lib/autosave.ts) and the createLocalStorageStore hook
 * (state/localStorageStore.ts) already guard their own access; this module is the
 * shared guard for the remaining ad-hoc getters/setters (see externalWsProtocol.ts).
 */

// Read a key, returning null on any failure (missing key OR storage access denied).
export function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage unavailable (incognito file://, disabled cookies, quota probe) — treat as absent.
    return null
  }
}

// Write a key, silently no-op'ing on any failure (denied access, quota, private mode).
export function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Persistence is best-effort; a failed write must never break the caller.
  }
}

// Remove a key, silently no-op'ing on any failure.
export function safeRemoveItem(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Same best-effort contract as safeSetItem.
  }
}
