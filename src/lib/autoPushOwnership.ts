/**
 * autoPushOwnership.ts
 *
 * Single-owner gate for AUTOMATIC sellfile push, across tabs of the same origin.
 *
 * The problem: every tab opens its own RSL Helper WebSocket and reacts to the same
 * broadcast gear packets, so with two tabs open the same account's sellfile was pushed
 * TWICE on every inbound event (each tab's foreground push, plus the other tab's
 * background-push for a non-active account). Receiving data in every tab is fine; a
 * MANUAL push in any tab is fine; only the AUTOMATIC push must be single-owner so a given
 * document change uploads once.
 *
 * Ownership is PER ACCOUNT, not one global owner: the tab that has account X active owns
 * X's auto-push (foreground), while the tab that background-services a non-active account Y
 * owns Y's. Two tabs editing two different accounts each auto-push their OWN account; the
 * gate only stops a SECOND tab from pushing the SAME account. So the token is keyed by
 * account id.
 *
 * The mechanism, deliberately minimal (no BroadcastChannel, no cross-tab messaging — the
 * app intentionally avoids cross-window sync, see state/localStorageStore.ts): per account,
 * one localStorage token `{ tabId, ts }` names the tab currently allowed to auto-push that
 * account. A tab checks/claims ownership LAZILY — only at the moment auto-push for that
 * account would actually fire (and on focus/visibility, wired at the call site) — so there
 * is no steady heartbeat to fight background-tab timer throttling. If the token is absent,
 * ours, or STALE (the owner tab closed or was frozen past the TTL), the acting tab claims it
 * and proceeds; otherwise it stands down. Last-writer-wins on the token is acceptable — a
 * rare double-claim races two near-simultaneous pushes of identical content, strictly better
 * than today's guaranteed duplicate on every packet.
 */
import { safeGetItem, safeSetItem } from './safeStorage'

// Per-account ownership token prefix. localStorage (shared across tabs) — the whole point is
// cross-tab visibility. The account id is appended: sellfileCreator.autoPush.owner.<id>.v1.
const AUTO_PUSH_OWNER_KEY_PREFIX = 'sellfileCreator.autoPush.owner.'
const AUTO_PUSH_OWNER_KEY_SUFFIX = '.v1'
// The full localStorage key for one account's auto-push ownership.
const ownerKey = (accountId: string): string => `${AUTO_PUSH_OWNER_KEY_PREFIX}${accountId}${AUTO_PUSH_OWNER_KEY_SUFFIX}`

// Staleness window: an owner that hasn't re-stamped within this many ms is considered gone
// (closed or frozen) and its claim may be taken over. Chrome/FF can fully freeze a
// backgrounded tab after ~5 min; we refresh the stamp on every gate check AND on focus, so
// an ACTIVE owner easily beats this window while a frozen/closed one falls out of it.
const OWNER_TTL_MS = 30_000

// Per-tab identity. sessionStorage is per-tab and survives same-tab reloads, so a tab keeps
// a stable id across F5 (and the account-switch reload) without leaking into other tabs.
const TAB_ID_SESSION_KEY = 'sellfileCreator.tabId.session.v1'

// Lazily-generated, cached for the session. Falls back to a volatile in-memory id when
// sessionStorage is unavailable (incognito file://) — still unique per tab instance.
let cachedTabId: string | null = null

// Generate a random-enough id; collisions across tabs are astronomically unlikely and a
// collision would only mean two tabs share auto-push ownership (a benign double-push).
const generateTabId = (): string => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

// This tab's stable id (sessionStorage-backed; volatile fallback when storage is blocked).
const getTabId = (): string => {
  if (cachedTabId !== null) return cachedTabId
  try {
    const existing = window.sessionStorage.getItem(TAB_ID_SESSION_KEY)
    if (existing && existing.length > 0) { cachedTabId = existing; return existing }
    const fresh = generateTabId()
    window.sessionStorage.setItem(TAB_ID_SESSION_KEY, fresh)
    cachedTabId = fresh
    return fresh
  } catch {
    // Storage-less: a volatile per-instance id still gives correct single-owner behavior
    // within this tab's lifetime (it just won't survive a reload — harmless here).
    cachedTabId = generateTabId()
    return cachedTabId
  }
}

type OwnerToken = { tabId: string; ts: number }

// Parse one account's stored token; null when absent or malformed (treated as "no owner").
const readOwner = (accountId: string): OwnerToken | null => {
  const raw = safeGetItem(ownerKey(accountId))
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { tabId, ts } = parsed as Record<string, unknown>
    if (typeof tabId !== 'string' || typeof ts !== 'number') return null
    return { tabId, ts }
  } catch {
    return null
  }
}

// Stamp this tab as the owner of one account (claim or refresh). Best-effort; a failed write
// just means the next gate check re-evaluates.
const writeOwner = (accountId: string): void => {
  safeSetItem(ownerKey(accountId), JSON.stringify({ tabId: getTabId(), ts: Date.now() }))
}

/**
 * May THIS tab auto-push the given ACCOUNT right now? Call at the moment an automatic push
 * for that account would fire. Returns true — and refreshes/claims ownership of that account
 * — when this tab owns it or the current owner is absent/stale. Returns false when another
 * live tab owns that account's auto-push (then this tab silently stands down; manual push is
 * unaffected). Lazy by design: this call IS the heartbeat, so an owner that keeps
 * auto-pushing an account keeps its claim fresh with no timer.
 */
export const claimAutoPushOwnership = (accountId: string): boolean => {
  const owner = readOwner(accountId)
  const now = Date.now()
  // No owner, or we already are the owner → (re)stamp and proceed.
  if (owner === null || owner.tabId === getTabId()) {
    writeOwner(accountId)
    return true
  }
  // A different tab owns it — but a stale stamp means that tab closed or froze; reclaim.
  // `now - owner.ts` can go negative if another tab's clock is ahead; only positive drift
  // past the TTL counts as stale (a future stamp means the owner is very much alive).
  if (now - owner.ts > OWNER_TTL_MS) {
    writeOwner(accountId)
    return true
  }
  // A live, different owner holds this account's auto-push → stand down.
  return false
}

/**
 * Refresh ownership of the given account if we already hold it — used on focus/visibility so
 * the tab the user is looking at keeps its active account's claim warm without waiting for
 * the next push. Never STEALS ownership (that only happens lazily at push time via
 * claimAutoPushOwnership); a non-owner focusing does not disrupt a live owner mid-session.
 * Returns whether this tab currently owns that account's auto-push.
 */
export const refreshAutoPushOwnershipIfOwner = (accountId: string): boolean => {
  const owner = readOwner(accountId)
  if (owner !== null && owner.tabId === getTabId()) {
    writeOwner(accountId)
    return true
  }
  return false
}

// Test-only: reset the cached tab id so each test starts from a clean per-tab identity.
export const __resetAutoPushOwnershipForTests = (): void => {
  cachedTabId = null
}
