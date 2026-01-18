import type { ExternalCommand } from './externalCommands'

// Protocol identifiers map to WebSocket subprotocols so we can negotiate format
// without changing URLs or adding extra query params.
export const EXTERNAL_WS_SUBPROTOCOL_JSONRPC = 'jsonrpc'
export const EXTERNAL_WS_SUBPROTOCOL_HELPER = 'helper'

// Keep a single default to avoid guessing when the server skips subprotocols.
export const EXTERNAL_WS_PROTOCOL_DEFAULT = EXTERNAL_WS_SUBPROTOCOL_JSONRPC

// Request method names double as shared identifiers across both protocol shapes.
export const EXTERNAL_WS_METHOD_UPLOAD_SELLFILE = 'uploadSellfile'

// Event names reuse the existing external command identifiers.
export const EXTERNAL_WS_EVENT_SELECT_RULE = 'selectRule'
export const EXTERNAL_WS_EVENT_GEAR_DB_FILE = 'gearDbFile'
export const EXTERNAL_WS_EVENT_GEAR_DB_FILE_BINARY = 'gearDbFileBinary'
export const EXTERNAL_WS_EVENT_GEAR_DB_RAW_SNAPSHOT = 'gearDbRawSnapshot'
export const EXTERNAL_WS_EVENT_GEAR_DB_RAW_DELTA = 'gearDbRawDelta'

// Limit accepted method and event values so callers do not drift.
export type ExternalWsRequestMethod = typeof EXTERNAL_WS_METHOD_UPLOAD_SELLFILE
export type ExternalWsEventName =
  | typeof EXTERNAL_WS_EVENT_SELECT_RULE
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_FILE
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_FILE_BINARY
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_RAW_SNAPSHOT
  | typeof EXTERNAL_WS_EVENT_GEAR_DB_RAW_DELTA

// Enumerate the supported wire protocols so inference stays explicit.
export type ExternalWsProtocol =
  | typeof EXTERNAL_WS_SUBPROTOCOL_JSONRPC
  | typeof EXTERNAL_WS_SUBPROTOCOL_HELPER

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
  // Return the exact token so callers can compare against constants.
  if (value === EXTERNAL_WS_SUBPROTOCOL_JSONRPC) return EXTERNAL_WS_SUBPROTOCOL_JSONRPC
  // Allow the lightweight protocol when the server opts into it.
  if (value === EXTERNAL_WS_SUBPROTOCOL_HELPER) return EXTERNAL_WS_SUBPROTOCOL_HELPER
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

// Lightweight parsing: explicit message type differentiates events vs responses.
const parseHelperMessage = (raw: unknown): ExternalWsInboundMessage | null => {
  // Lightweight messages always include a lowercase-able type field.
  if (!isRecord(raw)) return null
  const typeValue = typeof raw.type === 'string' ? raw.type.toLowerCase() : null

  if (typeValue === 'evt') {
    // Events specify their name separately and carry a payload object.
    const nameValue = typeof raw.name === 'string' ? raw.name : null
    if (!nameValue) return null
    // Tag the lightweight event so callers can adapt their outbound format.
    return {
      kind: 'event',
      name: nameValue as ExternalWsEventName,
      payload: raw.payload ?? {},
      protocol: EXTERNAL_WS_SUBPROTOCOL_HELPER,
    }
  }

  if (typeValue === 'res') {
    // Responses should always include a numeric id plus ok/error info.
    const id = toId(raw.id)
    if (id === null) return null
    const ok = raw.ok === true
    const errorMessage = typeof raw.error === 'string' ? raw.error : undefined
    const response: ExternalWsResponse = {
      ok,
      payload: raw.payload,
      ...(errorMessage ? { error: errorMessage } : {}),
    }
    // Preserve the helper protocol for response handling.
    return { kind: 'response', id, response, protocol: EXTERNAL_WS_SUBPROTOCOL_HELPER }
  }

  return null
}

// Try both codecs to keep the client tolerant to either wire format.
export const parseExternalWsMessage = (raw: unknown): ExternalWsInboundMessage | null => (
  // Try JSON-RPC first so explicit jsonrpc: "2.0" wins over fallback parsing.
  parseJsonRpcMessage(raw) ?? parseHelperMessage(raw)
)

// Encode a request message in the chosen protocol format.
export const buildExternalWsRequest = (
  protocol: string,
  id: number,
  method: ExternalWsRequestMethod,
  payload: unknown,
): string => {
  if (protocol === EXTERNAL_WS_SUBPROTOCOL_HELPER) {
    // Lightweight requests use cmd/payload under a req envelope.
    const envelope = { id, type: 'req', cmd: method, payload }
    return JSON.stringify(envelope)
  }

  // JSON-RPC requests use method/params with the standard version tag.
  const envelope = { jsonrpc: '2.0', id, method, params: payload ?? {} }
  return JSON.stringify(envelope)
}

// Normalize event payloads into a shape the existing command parser expects.
export const buildExternalCommandEnvelope = (
  name: ExternalWsEventName,
  payload: unknown,
): Record<string, unknown> => {
  // Flatten the payload so the existing parser sees fields at the top level.
  const recordPayload = isRecord(payload) ? payload : {}
  return { type: name, ...recordPayload }
}
