import type { ExternalCommand } from './externalCommands'
import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage'
import { createListenerSet } from './listenerSet'
import { ACCOUNT_BASE_KEY_SIMPLE_CUSTOM_SNAPSHOT, ACCOUNT_BASE_KEY_SIMPLE_VARIANT, resolveAccountScopedKey } from './accounts'
// Shared WebSocket-scheme predicate, so the port extractor below accepts exactly the schemes
// the launch-param sanitizer does.
import { isWebSocketProtocol } from './runtimeConfig'
// Negotiated feature set of the connected client — decides which upload method is used.
import { CAPABILITY_SFC_FILE_AS_SELLFILE, hasClientCapability } from './clientCapabilities'

// Default port for a locally running RSL Helper WebSocket server.
export const RSL_HELPER_DEFAULT_PORT = 8080
// localStorage key that persists the user-configured RSL Helper port.
export const RSL_HELPER_PORT_STORAGE_KEY = 'sellfileCreator.rslHelper.port.v1'
// localStorage key that persists whether the user has enabled the RSL Helper connection.
export const RSL_HELPER_CONNECT_ENABLED_KEY = 'sellfileCreator.rslHelper.connectEnabled.v1'
// localStorage key that persists whether the user last chose Expert mode in a simple-mode session.
export const SIMPLE_EXPERT_MODE_KEY = 'sellfileCreator.simple.expertMode.v1'
// localStorage key that persists the toggle variant (preset or custom) the user last had in
// simple mode. Account-scoped (lib/accounts.ts owns the base key): beginner/lategame tracks
// account progression, unlike SIMPLE_EXPERT_MODE_KEY above which is a property of the user
// and stays global.
export const SIMPLE_VARIANT_KEY = resolveAccountScopedKey(ACCOUNT_BASE_KEY_SIMPLE_VARIANT)

// Autosave payload key marking that the saved setup is (still) an unmodified built-in
// preset. When present, the simple-mode load path swaps in the CURRENT built-in of that
// name instead of the saved body, so users ride preset updates across app versions.
export const AUTOSAVE_PRESET_ORIGIN_KEY = 'PresetOrigin'

// Autosave payload key mirroring the simple-mode expert choice. The standalone
// SIMPLE_EXPERT_MODE_KEY is written once at click time, which the embedded WebView host
// (it kills the process without firing unload events) does not durably flush — so the
// choice was lost and the next launch re-opened the express dialog. Autosave, by contrast,
// is rewritten continuously on a debounce DURING the session, so it is already on disk
// before the host kills the WebView. We therefore stamp the flag here too and PREFER this
// value on simple-mode startup. Same durability path the override answers already ride.
export const AUTOSAVE_SIMPLE_EXPERT_MODE_KEY = 'SimpleExpertMode'

// Autosave payload key recording WHEN the document first diverged from its last save or
// load (epoch ms) — not when the autosave was last written (that is AutosaveSavedAt, which
// bumps on every debounced write). This is the age the dirty dot must show after a restore.
//
// It lives in the autosave payload rather than only in the standalone staleness key because
// the divergence moment is a property of THE DOCUMENT: a session that never saved still
// diverged at a knowable instant, and the separate key is deleted the moment both documents
// read clean — so any transient clean render destroyed the age before the restore could use
// it. Carried with the body, it cannot be lost independently of the content it describes.
// Absent on entries written before this field existed; the reader falls back to "unknown".
export const AUTOSAVE_DIVERGED_AT_KEY = 'DivergedAt'

// Autosave payload key recording that the body was CLEAN when written — its content existed
// somewhere durable the user can reopen (the .sfc they just saved or loaded, a bundled
// preset), so restoring it whole loses nothing and must not present as unsaved work. This is
// the general answer to "is this restored body recoverable?" (lib/sfcProvenance.ts), recorded
// ONCE at write time by the one payload writer instead of being re-derived per restore path
// from special-case markers. Complementary to DivergedAt by construction: a write carries
// exactly one of the two, decided by the same clean/dirty predicate. Absent on entries from
// before the field existed, which the reader treats as "not anchored" — today's behaviour.
export const AUTOSAVE_ANCHORED_KEY = 'Anchored'

