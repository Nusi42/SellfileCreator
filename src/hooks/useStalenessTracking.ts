/**
 * useStalenessTracking.ts
 *
 * Owns the "how long has this been unsaved" clock behind the dirty-badge dots.
 *
 * Two jobs the badges cannot do themselves:
 *  1. PERSIST the moment each document went dirty, so the age survives a restart.
 *     Without this the stamps live only in React state and reset on reload — the
 *     precise reason a user lost an hour of edits without the dot ever warning them.
 *  2. TICK, so a badge that is mounted but untouched still ages. Nothing else
 *     re-renders the header when the only thing that changed is the wall clock.
 *
 * The ramp itself (stops, colours, formatting) lives in lib/stalenessRamp.ts.
 */

import { useEffect, useRef, useState } from 'react'
import { STALENESS_SINCE_KEY, STALENESS_TICK_MS } from '../lib/constants'
import { resolveDirtySince } from '../lib/stalenessRamp'
import { provenanceKeepsStalenessStamp, type SfcProvenance } from '../lib/sfcProvenance'

/** Persisted shape: epoch-ms stamps, either null when that document is clean. */
interface StalenessSinceRecord {
  sfc: number | null
  hsf: number | null
}

const EMPTY_RECORD: StalenessSinceRecord = { sfc: null, hsf: null }

/** A stamp is usable only if it is a finite number that is not in the future. */
const isUsableStamp = (value: unknown, now: number): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value <= now
)

/**
 * Read the persisted stamps. Anything malformed — hand-edited storage, a stamp
 * from a machine whose clock has since moved back — degrades to "clean" rather
 * than to a wrong age, so the worst failure is today's neutral dot.
 */
function readPersistedStamps(now: number): StalenessSinceRecord {
  try {
    const raw = localStorage.getItem(STALENESS_SINCE_KEY)
    if (!raw) return EMPTY_RECORD
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_RECORD
    const record = parsed as Partial<StalenessSinceRecord>
    return {
      sfc: isUsableStamp(record.sfc, now) ? record.sfc : null,
      hsf: isUsableStamp(record.hsf, now) ? record.hsf : null,
    }
  } catch {
    return EMPTY_RECORD
  }
}

export interface StalenessTracking {
  /** When the SFC went dirty (epoch ms), or null while it is saved. */
  sfcDirtySince: number | null
  /** When the HSF export went stale (epoch ms), or null while it is current. */
  hsfDirtySince: number | null
  /** Advances on every tick so consumers re-render as the ramp progresses. */
  now: number
}

/**
 * Tracks both documents' unsaved age. `sfcDirty` / `hsfDirty` are the live dirty
 * flags; this hook stamps their rising edges, clears on save, and persists both.
 *
 * `sfcRecovery` describes autosave restores: `seq` counts them, `divergedAt` is the
 * moment the restored body first diverged from its last save/load (carried inside the
 * autosave payload). A restore drives the SFC dirty flag clean→dirty, but that edge is
 * a RECOVERY, not an edit — the work has been unsaved since the original session, so
 * the clock must adopt that stamp instead of restarting at now (see lib/sfcProvenance.ts).
 * Counting rather than flagging means each restore arms the adoption exactly once, so a
 * later genuine edit still stamps normally. A null `divergedAt` (entry predates the
 * field, or a malformed/future value) means the age is genuinely unknown and the edge
 * falls back to stamping now.
 */
export interface SfcRecoverySignal {
  seq: number
  divergedAt: number | null
  /**
   * What the load that bumped `seq` actually was. Carried rather than assumed so the
   * "does this edge resume the persisted stamp?" question is answered by the ONE
   * exported predicate (provenanceKeepsStalenessStamp), never re-derived here from
   * the bare fact that a counter moved. A future provenance is then handled by that
   * predicate alone instead of silently taking the recovery path.
   */
  provenance: SfcProvenance
}

const NO_RECOVERY: SfcRecoverySignal = { seq: 0, divergedAt: null, provenance: 'anchored' }

