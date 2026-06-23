import type { ExternalCommand } from './externalCommands'
import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage'

// Default port for a locally running RSL Helper WebSocket server.
export const RSL_HELPER_DEFAULT_PORT = 8080
// localStorage key that persists the user-configured RSL Helper port.
export const RSL_HELPER_PORT_STORAGE_KEY = 'sellfileCreator.rslHelper.port.v1'
// localStorage key that persists whether the user has enabled the RSL Helper connection.
export const RSL_HELPER_CONNECT_ENABLED_KEY = 'sellfileCreator.rslHelper.connectEnabled.v1'
// localStorage key that persists whether the user last chose Expert mode in a simple-mode session.
export const SIMPLE_EXPERT_MODE_KEY = 'sellfileCreator.simple.expertMode.v1'
// localStorage key that persists the toggle variant (preset or custom) the user last had in simple mode.
export const SIMPLE_VARIANT_KEY = 'sellfileCreator.simple.variant.v1'

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

// Default WebSocket endpoint, built from the default port.
export const RSL_HELPER_DEFAULT_WS_ENDPOINT = `ws://localhost:${RSL_HELPER_DEFAULT_PORT}/`

// Read the persisted port from localStorage, falling back to the default.
export const getRslHelperPort = (): number => {
  const raw = safeGetItem(RSL_HELPER_PORT_STORAGE_KEY)
  if (!raw) return RSL_HELPER_DEFAULT_PORT
  const parsed = parseInt(raw, 10)
  // Reject anything outside the valid TCP port range.
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : RSL_HELPER_DEFAULT_PORT
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
// Sends the current gear-inspector selection to RSL Helper; params: { artifactIds: number[] }.
export const EXTERNAL_WS_METHOD_SELECT_ARTIFACTS = 'selectArtifacts'
// Asks RSL Helper to push all its current datasets immediately after connection.
export const EXTERNAL_WS_METHOD_REQUEST_SFC_SYNC = 'requestSfcSync'

// Event names reuse the existing external command identifiers.
export const EXTERNAL_WS_EVENT_SELECT_RULE = 'selectRule'
export const EXTERNAL_WS_EVENT_GEAR_DB_FILE_BINARY = 'gearDbFileBinary'
// Separate per-type gear data messages pushed by RSL Helper.
// Each carries one collection so the sender can stream them independently.
export const EXTERNAL_WS_EVENT_GEAR_DB_ARTIFACTS = 'artifacts'
export const EXTERNAL_WS_EVENT_GEAR_DB_CHAMPIONS = 'champions'
export const EXTERNAL_WS_EVENT_GEAR_DB_INBOX_ARTIFACTS = 'inboxArtifacts'
export const EXTERNAL_WS_EVENT_GEAR_DB_LAST_USED = 'lastUsed'

// Limit accepted event values so callers do not drift.
export type ExternalWsEventName =
  | typeof EXTERNAL_WS_EVENT_SELECT_RULE
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_FILE_BINARY
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_ARTIFACTS
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_CHAMPIONS
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_INBOX_ARTIFACTS
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_LAST_USED

// Only JSON-RPC is supported; keep the type alias for call-site clarity.
export type ExternalWsProtocol = typeof EXTERNAL_WS_SUBPROTOCOL_JSONRPC

// Limit accepted request method values so callers do not drift.
export type ExternalWsRequestMethod =
  | typeof EXTERNAL_WS_METHOD_UPLOAD_SELLFILE
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
