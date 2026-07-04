/**
 * accounts.ts
 *
 * Multi-account registry + per-account localStorage partitioning (SSOT).
 *
 * Ownership model: one human, one machine, N game accounts. Documents and game data
 * partition per account; app look/behavior stays global. The registry itself is global.
 *
 * Two ids, deliberately decoupled:
 *  - `id`              — internal SFC id; immutable, generated, namespaces the storage keys.
 *  - `helperAccountId` — RSL Helper's stable per-game-account id (e.g. "account-d"),
 *                        a mutable *binding*. Bind/rebind never moves storage.
 *
 * Initialization is lazy: the first call that needs the registry runs (in order)
 * legacy migration → registry load → URL `?account`/`?accountName` resolution.
 * This makes module import order irrelevant — constants.ts can resolve scoped keys
 * at module scope and the migration is guaranteed to have run first.
 */
import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage'
import { getAccountIdParam, getAccountNameParam } from './runtimeConfig'

// ---------------------------------------------------------------------------
// Storage keys (all global — never account-scoped themselves)
// ---------------------------------------------------------------------------

// The registry document: { activeAccountId, accounts: SfcAccount[] }.
export const ACCOUNTS_REGISTRY_KEY = 'sellfileCreator.accounts.v1'
// One-shot carry for the shift-switch merge flow: written just before the reload,
// consumed (and removed) by the target account's session right after restore.
export const ACCOUNT_MERGE_CARRY_KEY = 'sellfileCreator.accountMergeCarry.v1'

// Every app key lives under this prefix; scoped keys are rewritten under the account prefix.
const APP_KEY_PREFIX = 'sellfileCreator.'
// Namespace root for per-account keys: sellfileCreator.acc.<id>.<rest-of-base-key>.
const ACCOUNT_KEY_PREFIX = 'sellfileCreator.acc.'

/**
 * SSOT: base keys that partition per account. Everything not listed stays global.
 * Rationale ("documents and game-account data are per-account; app look/behavior is global"):
 *  - the two autosave documents ARE the account's content (sellfile doc + gear queue),
 *  - restoreSelection refers to those autosaves,
 *  - builder user-defaults encode an account's gear strategy,
 *  - simple.variant (beginner/lategame/custom) tracks account progression,
 *  - rulesFilter state/sync hold filter *values* applied to the account's document
 *    (rulesFilter open/collapse are pure UI and stay global),
 *  - sellfile.autoPush is a per-game-account contract: each account decides whether
 *    its sellfile flows to RSL Helper automatically.
 */
export const ACCOUNT_SCOPED_BASE_KEYS: ReadonlySet<string> = new Set([
  'sellfileCreator.autosave.sfc.v1',
  'sellfileCreator.autosave.gearInspector.v1',
  'sellfileCreator.autosave.restoreSelection.v1',
  'sellfileCreator.builder.userDefaults.v1',
  'sellfileCreator.safeguardBuilder.userDefaults.v1',
  'sellfileCreator.simple.variant.v1',
  'sellfileCreator.rulesFilter.state.v3',
  'sellfileCreator.rulesFilter.sync.v1',
  'sellfileCreator.sellfile.autoPush.v1',
])

// Keys that are NOT scoped going forward but must still move into the first account's
// namespace during legacy migration, so older in-place migrations keep working there.
// autosave.sfr.v1 is the pre-rename sellfile autosave; useAutosaveRestore derives its key
// from AUTOSAVE_KEY by string-replace, so it looks *inside* the account namespace.
const LEGACY_MIGRATION_EXTRA_KEYS: readonly string[] = ['sellfileCreator.autosave.sfr.v1']

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// How an account came to exist — informational (shown in tooltips/debug), not behavioral.
export type SfcAccountOrigin = 'legacy' | 'helper' | 'manual'

export type SfcAccount = {
  // Internal SFC id. Immutable; storage namespace hangs off it.
  id: string
  // User-editable label shown everywhere in the UI.
  displayName: string
  // RSL Helper's per-game-account id when bound; absent for never-connected accounts.
  helperAccountId?: string
  // Per-account accent (hex) for at-a-glance identification; rendered through the
  // usual contrast-adaptation helpers at display time like other user colours.
  accentColor?: string
  // True once the user manually renamed the account — blocks ?accountName= refreshes.
  nameCustomized?: boolean
  origin: SfcAccountOrigin
  createdAt: string
  lastActiveAt: string
}

export type SfcAccountRegistry = {
  activeAccountId: string
  accounts: SfcAccount[]
}

