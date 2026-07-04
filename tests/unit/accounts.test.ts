import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNTS_REGISTRY_KEY,
  ACCOUNT_SCOPED_BASE_KEYS,
  __resetAccountsForTests,
  bindHelperAccount,
  buildAccountRpcParams,
  classifyInboundAccountStamp,
  createAccount,
  deleteAccount,
  getAccounts,
  getActiveAccount,
  getUnstampedDefaultAccount,
  renameAccount,
  setUnstampedDefaultAccount,
  resolveAccountScopedKey,
  resolveAccountScopedKeyFor,
  stageAccountMergeCarry,
  switchAccount,
  takeAccountMergeCarry,
} from '../../src/lib/accounts.js'
import { __resetRuntimeConfigForTests, getSimpleMode, SIMPLE_MODE_SESSION_KEY } from '../../src/lib/runtimeConfig.js'

// ---------------------------------------------------------------------------
// Minimal browser-global stubs: a Map-backed localStorage plus the location and
// history members the account bootstrap touches (URL resolution + param strip).
// ---------------------------------------------------------------------------

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

// Install fresh window/localStorage globals and reset both module caches so each
// test runs the full lazy bootstrap (migration → load → URL resolution) again.
const freshWindow = (href = 'https://app.example/index.html'): StorageStub => {
  const storage = makeStorage()
  ;(globalThis as Record<string, unknown>).window = {
    localStorage: storage,
    location: { href },
    history: { state: null, replaceState: () => {} },
  }
  __resetRuntimeConfigForTests()
  __resetAccountsForTests()
  return storage
}

beforeEach(() => { freshWindow() })

// ---------------------------------------------------------------------------
// Legacy migration + key scoping
// ---------------------------------------------------------------------------

test('legacy migration wraps pre-account keys into a Default account namespace', () => {
  const storage = freshWindow()
  // Seed pre-account data: one scoped key plus the legacy sfr autosave extra.
  storage.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{"doc":1}]')
  storage.setItem('sellfileCreator.autosave.sfr.v1', '["CRC",{"old":1}]')
  storage.setItem('sellfileCreator.lang.v1', '"de-DE"')

  const resolved = resolveAccountScopedKey('sellfileCreator.autosave.sfc.v1')
  const active = getActiveAccount()
  // The scoped key now lives under the generated account's namespace…
  assert.equal(resolved, `sellfileCreator.acc.${active.id}.autosave.sfc.v1`)
  assert.equal(storage.getItem(resolved), '["CRC",{"doc":1}]')
  // …the source keys are gone (moved, not copied)…
  assert.equal(storage.getItem('sellfileCreator.autosave.sfc.v1'), null)
  assert.equal(storage.getItem('sellfileCreator.autosave.sfr.v1'), null)
  // …the legacy sfr extra moved too (the in-place sfr→sfc migration derives its key
  // from the namespaced autosave key, so it must find the old data inside the namespace)…
  assert.equal(storage.getItem(`sellfileCreator.acc.${active.id}.autosave.sfr.v1`), '["CRC",{"old":1}]')
  // …while global keys are untouched and pass through the resolver unchanged.
  assert.equal(storage.getItem('sellfileCreator.lang.v1'), '"de-DE"')
  assert.equal(resolveAccountScopedKey('sellfileCreator.lang.v1'), 'sellfileCreator.lang.v1')
  // The migrated account is the registry's single legacy-origin entry with the FIXED id —
  // deterministic so key resolution agrees across processes (see LEGACY_ACCOUNT_ID),
  // which is what lets Playwright specs seed account-scoped keys from Node.
  assert.equal(getAccounts().length, 1)
  assert.equal(active.id, 'default')
  assert.equal(active.origin, 'legacy')
  assert.equal(active.displayName, 'Default')
  // The migrated account starts flagged as the unstamped-data receiver, so pre-stamping
  // RSL Helper data stays with the original data set even after more accounts exist.
  assert.equal(active.unstampedDefault, true)
  assert.equal(getUnstampedDefaultAccount()?.id, active.id)
})

