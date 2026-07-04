import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createLocalStorageStore } from '../../src/state/localStorageStore.js'

// ---------------------------------------------------------------------------
// loadOnce document-view semantics: a store reads localStorage ONCE at creation
// then serves its in-memory value, so two tabs on the same key do not mirror each
// other's mid-session writes — while writes still persist for the next load.
// We model two tabs as two store instances over ONE shared localStorage.
// ---------------------------------------------------------------------------

type StorageStub = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const makeStorage = (): StorageStub => {
  const data = new Map<string, string>()
  return {
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { data.set(k, v) },
    removeItem: (k) => { data.delete(k) },
  }
}

let storage: StorageStub

beforeEach(() => {
  storage = makeStorage()
  ;(globalThis as Record<string, unknown>).window = { localStorage: storage }
})

// A tiny string store factory used by the tests, toggling loadOnce.
const makeStore = (loadOnce: boolean) => createLocalStorageStore<string>({
  key: 'k',
  fallback: '',
  parse: (raw) => raw ?? '',
  serialize: (v) => (v === '' ? null : v),
  loadOnce,
})

test('default (mirror) store adopts another tab\'s write on the next read', () => {
  const tabA = makeStore(false)
  const tabB = makeStore(false)
  tabA.set('from-A')
  // Tab B re-reads storage on getSnapshot → sees A's write (the mirror behavior).
  assert.equal(tabB.getSnapshot(), 'from-A')
})

test('loadOnce store does NOT adopt another tab\'s mid-session write', () => {
  const tabA = makeStore(true)
  const tabB = makeStore(true)
  // Both seeded empty at creation. A writes; B must keep its own in-memory value.
  tabA.set('from-A')
  assert.equal(tabB.getSnapshot(), '')
  // A still sees its own write.
  assert.equal(tabA.getSnapshot(), 'from-A')
})

test('loadOnce store STILL persists so a freshly created store (new tab) boots from it', () => {
  const tabA = makeStore(true)
  tabA.set('saved')
  // A brand-new store instance = a fresh tab booting → reads the persisted value once.
  const freshTab = makeStore(true)
  assert.equal(freshTab.getSnapshot(), 'saved')
})

test('loadOnce store survives a "reload" (new instance) with its own last write', () => {
  const first = makeStore(true)
  first.set('v1')
  // Reload: same tab, new module state → re-seeds from storage.
  const reloaded = makeStore(true)
  assert.equal(reloaded.getSnapshot(), 'v1')
  reloaded.set('v2')
  const reloadedAgain = makeStore(true)
  assert.equal(reloadedAgain.getSnapshot(), 'v2')
})

test('loadOnce update() computes from the in-memory value, not another tab\'s storage write', () => {
  const tabA = makeStore(true)
  const tabB = makeStore(true)
  tabA.set('a')          // storage now "a"
  // B updates from ITS in-memory value ('' seeded), not from storage ('a').
  tabB.update((prev) => `${prev}b`)
  assert.equal(tabB.getSnapshot(), 'b')  // '' + 'b', NOT 'a' + 'b'
})

test('last-writer-wins on the persisted value across two loadOnce tabs', () => {
  const tabA = makeStore(true)
  const tabB = makeStore(true)
  tabA.set('A-wrote')
  tabB.set('B-wrote')     // B persists last
  // A future fresh tab loads whoever wrote last (B) — the accepted last-writer-wins outcome.
  const freshTab = makeStore(true)
  assert.equal(freshTab.getSnapshot(), 'B-wrote')
})
