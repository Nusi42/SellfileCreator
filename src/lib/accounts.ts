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
 *  - `helperAccountId` — RSL Helper's stable per-game-account id (e.g. "um12345678"),
 *                        a mutable *binding*. Bind/rebind never moves storage.
 *
 * Initialization is lazy: the first call that needs the registry runs (in order)
 * legacy migration → registry load → URL `?playerid`/`?playerName` resolution.
 * This makes module import order irrelevant — constants.ts can resolve scoped keys
 * at module scope and the migration is guaranteed to have run first.
 */
import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage'
import { getPlayerIdParam, getPlayerNameParam, stashSimpleModeForSession } from './runtimeConfig'

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
 *    its sellfile flows to RSL Helper automatically,
 *  - sellfile.lastPush records each account's last successful upload (menu summary).
 */
// Base keys the background account-push flow rebases onto OTHER accounts — exported so
// that flow never restates the literals (resolveAccountScopedKeyFor takes these).
export const ACCOUNT_BASE_KEY_AUTOSAVE_SFC = 'sellfileCreator.autosave.sfc.v1'
export const ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR = 'sellfileCreator.autosave.gearInspector.v1'
export const ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH = 'sellfileCreator.sellfile.autoPush.v1'
// Last SUCCESSFUL sellfile upload to RSL Helper (ISO timestamp) — per account because
// both the foreground push (active account) and the background push (any account) write it.
export const ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH = 'sellfileCreator.sellfile.lastPush.v1'
// Last FAILED background push (ISO timestamp). Background outcomes are toast-free — the
// switcher list surfaces this marker instead; any later successful push clears it.
export const ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_ERROR = 'sellfileCreator.sellfile.lastPushError.v1'
// Tiny stats snapshot (generated-rule count + gear sell/keep outcome summary) the LIVE
// session writes for its own account — pipeline results are not derivable from autosaves
// at menu-open cost, so the switcher's summary lines read this instead.
export const ACCOUNT_BASE_KEY_ACCOUNT_STATS = 'sellfileCreator.accountStats.v1'
// Whether REAL endpoint gear data persists into the account's gearInspector autosave
// (perf/sanity toggle, default ON) — per account: each game account decides how much
// storage its inventory may occupy on this device.
export const ACCOUNT_BASE_KEY_GEAR_DB_PERSIST_ENDPOINT_GEAR = 'sellfileCreator.gearDb.persistEndpointGear.v1'

