/**
 * autosave-corrupt-ignore.test.ts
 *
 * An autosave entry that fails its integrity check must be IGNORED, not deleted. A failed
 * check does not prove the data is worthless: saveAutosave swallows write errors, so a write
 * truncated by quota exhaustion leaves a body that fails CRC on the very next boot — and
 * deleting it there destroyed the user's only copy of their document. Ignoring gives the
 * caller the same "no usable autosave" outcome while leaving the bytes in place for the
 * session's next write to overwrite.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { computeCrc32, loadAutosave, removeAutosave, saveAutosave } from '../../src/lib/autosave.js'

type StorageStub = {
  data: Map<string, string>
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

// Map-backed localStorage stub, mirroring the pattern in background-account-push.test.ts.
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

// lib/autosave.ts uses the BARE `localStorage` global, so point that at the stub.
const installStorage = (): StorageStub => {
  const storage = makeStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  return storage
}

const KEY = 'sellfileCreator.acc.default.autosave.sfc.v1'

let storage: StorageStub

beforeEach(() => { storage = installStorage() })

test('a CRC mismatch is ignored, and the entry is left in storage', () => {
  // A body whose stored CRC does not match — exactly what a truncated write leaves behind.
  const corrupt = JSON.stringify(['DEADBEEF', { Recipes: [{ name: 'my precious setup' }] }])
  storage.data.set(KEY, corrupt)

  // The reader reports "nothing usable"…
  assert.equal(loadAutosave(KEY), null)
  // …but must NOT have destroyed the bytes.
  assert.equal(storage.getItem(KEY), corrupt)
})

test('unparseable JSON is ignored, not dropped', () => {
  const corrupt = '{"truncated": '
  storage.data.set(KEY, corrupt)

  assert.equal(loadAutosave(KEY), null)
  assert.equal(storage.getItem(KEY), corrupt)
})

test('a malformed envelope is ignored, not dropped', () => {
  // Wrong envelope shape (not the `[crc, payload]` pair) still carries user data.
  const corrupt = JSON.stringify({ Recipes: [{ name: 'setup' }] })
  storage.data.set(KEY, corrupt)

  assert.equal(loadAutosave(KEY), null)
  assert.equal(storage.getItem(KEY), corrupt)
})

test('a non-string crc field is ignored, not dropped', () => {
  const corrupt = JSON.stringify([12345, { Recipes: [] }])
  storage.data.set(KEY, corrupt)

  assert.equal(loadAutosave(KEY), null)
  assert.equal(storage.getItem(KEY), corrupt)
})

test('repeated reads of a corrupt entry stay non-destructive', () => {
  // Several boots in a row must not erode the entry — nothing is ever removed.
  const corrupt = JSON.stringify(['DEADBEEF', { Recipes: [{ name: 'still here' }] }])
  storage.data.set(KEY, corrupt)

  for (let i = 0; i < 3; i += 1) assert.equal(loadAutosave(KEY), null)
  assert.equal(storage.getItem(KEY), corrupt)
})

test('a valid entry still round-trips', () => {
  const payload = { Recipes: [{ name: 'good' }] }
  saveAutosave(KEY, payload)

  const entry = loadAutosave<typeof payload>(KEY)
  assert.deepEqual(entry?.payload, payload)
  assert.equal(entry?.crc, computeCrc32(JSON.stringify(payload)))
})

test('the next save overwrites a corrupt entry in place', () => {
  // This is the accepted resolution path: the app simply writes over it.
  storage.data.set(KEY, JSON.stringify(['DEADBEEF', { stale: true }]))
  assert.equal(loadAutosave(KEY), null)

  const payload = { Recipes: [{ name: 'fresh' }] }
  saveAutosave(KEY, payload)
  assert.deepEqual(loadAutosave<typeof payload>(KEY)?.payload, payload)
})

test('removeAutosave still clears the key', () => {
  saveAutosave(KEY, { Recipes: [] })
  removeAutosave(KEY)
  assert.equal(storage.getItem(KEY), null)
})
