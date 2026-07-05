import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createLocalStorageStore,
  setRememberableViewPersistGetter,
  registerRememberableViewReset,
} from '../../src/state/localStorageStore.js'

// ---------------------------------------------------------------------------
// rememberableView semantics: a rememberable-view store's persistence is governed at
// RUNTIME by an injected predicate (the "Remember last view" toggle in the app).
//  - predicate true  → behaves like a normal persisted localStorage store,
//  - predicate false → behaves ephemerally (in-memory only, reset on reload).
// It also registers a reset callback so an ON→OFF flip can clear it live.
// We drive the predicate directly here (the app injects it via
// rememberableViewPreference.ts) and model two loads as two store instances over one
// shared localStorage.
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
// The live "should rememberable-view stores persist?" flag, controllable per test.
let persist = true

beforeEach(() => {
  store = makeStorage()
  ;(globalThis as Record<string, unknown>).window = { localStorage: store.stub }
  persist = true
  setRememberableViewPersistGetter(() => persist)
})

const makeRememberableViewStore = () => createLocalStorageStore<string>({
  key: 'k',
  fallback: '',
  parse: (raw) => raw ?? '',
  serialize: (v) => (v === '' ? null : v),
  rememberableView: true,
})

const makeNormalStore = () => createLocalStorageStore<string>({
  key: 'k',
  fallback: '',
  parse: (raw) => raw ?? '',
  serialize: (v) => (v === '' ? null : v),
})

test('rememberableView store PERSISTS when the toggle is ON', () => {
  persist = true
  const s = makeRememberableViewStore()
  s.set('value')
  assert.equal(s.getSnapshot(), 'value')
  assert.equal(store.data.get('k'), 'value')          // written to storage
  // A fresh instance (reload) reads it back.
  const reloaded = makeRememberableViewStore()
  assert.equal(reloaded.getSnapshot(), 'value')
})

test('rememberableView store is EPHEMERAL when the toggle is OFF', () => {
  persist = false
  const s = makeRememberableViewStore()
  s.set('value')
  assert.equal(s.getSnapshot(), 'value')              // in-memory value served
  assert.equal(store.data.has('k'), false)             // …but storage untouched
  // A fresh instance (reload) starts from default — nothing was persisted.
  const reloaded = makeRememberableViewStore()
  assert.equal(reloaded.getSnapshot(), '')
})

test('toggle OFF makes an otherwise-persisted store stop reading storage mid-session', () => {
  // A value persisted while ON…
  store.data.set('k', 'persisted')
  persist = true
  const s = makeRememberableViewStore()
  assert.equal(s.getSnapshot(), 'persisted')           // reads it while ON
  // …flip OFF: now the store serves its in-memory value and ignores storage.
  persist = false
  assert.equal(s.getSnapshot(), 'persisted')           // still the last in-memory value
  s.set('changed')
  assert.equal(store.data.get('k'), 'persisted')       // OFF → the write did NOT touch storage
})

test('registerRememberableViewReset.runAll() clears storage and resets the value to default', () => {
  persist = true
  const s = makeRememberableViewStore()                     // auto-registers its reset
  s.set('value')
  assert.equal(store.data.get('k'), 'value')
  registerRememberableViewReset.runAll()                    // the ON→OFF clear+reset
  assert.equal(store.data.has('k'), false)             // storage cleared
  assert.equal(s.getSnapshot(), '')                    // in-memory reset to default
})

test('a normal (non-rememberableView) store is unaffected by the toggle', () => {
  persist = false                                      // toggle OFF must not matter here
  const a = makeNormalStore()
  a.set('persisted')
  assert.equal(store.data.get('k'), 'persisted')       // always persists
  const b = makeNormalStore()
  assert.equal(b.getSnapshot(), 'persisted')
})