test('every declared scoped key resolves into the active account namespace', () => {
  freshWindow()
  const active = getActiveAccount()
  for (const baseKey of ACCOUNT_SCOPED_BASE_KEYS) {
    const resolved = resolveAccountScopedKey(baseKey)
    // sellfileCreator.<rest> → sellfileCreator.acc.<id>.<rest>, keeping the .vN tail intact.
    assert.equal(resolved, `sellfileCreator.acc.${active.id}.${baseKey.slice('sellfileCreator.'.length)}`)
    // The explicit-account resolver is the same formula (public SSOT for background flows).
    assert.equal(resolveAccountScopedKeyFor(active.id, baseKey), resolved)
  }
})

// ---------------------------------------------------------------------------
// URL param resolution (?playerid / ?playerName)
// ---------------------------------------------------------------------------

test('?playerid binds the sole unbound account and refreshes its name', () => {
  const storage = freshWindow('https://app.example/index.html?playerid=um123&playerName=MainHero&simple')
  storage.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  const active = getActiveAccount()
  // Auto-bind path: the legacy Default account adopts the helper id + decorative name.
  assert.equal(active.helperAccountId, 'um123')
  assert.equal(active.displayName, 'MainHero')
  assert.equal(getAccounts().length, 1)
})

test('?playerName percent-decodes special characters via URLSearchParams', () => {
  const storage = freshWindow('https://app.example/index.html?playerid=um1&playerName=My%20Name%20%26%20Co%3F')
  storage.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  // Encoded space, ampersand, and question mark all round-trip into the display name.
  assert.equal(getActiveAccount().displayName, 'My Name & Co?')
})

test('?playerid with an unknown id creates a fresh helper-origin account when no unbound candidate exists', () => {
  // First launch binds um1 to the default account…
  freshWindow('https://app.example/index.html?playerid=um1&playerName=Main')
  assert.equal(getActiveAccount().helperAccountId, 'um1')
  const registryJson = (globalThis as Record<string, unknown>).window as { localStorage: StorageStub }
  const persisted = registryJson.localStorage.getItem(ACCOUNTS_REGISTRY_KEY)!
  // …second launch with a different id must NOT steal the bound account.
  const storage2 = freshWindow('https://app.example/index.html?playerid=um2&playerName=Alt')
  storage2.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  const active = getActiveAccount()
  assert.equal(active.helperAccountId, 'um2')
  assert.equal(active.displayName, 'Alt')
  assert.equal(active.origin, 'helper')
  assert.equal(getAccounts().length, 2)
})

test('?playerid matching a bound account follows in-game renames (game name is authoritative)', () => {
  freshWindow('https://app.example/index.html?playerid=um1&playerName=Main')
  // Even a manual SFC rename is only a pre-seed: the next identified launch corrects it.
  renameAccount(getActiveAccount().id, 'My precious')
  const persisted = ((globalThis as Record<string, unknown>).window as { localStorage: StorageStub }).localStorage.getItem(ACCOUNTS_REGISTRY_KEY)!
  const storage2 = freshWindow('https://app.example/index.html?playerid=um1&playerName=RenamedInGame')
  storage2.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  const active = getActiveAccount()
  assert.equal(active.helperAccountId, 'um1')
  // The Player ID identified the account; the changed player name propagates in.
  assert.equal(active.displayName, 'RenamedInGame')
})

// ---------------------------------------------------------------------------
// Registry mutations
// ---------------------------------------------------------------------------

test('create / switch / rename / delete round-trip', () => {
  const storage = freshWindow()
  storage.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  const first = getActiveAccount()
  const second = createAccount('Alt account')
  assert.equal(getAccounts().length, 2)
  // Switch writes the registry; the caller performs the reload.
  switchAccount(second.id)
  assert.equal(getActiveAccount().id, second.id)
  renameAccount(second.id, 'Alt renamed')
  assert.equal(getActiveAccount().displayName, 'Alt renamed')
  // Deleting the active account sweeps its namespace and reactivates the survivor.
  storage.setItem(`sellfileCreator.acc.${second.id}.autosave.sfc.v1`, '["CRC",{}]')
  const needsReload = deleteAccount(second.id)
  assert.equal(needsReload, true)
  assert.equal(getActiveAccount().id, first.id)
  assert.equal(storage.getItem(`sellfileCreator.acc.${second.id}.autosave.sfc.v1`), null)
  // The last remaining account is protected from deletion.
  assert.equal(deleteAccount(first.id), false)
  assert.equal(getAccounts().length, 1)
})

