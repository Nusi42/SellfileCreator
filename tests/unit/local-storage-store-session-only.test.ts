import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createLocalStorageStore } from '../../src/state/localStorageStore.js'

// ---------------------------------------------------------------------------
// sessionOnly (ephemeral) semantics: the store never reads or writes
// localStorage — it seeds from fallback, lives in memory, and resets on every
// load. Used for VIEW state that should not be saved at all, while keeping the
// store's cross-component sharing. We model two tabs / two loads as separate
// store instances over ONE shared localStorage.
// ---------------------------------------------------------------------------

type StorageStub = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const makeStorage = (): { stub: StorageStub; data: Map<string, string> } => {
  const data = new Map<string, string>()
  return {
    data,
    stub: {
      getItem: (k) => (data.has(k) ? data.get(k)! : null),
      setItem: (k, v) => { data.set(k, v) },
      removeItem: (k) => { data.delete(k) },
    },
  }
}

let store: ReturnType<typeof makeStorage>

beforeEach(() => {
  store = makeStorage()
  ;(globalThis as Record<string, unknown>).window = { localStorage: store.stub }
})

const makeStore = (sessionOnly: boolean) => createLocalStorageStore<string>({
  key: 'k',
  fallback: '',
  parse: (raw) => raw ?? '',
  serialize: (v) => (v === '' ? null : v),
  sessionOnly,
})

test('sessionOnly store NEVER writes to localStorage', () => {
  const s = makeStore(true)
  s.set('value')
  assert.equal(s.getSnapshot(), 'value')          // in-memory value is served
  assert.equal(store.data.has('k'), false)         // …but storage was never touched
})

test('sessionOnly store ignores a pre-existing persisted value (resets to fallback each load)', () => {
  // Simulate a value left in storage by an older persisted build.
  store.data.set('k', 'stale-persisted')
  const s = makeStore(true)
  // A sessionOnly store seeds from fallback, NOT from storage.
  assert.equal(s.getSnapshot(), '')
})

test('sessionOnly store does not share across two instances (loads/tabs) via storage', () => {
  const a = makeStore(true)
  const b = makeStore(true)
  a.set('from-A')
  // B has its own in-memory value and never reads storage → unaffected.
  assert.equal(b.getSnapshot(), '')
  // And nothing was persisted for a future load to pick up.
  assert.equal(store.data.has('k'), false)
})

test('a fresh sessionOnly instance (reload) starts from default, not the last write', () => {
  const first = makeStore(true)
  first.set('v1')
  // Reload: new instance → back to default (ephemeral).
  const reloaded = makeStore(true)
  assert.equal(reloaded.getSnapshot(), '')
})

test('sessionOnly update() computes from the in-memory value', () => {
  const s = makeStore(true)
  s.set('a')
  s.update((prev) => `${prev}b`)
  assert.equal(s.getSnapshot(), 'ab')
})

test('a normal (persisted) store still writes and shares across instances', () => {
  const a = makeStore(false)
  a.set('persisted')
  assert.equal(store.data.get('k'), 'persisted')
  // A second instance reads it back from storage (the ordinary behavior).
  const b = makeStore(false)
  assert.equal(b.getSnapshot(), 'persisted')
})
