/**
 * useClientCapability.ts
 *
 * React binding for the negotiated client feature set (lib/clientCapabilities.ts).
 *
 * Feature gates that run inside a callback (the sellfile upload path) read the set on demand
 * and need no hook. This exists for the opposite case: UI that PRESENTS a capability and must
 * repaint when a `capabilities` packet lands mid-session, or when the socket drops and the
 * set falls back to the RSL Helper baseline.
 */
import { useCallback, useSyncExternalStore } from 'react'
import {
  hasClientCapability,
  subscribeClientCapabilities,
  type ClientCapability,
} from '../lib/clientCapabilities'

/**
 * True while the connected client announces `capability`.
 *
 * The snapshot is the boolean itself rather than the capability array, so React compares a
 * primitive: a packet that changes some OTHER capability re-notifies but does not re-render
 * this consumer.
 */
export function useClientCapability(capability: ClientCapability): boolean {
  // Bind the token into the snapshot reader; stable per capability so subscriptions persist.
  const getSnapshot = useCallback(() => hasClientCapability(capability), [capability])
  // Server render (and any non-DOM pass) has no live socket, hence no announced features.
  return useSyncExternalStore(subscribeClientCapabilities, getSnapshot, () => false)
}
