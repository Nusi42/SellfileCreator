/**
 * clientCapabilities.ts
 *
 * Negotiated protocol features of the connected client (SSOT).
 *
 * A client announces what it supports by sending a `capabilities` notification as its first
 * answer to `requestSfcSync` (see userDocs/websocket-jsonrpc.md). Until such a packet
 * arrives — and for every client that never sends one, RSL Helper included — the session
 * runs on DEFAULT_CLIENT_CAPABILITIES, which is exactly today's behavior. That makes the
 * handshake purely additive: no client has to opt in to the standard flow.
 *
 * State lives here rather than in runtimeConfig because it is a property of the CONNECTION,
 * not of the launch: it arrives after startup and is dropped when the socket goes away.
 */
import { adoptClientName } from './runtimeConfig'

// The client wants the .sfc RECIPE DOCUMENT pushed via `uploadSfcFile` instead of the
// compiled .hsf sellfile via `uploadSellfile`. Named so no feature gate spells it inline.
export const CAPABILITY_SFC_FILE_AS_SELLFILE = 'SfcFileAsSellfile'

// Every feature a client may advertise. Extend this list (and the docs) when a new
// negotiated behavior lands — an unknown token is ignored rather than rejected, so an older
// SFC build stays compatible with a newer client naming features it has never heard of.
export const CLIENT_CAPABILITIES = [
  CAPABILITY_SFC_FILE_AS_SELLFILE,
] as const

export type ClientCapability = (typeof CLIENT_CAPABILITIES)[number]

// Set form for O(1) membership checks when validating inbound tokens.
const CLIENT_CAPABILITY_SET: ReadonlySet<string> = new Set(CLIENT_CAPABILITIES)

// True when a raw token names a capability this build understands.
export const isClientCapability = (token: string): token is ClientCapability =>
  CLIENT_CAPABILITY_SET.has(token)

// What a client is assumed to support before (or without) a `capabilities` packet.
//
// RSL Helper is the application Sellfile Creator is written for and it sends no such packet,
// so "nothing announced" MUST mean "whatever the current RSL Helper does". This list is
// therefore the RSL Helper baseline, NOT every token above: a capability only belongs here
// once RSL Helper itself ships it. Adding one changes behavior for every client that stays
// silent, so a feature RSL Helper does not implement (SfcFileAsSellfile — it has no
// `uploadSfcFile` handler) stays out and must be announced explicitly.
export const DEFAULT_CLIENT_CAPABILITIES: readonly ClientCapability[] = []

// Null until a `capabilities` packet is received; the announced set afterwards. Null and an
// empty array are deliberately different: null means "nothing announced" (apply the default),
// [] means "announced, and none of the tokens are ours".
let announced: readonly ClientCapability[] | null = null

/**
 * Adopt an announced capability list. Unknown tokens are dropped and duplicates collapse,
 * so the stored set only ever holds features this build can actually act on.
 *
 * Returns true when the effective set changed, so the caller can re-render only when there
 * is something to re-render.
 */
export function adoptClientCapabilities(tokens: readonly string[]): boolean {
  const next: ClientCapability[] = []
  const seen = new Set<ClientCapability>()
  for (const token of tokens) {
    if (!isClientCapability(token) || seen.has(token)) continue
    seen.add(token)
    next.push(token)
  }
  const before = getClientCapabilities()
  announced = next
  // Compare against what was in force BEFORE, so the first packet announcing exactly the
  // default set is correctly reported as "no change".
  return before.length !== next.length || next.some((cap, i) => before[i] !== cap)
}

// Forget the announced set — called when the socket drops, so a reconnect to a DIFFERENT
// client cannot inherit the previous one's features.
export function resetClientCapabilities(): void {
  announced = null
}

// The capability set in force. Nothing announced → the RSL Helper baseline. Single place
// that default is applied, so no caller can disagree about what "unset" means.
export function getClientCapabilities(): readonly ClientCapability[] {
  return announced ?? DEFAULT_CLIENT_CAPABILITIES
}

// True when the connected client announced `capability`. The one predicate every feature
// gate calls — never compare against the raw array at a call site.
export function hasClientCapability(capability: ClientCapability): boolean {
  return getClientCapabilities().includes(capability)
}

/**
 * Apply a parsed `capabilities` packet: adopt the feature list and, when the packet also
 * names the client, its display name. Returns true when either changed, so one call tells
 * the caller whether a re-render is warranted.
 *
 * The name is accepted here as well as from ?clientName because a client that connects to
 * an already-running app has no other way to introduce itself; runtimeConfig persists it
 * for the next launch's first paint.
 */
export function applyClientCapabilitiesPacket(packet: {
  capabilities: readonly string[]
  clientName?: string | null
}): boolean {
  const capabilitiesChanged = adoptClientCapabilities(packet.capabilities)
  const nameChanged = adoptClientName(packet.clientName)
  return capabilitiesChanged || nameChanged
}
