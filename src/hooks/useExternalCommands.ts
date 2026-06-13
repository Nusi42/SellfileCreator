import { useCallback, useEffect, useRef } from 'react'

import {
  buildExternalWsRequest,
  EXTERNAL_WS_PROTOCOL_DEFAULT,
  EXTERNAL_WS_EVENT_GEAR_DB_FILE_BINARY,
  EXTERNAL_WS_METHOD_REQUEST_SFC_SYNC,
  EXTERNAL_WS_METHOD_UPLOAD_SELLFILE,
  isRecord,
  parseExternalWsMessage,
  resolveProtocolFromSubprotocol,
  type ExternalWsPendingRequest,
  type ExternalWsRequestMethod,
  type ExternalWsResponse,
} from '../lib/externalWsProtocol'
import { normalizeExternalEvent, type ExternalCommand } from '../lib/externalCommands'
import { capturePacket } from '../lib/packetCapture'

export type UseExternalCommandsOptions = {
  pushEndpoint: string | undefined
  onCommand: (command: ExternalCommand) => void
  onReachabilityChange: (reachable: boolean) => void
}

export type UseExternalCommandsApi = {
  sendRequest: (method: ExternalWsRequestMethod, payload: unknown) => Promise<ExternalWsResponse>
  // Fire-and-forget re-request: asks RSL Helper to push all current datasets again.
  requestSfcSync: () => void
}

const DEFAULT_RECONNECT_DELAY_MS = 2000
const DEFAULT_REQUEST_TIMEOUT_MS = 15000
const UPLOAD_REQUEST_TIMEOUT_MS = 60000
/**
 * useExternalCommands
 *
 * Establishes a WebSocket connection to the configured endpoint, consumes
 * inbound push events, and exposes a request helper for outbound commands.
 */
