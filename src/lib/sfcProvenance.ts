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

import { AUTOSAVE_DIVERGED_AT_KEY } from './externalWsProtocol'

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
