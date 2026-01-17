import { useCallback, useEffect, useRef } from 'react'

import {
  buildExternalWsRequest,
  EXTERNAL_WS_PROTOCOL_DEFAULT,
  EXTERNAL_WS_SUBPROTOCOL_JSONRPC,
  EXTERNAL_WS_SUBPROTOCOL_HELPER,
  isRecord,
  parseExternalWsMessage,
  resolveProtocolFromSubprotocol,
  type ExternalWsPendingRequest,
  type ExternalWsRequestMethod,
  type ExternalWsResponse,
} from '../lib/externalWsProtocol'
import { normalizeExternalEvent, type ExternalCommand } from '../lib/externalCommands'

export type UseExternalCommandsOptions = {
  pushEndpoint: string | undefined
  onCommand: (command: ExternalCommand) => void
  onReachabilityChange: (reachable: boolean) => void
}

export type UseExternalCommandsApi = {
  sendRequest: (method: ExternalWsRequestMethod, payload: unknown) => Promise<ExternalWsResponse>
}

const DEFAULT_RECONNECT_DELAY_MS = 2000
const DEFAULT_REQUEST_TIMEOUT_MS = 15000

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
  // Incrementing ids keep request/response correlation deterministic.
  const nextIdRef = useRef(1)
  // Cache the reconnect timer id so we can cancel it on cleanup.
  const reconnectTimerRef = useRef<number | null>(null)
  // Flag that stops reconnect loops during unmount.
  const closedRef = useRef(false)

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
    // Parse the inbound payload into a normalized envelope.
    const parsed = parseExternalWsMessage(message)
    if (!parsed) return

    if (parsed.kind === 'event') {
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

    const connect = () => {
      // Stop reconnect attempts after unmount.
      if (closedRef.current) return

      try {
        // Attempt to negotiate the protocol with the preferred order.
        const socket = new WebSocket(pushEndpoint, [
          EXTERNAL_WS_SUBPROTOCOL_JSONRPC,
          EXTERNAL_WS_SUBPROTOCOL_HELPER,
        ])
        socketRef.current = socket

        socket.onopen = () => {
          // Record the negotiated protocol so outbound requests match it.
          const negotiated = resolveProtocolFromSubprotocol(socket.protocol)
          protocolRef.current = negotiated ?? EXTERNAL_WS_PROTOCOL_DEFAULT
          // Mark the endpoint as reachable once the socket opens.
          onReachabilityChange(true)
        }

        socket.onmessage = (event) => {
          // Normalize the payload into a JSON object before parsing.
          const raw = event.data
          if (typeof raw === 'string') {
            try {
              handleInboundMessage(JSON.parse(raw))
            } catch {}
            return
          }

          // Blob payloads can appear if the server sends binary frames.
          if (raw instanceof Blob) {
            raw.text().then((text) => {
              try {
                handleInboundMessage(JSON.parse(text))
              } catch {}
            }).catch(() => {})
            return
          }

          // Some environments pass plain objects through directly.
          if (isRecord(raw)) {
            handleInboundMessage(raw)
          }
        }

        socket.onclose = () => {
          // Mark the endpoint as unreachable after the socket closes.
          onReachabilityChange(false)
          // Resolve any pending requests with a consistent error message.
          clearPendingRequests('WebSocket closed')
          // Reconnect unless the hook is being torn down.
          if (closedRef.current) return
          reconnectTimerRef.current = window.setTimeout(connect, DEFAULT_RECONNECT_DELAY_MS)
        }

        socket.onerror = () => {
          // Socket errors imply the endpoint is not currently reachable.
          onReachabilityChange(false)
        }
      } catch {
        // Failures during construction should still trigger a reconnect.
        onReachabilityChange(false)
        reconnectTimerRef.current = window.setTimeout(connect, DEFAULT_RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      // Signal that reconnects should stop before cleaning up.
      closedRef.current = true
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

    return new Promise((resolve, reject) => {
      // Set a timeout so hung requests do not block the UI.
      const timeoutId = window.setTimeout(() => {
        pendingRef.current.delete(id)
        reject(new Error('WebSocket request timed out'))
      }, DEFAULT_REQUEST_TIMEOUT_MS)

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

  return { sendRequest }
}

export default useExternalCommands