test('setUnstampedDefaultAccount enforces radio semantics and persists', () => {
  freshWindow()
  const first = getActiveAccount()
  const second = createAccount('Alt')
  // Flag the first account, then move the flag — only ever ONE flagged account.
  setUnstampedDefaultAccount(first.id)
  assert.equal(getUnstampedDefaultAccount()?.id, first.id)
  setUnstampedDefaultAccount(second.id)
  assert.equal(getUnstampedDefaultAccount()?.id, second.id)
  assert.equal(getAccounts().filter((a) => a.unstampedDefault === true).length, 1)
  // Clearing with null leaves no flagged account (unstamped data → active account).
  setUnstampedDefaultAccount(null)
  assert.equal(getUnstampedDefaultAccount(), null)
})

test('bindHelperAccount moves an id between accounts instead of duplicating it', () => {
  freshWindow()
  const first = getActiveAccount()
  const second = createAccount('Alt')
  bindHelperAccount(first.id, 'um9')
  // Rebinding to another account must release the id from the first one.
  bindHelperAccount(second.id, 'um9')
  assert.equal(getAccounts().find((a) => a.id === first.id)?.helperAccountId, undefined)
  assert.equal(getAccounts().find((a) => a.id === second.id)?.helperAccountId, 'um9')
  // Unbind clears without touching anything else.
  bindHelperAccount(second.id, undefined)
  assert.equal(getAccounts().find((a) => a.id === second.id)?.helperAccountId, undefined)
})

// ---------------------------------------------------------------------------
// Merge carry + protocol glue
// ---------------------------------------------------------------------------

test('merge carry is one-shot: staged once, taken once, gone after', () => {
  freshWindow()
  stageAccountMergeCarry({ fromDisplayName: 'Default', sfcText: '{"Version":"1"}' })
  const carry = takeAccountMergeCarry()
  assert.deepEqual(carry, { fromDisplayName: 'Default', sfcText: '{"Version":"1"}' })
  // Read-and-clear: a second take (e.g. after a crash loop) must find nothing.
  assert.equal(takeAccountMergeCarry(), null)
})

test('buildAccountRpcParams includes the Player ID only when bound', () => {
  freshWindow()
  const active = getActiveAccount()
  // Unbound: name-only params keep the payload honest (no fabricated ids).
  assert.deepEqual(buildAccountRpcParams(), { playerName: active.displayName })
  bindHelperAccount(active.id, 'um42')
  assert.deepEqual(buildAccountRpcParams(), { playerId: 'um42', playerName: active.displayName })
})

test('classifyInboundAccountStamp: attribute / bind-on-first-stamp / match / mismatch', () => {
  freshWindow()
  const active = getActiveAccount()
  // No stamp → data is attributed to the active account (pre-stamping Helper).
  assert.equal(classifyInboundAccountStamp({}), 'attribute')
  // First stamped packet on a never-bound account adopts the full identity —
  // the player name lands directly in displayName (there is no second name).
  assert.equal(classifyInboundAccountStamp({ playerId: 'um7', playerName: 'Hero' }), 'bound')
  assert.equal(getActiveAccount().helperAccountId, 'um7')
  assert.equal(getActiveAccount().displayName, 'Hero')
  // Subsequent stamps match; an id-matched stream with a NEW name is an in-game
  // rename — the account data follows the game.
  assert.equal(classifyInboundAccountStamp({ playerId: 'um7' }), 'match')
  assert.equal(classifyInboundAccountStamp({ playerId: 'um7', playerName: 'Hero2' }), 'match')
  assert.equal(getActiveAccount().displayName, 'Hero2')
  assert.equal(classifyInboundAccountStamp({ playerId: 'um8' }), 'mismatch')
  assert.equal(getActiveAccount().id, active.id)
})

