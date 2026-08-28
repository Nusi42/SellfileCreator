/**
 * sfcProvenance.ts
 *
 * SSOT for "is the freshly-loaded document clean?" — the rule that decides
 * whether the builder header's dirty dot appears the moment content lands.
 *
 * Why this exists: every load path used to call markNextSnapshotAsSaved()
 * unconditionally, so a bundled preset, a user's .sfc from disk, an autosave
 * restore, and an append-import all presented identically as "saved". Three of
 * those four are wrong — an autosave restore in particular has NEVER touched
 * disk, which is exactly the scenario the staleness ramp was built to warn
 * about, yet it cleared the dot and reset the clock.
 *
 * The contract the dot actually encodes:
 *
 *   A document is clean if and only if its current content exists somewhere the
 *   user can get it back from WITHOUT this tab.
 *
 * Not "unchanged since load", and not "history index equals savedIndex" — those
 * are mechanisms, and both answer the wrong question. Recoverability is the
 * question, and each load site already knows its own answer.
 */

import { AUTOSAVE_ANCHORED_KEY, AUTOSAVE_DIVERGED_AT_KEY } from './externalWsProtocol'

/**
 * Where a freshly-loaded document's content came from, in terms of what the user
 * would lose by closing the tab right now.
 */
export type SfcProvenance =
  /**
   * Byte-identical to something durable the user can reopen: a bundled preset,
   * or the .sfc file they just picked. Closing the tab loses nothing.
   */
  | 'anchored'
  /**
   * Produced by combining or mutating sources — append/selective import, or a
   * bulk clear. The result matches no file anywhere, so it is unsaved work from
   * the instant it lands.
   */
  | 'derived'
  /**
   * Restored from autosave. The work is real, unsaved, and has been unsaved
   * since the ORIGINAL edit — so the staleness clock must resume from the
   * persisted stamp rather than restart at "now".
   */
  | 'recovered'

/**
 * Does this provenance leave the document clean (no dot)?
 *
 * The single branch every load site funnels through, so "which loads clear the
 * dirty flag" has exactly one definition instead of one per call site.
 */
export function provenanceIsClean(provenance: SfcProvenance): boolean {
  return provenance === 'anchored'
}

/**
 * Should the staleness clock keep the stamp already persisted, instead of
 * stamping "now" on the rising edge?
 *
 * Only a recovery does: its unsaved age predates this session. A derived
 * document was genuinely created just now, so it starts its clock at zero.
 */
export function provenanceKeepsStalenessStamp(provenance: SfcProvenance): boolean {
  return provenance === 'recovered'
}

/**
 * Read the divergence stamp (epoch ms) out of an autosave payload.
 *
 * Returns null when the entry predates the field, carries a malformed value, or is
 * stamped in the future (a machine whose clock has since moved back). A null means
 * "age unknown" and the restore edge stamps now — degrading to today's behaviour
 * rather than to a wrong, alarming age.
 */
export function readAutosaveDivergedAt(payload: unknown, now: number = Date.now()): number | null {
  if (typeof payload !== 'object' || payload === null) return null
  const raw = (payload as Record<string, unknown>)[AUTOSAVE_DIVERGED_AT_KEY]
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  // A future stamp cannot describe an elapsed age; treat it as unknown.
  return raw <= now ? raw : null
}

/**
 * Read the anchored marker out of an autosave payload: was the body CLEAN when written?
 *
 * Only a literal `true` counts; anything else (absent on pre-field entries, malformed)
 * reads as not anchored, so the worst failure is today's recovered reading — never a
 * false "saved".
 */
export function readAutosaveAnchored(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  return (payload as Record<string, unknown>)[AUTOSAVE_ANCHORED_KEY] === true
}

/**
 * Which provenance an autosave restore actually has.
 *
 * A restore is 'recovered' by default — the body came back from autosave, which never
 * touches disk. The exception is a body that is RECOVERABLE without this tab: one written
 * while the document was clean (just saved, just loaded, undone back to its save point) or
 * one byte-identical to a bundled preset — and restored WHOLE, so the result is exactly
 * that recoverable content rather than a mix with session state. That satisfies the clean
 * contract at the top of this file; reporting it as 'recovered' put a dirty dot and a
 * "you still have unsaved work" nudge on a document the user had just saved, which is the
 * false alarm that teaches users to ignore the dot.
 *
 * `anchored` is the caller's verdict on both halves (the entry's markers AND the
 * whole-body restore); this function only owns the mapping so the two provenances have
 * exactly one home.
 */
export function restoreProvenance(anchored: boolean): SfcProvenance {
  return anchored ? 'anchored' : 'recovered'
}
