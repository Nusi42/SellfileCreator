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
  /** True when a restored session came back with SFC work already unsaved. */
  restoredDirtySfc: boolean
}

/**
 * Tracks both documents' unsaved age. `sfcDirty` / `hsfDirty` are the live dirty
 * flags; this hook stamps their rising edges, clears on save, and persists both.
 */
export function useStalenessTracking(sfcDirty: boolean, hsfDirty: boolean): StalenessTracking {
  // Restore once, at mount, before any edge has been observed this session.
  const [restored] = useState(() => readPersistedStamps(Date.now()))
  // Whether the SFC came back from storage already dirty — the startup nudge reads
  // this to decide it should point at Save. Frozen at mount (a plain initializer,
  // never updated) because a later save clears the stamp while the nudge still
  // needs to know how the session STARTED.
  const [restoredDirtySfc] = useState(() => restored.sfc !== null)

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

  /* eslint-disable react-you-might-not-need-an-effect/no-derived-state */
  // Stamp the clean→dirty edge; clear on save. Deriving a checkpoint from a state
  // TRANSITION is the intentional set-state-on-edge pattern used elsewhere in this
  // codebase (it cannot be computed from current props alone), so the lint rules
  // that assume effects only mirror props are disabled for these two blocks.
  useEffect(() => {
    setSfcDirtySince((current) => {
      const { next, restorePending } = resolveDirtySince({
        dirty: sfcDirty,
        wasDirty: prevSfcDirtyRef.current,
        current,
        restorePending: sfcRestoredPendingRef.current,
        now: Date.now(),
      })
      sfcRestoredPendingRef.current = restorePending
      return next
    })
    prevSfcDirtyRef.current = sfcDirty
  }, [sfcDirty])

  useEffect(() => {
    setHsfDirtySince((current) => {
      const { next, restorePending } = resolveDirtySince({
        dirty: hsfDirty,
        wasDirty: prevHsfDirtyRef.current,
        current,
        restorePending: hsfRestoredPendingRef.current,
        now: Date.now(),
      })
      hsfRestoredPendingRef.current = restorePending
      return next
    })
    prevHsfDirtyRef.current = hsfDirty
  }, [hsfDirty])
  /* eslint-enable react-you-might-not-need-an-effect/no-derived-state */

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
    restoredDirtySfc,
  }
}