// ---------------------------------------------------------------------------
// Default accents — distinct hues auto-assigned round-robin so differentiation
// works before anyone customizes anything. User-content colours (not theme tokens).
// ---------------------------------------------------------------------------

export const ACCOUNT_ACCENT_PALETTE: readonly string[] = [
  '#64b5f6', // blue
  '#81c784', // green
  '#ffb74d', // orange
  '#ba68c8', // purple
  '#4dd0e1', // cyan
  '#e57373', // red
  '#ffd54f', // yellow
  '#a1887f', // brown
]

// Pick the accent for the Nth created account (wraps around the palette).
export const pickDefaultAccent = (index: number): string =>
  ACCOUNT_ACCENT_PALETTE[((index % ACCOUNT_ACCENT_PALETTE.length) + ACCOUNT_ACCENT_PALETTE.length) % ACCOUNT_ACCENT_PALETTE.length]!

// ---------------------------------------------------------------------------
// Registry cache + change notification (React subscribes via state/useAccounts.ts)
// ---------------------------------------------------------------------------

let registryCache: SfcAccountRegistry | null = null
// Monotonic snapshot version so useSyncExternalStore gets a cheap referential signal.
let registryVersion = 0
const listeners = new Set<() => void>()

const notify = (): void => {
  registryVersion += 1
  for (const listener of listeners) listener()
}

// Subscribe to registry changes; returns the unsubscribe function.
export const subscribeAccounts = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Cheap version stamp for useSyncExternalStore getSnapshot.
export const getAccountsVersion = (): number => {
  ensureAccountsInitialized()
  return registryVersion
}

// ---------------------------------------------------------------------------
// Parsing / persistence
// ---------------------------------------------------------------------------

// Defensive record guard mirroring the store-level sanitization used elsewhere.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// Accept only well-formed accounts; a corrupt entry is dropped rather than crashing startup.
const sanitizeAccount = (value: unknown): SfcAccount | null => {
  if (!isRecord(value)) return null
  const { id, displayName, helperAccountId, accentColor, nameCustomized, origin, createdAt, lastActiveAt } = value
  if (typeof id !== 'string' || !id) return null
  if (typeof displayName !== 'string' || !displayName) return null
  // Unknown origins degrade to 'manual' so future origin tokens stay loadable.
  const safeOrigin: SfcAccountOrigin = origin === 'legacy' || origin === 'helper' ? origin : 'manual'
  return {
    id,
    displayName,
    ...(typeof helperAccountId === 'string' && helperAccountId ? { helperAccountId } : {}),
    ...(typeof accentColor === 'string' && accentColor ? { accentColor } : {}),
    ...(nameCustomized === true ? { nameCustomized: true } : {}),
    origin: safeOrigin,
    createdAt: typeof createdAt === 'string' ? createdAt : nowIso(),
    lastActiveAt: typeof lastActiveAt === 'string' ? lastActiveAt : nowIso(),
  }
}

// Parse the persisted registry; null when absent or unusable (triggers legacy migration).
const parseRegistry = (raw: string | null): SfcAccountRegistry | null => {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.accounts)) return null
    const accounts = parsed.accounts.map(sanitizeAccount).filter((a): a is SfcAccount => a !== null)
    // An empty registry is unusable — treat like absence so we recover with a fresh default.
    if (accounts.length === 0) return null
    const active = typeof parsed.activeAccountId === 'string' ? parsed.activeAccountId : ''
    // Clamp a dangling active id to the most recently used account.
    const activeAccountId = accounts.some((a) => a.id === active) ? active : mostRecent(accounts).id
    return { activeAccountId, accounts }
  } catch {
    return null
  }
}

const persistRegistry = (): void => {
  if (!registryCache) return
  safeSetItem(ACCOUNTS_REGISTRY_KEY, JSON.stringify(registryCache))
}

const nowIso = (): string => new Date().toISOString()

// Most recently active account — used when the active id dangles or gets deleted.
const mostRecent = (accounts: readonly SfcAccount[]): SfcAccount =>
  [...accounts].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))[0]!

// Random, collision-safe-enough internal id (registry-local uniqueness is re-checked).
const generateAccountId = (existing: readonly SfcAccount[]): string => {
  for (;;) {
    const candidate = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    if (!existing.some((a) => a.id === candidate)) return candidate
  }
}

// ---------------------------------------------------------------------------
// Key scoping
// ---------------------------------------------------------------------------

// Rewrite a scoped base key under the given account's namespace; global keys pass through.
const namespacedKey = (baseKey: string, accountId: string): string =>
  `${ACCOUNT_KEY_PREFIX}${accountId}.${baseKey.slice(APP_KEY_PREFIX.length)}`