export function useStalenessTracking(
  sfcDirty: boolean,
  hsfDirty: boolean,
  sfcRecovery: SfcRecoverySignal = NO_RECOVERY,
): StalenessTracking {
  // Restore once, at mount, before any edge has been observed this session.
  const [restored] = useState(() => readPersistedStamps(Date.now()))

  const [sfcDirtySince, setSfcDirtySince] = useState<number | null>(restored.sfc)
  const [hsfDirtySince, setHsfDirtySince] = useState<number | null>(restored.hsf)

  // Edge trackers seeded from the RESTORED state, not from `false`. Seeding from
  // false would treat an already-dirty restored session as a fresh clean→dirty
  // transition and reset its age to zero — throwing away the very history we just
  // reloaded. Seeding from the stamp keeps a restored hour reading as an hour.
  const prevSfcDirtyRef = useRef(restored.sfc !== null)
  const prevHsfDirtyRef = useRef(restored.hsf !== null)
  // A restored stamp must survive the FIRST observation of a clean document.
  //
  // The app always boots clean — the history baseline is established before any edit
  // — so the very first run of the edge effects below saw `!dirty` and cleared the
  // stamp we had just reloaded. The restored age was destroyed before anything could
  // read it, and the next edit stamped a fresh "now": the dot restarted at zero on
  // every reload and could only ever reach the red tier inside one long session.
  // These latches let the initial clean observation pass WITHOUT clearing, so only a
  // genuine dirty→clean transition (an actual save) resets the clock.
  const sfcRestoredPendingRef = useRef(restored.sfc !== null)
  const hsfRestoredPendingRef = useRef(restored.hsf !== null)

  /* eslint-disable react-you-might-not-need-an-effect/no-derived-state,
     react-you-might-not-need-an-effect/no-event-handler -- both edge effects below derive a
     checkpoint from a state TRANSITION (clean<->dirty). That is not an event handler moved
     into an effect: the restore lands across two commits and the edge is only visible by
     comparing against the previous render's flag, which no call site can do for us. */
  // Stamp the clean→dirty edge; clear on save. Deriving a checkpoint from a state
  // TRANSITION is the intentional set-state-on-edge pattern used elsewhere in this
  // codebase (it cannot be computed from current props alone), so the lint rules
  // that assume effects only mirror props are disabled for these two blocks.
  // Which restore this hook has already accounted for.
  //
  // The recovery must stay ARMED until a rising edge actually consumes it, and must not
  // be cleared merely by having been observed. The restore lands in two commits: the
  // seq bumps first, and `sfcDirty` only flips true once the history snapshot for the
  // restored body commits. Consuming on first sight therefore burned the recovery on a
  // still-clean render, and the real rising edge a commit later saw `recovering === false`
  // and stamped now — age 0, a neutral dot ramping from scratch, which is exactly the
  // "it doesn't ramp up" symptom. Disarming only on the edge that uses it also keeps the
  // one-shot guarantee: the next genuine edit still stamps normally.
  const armedRecoveredSeqRef = useRef(sfcRecovery.seq)
  //
  // EVERY edge input is snapshotted HERE, in the effect body, and the updater below closes
  // over those constants only. A state updater is DEFERRED: React may invoke it after the
  // effect body has already run to completion, so any mutable ref the updater reads has
  // been overwritten by then. Reading `prevSfcDirtyRef.current` inside the updater meant
  // the rising edge arrived as `dirty=true, wasDirty=true` — "still dirty, no edge" — and
  // the stamp stayed null forever: the dot appeared but could never age. Same reason the
  // restore-grace and recovery flags are read here rather than inside.
  useEffect(() => {
    const wasDirty = prevSfcDirtyRef.current
    const restorePendingNow = sfcRestoredPendingRef.current
    // Only a provenance that OWNS a pre-session age arms an adoption (SSOT predicate);
    // an anchored or derived load that bumped the counter must stamp normally.
    const pendingRecovery = sfcRecovery.seq !== armedRecoveredSeqRef.current
      && provenanceKeepsStalenessStamp(sfcRecovery.provenance)
    // A recovery only applies on the clean→dirty edge; until then it stays armed.
    const recovering = pendingRecovery && sfcDirty && !wasDirty
    const recoveredStamp = recovering ? sfcRecovery.divergedAt : null
    const now = Date.now()
    if (recovering) armedRecoveredSeqRef.current = sfcRecovery.seq
    prevSfcDirtyRef.current = sfcDirty
    setSfcDirtySince((current) => {
      const { next, restorePending } = resolveDirtySince({
        dirty: sfcDirty,
        wasDirty,
        // A recovery adopts the stamp the restored body carries. It is preferred over
        // `current` because the standalone staleness key can legitimately be absent
        // (any transient clean render deletes it), while the body's stamp travels with
        // the content it describes and therefore survives.
        current: recoveredStamp !== null ? recoveredStamp : current,
        restorePending: restorePendingNow,
        keepStamp: recovering,
        now,
      })
      sfcRestoredPendingRef.current = restorePending
      return next
    })
  }, [sfcDirty, sfcRecovery])

  useEffect(() => {
    // Same deferred-updater rule as the SFC effect above: snapshot, then close over it.
    const wasDirty = prevHsfDirtyRef.current
    const restorePendingNow = hsfRestoredPendingRef.current
    const now = Date.now()
    prevHsfDirtyRef.current = hsfDirty
    setHsfDirtySince((current) => {
      const { next, restorePending } = resolveDirtySince({
        dirty: hsfDirty,
        wasDirty,
        current,
        restorePending: restorePendingNow,
        now,
      })
      hsfRestoredPendingRef.current = restorePending
      return next
    })
  }, [hsfDirty])
  /* eslint-enable react-you-might-not-need-an-effect/no-derived-state,
     react-you-might-not-need-an-effect/no-event-handler */

  // Mirror both stamps to storage whenever either moves. Writing the pair as one
  // record keeps the two documents' clocks atomic — a half-written pair could show
  // one dot aging while the other silently reset.
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- writing to
     localStorage is a real external side effect (the whole point of this hook), not an
     event handler that could be called from the save/edit sites instead. */
  useEffect(() => {
    try {
      if (sfcDirtySince === null && hsfDirtySince === null) {
        // Both saved: drop the entry entirely rather than persisting a null pair,
        // so a clean install and a fully-saved session look identical in storage.
        localStorage.removeItem(STALENESS_SINCE_KEY)
        return
      }
      const record: StalenessSinceRecord = { sfc: sfcDirtySince, hsf: hsfDirtySince }
      localStorage.setItem(STALENESS_SINCE_KEY, JSON.stringify(record))
    } catch {
      // Storage full or blocked (private mode): the ramp degrades to session-only,
      // which is exactly today's behaviour. Never worth breaking the app over.
    }
  }, [sfcDirtySince, hsfDirtySince])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

  // Coarse clock driving re-renders as the ramp advances. Only runs while something
  // is actually unsaved — a saved session pays nothing.
  const anythingDirty = sfcDirtySince !== null || hsfDirtySince !== null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!anythingDirty) return
    // No eager re-sync here: `now` is seeded at mount and the stamps it is compared
    // against are restored in the same commit, so the first paint is already
    // accurate. The interval only has to carry it forward from there.
    const id = setInterval(() => setNow(Date.now()), STALENESS_TICK_MS)
    return () => clearInterval(id)
  }, [anythingDirty])

  return {
    sfcDirtySince,
    hsfDirtySince,
    now,
  }
}