// The simple-mode toggle selections we persist. 'custom' means the user's own SFC.
export type SimpleVariant = 'beginner' | 'lategame' | 'custom'
// Guard a raw localStorage string against the known variant tokens.
const isSimpleVariant = (value: string | null): value is SimpleVariant =>
  value === 'beginner' || value === 'lategame' || value === 'custom'

// Read the variant the user last selected in simple mode, or null when none was stored.
// safeGetItem so an opaque-origin/incognito file:// launch (storage access throws) degrades
// to "no stored variant" instead of crashing the render that resolves the startup source.
export const getSimpleVariant = (): SimpleVariant | null => {
  const raw = safeGetItem(SIMPLE_VARIANT_KEY)
  return isSimpleVariant(raw) ? raw : null
}

// Persist the last-selected simple-mode variant so it survives reloads.
export const setSimpleVariant = (variant: SimpleVariant): void => {
  safeSetItem(SIMPLE_VARIANT_KEY, variant)
}

// localStorage key holding the simple-mode Custom snapshot: the user's own (non-preset)
// document as .sfc text plus its unsaved stamp. Account-scoped like the variant.
//
// Why it is durable: the express toggle reads as three rule sets — two bundled and the
// user's own — and the bundled two survive anything. The custom one used to live only in
// memory once the user tried a preset (autosave then holds the preset), so a reload —
// F5, RSL Helper relaunching the app, a crash — silently discarded it, bypassing the Go
// Expert confirmation that guards exactly that loss. Written whenever the in-session
// latch takes a snapshot, read to offer Custom at boot / on Go Simple when the live
// document is a preset, and deleted only by an explicit decision — the Go Expert
// confirmation's proceed or the Custom button's right-click Discard (one App handler).
// lib/accounts.ts owns the base key (account-scoped like the variant).
export const SIMPLE_CUSTOM_SNAPSHOT_KEY = resolveAccountScopedKey(ACCOUNT_BASE_KEY_SIMPLE_CUSTOM_SNAPSHOT)

/** The persisted Custom snapshot: the .sfc text and when it went unsaved (null = saved). */
export type SimpleCustomSnapshot = { text: string; dirtySince: number | null }

// Only a well-formed record counts; anything else (absent, hand-edited, truncated by a
// quota failure) reads as "no snapshot" so the worst outcome is today's missing button.
const isSimpleCustomSnapshot = (value: unknown): value is SimpleCustomSnapshot => {
  if (!isRecord(value)) return false
  const dirtySince = value['dirtySince']
  return typeof value['text'] === 'string' && value['text'].length > 0
    && (dirtySince === null || (typeof dirtySince === 'number' && Number.isFinite(dirtySince)))
}

