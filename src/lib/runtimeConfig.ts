import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage'
import { ALLOW_TEST_HOOKS } from './testHooks'
import { createListenerSet } from './listenerSet'

export type RuntimeConfig = {
  pushEndpoint?: string
  // True when the app was opened from RSL Helper via ?simple param — activates streamlined UI.
  simple?: boolean
  // The game's Player ID for the account (?playerid=um12345678), as passed by RSL Helper.
  // Opaque string — never parsed. Used once at startup to resolve/bind/create the
  // matching SFC account (lib/accounts.ts).
  playerId?: string
  // Optional human-readable account name (?playerName=…). Decorative only: it names a freshly
  // auto-created account and refreshes a non-customized name — never a lookup key.
  playerName?: string
  // Display name of the connected client (?clientName=…), substituted into every UI string
  // that names it. Absent when the launcher did not say — callers use DEFAULT_CLIENT_NAME.
  clientName?: string
  // Dev-only: true when ?capturePackets is present. Streams raw inbound endpoint
  // packets to the dev server so they can be saved as sampleLog fixtures. Always
  // false in production builds — the flag is gated on import.meta.env.DEV.
  capturePackets?: boolean
  // TEST-only: true when ?logWasmHeap is present in a TEST build (ALLOW_TEST_HOOKS). Lets the
  // endpoint-incremental-updates Playwright spec read the rule-cache worker's WASM
  // linear-memory size via window.__wasmHeapMB (performance.memory on the main thread cannot
  // see the worker heap). Gated on ALLOW_TEST_HOOKS, so it is tree-shaken out of DEV and
  // release builds entirely — never ships.
  logWasmHeap?: boolean
}

type AppWindow = Window & { __APP_CONFIG__?: unknown }

// Display name used for the connected client wherever the UI names it, when the launch URL
// carries no ?clientName. RSL Helper is the reference client, so its name is the default.
// SSOT for the `{client}` catalog placeholder — never spell the name inline in a string.
export const DEFAULT_CLIENT_NAME = 'RSL Helper'

// Longest a ?clientName may be before it is rejected. The name is interpolated into buttons
// and tooltips, so an unbounded value would wreck the layout; a launcher sending something
// this long is misusing the param rather than naming itself.
export const CLIENT_NAME_MAX_LENGTH = 40

// The only transports an RSL Helper endpoint may use. SSOT for both the launch-param scheme
// gate below and the port extractor in externalWsProtocol.ts, so the two cannot drift on what
// counts as a WebSocket URL. Values are `URL.protocol` strings, hence the trailing colon.
const WS_SCHEMES: readonly string[] = ['ws:', 'wss:']

// True when a parsed URL's protocol is a supported WebSocket scheme.
export const isWebSocketProtocol = (protocol: string): boolean => WS_SCHEMES.includes(protocol)

function sanitizePushEndpoint(value: unknown): string | undefined {
  // Only accept string inputs so we do not coerce unexpected objects.
  if (typeof value !== 'string') return undefined
  // Trim whitespace to avoid subtle mismatches when params are copy-pasted.
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    // WebSocket endpoints are the only supported transport now.
    if (isWebSocketProtocol(url.protocol)) {
      return url.toString()
    }
  } catch {
    // ignore invalid values
  }
  return undefined
}

function readPushEndpoint(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const win = window as AppWindow
  const raw = win.__APP_CONFIG__
  if (raw && typeof raw === 'object') {
    const config = raw as { endpoint?: unknown }
    const fromConfig = sanitizePushEndpoint(config.endpoint)
    if (fromConfig) {
      return fromConfig
    }
  }

  try {
    const currentUrl = new URL(window.location.href)
    const fromSearch = sanitizePushEndpoint(currentUrl.searchParams.get('endpoint'))
    if (fromSearch) {
      return fromSearch
    }
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      const fromHash = sanitizePushEndpoint(hashParams.get('endpoint'))
      if (fromHash) {
        return fromHash
      }
    }
  } catch {
    // ignore parsing issues
  }

  return undefined
}