test('classifyInboundAccountStamp: name-only stamps are a full identity', () => {
  freshWindow()
  // First name stamp on a never-claimed account proves ownership (and names it).
  assert.equal(classifyInboundAccountStamp({ playerName: 'Hero' }), 'bound')
  assert.equal(getActiveAccount().displayName, 'Hero')
  assert.equal(classifyInboundAccountStamp({ playerName: 'Hero' }), 'match')
  // A name identifying ANOTHER account is a mismatch (routes to the background service).
  const other = createAccount('AltHero')
  assert.equal(classifyInboundAccountStamp({ playerName: 'AltHero' }), 'mismatch')
  // A name nobody owns while the active account already has one is a mismatch too.
  assert.equal(classifyInboundAccountStamp({ playerName: 'Stranger' }), 'mismatch')
  assert.ok(other)
})

test('?simple strips from the URL only after the session marker persists, and survives reloads', () => {
  // Window stub with a WORKING sessionStorage plus a replaceState recorder.
  const storage = makeStorage()
  const session = makeStorage()
  const replaced: string[] = []
  ;(globalThis as Record<string, unknown>).window = {
    localStorage: storage,
    sessionStorage: session,
    location: { href: 'https://app.example/index.html?playerid=um1&playerName=Main&simple' },
    history: { state: null, replaceState: (_s: unknown, _t: unknown, url: string) => { replaced.push(url) } },
  }
  __resetRuntimeConfigForTests()
  __resetAccountsForTests()
  assert.equal(getSimpleMode(), true)
  // Triggering the bootstrap consumes and strips ALL one-shot launch params.
  getActiveAccount()
  assert.equal(replaced[replaced.length - 1], 'https://app.example/index.html')
  assert.equal(session.getItem(SIMPLE_MODE_SESSION_KEY), '1')
  // A same-tab reload (fresh config, same sessionStorage) stays in simple mode.
  ;(globalThis as { window: { location: { href: string } } }).window.location.href = 'https://app.example/index.html'
  __resetRuntimeConfigForTests()
  assert.equal(getSimpleMode(), true)
})

test('?simple stays in the URL when sessionStorage is unavailable', () => {
  // A window WITHOUT sessionStorage → the stash fails → the param must survive as the
  // reload carrier (stripping it would silently exit simple mode on F5).
  const storage = makeStorage()
  const replaced: string[] = []
  ;(globalThis as Record<string, unknown>).window = {
    localStorage: storage,
    location: { href: 'https://app.example/index.html?playerid=um1&simple' },
    history: { state: null, replaceState: (_s: unknown, _t: unknown, url: string) => { replaced.push(url) } },
  }
  __resetRuntimeConfigForTests()
  __resetAccountsForTests()
  getActiveAccount()
  // playerid is stripped regardless; simple remains (URLSearchParams may re-serialize the
  // bare flag as `simple=`, which the reader accepts — compare params, not raw strings).
  const rewritten = new URL(replaced[replaced.length - 1]!)
  assert.equal(rewritten.searchParams.has('playerid'), false)
  assert.equal(rewritten.searchParams.has('simple'), true)
})

test('name-only launches route consistently, including after mixed usage', () => {
  // A name-only launch creates a helper-origin account carrying the name identity.
  freshWindow('https://app.example/index.html?playerid=um9&playerName=Hero')
  const first = getActiveAccount()
  assert.equal(first.helperAccountId, 'um9')
  assert.equal(first.displayName, 'Hero')
  const persisted = ((globalThis as Record<string, unknown>).window as { localStorage: StorageStub }).localStorage.getItem(ACCOUNTS_REGISTRY_KEY)!
  // A later NAME-ONLY launch resolves to the same account (mixed usage stays consistent).
  const storage2 = freshWindow('https://app.example/index.html?playerName=Hero')
  storage2.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  assert.equal(getActiveAccount().id, first.id)
  // An UNKNOWN name (the sole existing account is already claimed) creates a fresh
  // helper-origin account instead of re-claiming — the helperBound guard at work.
  const storage3 = freshWindow('https://app.example/index.html?playerName=Default')
  storage3.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  const resolved = getActiveAccount()
  assert.equal(resolved.displayName, 'Default')
  assert.notEqual(resolved.id, first.id)
  // …and the new account is itself marked helper-bound.
  assert.equal(resolved.helperBound, true)
})

export const __accountsTestMarker = true