// Read the persisted Custom snapshot, or null when none (or a malformed one) is stored.
export const getSimpleCustomSnapshot = (): SimpleCustomSnapshot | null => {
  const raw = safeGetItem(SIMPLE_CUSTOM_SNAPSHOT_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isSimpleCustomSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

// Persist the Custom snapshot (replacing any previous one).
export const setSimpleCustomSnapshot = (snapshot: SimpleCustomSnapshot): void => {
  safeSetItem(SIMPLE_CUSTOM_SNAPSHOT_KEY, JSON.stringify(snapshot))
}

// Forget the Custom snapshot — the user chose to discard it.
export const clearSimpleCustomSnapshot = (): void => {
  safeRemoveItem(SIMPLE_CUSTOM_SNAPSHOT_KEY)
}

// Read whether the user has previously toggled on the RSL Helper connection.
export const getRslHelperConnectEnabled = (): boolean =>
  safeGetItem(RSL_HELPER_CONNECT_ENABLED_KEY) === 'true'

// Persist or clear the RSL Helper connection preference.
export const setRslHelperConnectEnabled = (enabled: boolean): void => {
  if (enabled) {
    safeSetItem(RSL_HELPER_CONNECT_ENABLED_KEY, 'true')
  } else {
    safeRemoveItem(RSL_HELPER_CONNECT_ENABLED_KEY)
  }
}

// Read whether the user was in Expert mode at the end of their last simple-mode session.
// safeGetItem-guarded: this runs in the expertMode useState initializer at first render, so a
// throwing localStorage (incognito file://) would otherwise take the whole app down to black.
export const getSimpleExpertMode = (): boolean =>
  safeGetItem(SIMPLE_EXPERT_MODE_KEY) === 'true'

// Persist the expert mode preference for the next simple-mode session.
export const setSimpleExpertMode = (enabled: boolean): void => {
  if (enabled) {
    safeSetItem(SIMPLE_EXPERT_MODE_KEY, 'true')
  } else {
    safeRemoveItem(SIMPLE_EXPERT_MODE_KEY)
  }
}

// Build the raw WebSocket endpoint URL (not a page deep-link) from the given port.
export const buildRslHelperWsEndpoint = (port?: number): string =>
  `ws://localhost:${port ?? getRslHelperPort()}/`

// Extract the port from a launch `?endpoint=ws://host:port/` URL, or null when it has none.
// The migration path (App.tsx) uses this so a helper running on a non-default port is still
// reached after the param is stripped — without it the URL's port was parsed and discarded,
// and the session silently fell back to the persisted/default port.
// Only an EXPLICIT port counts. A portless `ws://localhost/` implies 80 per URL semantics, but
// 80 is never where RSL Helper listens — adopting it would overwrite a working persisted port
// (possibly one the user set by hand) with a port nothing serves. `URL.port` is '' both for a
// truly portless URL and for one spelling out the scheme default, and that ambiguity is fine
// here: either way we report "no port information" and the caller keeps what it has.
// The scheme gate comes from isWebSocketProtocol (runtimeConfig.ts), which is also what the
// launch-param sanitizer uses.
export const extractRslHelperPortFromEndpoint = (endpoint: string): number | null => {
  try {
    const url = new URL(endpoint)
    // Gate on the scheme FIRST: a port from a non-WebSocket URL is not an RSL Helper port,
    // even though `URL` happily parses one out of e.g. http://localhost:8080/.
    if (!isWebSocketProtocol(url.protocol)) return null
    return parseRslHelperPort(url.port)
  } catch {
    // Unparseable endpoint — the caller keeps its persisted port.
    return null
  }
}

// Inclusive bounds of the valid TCP port range — the SSOT for every port range check
// (storage read, the config popout's field + spinner, and the launch-param migration).
export const RSL_HELPER_PORT_MIN = 1
export const RSL_HELPER_PORT_MAX = 65535

// Parse an arbitrary raw value into a valid port number, or null when it is not one.
// Single definition of "is this a usable port" so the popout, the storage reader, and the
// ?endpoint= migration cannot drift apart on what they accept.
export const parseRslHelperPort = (raw: string | number | null | undefined): number | null => {
  if (raw === null || raw === undefined) return null
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10)
  // Reject NaN/Infinity and non-integers before the range check.
  if (!Number.isInteger(parsed)) return null
  return parsed >= RSL_HELPER_PORT_MIN && parsed <= RSL_HELPER_PORT_MAX ? parsed : null
}

// Clamp an arbitrary integer into the valid port range. Used by the popout's spinner so a
// step past either bound lands ON the bound; parseRslHelperPort (reject, don't clamp) stays
// the rule for typed/stored input — both share the same two bound constants.
export const clampRslHelperPort = (port: number): number =>
  Math.min(RSL_HELPER_PORT_MAX, Math.max(RSL_HELPER_PORT_MIN, port))

// Read the persisted port from localStorage, falling back to the default.
export const getRslHelperPort = (): number =>
  parseRslHelperPort(safeGetItem(RSL_HELPER_PORT_STORAGE_KEY)) ?? RSL_HELPER_DEFAULT_PORT

// Subscribers notified when setRslHelperPort commits a DIFFERENT effective port.
// Registered beside the writer (the port SSOT) so every caller — the config popout, the
// launch-param migration — reaches the same notification without prop-threading; App.tsx
// consumes it via useSyncExternalStore to re-derive the live WebSocket endpoint, which is
// what makes an already-open connection reconnect on the new port.
const rslHelperPortListeners = createListenerSet()

// Subscribe to committed port changes; returns the unsubscribe (useSyncExternalStore shape).
export const subscribeRslHelperPort = rslHelperPortListeners.subscribe

// Persist the port, clearing the key when it is the default so storage stays clean.
// Invalid values are ignored rather than written, so the stored value is always readable.
// safeSetItem/safeRemoveItem keep an opaque-origin (incognito file://) launch from throwing.
export const setRslHelperPort = (port: number): void => {
  const valid = parseRslHelperPort(port)
  if (valid === null) return
  // Capture before writing so only a REAL change notifies (a same-port commit is a no-op —
  // notifying would pointlessly tear down and reopen a healthy connection).
  const previous = getRslHelperPort()
  if (valid === RSL_HELPER_DEFAULT_PORT) {
    safeRemoveItem(RSL_HELPER_PORT_STORAGE_KEY)
  } else {
    safeSetItem(RSL_HELPER_PORT_STORAGE_KEY, String(valid))
  }
  if (valid !== previous) rslHelperPortListeners.notify()
}

// Build the deep-link URL that opens the app pre-connected to a local RSL Helper instance.
// Strips any existing query string so the result is predictable regardless of current state.
// Uses the URL API instead of origin+pathname because window.location.origin is the
// string "null" for file:// URLs in Firefox, which would produce an invalid URL.
// Accepts an explicit port override; falls back to the persisted value or the default.
export const buildRslHelperConnectUrl = (port?: number): string => {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  const resolvedPort = port ?? getRslHelperPort()
  return `${url.href}?endpoint=ws://localhost:${resolvedPort}/`
}

// JSON-RPC 2.0 is the sole supported wire protocol.
export const EXTERNAL_WS_SUBPROTOCOL_JSONRPC = 'jsonrpc'

// Keep a single default so outbound requests always have a known protocol.
export const EXTERNAL_WS_PROTOCOL_DEFAULT = EXTERNAL_WS_SUBPROTOCOL_JSONRPC

// Request method names double as shared identifiers across both protocol shapes.
export const EXTERNAL_WS_METHOD_UPLOAD_SELLFILE = 'uploadSellfile'
// Uploads the .sfc RECIPE DOCUMENT instead of the compiled .hsf sellfile. Sent in place of
// uploadSellfile only when the client advertised the SfcFileAsSellfile capability — a client
// that never asks for it must never receive this method (see lib/runtimeConfig.ts).
export const EXTERNAL_WS_METHOD_UPLOAD_SFC_FILE = 'uploadSfcFile'
// Sends the current gear-inspector selection to RSL Helper.
// Params: { artifactIds: number[], multiSelect: boolean } — multiSelect false means the grid is
// in single-select mode, where a plain click replaces the previous pick instead of adding to it.
// It describes HOW the user is picking, not a length cap: ctrl/shift-click and the select-all
// buttons stay live in that mode, so the array can still hold several ids. The exception is a
// client announcing autoSellSupported, for which single-select is enforced as a hard one-item
// cap (see lib/clientCapabilities.ts).
export const EXTERNAL_WS_METHOD_SELECT_ARTIFACTS = 'selectArtifacts'
// Asks RSL Helper to push all its current datasets immediately after connection.
export const EXTERNAL_WS_METHOD_REQUEST_SFC_SYNC = 'requestSfcSync'

// Which document the auto-push/export path uploads, and under which method.
//
// Default: the compiled .hsf sellfile via `uploadSellfile` — what RSL Helper expects.
// With the SfcFileAsSellfile capability the client instead receives the .sfc RECIPE
// DOCUMENT via `uploadSfcFile`, so it stores the editable source rather than the
// compiled ruleset. SSOT for both push sites (the interactive export in App.tsx and the
// background per-account push), so they can never disagree on method, filename, or type.
export type SellfileUploadTarget = {
  method: ExternalWsRequestMethod
  // True when the payload must be the .sfc document instead of the compiled .hsf.
  sfcDocument: boolean
}

export const resolveSellfileUploadTarget = (): SellfileUploadTarget => (
  hasClientCapability(CAPABILITY_SFC_FILE_AS_SELLFILE)
    ? { method: EXTERNAL_WS_METHOD_UPLOAD_SFC_FILE, sfcDocument: true }
    : { method: EXTERNAL_WS_METHOD_UPLOAD_SELLFILE, sfcDocument: false }
)

// Why there is no separate "does auto-push watch the .sfc?" predicate here:
//
// Auto-push fires on "the pushed document changed", so the watched document must be the one
// actually uploaded — which is exactly what `resolveSellfileUploadTarget().sfcDocument`
// already answers. A second exported wrapper over that read was tried and removed: it had no
// callers (the background service reads the resolver directly, and React consumers must use
// `useClientCapability(CAPABILITY_SFC_FILE_AS_SELLFILE)` so they REPAINT when the capability
// lands mid-session or drops with the socket), so it only added a second name for one fact.
//
// For the record, the reason the compiled .hsf fingerprint cannot serve as the trigger under
// SfcFileAsSellfile: it is wrong in BOTH directions. A note/recipe-name edit changes the .sfc
// while compiling to identical rules (a real edit that would never reach the client), and
// gear-DB churn that shifts safeguard detection moves the .hsf crc while the .sfc is
// byte-identical (pushing a document nobody changed). It also only exists after a pipeline
// run, which the .sfc path has no other reason to pay for.

// Event names reuse the existing external command identifiers.
export const EXTERNAL_WS_EVENT_SELECT_RULE = 'selectRule'
export const EXTERNAL_WS_EVENT_GEAR_DB_FILE_BINARY = 'gearDbFileBinary'
// Separate per-type gear data messages pushed by RSL Helper.
// Each carries one collection so the sender can stream them independently.
export const EXTERNAL_WS_EVENT_GEAR_DB_ARTIFACTS = 'artifacts'
export const EXTERNAL_WS_EVENT_GEAR_DB_CHAMPIONS = 'champions'
export const EXTERNAL_WS_EVENT_GEAR_DB_INBOX_ARTIFACTS = 'inboxArtifacts'
export const EXTERNAL_WS_EVENT_GEAR_DB_LAST_USED = 'lastUsed'
// Equip-only feed: { championId: { slot: artifactId } }. Pushed on every gear move,
// unlike `champions`, which RSL Helper only re-sends when a champion itself changes.
export const EXTERNAL_WS_EVENT_GEAR_DB_EQUIPPED = 'ArtifactByHeroID'
// Capability handshake: the client announces the protocol features it supports (and may
// name itself) as its first answer to requestSfcSync. Optional — a client that never sends
// it runs on the default feature set. See lib/clientCapabilities.ts.
export const EXTERNAL_WS_EVENT_CAPABILITIES = 'capabilities'

// Limit accepted event values so callers do not drift.
export type ExternalWsEventName =
  | typeof EXTERNAL_WS_EVENT_CAPABILITIES
  | typeof EXTERNAL_WS_EVENT_SELECT_RULE
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_FILE_BINARY
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_ARTIFACTS
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_CHAMPIONS
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_INBOX_ARTIFACTS
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_LAST_USED
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_EQUIPPED

// Only JSON-RPC is supported; keep the type alias for call-site clarity.
export type ExternalWsProtocol = typeof EXTERNAL_WS_SUBPROTOCOL_JSONRPC

// Limit accepted request method values so callers do not drift.
export type ExternalWsRequestMethod =
  | typeof EXTERNAL_WS_METHOD_UPLOAD_SELLFILE
  | typeof EXTERNAL_WS_METHOD_UPLOAD_SFC_FILE
  | typeof EXTERNAL_WS_METHOD_SELECT_ARTIFACTS
  | typeof EXTERNAL_WS_METHOD_REQUEST_SFC_SYNC

// Normalized response shape for both protocols.
export type ExternalWsResponse = {
  ok: boolean
  payload?: unknown
  error?: string
}

// Normalized inbound messages so the hook can share parsing logic.
export type ExternalWsInboundMessage =
  | { kind: 'event'; name: ExternalWsEventName; payload: unknown; protocol: ExternalWsProtocol }
  | { kind: 'response'; id: number; response: ExternalWsResponse; protocol: ExternalWsProtocol }

// Internal descriptor for a decoded external command event.
export type ExternalWsDecodedEvent = {
  command: ExternalCommand
}

// Wrapper for pending request data so the hook can resolve promises safely.
export type ExternalWsPendingRequest = {
  resolve: (value: ExternalWsResponse) => void
  reject: (error: Error) => void
  timeoutId: number | null
}

// Tiny helper so we can treat unknown JSON payloads as record-like objects.
export const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

// Coerce arbitrary values into safe numeric ids for responses.
const toId = (value: unknown): number | null => {
  // Only numeric ids are supported to keep request maps simple.
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  // Normalize decimals so ids stay stable across parsing differences.
  return Math.floor(value)
}

// Resolve the intended protocol based on the negotiated subprotocol string.
export const resolveProtocolFromSubprotocol = (value: string | null): string | null => {
  // Null means the server skipped subprotocol negotiation.
  if (!value) return null
  // Only JSON-RPC is recognized; anything else is ignored.
  if (value === EXTERNAL_WS_SUBPROTOCOL_JSONRPC) return EXTERNAL_WS_SUBPROTOCOL_JSONRPC
  return null
}

// JSON-RPC parsing: notifications map to events, responses map to request results.
const parseJsonRpcMessage = (raw: unknown): ExternalWsInboundMessage | null => {
  // JSON-RPC payloads are objects with jsonrpc: "2.0".
  if (!isRecord(raw)) return null
  if (raw.jsonrpc !== '2.0') return null

  // Extract core fields with defensive checks.
  const idValue = raw.id
  const method = typeof raw.method === 'string' ? raw.method : null

  // Notifications (no id) map directly to events.
  if ((idValue === null || idValue === undefined) && method) {
    // Params become the payload for existing command parsers.
    const params = raw.params
    // Tag the inbound event with the protocol we matched.
    return {
      kind: 'event',
      name: method as ExternalWsEventName,
      payload: params ?? {},
      protocol: EXTERNAL_WS_SUBPROTOCOL_JSONRPC,
    }
  }

  // Responses must carry a numeric id; treat result vs error accordingly.
  const id = toId(idValue)
  if (id === null) return null

  if ('error' in raw) {
    // JSON-RPC error objects may include a message field.
    const errorValue = raw.error
    const message = isRecord(errorValue) && typeof errorValue.message === 'string'
      ? errorValue.message
      : 'unknown error'
    // Carry the JSON-RPC protocol marker into the response.
    return {
      kind: 'response',
      id,
      response: { ok: false, error: message, payload: errorValue },
      protocol: EXTERNAL_WS_SUBPROTOCOL_JSONRPC,
    }
  }

  if ('result' in raw) {
    // Successful JSON-RPC responses carry a result payload.
    // Record the protocol so callers can infer the server shape.
    return {
      kind: 'response',
      id,
      response: { ok: true, payload: raw.result },
      protocol: EXTERNAL_WS_SUBPROTOCOL_JSONRPC,
    }
  }

  return null
}

// Parse the sole supported wire format.
export const parseExternalWsMessage = (raw: unknown): ExternalWsInboundMessage | null => (
  parseJsonRpcMessage(raw)
)

// Encode a request message in JSON-RPC 2.0 format.
export const buildExternalWsRequest = (
  _protocol: string,
  id: number,
  method: ExternalWsRequestMethod,
  payload: unknown,
): string => {
  // JSON-RPC requests use method/params with the standard version tag.
  const envelope = { jsonrpc: '2.0', id, method, params: payload ?? {} }
  return JSON.stringify(envelope)
}
