/**
 * persist-default-store.test.ts
 *
 * A store whose fallback varies by session (the RSLH theme flag: ON under ?simple, OFF
 * otherwise) must keep writing the value even when it equals that session's default.
 * The normal remove-on-default optimization deletes the key instead, so the next launch
 * re-resolves the absent key through a DIFFERENT fallback and the user's theme choice
 * silently reverts — which is exactly the "simple-mode theme changes get reset" report.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createLocalStorageStore } from '../../src/state/localStorageStore.js'

type StorageStub = {
  data: Map<string, string>
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

const makeStorage = (): StorageStub => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size },
  }
}

const installStorage = (storage: StorageStub): StorageStub => {
  ;(globalThis as Record<string, unknown>).window = { localStorage: storage }
  return storage
}

const KEY = 'sellfileCreator.rslhEnabled.v1'

// Build a flag store shaped exactly like the RSLH one, with the session default injected
// so a test can model "this launch defaults ON" vs "this launch defaults OFF".
const makeFlagStore = (sessionDefault: boolean, persistDefault: boolean) =>
  createLocalStorageStore<boolean>({
    key: KEY,
    fallback: sessionDefault,
    parse: (raw) => (raw === 'true' ? true : raw === 'false' ? false : sessionDefault),
    serialize: (value) => (value ? 'true' : 'false'),
    persistDefault,
  })

let storage: StorageStub

beforeEach(() => { storage = installStorage(makeStorage()) })

test('choosing the value that equals this session default still persists it', () => {
  // Simple-mode launch: RSLH defaults ON. The user explicitly selects ON.
  const store = makeFlagStore(true, true)
  store.set(true)
  // The choice must be on disk, not expressed as key absence.
  assert.equal(storage.getItem(KEY), 'true')
})

test('the persisted choice survives a session whose default differs', () => {
  // Session 1 — simple mode (default ON): the user picks ON.
  makeFlagStore(true, true).set(true)
  assert.equal(storage.getItem(KEY), 'true')

  // Session 2 — normal launch (default OFF). The stored choice must win over the fallback.
  const nextSession = makeFlagStore(false, true)
  assert.equal(nextSession.getSnapshot(), true)
})

test('the OFF choice still persists and survives a default-ON session', () => {
  // Session 1 — normal launch (default OFF): the user explicitly picks OFF.
  makeFlagStore(false, true).set(false)
  assert.equal(storage.getItem(KEY), 'false')

  // Session 2 — simple mode (default ON). The explicit OFF must not be overridden.
  assert.equal(makeFlagStore(true, true).getSnapshot(), false)
})

test('an untouched key still resolves through the session default', () => {
  // Nothing stored — each session is free to apply its own default.
  assert.equal(makeFlagStore(true, true).getSnapshot(), true)
  assert.equal(makeFlagStore(false, true).getSnapshot(), false)
})

test('regression: without persistDefault the choice is dropped', () => {
  // This is the old behavior, pinned so the bug cannot quietly return. Choosing the value
  // that equals the session default removes the key…
  makeFlagStore(true, false).set(true)
  assert.equal(storage.getItem(KEY), null)
  // …and the next session's different default then wins, reverting the user's theme.
  assert.equal(makeFlagStore(false, false).getSnapshot(), false)
})

test('a constant-fallback store keeps the remove-on-default behavior', () => {
  // persistDefault is opt-in: ordinary stores must still keep storage free of keys the
  // user never customized.
  const store = createLocalStorageStore<boolean>({
    key: 'sellfileCreator.someFlag.v1',
    fallback: false,
    parse: (raw) => raw === 'true',
    serialize: (value) => (value ? 'true' : 'false'),
  })
  store.set(true)
  assert.equal(storage.getItem('sellfileCreator.someFlag.v1'), 'true')
  store.set(false)
  assert.equal(storage.getItem('sellfileCreator.someFlag.v1'), null)
})