export const ACCOUNT_SCOPED_BASE_KEYS: ReadonlySet<string> = new Set([
  ACCOUNT_BASE_KEY_AUTOSAVE_SFC,
  ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR,
  'sellfileCreator.autosave.restoreSelection.v1',
  'sellfileCreator.builder.userDefaults.v1',
  'sellfileCreator.safeguardBuilder.userDefaults.v1',
  'sellfileCreator.simple.variant.v1',
  'sellfileCreator.rulesFilter.state.v3',
  'sellfileCreator.rulesFilter.sync.v1',
  ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH,
  ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH,
  ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_ERROR,
  ACCOUNT_BASE_KEY_ACCOUNT_STATS,
  ACCOUNT_BASE_KEY_GEAR_DB_PERSIST_ENDPOINT_GEAR,
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
  // THE account name — by definition the player's name in the game. Editable in the
  // manager (mainly to pre-seed accounts before RSL Helper identifies them), used as the
  // name identity for routing, and ALWAYS refreshed when RSL Helper sends a playerName
  // (in-game renames propagate here; the game is authoritative, there is no second name).
  // NOT required: may be '' — UI labels then fall back via accountDisplayLabel.
  displayName: string
  // Which side long names ellipsize on in the switcher button; absent = 'left'
  // (the END of the name stays visible). Stored only when 'right' is chosen.
  nameEllipsis?: 'left' | 'right'
  // The game's Player ID when bound. Permanent and unique — the primary identity.
  helperAccountId?: string
  // True once ANY helper identity (id or name) was adopted. Guards the sole-unbound
  // auto-bind: a name-only launch claims the legacy account exactly once, so a second,
  // different name-only launch creates a fresh account instead of re-claiming it.
  helperBound?: boolean
  // Per-account accent (hex) for at-a-glance identification; rendered through the
  // usual contrast-adaptation helpers at display time like other user colours.
  accentColor?: string
  // At most ONE account carries this flag (radio semantics via setUnstampedDefaultAccount):
  // endpoint data arriving WITHOUT a playerId stamp belongs to this account. Unset on
  // every account → unstamped data is attributed to whichever account is active (legacy
  // behavior, correct for single-account users).
  unstampedDefault?: boolean
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
  const { id, displayName, nameEllipsis, helperAccountId, helperBound, accentColor, unstampedDefault, origin, createdAt, lastActiveAt } = value
  if (typeof id !== 'string' || !id) return null
  // Names are OPTIONAL ('' is valid — the label falls back to the Player ID); only a
  // wrong TYPE marks the entry as corrupt.
  if (typeof displayName !== 'string') return null
  // Unknown origins degrade to 'manual' so future origin tokens stay loadable.
  const safeOrigin: SfcAccountOrigin = origin === 'legacy' || origin === 'helper' ? origin : 'manual'
  return {
    id,
    displayName,
    // 'left' is the default and stored as absence — only an explicit 'right' survives.
    ...(nameEllipsis === 'right' ? { nameEllipsis: 'right' as const } : {}),
    ...(typeof helperAccountId === 'string' && helperAccountId ? { helperAccountId } : {}),
    ...(helperBound === true ? { helperBound: true } : {}),
    ...(typeof accentColor === 'string' && accentColor ? { accentColor } : {}),
    ...(unstampedDefault === true ? { unstampedDefault: true } : {}),
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
    // The migrated account starts as the unstamped-data receiver: pre-stamping RSL
    // Helper data keeps belonging to the user's original data set even after they
    // create and switch to additional accounts. Editable in the account manager.
    unstampedDefault: true,
    origin: 'legacy',
    createdAt: nowIso(),
    lastActiveAt: nowIso(),
  }
  // Move every scoped key plus the legacy-only extras (old autosave.sfr) into the namespace.
  for (const baseKey of ACCOUNT_SCOPED_BASE_KEYS) moveKeyIntoNamespace(baseKey, account.id)
  for (const baseKey of LEGACY_MIGRATION_EXTRA_KEYS) moveKeyIntoNamespace(baseKey, account.id)
  return { activeAccountId: account.id, accounts: [account] }
}

// Strip the consumed launch params from the address bar (mirrors the ?endpoint pattern in
// App.tsx): ?playerid/?playerName so reloads and copied URLs don't replay a stale account
// selection, and ?simple purely for cosmetics — but only after its session marker
// verifiably persisted, because reloads (F5, account switch) must stay in simple mode.
const stripLaunchParamsFromUrl = (): void => {
  if (typeof window === 'undefined') return
  try {
    const cleanUrl = new URL(window.location.href)
    const params = cleanUrl.searchParams
    let changed = false
    for (const key of ['playerid', 'playerName']) {
      if (params.has(key)) {
        params.delete(key)
        changed = true
      }
    }
    // Without a durable marker the param stays as the reload carrier for simple mode.
    if (params.has('simple') && stashSimpleModeForSession()) {
      params.delete('simple')
      changed = true
    }
    if (!changed) return
    window.history.replaceState(window.history.state, '', cleanUrl.toString())
  } catch {
    // history/URL access can fail on exotic embeds — the params are harmless if they stay.
  }
}

/**
 * Record what a launch/packet proved for this account. The Player ID is permanent and
 * unique — adopting it releases it from any other account. The player name is OWNED by
 * the game: whenever a trusted source (an id-matched or first-contact launch/packet)
 * carries one, it refreshes displayName so in-game renames propagate into the registry.
 * Either adoption marks the account helper-bound (see the SfcAccount field docs).
 */
const adoptHelperIdentity = (
  registry: SfcAccountRegistry,
  account: SfcAccount,
  playerId: string | undefined,
  playerName: string | undefined,
): void => {
  if (playerId) {
    for (const other of registry.accounts) {
      if (other !== account && other.helperAccountId === playerId) delete other.helperAccountId
    }
    account.helperAccountId = playerId
  }
  if (playerName && account.displayName !== playerName) account.displayName = playerName
  if (playerId || playerName) account.helperBound = true
}

// Find the account a player name refers to (displayName IS the in-game name). Shared by
// launch resolution, inbound classification, and the background push lookup so all three
// route names identically. Duplicate names resolve to the first registry entry.
// Empty is never an identity: nameless accounts are not routable by name.
export const findAccountByPlayerName = (name: string): SfcAccount | null =>
  name ? getAccountRegistry().accounts.find((a) => a.displayName === name) ?? null : null

// UI label for an account: the player name, else the Player ID — the same resolution
// order the identity ladder uses. '' when both are absent (callers show a localized
// "Unnamed" fallback; the literal cannot live here, lib code has no i18n access).
export const accountDisplayLabel = (account: SfcAccount): string =>
  account.displayName || account.helperAccountId || ''

/**
 * Resolve the ?playerid / ?playerName launch params against the registry. RSL Helper may
 * send either or both — each is a full account identity, so any CONSISTENT choice routes
 * to the same account:
 *  1. playerid matches a bound account            → activate it,
 *  2. else playerName matches an account name     → activate it,
 *  3. else exactly one never-helper-bound account exists → claim it (the merge/reuse
 *     path that folds legacy data into the user's helper account on first launch),
 *  4. otherwise                                   → create a fresh helper-origin account.
 * The identities the launch carried are then recorded on the target: the id binds, and
 * the name ALWAYS refreshes the account name — in-game renames propagate whenever the
 * Player ID identifies the account. (With name-only usage a rename cannot be recognized
 * — the old name is unknown — so sending the Player ID is the recommended contract.)
 */
const resolveHelperLaunchParam = (registry: SfcAccountRegistry): void => {
  const playerId = getPlayerIdParam()
  // URLSearchParams already percent-decoded the value, so any character is legal here.
  // Clamp the length defensively — a runaway name would bloat the registry and the UI.
  const playerName = getPlayerNameParam()?.slice(0, 80)
  if (!playerId && !playerName) return
  let target = playerId ? registry.accounts.find((a) => a.helperAccountId === playerId) : undefined
  if (!target && playerName) {
    target = registry.accounts.find((a) => a.displayName === playerName)
  }
  if (!target) {
    // Only a UNIQUE never-claimed candidate is auto-bound (helperBound guards re-claiming).
    const unbound = registry.accounts.filter((a) => !a.helperAccountId && !a.helperBound)
    if (unbound.length === 1) {
      // Auto-bind the sole unbound account — silent merge of pre-account data.
      // `origin` is left as-is: it records how the account was CREATED, not how it was bound.
      target = unbound[0]!
    } else {
      // No unambiguous candidate: a fresh, empty account for this game account.
      target = {
        id: generateAccountId(registry.accounts),
        // playerName ?? playerId is non-null here — the early return guards both-absent.
        displayName: playerName ?? playerId!,
        accentColor: pickDefaultAccent(registry.accounts.length),
        origin: 'helper',
        createdAt: nowIso(),
        lastActiveAt: nowIso(),
      }
      registry.accounts.push(target)
    }
  }
  // Record the identities: bind the id, refresh the name (game-authoritative).
  adoptHelperIdentity(registry, target, playerId, playerName)
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
  stripLaunchParamsFromUrl()
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
    // A name is NOT required — '' is valid; labels fall back via accountDisplayLabel.
    displayName: displayName.trim(),
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
  // '' is allowed (clears the name; the label falls back to the Player ID).
  if (!account || account.displayName === trimmed) return
  account.displayName = trimmed
  persistRegistry()
  notify()
}

// Which side long names ellipsize on in the switcher button. 'left' is the default and
// stored as key absence; only an explicit 'right' persists.
export const setAccountNameEllipsis = (id: string, side: 'left' | 'right'): void => {
  const account = getAccountRegistry().accounts.find((a) => a.id === id)
  if (!account) return
  const current: 'left' | 'right' = account.nameEllipsis === 'right' ? 'right' : 'left'
  if (current === side) return
  if (side === 'left') delete account.nameEllipsis
  else account.nameEllipsis = 'right'
  persistRegistry()
  notify()
}

// undefined clears the accent — "no accent color" is a valid choice (neutral button).
export const setAccountAccent = (id: string, accentColor: string | undefined): void => {
  const account = getAccountRegistry().accounts.find((a) => a.id === id)
  if (!account || account.accentColor === accentColor) return
  if (accentColor === undefined) delete account.accentColor
  else account.accentColor = accentColor
  persistRegistry()
  notify()
}

// The account flagged to receive UNSTAMPED endpoint data, or null when none is flagged
// (then unstamped data is attributed to the active account, the legacy behavior).
export const getUnstampedDefaultAccount = (): SfcAccount | null => {
  ensureAccountsInitialized()
  return getAccountRegistry().accounts.find((a) => a.unstampedDefault === true) ?? null
}

// Flag exactly one account (or none, with null) as the unstamped-data receiver.
// Radio semantics: setting it clears the flag from every other account.
export const setUnstampedDefaultAccount = (id: string | null): void => {
  const registry = getAccountRegistry()
  let changed = false
  for (const account of registry.accounts) {
    const shouldFlag = id !== null && account.id === id
    if (shouldFlag && account.unstampedDefault !== true) { account.unstampedDefault = true; changed = true }
    if (!shouldFlag && account.unstampedDefault) { delete account.unstampedDefault; changed = true }
  }
  if (!changed) return
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
  // The game's Player ID — only present when the active account is bound to one.
  // (`playerName`, not `name`, because uploadSellfile already uses `name` for the filename.)
  playerId?: string
  // SFC's account name — only present when the account HAS one (names are optional;
  // an empty name is no identity and must not be sent as one).
  playerName?: string
}

export const buildAccountRpcParams = (): AccountRpcParams => {
  const active = getActiveAccount()
  return {
    ...(active.helperAccountId ? { playerId: active.helperAccountId } : {}),
    // displayName IS the in-game player name (kept fresh from helper-sent names).
    ...(active.displayName ? { playerName: active.displayName } : {}),
  }
}

// An inbound packet's optional identity stamp — either half may be present alone.
export type InboundAccountStamp = {
  // `undefined` is explicit so exactOptionalPropertyTypes callers can pass through
  // possibly-absent command fields verbatim.
  playerId?: string | null | undefined
  playerName?: string | null | undefined
}

// Verdicts for an inbound stamp — see classifyInboundAccountStamp.
export type InboundAccountVerdict = 'attribute' | 'match' | 'bound' | 'mismatch'

/**
 * Classify an inbound packet's identity stamp against the ACTIVE account. RSL Helper may
 * stamp the Player ID, the name, or both — either is a full identity:
 *  - both absent  → 'attribute' (pre-stamping Helper: data belongs to the active account),
 *  - id present   → id decides: equals the active binding → 'match'; active never bound to
 *                   an id → adopt id (+name) and report 'bound' (the stream proves
 *                   ownership); different id → 'mismatch',
 *  - name only    → same ladder against the name binding (display name counts when no name
 *                   binding exists yet), except a name already bound to ANOTHER account is
 *                   an immediate 'mismatch' so the caller can route it there.
 * 'mismatch' data is never merged into the active view — the caller hands it to the
 * background push service (which builds and uploads THAT account's sellfile if its
 * auto-push is on) and only drops it, with a toast, when no known account matches.
 */
export const classifyInboundAccountStamp = (stamp: InboundAccountStamp): InboundAccountVerdict => {
  const playerId = stamp.playerId ?? undefined
  const playerName = stamp.playerName ?? undefined
  if (!playerId && !playerName) return 'attribute'
  const registry = getAccountRegistry()
  const active = getActiveAccount()
  if (playerId) {
    if (active.helperAccountId === playerId) {
      // The game owns the name: an id-matched stream carrying a NEW name means the
      // player renamed in-game — update our account data to follow.
      if (playerName && active.displayName !== playerName) {
        adoptHelperIdentity(registry, active, undefined, playerName)
        persistRegistry()
        notify()
      }
      return 'match'
    }
    if (!active.helperAccountId) {
      adoptHelperIdentity(registry, active, playerId, playerName)
      persistRegistry()
      notify()
      return 'bound'
    }
    return 'mismatch'
  }
  // Name-only stamp: displayName IS the player name.
  if (active.displayName === playerName) return 'match'
  // A name that identifies ANOTHER account routes there (background service).
  if (registry.accounts.some((a) => a.id !== active.id && a.displayName === playerName)) return 'mismatch'
  if (!active.helperBound && !active.helperAccountId) {
    // First name stamp on a never-claimed account proves ownership (and names it).
    adoptHelperIdentity(registry, active, undefined, playerName)
    persistRegistry()
    notify()
    return 'bound'
  }
  // Already claimed under another name: without an id a rename is indistinguishable
  // from a different account — mismatch (docs recommend sending the Player ID).
  return 'mismatch'
}
