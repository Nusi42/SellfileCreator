/**
 * autoPushTrigger.ts
 *
 * WHEN an automatic sellfile push goes out — keyed on which document auto-push has already
 * TRIED, not on the moment the document turned dirty.
 *
 * The trigger used to be the clean→dirty edge, and an edge happens once per dirty spell. A
 * push takes seconds (the receiving client judges the whole vault on arrival), so an edit
 * made while one was in flight left the document dirty with no edge left to come; so did a
 * push that failed or found the socket down. Every later edit then stayed unpushed until the
 * user pressed Push by hand. Comparing fingerprints instead means a document that moved past
 * the one last tried is always pushed, once, as soon as nothing is in flight.
 *
 * Who may push (the per-account tab ownership gate) is a separate question and stays in
 * autoPushOwnership.ts; this module only answers "is there something to push now".
 */

export type AutoPushInputs = {
  // Auto-push is switched on for the active account.
  enabled: boolean
  // A push endpoint is currently reachable.
  connected: boolean
  // The document a push would send differs from the last one pushed successfully.
  dirty: boolean
  // An automatic push has been sent and has not settled yet.
  inFlight: boolean
  // Fingerprint of the document a push would send right now.
  docHash: string | null
  // Fingerprint of the document auto-push last TRIED (null = nothing tried).
  attemptedHash: string | null
}

/**
 * The attempted fingerprint worth keeping. Forgotten while auto-push is off or the endpoint
 * is gone, so switching auto-push on, or reconnecting, retries a document an earlier attempt
 * could not deliver — without that, an unchanged document would never be tried again.
 */
export const keptAttemptedHash = (s: AutoPushInputs): string | null =>
  (s.enabled && s.connected ? s.attemptedHash : null)

/** Whether an automatic push should go out now (ownership aside — see the module note). */
export const shouldAutoPush = (s: AutoPushInputs): boolean =>
  s.enabled
  && s.connected
  && s.dirty
  // One at a time: the receiver handles uploads in order, and a pile-up of multi-second
  // uploads would run the later ones past their request timeout.
  && !s.inFlight
  // Only a document auto-push has not tried yet — no retry loop on a persistent failure.
  && s.docHash !== keptAttemptedHash(s)
