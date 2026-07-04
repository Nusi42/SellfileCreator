import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  claimAutoPushOwnership,
  refreshAutoPushOwnershipIfOwner,
  __resetAutoPushOwnershipForTests,
} from '../../src/lib/autoPushOwnership.js'

// ---------------------------------------------------------------------------
// Cross-tab auto-push ownership: a single localStorage token gates who may
// AUTO-push. Two "tabs" are modelled as two module states sharing one
// localStorage but each with its OWN sessionStorage (per-tab tab id). We swap
// the sessionStorage global to simulate switching which tab is executing.
// ---------------------------------------------------------------------------

type StorageStub = {
  data: Map<string, string>
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const makeStorage = (): StorageStub => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

// One shared localStorage (cross-tab); a per-tab sessionStorage is installed per "tab".
let sharedLocal: StorageStub
// A controllable clock so staleness can be tested without real waiting. Date.now is used by
// the module; we override it here (unit tests run in Node where this is permitted).
let clockMs = 1_000_000
const originalDateNow = Date.now

// Install a window for a given "tab" — shared localStorage, that tab's own sessionStorage.
const activateTab = (session: StorageStub): void => {
  ;(globalThis as Record<string, unknown>).window = {
    localStorage: sharedLocal,
    sessionStorage: session,
  }
  // The module caches its tab id per module-load; reset so it re-reads THIS tab's session.
  __resetAutoPushOwnershipForTests()
}

beforeEach(() => {
  sharedLocal = makeStorage()
  clockMs = 1_000_000
  Date.now = () => clockMs
})

// Restore the real clock after the suite (each test re-stubs in beforeEach anyway).
test.after?.(() => { Date.now = originalDateNow })

// The account whose auto-push ownership is being contended in most tests.
const ACC = 'acc-X'

test('first tab claims an account\'s auto-push ownership and may push', () => {
  const tabA = makeStorage()
  activateTab(tabA)
  assert.equal(claimAutoPushOwnership(ACC), true)
})

test('a second live tab is denied the SAME account while the first holds a fresh claim', () => {
  const tabA = makeStorage()
  const tabB = makeStorage()
  // Tab A claims account X.
  activateTab(tabA)
  assert.equal(claimAutoPushOwnership(ACC), true)
  // Tab B, moments later, is denied X — A owns it and its stamp is fresh.
  clockMs += 1_000
  activateTab(tabB)
  assert.equal(claimAutoPushOwnership(ACC), false)
})

test('two tabs each own a DIFFERENT account without conflict', () => {
  const tabA = makeStorage()
  const tabB = makeStorage()
  // Tab A active-owns account X.
  activateTab(tabA)
  assert.equal(claimAutoPushOwnership('acc-X'), true)
  // Tab B active-owns account Y — a different account, so it is NOT blocked by A's X claim.
  clockMs += 1_000
  activateTab(tabB)
  assert.equal(claimAutoPushOwnership('acc-Y'), true)
  // And each still holds its own: A keeps X, B keeps Y (per-account tokens are independent).
  clockMs += 1_000
  activateTab(tabA)
  assert.equal(claimAutoPushOwnership('acc-X'), true)
  assert.equal(claimAutoPushOwnership('acc-Y'), false) // B owns Y
})

test('a stale owner (closed/frozen tab) is reclaimed after the TTL', () => {
  const tabA = makeStorage()
  const tabB = makeStorage()
  activateTab(tabA)
  assert.equal(claimAutoPushOwnership(ACC), true)
  // A goes away; B tries much later than the 30s TTL → reclaims.
  clockMs += 31_000
  activateTab(tabB)
  assert.equal(claimAutoPushOwnership(ACC), true)
  // Now A comes back but B holds a fresh claim → A is denied.
  clockMs += 1_000
  activateTab(tabA)
  assert.equal(claimAutoPushOwnership(ACC), false)
})

test('the owner keeps its claim across repeated pushes (the claim IS the heartbeat)', () => {
  const tabA = makeStorage()
  const tabB = makeStorage()
  activateTab(tabA)
  // A pushes every 20s for a while — each claim re-stamps, so it never goes stale.
  for (let i = 0; i < 5; i += 1) {
    assert.equal(claimAutoPushOwnership(ACC), true)
    clockMs += 20_000
  }
  // B checks 20s after A's last push — still within TTL → denied.
  activateTab(tabB)
  assert.equal(claimAutoPushOwnership(ACC), false)
})

test('refreshAutoPushOwnershipIfOwner refreshes an existing claim but never steals one', () => {
  const tabA = makeStorage()
  const tabB = makeStorage()
  activateTab(tabA)
  assert.equal(claimAutoPushOwnership(ACC), true)
  // B focusing does NOT steal ownership from a live A.
  clockMs += 1_000
  activateTab(tabB)
  assert.equal(refreshAutoPushOwnershipIfOwner(ACC), false)
  // A focusing refreshes its own claim (keeps it warm).
  clockMs += 1_000
  activateTab(tabA)
  assert.equal(refreshAutoPushOwnershipIfOwner(ACC), true)
  // The refresh pushed the stamp forward, so B is still denied even later.
  clockMs += 25_000
  activateTab(tabB)
  assert.equal(claimAutoPushOwnership(ACC), false)
})

test('storage-less environment (no sessionStorage) still gates within the tab', () => {
  // A window whose sessionStorage throws — the module falls back to a volatile tab id and
  // localStorage is also absent → claim always succeeds (single-tab degradation).
  ;(globalThis as Record<string, unknown>).window = {
    get localStorage(): StorageStub { throw new Error('blocked') },
    get sessionStorage(): StorageStub { throw new Error('blocked') },
  }
  __resetAutoPushOwnershipForTests()
  // With no persistence, there is no cross-tab token to deny against — auto-push proceeds
  // (correct: a lone storage-less tab must still auto-push).
  assert.equal(claimAutoPushOwnership(ACC), true)
})