/**
 * Resolve a storage key for the ACTIVE account. Scoped base keys (see
 * ACCOUNT_SCOPED_BASE_KEYS) come back namespaced; everything else is returned as-is.
 * Safe to call at module scope: the active account is fixed for the whole session
 * (switching accounts reloads the page), so a once-resolved key never goes stale.
 */
export const resolveAccountScopedKey = (baseKey: string): string => {
  if (!ACCOUNT_SCOPED_BASE_KEYS.has(baseKey)) return baseKey
  ensureAccountsInitialized()
  // registryCache is set by ensureAccountsInitialized; fall back to the raw key if
  // storage is unavailable (incognito file://) so the app still renders.
  return registryCache ? namespacedKey(baseKey, registryCache.activeAccountId) : baseKey
}

/**
 * Resolve a storage key for an EXPLICIT account (not necessarily the active one).
 * This is the public SSOT for the namespace formula — background flows that service
 * a non-active account (e.g. reading its autosave/auto-push preference to build and
 * push its sellfile on stamped inbound data) must use this instead of hand-rolling
 * `sellfileCreator.acc.<id>.…`. Global keys pass through unchanged, like above.
 */
export const resolveAccountScopedKeyFor = (accountId: string, baseKey: string): string => {
  if (!ACCOUNT_SCOPED_BASE_KEYS.has(baseKey)) return baseKey
  return namespacedKey(baseKey, accountId)
}

// ---------------------------------------------------------------------------
// Lazy initialization: migration → load → URL resolution
// ---------------------------------------------------------------------------

let initialized = false

// Move a key's value (if any) to its per-account location, deleting the source.
// Values move verbatim — CRC-wrapped autosaves stay valid because the payload is untouched.
const moveKeyIntoNamespace = (baseKey: string, accountId: string): void => {
  const value = safeGetItem(baseKey)
  if (value === null) return
  safeSetItem(namespacedKey(baseKey, accountId), value)
  safeRemoveItem(baseKey)
}

// Fixed id for the migration-created first account. Deterministic on purpose: key
// resolution must agree across processes that never share a registry — most notably the
// Playwright runner, which imports constants.ts in Node (in-memory registry there) and
// seeds storage keys for the browser (fresh registry there). Both migrations yield this
// same id, so a Node-resolved AUTOSAVE_KEY matches what the browser app reads. Later
// accounts get random ids; uniqueness is registry-local, so the shared constant is safe.
const LEGACY_ACCOUNT_ID = 'default'

// First-run migration: wrap all pre-account data into a single "Default" account.
// Registry existence is itself the migration marker — no separate flag key.
const migrateLegacyStorage = (): SfcAccountRegistry => {
  const account: SfcAccount = {
    id: LEGACY_ACCOUNT_ID,
    displayName: 'Default',
    accentColor: pickDefaultAccent(0),
    origin: 'legacy',
    createdAt: nowIso(),
    lastActiveAt: nowIso(),
  }
  // Move every scoped key plus the legacy-only extras (old autosave.sfr) into the namespace.
  for (const baseKey of ACCOUNT_SCOPED_BASE_KEYS) moveKeyIntoNamespace(baseKey, account.id)
  for (const baseKey of LEGACY_MIGRATION_EXTRA_KEYS) moveKeyIntoNamespace(baseKey, account.id)
  return { activeAccountId: account.id, accounts: [account] }
}

// Strip the one-shot account params from the address bar (mirrors the ?endpoint pattern in
// App.tsx) so reloads and copied URLs don't replay a stale account selection.
const stripAccountParamsFromUrl = (): void => {
  if (typeof window === 'undefined') return
  try {
    const cleanUrl = new URL(window.location.href)
    if (!cleanUrl.searchParams.has('account') && !cleanUrl.searchParams.has('accountName')) return
    cleanUrl.searchParams.delete('account')
    cleanUrl.searchParams.delete('accountName')
    window.history.replaceState(window.history.state, '', cleanUrl.toString())
  } catch {
    // history/URL access can fail on exotic embeds — the param is harmless if it stays.
  }
}

/**
 * Resolve the ?account launch param against the registry:
 *  1. id matches a bound account            → activate it,
 *  2. id unknown + exactly one unbound acct → bind that account (the merge/reuse path
 *     that folds legacy data into the user's helper account on first launch),
 *  3. otherwise                             → create a fresh helper-origin account.
 * ?accountName additionally refreshes a bound account's label unless the user renamed it.
 */