export function useExternalCommands({
  pushEndpoint,
  onCommand,
  onReachabilityChange,
}: UseExternalCommandsOptions): UseExternalCommandsApi {
  // Keep the latest handler in a ref so the socket callback stays stable.
  const handlerRef = useRef(onCommand)
  // Store the active socket instance to avoid re-opening on every render.
  const socketRef = useRef<WebSocket | null>(null)
  // Track requests awaiting a response so we can resolve by id.
  const pendingRef = useRef<Map<number, ExternalWsPendingRequest>>(new Map())
  // Remember the negotiated protocol so outbound requests match the server.
  const protocolRef = useRef<string>(EXTERNAL_WS_PROTOCOL_DEFAULT)
  // Track whether a protocol was explicitly negotiated via subprotocols.
  const protocolLockedRef = useRef(false)
  // Incrementing ids keep request/response correlation deterministic.
  const nextIdRef = useRef(1)
  // Cache the reconnect timer id so we can cancel it on cleanup.
  const reconnectTimerRef = useRef<number | null>(null)
  // Flag that stops reconnect loops during unmount.
  const closedRef = useRef(false)
  // Stash metadata for the next binary DB payload.
  const pendingBinaryMetaRef = useRef<{ name: string; contentType?: string | null } | null>(null)

  useEffect(() => {
    // Keep the ref in sync with the latest callback.
    handlerRef.current = onCommand
  }, [onCommand])

  // Clear any outstanding request timeouts and promise handlers.
  const clearPendingRequests = useCallback((reason: string) => {
    // Reject every pending promise so callers do not wait forever.
    pendingRef.current.forEach((pending) => {
      // Clear any pending timeout to avoid double rejection.
      if (pending.timeoutId !== null) {
        window.clearTimeout(pending.timeoutId)
      }
      // Propagate the cleanup reason to the caller.
      pending.reject(new Error(reason))
    })
    // Drop all pending entries after rejecting them.
    pendingRef.current.clear()
  }, [])

  // Ensure we tear down sockets and scheduled reconnect attempts.
  const cleanupSocket = useCallback((reason: string) => {
    // Capture the active socket so we can tear it down safely.
    const socket = socketRef.current
    if (socket) {
      // Null handlers first so we do not trigger stale callbacks.
      try { socket.onopen = null } catch {}
      try { socket.onmessage = null } catch {}
      try { socket.onclose = null } catch {}
      try { socket.onerror = null } catch {}
      // Close the socket to release the connection immediately.
      try { socket.close() } catch {}
      // Drop the ref so a reconnect can create a new instance.
      socketRef.current = null
    }
    // Cancel any scheduled reconnect attempt.
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    // Resolve/reject any outstanding requests.
    clearPendingRequests(reason)
  }, [clearPendingRequests])

  // Handle parsed inbound messages and route them to commands or responses.
  const handleInboundMessage = useCallback((message: unknown) => {
    // Dev-only: record the raw frame (object form) before any parsing so the captured
    // fixture matches exactly what RSL Helper sent, in true receive order. The
    // import.meta.env.DEV literal folds to false in non-dev builds, so this call is dead and
    // the whole packetCapture module tree-shakes out of release/test. ?capturePackets gates
    // it at runtime within dev. See lib/packetCapture.ts.
    if (import.meta.env.DEV) capturePacket(message)
    // Parse the inbound payload into a normalized envelope.
    const parsed = parseExternalWsMessage(message)
    if (!parsed) return

    // Infer the protocol from the first inbound frame when none was negotiated.
    if (!protocolLockedRef.current && protocolRef.current !== parsed.protocol) {
      // Lock onto the first observed protocol to keep outbound requests stable.
      protocolLockedRef.current = true
      protocolRef.current = parsed.protocol
    }

    if (parsed.kind === 'event') {
      if (parsed.name === EXTERNAL_WS_EVENT_GEAR_DB_FILE_BINARY) {
        const payload = isRecord(parsed.payload) ? parsed.payload : {}
        const nameValue = typeof payload.name === 'string' ? payload.name : null
        const contentTypeValue = typeof payload.contentType === 'string' ? payload.contentType : null
        if (nameValue) {
          pendingBinaryMetaRef.current = { name: nameValue, contentType: contentTypeValue }
        }
        return
      }
      // Normalize the event name + payload into a command the UI understands.
      const normalized = normalizeExternalEvent(parsed.name, parsed.payload)
      if (!normalized) return
      try {
        // Forward the command into the app-level handler.
        handlerRef.current(normalized)
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('Failed to apply external command', err)
        }
      }
      return
    }

    // Route responses back to the pending request promise.
    const pending = pendingRef.current.get(parsed.id)
    if (!pending) return
    // Cancel the timeout so it does not race with the resolve.
    if (pending.timeoutId !== null) {
      window.clearTimeout(pending.timeoutId)
    }
    // Remove the entry before resolving to avoid duplicate handling.
    pendingRef.current.delete(parsed.id)
    pending.resolve(parsed.response)
  }, [])

  // Establish (or re-establish) the WebSocket connection as needed.
  useEffect(() => {
    // Skip setup when running server-side or without a configured endpoint.
    if (typeof window === 'undefined' || !pushEndpoint) {
      return undefined
    }

    closedRef.current = false
    // Local timer id lets the lint rule trace clearTimeout in the effect cleanup.
    let reconnectTimer: number | null = null

  const connect = () => {
      // Stop reconnect attempts after unmount.
      if (closedRef.current) return

      try {
        // Connect without advertising subprotocols — many server implementations
        // (e.g. Delphi) reject the upgrade when they receive unknown
        // Sec-WebSocket-Protocol headers, even though RFC 6455 allows ignoring
        // them. Protocol detection falls back to inspecting the first inbound
        // frame, which works reliably without negotiation.
        const socket = new WebSocket(pushEndpoint)
        socketRef.current = socket

        socket.onopen = () => {
          // Check if the server voluntarily echoed a subprotocol anyway.
          const negotiated = resolveProtocolFromSubprotocol(socket.protocol)
          // Lock inference only when the server selects a subprotocol explicitly.
          protocolLockedRef.current = Boolean(negotiated)
          // Fall back to the default when no subprotocol was negotiated.
          protocolRef.current = negotiated ?? EXTERNAL_WS_PROTOCOL_DEFAULT
          // Mark the endpoint as reachable once the socket opens.
          onReachabilityChange(true)
          // Ask RSL Helper to push all current datasets so we get a full snapshot
          // immediately rather than waiting for the next natural push cycle.
          // Fire-and-forget: unmatched responses are silently dropped by handleInboundMessage.
          try {
            const id = nextIdRef.current++
            socket.send(buildExternalWsRequest(protocolRef.current, id, EXTERNAL_WS_METHOD_REQUEST_SFC_SYNC, {}))
          } catch {
            // Non-fatal — older RSL Helper versions that do not support requestSfcSync will simply not respond.
            if (import.meta.env.DEV) console.warn('[requestSfcSync] failed to send on connect')
          }
        }

        // Receive binary frames as ArrayBuffer so the raw bytes are available
        // synchronously in onmessage without an extra Blob.arrayBuffer() round-trip.
        // This eliminates the async conversion step and lets the app pass the
        // buffer directly to importGearDatabaseFromArrayBuffer, skipping two
        // intermediate 89-MB copies (File ctor + file.arrayBuffer()) per import.
        socket.binaryType = 'arraybuffer'

        socket.onmessage = (event) => {
          // Normalize the payload into a JSON object before parsing.
          const raw = event.data
          // Helper to parse inbound JSON safely.
          const parseJson = (text: string) => {
            // Avoid parsing after unmount to prevent stale handlers.
            if (closedRef.current) return
            try {
              handleInboundMessage(JSON.parse(text))
            } catch {}
          }

          if (typeof raw === 'string') {
            parseJson(raw)
            return
          }

          // Binary frames arrive as ArrayBuffer (binaryType = 'arraybuffer').
          // The buffer is available synchronously — no Blob.arrayBuffer() needed.
          if (raw instanceof ArrayBuffer) {
            const meta = pendingBinaryMetaRef.current
            if (meta) {
              pendingBinaryMetaRef.current = null
              if (!closedRef.current) {
                // Dev-only: record a metadata stub for the binary gear-DB push so the
                // capture sequence stays coherent (the raw SQLite bytes are not JSON and
                // are not persisted as a fixture). RSL Helper does not use this path —
                // it is a secondary transport for direct binary DB loads — but capturing
                // the stub keeps the index contiguous if it ever fires. import.meta.env.DEV
                // folds false in non-dev builds so this is tree-shaken from release/test.
                if (import.meta.env.DEV) {
                  capturePacket(
                    { jsonrpc: '2.0', method: 'gearDbFileBinary', params: { name: meta.name, contentType: meta.contentType ?? null, byteLength: raw.byteLength } },
                    'gearDbFileBinary',
                  )
                }
                // Wrap as a Uint8Array view over the frame's backing buffer.
                // No copy is made here; the buffer stays alive until cmd.bytes
                // is nulled in applyEndpointPushCommand after the import.
                const bytes = new Uint8Array(raw)
                handlerRef.current({
                  kind: 'gearDbFileBinary',
                  name: meta.name,
                  bytes,
                  contentType: meta.contentType ?? null,
                })
              }
              return
            }
            // Binary frame without a preceding metadata notification — no
            // established protocol for raw binary here, so discard.
            return
          }

          // Blob payloads can appear if binaryType is overridden externally.
          // Fall back to text parsing so JSON-over-binary paths still work.
          if (raw instanceof Blob) {
            raw.text().then((text) => {
              parseJson(text)
            }).catch(() => {})
            return
          }

          // Some environments pass plain objects through directly.
          if (isRecord(raw)) {
            handleInboundMessage(raw)
          }
        }

        socket.onclose = (_event) => {
          // Mark the endpoint as unreachable after the socket closes.
          onReachabilityChange(false)
          // Resolve any pending requests with a consistent error message.
          clearPendingRequests('WebSocket closed')
          pendingBinaryMetaRef.current = null
          // Reconnect unless the hook is being torn down.
          if (closedRef.current) return
          // Keep both local and ref in sync for cleanup traceability.
          reconnectTimer = window.setTimeout(connect, DEFAULT_RECONNECT_DELAY_MS)
          reconnectTimerRef.current = reconnectTimer
        }

        socket.onerror = () => {
          // Socket errors imply the endpoint is not currently reachable.
          onReachabilityChange(false)
        }
      } catch {
        // Failures during construction should still trigger a reconnect.
        onReachabilityChange(false)
        // Keep both local and ref in sync for cleanup traceability.
        reconnectTimer = window.setTimeout(connect, DEFAULT_RECONNECT_DELAY_MS)
        reconnectTimerRef.current = reconnectTimer
      }
    }

    connect()

    return () => {
      // Signal that reconnects should stop before cleaning up.
      closedRef.current = true
      // Direct clearTimeout satisfies the lint rule's cleanup tracing.
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      // Tear down the socket and cancel outstanding requests.
      cleanupSocket('WebSocket closed by client')
    }
  }, [clearPendingRequests, cleanupSocket, handleInboundMessage, onReachabilityChange, pushEndpoint])

  // Send a request over the active socket and await the response.
  const sendRequest = useCallback(async (
    method: ExternalWsRequestMethod,
    payload: unknown,
  ): Promise<ExternalWsResponse> => {
    // Reject immediately when the socket is unavailable.
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket is not connected'))
    }

    // Allocate a stable numeric id for the request.
    const id = nextIdRef.current
    nextIdRef.current += 1

    // Encode the request according to the negotiated protocol.
    const envelope = buildExternalWsRequest(protocolRef.current, id, method, payload)
    // Use a longer timeout for large sellfile payloads.
    const timeoutMs = method === EXTERNAL_WS_METHOD_UPLOAD_SELLFILE
      ? UPLOAD_REQUEST_TIMEOUT_MS
      : DEFAULT_REQUEST_TIMEOUT_MS

    return new Promise((resolve, reject) => {
      // Set a timeout so hung requests do not block the UI.
      const timeoutId = window.setTimeout(() => {
        pendingRef.current.delete(id)
        reject(new Error('WebSocket request timed out'))
      }, timeoutMs)

      // Store the request before sending so responses can resolve it.
      pendingRef.current.set(id, { resolve, reject, timeoutId })
      try {
        // Send the encoded JSON payload.
        socket.send(envelope)
      } catch (err) {
        // Clean up the timeout when send fails immediately.
        window.clearTimeout(timeoutId)
        pendingRef.current.delete(id)
        reject(err instanceof Error ? err : new Error('WebSocket send failed'))
      }
    })
  }, [])

  // Re-send requestSfcSync on demand (mirrors the onopen handler).
  // Fire-and-forget — older RSL Helper versions that do not support it will simply not respond.
  const requestSfcSync = useCallback(() => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    try {
      const id = nextIdRef.current++
      socket.send(buildExternalWsRequest(protocolRef.current, id, EXTERNAL_WS_METHOD_REQUEST_SFC_SYNC, {}))
    } catch {
      if (import.meta.env.DEV) console.warn('[requestSfcSync] failed to send on demand')
    }
  }, [])

  return { sendRequest, requestSfcSync }
}

export default useExternalCommands
