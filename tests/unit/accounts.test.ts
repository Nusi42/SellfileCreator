import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNTS_REGISTRY_KEY,
  ACCOUNT_SCOPED_BASE_KEYS,
  __resetAccountsForTests,
  bindHelperAccount,
  buildAccountRpcParams,
  classifyInboundAccountId,
  createAccount,
  deleteAccount,
  getAccounts,
  getActiveAccount,
  renameAccount,
  resolveAccountScopedKey,
  resolveAccountScopedKeyFor,
  stageAccountMergeCarry,
  switchAccount,
  takeAccountMergeCarry,
} from '../../src/lib/accounts.js'
import { __resetRuntimeConfigForTests } from '../../src/lib/runtimeConfig.js'

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
// URL param resolution (?account / ?accountName)
// ---------------------------------------------------------------------------

test('?account binds the sole unbound account and refreshes its name', () => {
  const storage = freshWindow('https://app.example/index.html?account=um123&accountName=Nasgor&simple')
  storage.setItem('sellfileCreator.autosave.sfc.v1', '["CRC",{}]')
  const active = getActiveAccount()
  // Auto-bind path: the legacy Default account adopts the helper id + decorative name.
  assert.equal(active.helperAccountId, 'um123')
  assert.equal(active.displayName, 'Nasgor')
  assert.equal(getAccounts().length, 1)
})

test('?account with an unknown id creates a fresh helper-origin account when no unbound candidate exists', () => {
  // First launch binds um1 to the default account…
  freshWindow('https://app.example/index.html?account=um1&accountName=Main')
  assert.equal(getActiveAccount().helperAccountId, 'um1')
  const registryJson = (globalThis as Record<string, unknown>).window as { localStorage: StorageStub }
  const persisted = registryJson.localStorage.getItem(ACCOUNTS_REGISTRY_KEY)!
  // …second launch with a different id must NOT steal the bound account.
  const storage2 = freshWindow('https://app.example/index.html?account=um2&accountName=Alt')
  storage2.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  const active = getActiveAccount()
  assert.equal(active.helperAccountId, 'um2')
  assert.equal(active.displayName, 'Alt')
  assert.equal(active.origin, 'helper')
  assert.equal(getAccounts().length, 2)
})

test('?account matching a bound account activates it without renaming a customized name', () => {
  freshWindow('https://app.example/index.html?account=um1&accountName=Main')
  renameAccount(getActiveAccount().id, 'My precious')
  const persisted = ((globalThis as Record<string, unknown>).window as { localStorage: StorageStub }).localStorage.getItem(ACCOUNTS_REGISTRY_KEY)!
  const storage2 = freshWindow('https://app.example/index.html?account=um1&accountName=RenamedInGame')
  storage2.setItem(ACCOUNTS_REGISTRY_KEY, persisted)
  const active = getActiveAccount()
  assert.equal(active.helperAccountId, 'um1')
  // nameCustomized blocks the ?accountName refresh permanently.
  assert.equal(active.displayName, 'My precious')
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

test('buildAccountRpcParams includes the helper id only when bound', () => {
  freshWindow()
  const active = getActiveAccount()
  // Unbound: name-only params keep the payload honest (no fabricated ids).
  assert.deepEqual(buildAccountRpcParams(), { accountName: active.displayName })
  bindHelperAccount(active.id, 'um42')
  assert.deepEqual(buildAccountRpcParams(), { accountId: 'um42', accountName: active.displayName })
})

test('classifyInboundAccountId: attribute / bind-on-first-stamp / match / mismatch', () => {
  freshWindow()
  const active = getActiveAccount()
  // No stamp → data is attributed to the active account (pre-stamping Helper).
  assert.equal(classifyInboundAccountId(undefined), 'attribute')
  // First stamped packet on a never-bound account adopts the id.
  assert.equal(classifyInboundAccountId('um7'), 'bound')
  assert.equal(getActiveAccount().helperAccountId, 'um7')
  // Subsequent stamps match; a different id is a mismatch (caller drops the packet).
  assert.equal(classifyInboundAccountId('um7'), 'match')
  assert.equal(classifyInboundAccountId('um8'), 'mismatch')
  assert.equal(getActiveAccount().id, active.id)
})

export const __accountsTestMarker = true