const resolveHelperLaunchParam = (registry: SfcAccountRegistry): void => {
  const helperId = getAccountIdParam()
  if (!helperId) return
  const helperName = getAccountNameParam()
  let target = registry.accounts.find((a) => a.helperAccountId === helperId)
  if (!target) {
    const unbound = registry.accounts.filter((a) => !a.helperAccountId)
    if (unbound.length === 1) {
      // Auto-bind the sole unbound account — silent merge of pre-account data.
      // `origin` is left as-is: it records how the account was CREATED, not how it was bound.
      target = unbound[0]!
      target.helperAccountId = helperId
    } else {
      // No unambiguous candidate: a fresh, empty account for this game account.
      target = {
        id: generateAccountId(registry.accounts),
        displayName: helperName ?? helperId,
        helperAccountId: helperId,
        accentColor: pickDefaultAccent(registry.accounts.length),
        origin: 'helper',
        createdAt: nowIso(),
        lastActiveAt: nowIso(),
      }
      registry.accounts.push(target)
    }
  }
  // Refresh the decorative label from the helper unless the user customized it.
  if (helperName && !target.nameCustomized && target.displayName !== helperName) {
    target.displayName = helperName
  }
  registry.activeAccountId = target.id
}

// Run-once bootstrap; every public API funnels through here.
export const ensureAccountsInitialized = (): void => {
  if (initialized) return
  initialized = true
  // Load or migrate. A throwing/absent storage yields a volatile in-memory registry —
  // persistence degrades but the session still works (matches safeStorage's contract).
  registryCache = parseRegistry(safeGetItem(ACCOUNTS_REGISTRY_KEY)) ?? migrateLegacyStorage()
  // Apply the launch param, stamp activity, persist, and clean the address bar.
  resolveHelperLaunchParam(registryCache)
  const active = registryCache.accounts.find((a) => a.id === registryCache!.activeAccountId)
  if (active) active.lastActiveAt = nowIso()
  persistRegistry()
  stripAccountParamsFromUrl()
}

// Test-only: reset module state so unit tests can exercise migration repeatedly.
export const __resetAccountsForTests = (): void => {
  initialized = false
  registryCache = null
  registryVersion = 0
  listeners.clear()
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

export const getAccountRegistry = (): SfcAccountRegistry => {
  ensureAccountsInitialized()
  // Non-null: ensureAccountsInitialized always seeds a registry (possibly in-memory only).
  return registryCache!
}

export const getAccounts = (): readonly SfcAccount[] => getAccountRegistry().accounts

export const getActiveAccount = (): SfcAccount => {
  const registry = getAccountRegistry()
  // Registry invariants guarantee the active id resolves; fall back defensively anyway.
  return registry.accounts.find((a) => a.id === registry.activeAccountId) ?? mostRecent(registry.accounts)
}

// ---------------------------------------------------------------------------
// Mutation API (all persist + notify; callers reload where noted)
// ---------------------------------------------------------------------------

export const createAccount = (displayName: string): SfcAccount => {
  const registry = getAccountRegistry()
  const account: SfcAccount = {
    id: generateAccountId(registry.accounts),
    // Empty names fall back to a stable default; the rename dialog enforces non-empty too.
    displayName: displayName.trim() || 'New account',
    accentColor: pickDefaultAccent(registry.accounts.length),
    origin: 'manual',
    createdAt: nowIso(),
    lastActiveAt: nowIso(),
  }
  registry.accounts.push(account)
  persistRegistry()
  notify()
  return account
}

export const renameAccount = (id: string, displayName: string): void => {
  const account = getAccountRegistry().accounts.find((a) => a.id === id)
  const trimmed = displayName.trim()
  if (!account || !trimmed || account.displayName === trimmed) return
  account.displayName = trimmed
  // A manual rename wins over future ?accountName= refreshes permanently.
  account.nameCustomized = true
  persistRegistry()
  notify()
}

export const setAccountAccent = (id: string, accentColor: string): void => {
  const account = getAccountRegistry().accounts.find((a) => a.id === id)
  if (!account || account.accentColor === accentColor) return
  account.accentColor = accentColor
  persistRegistry()
  notify()
}

// Bind (or rebind) an account to a helper id, releasing the id from any other account
// first so a helper id never points at two SFC accounts. Pass undefined to unbind.
export const bindHelperAccount = (id: string, helperAccountId: string | undefined): void => {
  const registry = getAccountRegistry()
  const account = registry.accounts.find((a) => a.id === id)
  if (!account) return
  if (helperAccountId) {
    for (const other of registry.accounts) {
      if (other.id !== id && other.helperAccountId === helperAccountId) delete other.helperAccountId
    }
    account.helperAccountId = helperAccountId
  } else {
    delete account.helperAccountId
  }
  persistRegistry()
  notify()
}

/**
 * Delete an account and every `sellfileCreator.acc.<id>.*` key it owns.
 * Refuses to delete the last remaining account. Deleting the active account
 * activates the most recently used survivor; the CALLER must reload afterwards
 * (all in-memory stores still hold the deleted account's session state).
 * Returns true when a reload is required (the active account changed).
 */
export const deleteAccount = (id: string): boolean => {
  const registry = getAccountRegistry()
  if (registry.accounts.length <= 1) return false
  const index = registry.accounts.findIndex((a) => a.id === id)
  if (index < 0) return false
  registry.accounts.splice(index, 1)
  // Sweep the whole per-account namespace; enumerate defensively (storage may throw).
  try {
    const prefix = `${ACCOUNT_KEY_PREFIX}${id}.`
    const doomed: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(prefix)) doomed.push(key)
    }
    for (const key of doomed) safeRemoveItem(key)
  } catch {
    // Storage unavailable — registry entry is gone either way; orphans are harmless.
  }
  const wasActive = registry.activeAccountId === id
  if (wasActive) registry.activeAccountId = mostRecent(registry.accounts).id
  persistRegistry()
  notify()
  return wasActive
}