let cachedConfig: RuntimeConfig | null = null

// Shared reader for simple string params: query string first, then hash fragment —
// the same precedence readPushEndpoint uses. Returns a trimmed non-empty string or undefined.
function readStringParam(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const currentUrl = new URL(window.location.href)
    // Query param wins over hash so RSL Helper's canonical launch shape is authoritative.
    const fromSearch = currentUrl.searchParams.get(name)
    if (fromSearch && fromSearch.trim()) return fromSearch.trim()
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      const fromHash = hashParams.get(name)
      if (fromHash && fromHash.trim()) return fromHash.trim()
    }
  } catch {
    // ignore parsing issues — absent param is the safe fallback
  }
  return undefined
}

// Shared presence check for bare flag params: true when `name` appears at all — as ?name,
// ?name=1, ?name=true, or even ?name= — in the query string or the hash fragment. Single
// definition so every flag reader below accepts exactly the same spellings.
function hasParam(name: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const currentUrl = new URL(window.location.href)
    if (currentUrl.searchParams.has(name)) return true
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      if (hashParams.has(name)) return true
    }
  } catch {
    // ignore parsing issues — absent param is the safe fallback
  }
  return false
}

// Read ?clientName through the shared normalizer, so a URL-supplied name is sanitized
// exactly like one arriving over the socket. Undefined when absent/blank, which makes
// getClientName fall through to the stored name and then DEFAULT_CLIENT_NAME.
function readClientName(): string | undefined {
  return normalizeClientName(readStringParam('clientName')) ?? undefined
}

// sessionStorage marker keeping simple mode alive across same-tab reloads once the
// ?simple param has been stripped from the address bar. SESSION-scoped on purpose: a
// fresh launch (new WebView/tab) must again be told by RSL Helper's URL, while F5 and
// the account-switch reload stay in simple mode. This is the app's only sessionStorage
// use — localStorage would wrongly leak simple mode into later normal launches.
export const SIMPLE_MODE_SESSION_KEY = 'sellfileCreator.simple.session.v1'

