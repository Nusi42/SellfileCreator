// Minimal window.localStorage stub for node:test cases that exercise the safeStorage-backed
// readers/writers. Installed per case (and restored in finally) so state never leaks between
// tests. Single definition shared by every unit test that needs browser storage.

export type LocalStorageStub = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

// Build a fresh in-memory storage object.
export const createLocalStorageStub = (): LocalStorageStub => {
  const store = new Map<string, string>()
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v) },
    removeItem: (k) => { store.delete(k) },
  }
}

// Run `body` with `window` (and `globalThis.localStorage`) stubbed; `windowExtras` lets a
// caller add fields the code under test reads (e.g. `location`). Restores the previous
// globals afterwards, even when the body throws.
export const withLocalStorageStub = (body: () => void, windowExtras: Record<string, unknown> = {}): void => {
  const globals = globalThis as { window?: unknown; localStorage?: unknown }
  const previousWindow = globals.window
  const previousStorage = globals.localStorage
  const storage = createLocalStorageStub()
  globals.window = { ...windowExtras, localStorage: storage }
  globals.localStorage = storage
  try {
    body()
  } finally {
    if (previousWindow === undefined) delete globals.window
    else globals.window = previousWindow
    if (previousStorage === undefined) delete globals.localStorage
    else globals.localStorage = previousStorage
  }
}