/**
 * Make another account active. Only writes the registry — the CALLER performs the
 * `location.reload()`. A full reload is deliberate: dozens of stores, the autosave
 * debouncers, and the WASM pipeline all assume one document per session, so an
 * in-place swap could bleed state across accounts.
 */
export const switchAccount = (id: string): void => {
  const registry = getAccountRegistry()
  const account = registry.accounts.find((a) => a.id === id)
  if (!account || registry.activeAccountId === id) return
  registry.activeAccountId = id
  account.lastActiveAt = nowIso()
  persistRegistry()
  notify()
}

// ---------------------------------------------------------------------------
// Shift-switch merge carry (one-shot, global key)
// ---------------------------------------------------------------------------

export type AccountMergeCarry = {
  // Display name of the SOURCE account, used to label the import dialog.
  fromDisplayName: string
  // The source document serialized with the regular .sfc writer — the target session
  // re-parses it with the regular reader, so both sides share the file-format SSOT.
  sfcText: string
}

// Stage the carry just before switching; consumed exactly once after the reload.
export const stageAccountMergeCarry = (carry: AccountMergeCarry): void => {
  safeSetItem(ACCOUNT_MERGE_CARRY_KEY, JSON.stringify(carry))
}

// Read-and-clear the staged carry (null when none). Clearing first makes the flow
// crash-safe: a failed import never replays on the next launch.
export const takeAccountMergeCarry = (): AccountMergeCarry | null => {
  const raw = safeGetItem(ACCOUNT_MERGE_CARRY_KEY)
  if (!raw) return null
  safeRemoveItem(ACCOUNT_MERGE_CARRY_KEY)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const { fromDisplayName, sfcText } = parsed
    if (typeof fromDisplayName !== 'string' || typeof sfcText !== 'string' || !sfcText) return null
    return { fromDisplayName, sfcText }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// RSL Helper protocol glue
// ---------------------------------------------------------------------------

// Params stamped onto every outbound JSON-RPC request. RSL Helper ignores unknown params
// today (confirmed harmless); once it consumes them it can route sellfiles per account.
export type AccountRpcParams = {
  // Helper's own id — only present when the active account is bound.
  accountId?: string
  // SFC's display label; always present for context/debugging on the Helper side.
  accountName: string
}

export const buildAccountRpcParams = (): AccountRpcParams => {
  const active = getActiveAccount()
  return {
    ...(active.helperAccountId ? { accountId: active.helperAccountId } : {}),
    accountName: active.displayName,
  }
}

// Verdicts for an inbound packet's (optional) accountId — see classifyInboundAccountId.
export type InboundAccountVerdict = 'attribute' | 'match' | 'bound' | 'mismatch'

/**
 * Classify an inbound packet's accountId against the active account:
 *  - absent            → 'attribute' (pre-stamping Helper: data belongs to the active account),
 *  - equals binding    → 'match',
 *  - active unbound    → bind it now and report 'bound' (the data stream proves ownership),
 *  - differs           → 'mismatch' (caller drops the packet and surfaces a toast — data from
 *                        account A must never merge into account B's inspector).
 */
export const classifyInboundAccountId = (incoming: string | undefined | null): InboundAccountVerdict => {
  if (!incoming) return 'attribute'
  const active = getActiveAccount()
  if (!active.helperAccountId) {
    bindHelperAccount(active.id, incoming)
    return 'bound'
  }
  return active.helperAccountId === incoming ? 'match' : 'mismatch'
}