// Stash the session marker; returns true only when it verifiably persisted. Callers must
// NOT strip ?simple from the URL unless this returns true — in storage-less environments
// (incognito file://) the param stays as the reload carrier instead.
export function stashSimpleModeForSession(): boolean {
  try {
    window.sessionStorage.setItem(SIMPLE_MODE_SESSION_KEY, '1')
    return window.sessionStorage.getItem(SIMPLE_MODE_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function readSimpleMode(): boolean {
  // Accepts ?simple, ?simple=true, ?simple=1, or ?simple= (any presence counts).
  if (hasParam('simple')) return true
  // No URL param: a same-tab reload after the param was stripped rides the session marker.
  try {
    if (window.sessionStorage.getItem(SIMPLE_MODE_SESSION_KEY) === '1') return true
  } catch {
    // Storage unavailable — then the param was never stripped and absence means "off".
  }
  return false
}

// Dev-build flag. Vite statically replaces the `import.meta.env.DEV` token inside the
// IIFE with a literal, so release builds still resolve this to a constant `false` and the
// DEV-only readers below stay dead code. The try/catch exists for plain Node (the unit
// tests compile src directly), where `import.meta.env` does not exist and the property
// access would otherwise throw at module load.
const IS_DEV_BUILD: boolean = (() => {
  try { return Boolean(import.meta.env.DEV) } catch { return false }
})()

// Dev-only packet-capture flag. Reads ?capturePackets (or #capturePackets) the same
// way readSimpleMode does, but additionally requires a dev build (IS_DEV_BUILD) so the
// scaffolding can never activate in a production build even if the param is present.
function readCapturePackets(): boolean {
  if (!IS_DEV_BUILD) return false
  // Accepts ?capturePackets, ?capturePackets=1, ?capturePackets=true, or bare presence.
  return hasParam('capturePackets')
}

// Reads ?logWasmHeap (or #logWasmHeap), bare presence or =1/=true. This is a TEST-only
// hook (the e2e leak spec reads window.__wasmHeapMB), so it is gated on ALLOW_TEST_HOOKS:
// in real release builds that constant folds to `false`, making the whole reader provably
// dead so it (and the worker probe it drives) is tree-shaken out — the diagnostic does NOT
// ship. Only the TEST build (VITE_TEST_HOOKS=1) keeps it.
function readLogWasmHeap(): boolean {
  if (!ALLOW_TEST_HOOKS) return false
  return hasParam('logWasmHeap')
}

function computeRuntimeConfig(): RuntimeConfig {
  const pushEndpoint = readPushEndpoint()
  const simple = readSimpleMode() || undefined
  // Account routing params from RSL Helper (see lib/accounts.ts for the resolution rules).
  // `playerid` matches the game's own terminology; `playerName` mirrors the JSON-RPC param.
  const playerId = readStringParam('playerid')
  const playerName = readStringParam('playerName')
  // Client identity. Optional: absent means the stored name, then DEFAULT_CLIENT_NAME (see
  // getClientName below, the single place those fallbacks are applied). Protocol FEATURES
  // are negotiated over the socket instead — see lib/clientCapabilities.ts.
  const clientName = readClientName()
  // Remember a URL-supplied name for the next launch: the param is stripped from the
  // address bar right after startup, so without this a reload would forget who is connected.
  if (clientName) persistClientName(clientName)
  // IS_DEV_BUILD resolves to a constant `false` in non-dev builds (see its definition),
  // so this is `false && …` → readCapturePackets() is dead and the packet-capture
  // dev tool (lib/packetCapture.ts) stays out of the release/test bundle. (capturePackets
  // is a DEV tool, not a test hook — hence the DEV gate, not ALLOW_TEST_HOOKS.)
  const capturePackets = (IS_DEV_BUILD && readCapturePackets()) || undefined
  const logWasmHeap = readLogWasmHeap() || undefined
  return {
    ...(pushEndpoint ? { pushEndpoint } : {}),
    ...(simple ? { simple } : {}),
    ...(playerId ? { playerId } : {}),
    ...(playerName ? { playerName } : {}),
    ...(clientName ? { clientName } : {}),
    ...(capturePackets ? { capturePackets } : {}),
    ...(logWasmHeap ? { logWasmHeap } : {}),
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!cachedConfig) {
    cachedConfig = computeRuntimeConfig()
  }
  return cachedConfig
}

// Test-only: drop the cached config so unit tests can vary window.location per case.
// Production never re-reads — the launch URL is fixed for the lifetime of a session.
export function __resetRuntimeConfigForTests(): void {
  cachedConfig = null
}

export function getPushEndpoint(): string | undefined {
  return getRuntimeConfig().pushEndpoint
}

// True when the ?simple URL param was present at startup.
export function getSimpleMode(): boolean {
  return getRuntimeConfig().simple ?? false
}

// The game's Player ID from ?playerid= at startup, or undefined when not launched with
// account routing. Consumed exactly once by the account resolution in lib/accounts.ts.
export function getPlayerIdParam(): string | undefined {
  return getRuntimeConfig().playerId
}

// Optional account name from ?playerName= at startup (companion to ?playerid=).
export function getPlayerNameParam(): string | undefined {
  return getRuntimeConfig().playerName
}

// Dev-only: true when ?capturePackets was present at startup AND this is a dev build.
// Drives the inbound-packet capture scaffolding (see lib/packetCapture.ts).
export function getCapturePackets(): boolean {
  return getRuntimeConfig().capturePackets ?? false
}

// TEST-only: true when ?logWasmHeap was present at startup AND this is a TEST build.
// Drives the window.__wasmHeapMB stash in useRuleCacheWorker (read by the leak e2e spec).
// Always false in DEV/release (ALLOW_TEST_HOOKS folds false → readLogWasmHeap short-circuits).
export function getLogWasmHeap(): boolean {
  return getRuntimeConfig().logWasmHeap ?? false
}

// localStorage key remembering the last client name we were told. The name can arrive over
// the socket (the `capabilities` packet), which is far too late for the first paint — so the
// last known name is persisted and used as the startup fallback. Without it, a client that
// only names itself in the handshake would render as "RSL Helper" on every launch until
// its packet lands, then visibly rename.
export const CLIENT_NAME_STORAGE_KEY = 'sellfileCreator.clientName.v1'

// Normalize any client name from any source (launch param or handshake packet): collapse
// inner whitespace runs so a pasted multi-line value cannot wreck a tooltip, then clamp the
// length. Returns null when the value carries no name. One definition, so a name arriving
// over the socket is sanitized exactly like one from the URL.
export function normalizeClientName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  return collapsed.slice(0, CLIENT_NAME_MAX_LENGTH)
}

// Remember (or clear) the client name for the next launch's first paint. Writing the
// default removes the key so storage stays clean and a later default-named client does not
// inherit a stale custom name.
export function persistClientName(name: string | null): void {
  if (!name || name === DEFAULT_CLIENT_NAME) {
    safeRemoveItem(CLIENT_NAME_STORAGE_KEY)
    return
  }
  safeSetItem(CLIENT_NAME_STORAGE_KEY, name)
}

// The name currently in force, held in a module-level override so a handshake packet can
// rename the client mid-session without re-parsing the launch URL.
let clientNameOverride: string | null = null

// Subscribers notified when the effective client name changes. The i18n provider listens so
// every `{client}` string re-renders: `t` is memoized, so without an explicit invalidation a
// mid-session rename would leave memoized subtrees showing the old name.
const clientNameListeners = createListenerSet()

// Subscribe to client-name changes; returns an unsubscribe function.
export const subscribeClientName = clientNameListeners.subscribe

// Adopt a client name learned at runtime (the `capabilities` packet). Persists it so the
// NEXT launch paints it immediately. Returns true when the effective name actually changed,
// letting the caller re-render only when there is something to re-render.
export function adoptClientName(raw: unknown): boolean {
  const normalized = normalizeClientName(raw)
  if (!normalized) return false
  const before = getClientName()
  clientNameOverride = normalized
  persistClientName(normalized)
  if (before === normalized) return false
  clientNameListeners.notify()
  return true
}

// The name to show wherever the UI refers to the connected client. SSOT for the `{client}`
// catalog placeholder: every user-visible mention resolves through here, so whatever names
// the client renames all of them at once.
//
// Precedence: a name learned this session (handshake) → the launch URL → the name the last
// session was told → RSL Helper. The stored value sits BELOW the launch param so an
// explicit ?clientName always wins over a remembered one.
export function getClientName(): string {
  if (clientNameOverride) return clientNameOverride
  const fromLaunch = getRuntimeConfig().clientName
  if (fromLaunch) return fromLaunch
  return normalizeClientName(safeGetItem(CLIENT_NAME_STORAGE_KEY)) ?? DEFAULT_CLIENT_NAME
}

// Test-only: drop the session override so specs can exercise adoption repeatedly.
export function __resetClientNameForTests(): void {
  clientNameOverride = null
}

// Placeholder standing in for the connected client's name. Used by i18n catalog strings AND
// by authored note prose (presets), so both name whoever is actually connected instead of
// hardcoding one client. SSOT — never spell a client name inline in displayed text.
export const CLIENT_TOKEN = '{client}'
// Global matcher for the token; the lib target predates String.replaceAll.
const CLIENT_TOKEN_PATTERN = /\{client\}/g

/**
 * Expand `{client}` to the connected client's name.
 *
 * The indexOf guard skips the replace entirely for the vast majority of strings carrying no
 * token. A FUNCTION replacement is used rather than a string one because a client name may
 * contain `$&` or `$1`, which a string replacement would interpret as a pattern.
 */
export function expandClientToken(value: string): string {
  if (!value || value.indexOf(CLIENT_TOKEN) === -1) return value
  const name = getClientName()
  return value.replace(CLIENT_TOKEN_PATTERN, () => name)
}
