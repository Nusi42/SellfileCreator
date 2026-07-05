import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNTS_REGISTRY_KEY,
  ACCOUNT_SCOPED_BASE_KEYS,
  __resetAccountsForTests,
  accountDisplayLabel,
  bindHelperAccount,
  buildAccountRpcParams,
  classifyInboundAccountStamp,
  createAccount,
  deleteAccount,
  findAccountByPlayerName,
  getAccounts,
  getActiveAccount,
  getUnstampedDefaultAccount,
  renameAccount,
  setAccountAccent,
  setAccountNameEllipsis,
  setUnstampedDefaultAccount,
  resolveAccountScopedKey,
  resolveAccountScopedKeyFor,
  switchAccount,
} from '../../src/lib/accounts.js'
import { __resetRuntimeConfigForTests, getSimpleMode, SIMPLE_MODE_SESSION_KEY } from '../../src/lib/runtimeConfig.js'
import { ACTIVE_ACCOUNT_SESSION_KEY } from '../../src/lib/activeAccountSession.js'

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

test('setAccountAccent sets, replaces, and clears the accent (undefined = none)', () => {
  freshWindow()
  const account = getActiveAccount()
  // Migration assigns a default palette accent; replacing and clearing both persist.
  setAccountAccent(account.id, '#123456')
  assert.equal(getActiveAccount().accentColor, '#123456')
  setAccountAccent(account.id, undefined)
  assert.equal(getActiveAccount().accentColor, undefined)
  // The cleared accent is DELETED from the persisted record, not stored as null.
  assert.equal('accentColor' in getActiveAccount(), false)
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
// RSL Helper protocol glue
// ---------------------------------------------------------------------------

test('buildAccountRpcParams includes each identity only when present', () => {
  freshWindow()
  const active = getActiveAccount()
  // Unbound: name-only params keep the payload honest (no fabricated ids).
  assert.deepEqual(buildAccountRpcParams(), { playerName: active.displayName })
  bindHelperAccount(active.id, 'um42')
  assert.deepEqual(buildAccountRpcParams(), { playerId: 'um42', playerName: active.displayName })
  // Names are optional — an empty name is no identity and is omitted like the id.
  renameAccount(active.id, '')
  assert.deepEqual(buildAccountRpcParams(), { playerId: 'um42' })
})

test('optional names: empty displayName, label fallback, and name routing guard', () => {
  freshWindow()
  // createAccount accepts an empty name (no more forced default).
  const nameless = createAccount('')
  assert.equal(nameless.displayName, '')
  // Label resolution: name → Player ID → '' (UI supplies the localized fallback).
  assert.equal(accountDisplayLabel(nameless), '')
  bindHelperAccount(nameless.id, 'um77')
  assert.equal(accountDisplayLabel(nameless), 'um77')
  renameAccount(nameless.id, 'Hero')
  assert.equal(accountDisplayLabel(getAccounts().find((a) => a.id === nameless.id)!), 'Hero')
  // Empty is never a name identity: no account is routable by ''.
  renameAccount(nameless.id, '')
  assert.equal(findAccountByPlayerName(''), null)
  // A nameless account SURVIVES a registry reload (sanitizeAccount must not drop '').
  __resetAccountsForTests()
  assert.ok(getAccounts().some((a) => a.id === nameless.id && a.displayName === ''))
})

test('setAccountNameEllipsis stores only the non-default side', () => {
  freshWindow()
  const account = getActiveAccount()
  // Default is left — stored as key absence.
  assert.equal(account.nameEllipsis, undefined)
  setAccountNameEllipsis(account.id, 'right')
  assert.equal(getActiveAccount().nameEllipsis, 'right')
  // 'right' survives a registry reload (sanitizeAccount must carry the field through).
  __resetAccountsForTests()
  assert.equal(getActiveAccount().nameEllipsis, 'right')
  setAccountNameEllipsis(account.id, 'left')
  assert.equal('nameEllipsis' in getActiveAccount(), false)
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

// ---------------------------------------------------------------------------
// Per-tab active account (sessionStorage) + registry lost-update merge
// ---------------------------------------------------------------------------

// Install a window that HAS a working sessionStorage, so the per-tab account marker
// persists (freshWindow deliberately omits it to exercise storage-less degradation).
// Returns both stores so tests can seed the registry and inspect the session marker.
const freshWindowWithSession = (
  href = 'https://app.example/index.html',
): { local: StorageStub; session: StorageStub } => {
  const local = makeStorage()
  const session = makeStorage()
  ;(globalThis as Record<string, unknown>).window = {
    localStorage: local,
    sessionStorage: session,
    location: { href },
    history: { state: null, replaceState: () => {} },
  }
  __resetRuntimeConfigForTests()
  __resetAccountsForTests()
  return { local, session }
}

test('boot pins the tab account to sessionStorage and a plain reload keeps it', () => {
  const { local, session } = freshWindowWithSession()
  local.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  const first = getActiveAccount()
  const second = createAccount('Alt')
  // Switching pins the tab marker so the reload lands on the new account.
  switchAccount(second.id)
  assert.equal(session.getItem(ACTIVE_ACCOUNT_SESSION_KEY), second.id)
  // Persist the registry across the "reload": same sessionStorage, fresh module state.
  const persisted = local.getItem(ACCOUNTS_REGISTRY_KEY)!
  __resetAccountsForTests()
  ;(globalThis as { window: { location: { href: string } } }).window.location.href = 'https://app.example/index.html'
  __resetRuntimeConfigForTests()
  local.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  // A plain reload (no launch param) rides the session marker → still the second account,
  // NOT whatever the registry default happens to be.
  assert.equal(getActiveAccount().id, second.id)
  assert.notEqual(second.id, first.id)
})

test('a launch param overrides the tab session marker (RSL Helper opens the app for an account)', () => {
  const { local, session } = freshWindowWithSession()
  // Seed two accounts; pin the tab to the first via the session marker.
  local.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  const first = getActiveAccount()
  const second = createAccount('Second')
  bindHelperAccount(second.id, 'um777')
  session.setItem(ACTIVE_ACCOUNT_SESSION_KEY, first.id)
  const persisted = local.getItem(ACCOUNTS_REGISTRY_KEY)!
  // Reopen the SAME tab (session marker intact) but WITH a launch param for the second
  // account — the launch param must win and re-point the tab.
  __resetAccountsForTests()
  ;(globalThis as { window: { location: { href: string } } }).window.location.href =
    'https://app.example/index.html?playerid=um777'
  __resetRuntimeConfigForTests()
  local.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  assert.equal(getActiveAccount().id, second.id)
  // The tab marker is updated to the launched account for subsequent plain reloads.
  assert.equal(session.getItem(ACTIVE_ACCOUNT_SESSION_KEY), second.id)
})

test('a fresh tab (no marker, no launch) boots to the registry last-used default', () => {
  const { local } = freshWindowWithSession()
  local.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  const first = getActiveAccount()
  const second = createAccount('Second')
  switchAccount(second.id)
  const persisted = local.getItem(ACCOUNTS_REGISTRY_KEY)!
  // A brand-new tab: fresh sessionStorage (no marker), no launch param.
  const { local: local2, session: session2 } = freshWindowWithSession()
  local2.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  // Boots to the last-used default the switch recorded (second), then pins its own marker.
  assert.equal(getActiveAccount().id, second.id)
  assert.equal(session2.getItem(ACTIVE_ACCOUNT_SESSION_KEY), second.id)
  assert.notEqual(second.id, first.id)
})

test('persistRegistry merges a concurrent account created by another tab (no lost update)', () => {
  const { local } = freshWindowWithSession()
  local.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  // This tab has [Default]. Simulate ANOTHER tab writing a registry that also contains a
  // freshly created account this tab's cache never saw.
  const mine = getActiveAccount()
  const otherTabRegistry = {
    activeAccountId: mine.id,
    accounts: [
      { id: mine.id, displayName: 'Default', origin: 'legacy', createdAt: '2020-01-01T00:00:00.000Z', lastActiveAt: '2020-01-01T00:00:00.000Z' },
      { id: 'zz-other', displayName: 'MadeByOtherTab', origin: 'manual', createdAt: '2020-01-02T00:00:00.000Z', lastActiveAt: '2020-01-02T00:00:00.000Z' },
    ],
  }
  local.setItem(ACCOUNTS_REGISTRY_KEY, JSON.stringify(otherTabRegistry))
  // Now THIS tab renames its own account and persists. A blind write would drop zz-other;
  // the re-read-merge must keep it.
  renameAccount(mine.id, 'RenamedHere')
  const merged = JSON.parse(local.getItem(ACCOUNTS_REGISTRY_KEY)!) as { accounts: { id: string; displayName: string }[] }
  const ids = merged.accounts.map((a) => a.id)
  assert.ok(ids.includes('zz-other'), 'concurrent account survived the merge')
  assert.equal(merged.accounts.find((a) => a.id === mine.id)?.displayName, 'RenamedHere')
})

test('deleteAccount drops its id even when another tab re-persisted it', () => {
  const { local } = freshWindowWithSession()
  local.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  const first = getActiveAccount()
  const doomed = createAccount('Doomed')
  // Another tab writes a registry that STILL contains the doomed account (a stale snapshot
  // racing our delete). The deletion intent must win over the merge re-add.
  const stale = {
    activeAccountId: first.id,
    accounts: [
      { id: first.id, displayName: 'Default', origin: 'legacy', createdAt: '2020-01-01T00:00:00.000Z', lastActiveAt: '2020-01-01T00:00:00.000Z' },
      { id: doomed.id, displayName: 'Doomed', origin: 'manual', createdAt: '2020-01-02T00:00:00.000Z', lastActiveAt: '2020-01-02T00:00:00.000Z' },
    ],
  }
  local.setItem(ACCOUNTS_REGISTRY_KEY, JSON.stringify(stale))
  deleteAccount(doomed.id)
  const after = JSON.parse(local.getItem(ACCOUNTS_REGISTRY_KEY)!) as { accounts: { id: string }[] }
  assert.equal(after.accounts.some((a) => a.id === doomed.id), false, 'deleted id stays deleted despite the racing re-add')
})

export const __accountsTestMarker = true
