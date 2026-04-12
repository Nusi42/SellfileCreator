import type { ExternalCommand } from './externalCommands'

// Default port for a locally running RSL Helper WebSocket server.
export const RSL_HELPER_DEFAULT_PORT = 8080
// localStorage key that persists the user-configured RSL Helper port.
export const RSL_HELPER_PORT_STORAGE_KEY = 'rslHelperPort'

// Default WebSocket endpoint, built from the default port.
export const RSL_HELPER_DEFAULT_WS_ENDPOINT = `ws://localhost:${RSL_HELPER_DEFAULT_PORT}/`

// Read the persisted port from localStorage, falling back to the default.
export const getRslHelperPort = (): number => {
  const raw = localStorage.getItem(RSL_HELPER_PORT_STORAGE_KEY)
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
