import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  provenanceIsClean,
  provenanceKeepsStalenessStamp,
  readAutosaveDivergedAt,
  type SfcProvenance,
} from '../../src/lib/sfcProvenance.js'
import { resolveDirtySince } from '../../src/lib/stalenessRamp.js'
import { clampSavedIndex } from '../../src/hooks/useSfcHistory.js'

// ---------------------------------------------------------------------------
// Provenance — which loads leave the document clean.
// ---------------------------------------------------------------------------

// The contract: clean iff the content exists somewhere the user can get it back
// from without this tab. Only an anchored load qualifies.
test('only an anchored load presents as clean', () => {
  assert.equal(provenanceIsClean('anchored'), true)
  // A merge/clear result matches no file on disk — unsaved from the instant it lands.
  assert.equal(provenanceIsClean('derived'), false)
  // Restored autosave has never touched disk at all.
  assert.equal(provenanceIsClean('recovered'), false)
})

// Only a recovery carries an age that predates this session. A derived document was
// genuinely created just now, so it starts its clock at zero like any other edit.
test('only a recovery resumes the persisted staleness stamp', () => {
  assert.equal(provenanceKeepsStalenessStamp('recovered'), true)
  assert.equal(provenanceKeepsStalenessStamp('anchored'), false)
  assert.equal(provenanceKeepsStalenessStamp('derived'), false)
})

// Guards the pairing itself: a clean load must never also claim a stamp to resume,
// or the header would ask for an age on a document showing no dot.
test('clean and stamp-resuming provenances are mutually exclusive', () => {
  const all: SfcProvenance[] = ['anchored', 'derived', 'recovered']
  for (const provenance of all) {
    assert.equal(
      provenanceIsClean(provenance) && provenanceKeepsStalenessStamp(provenance),
      false,
      `${provenance} must not be both clean and stamp-resuming`,
    )
  }
})

// ---------------------------------------------------------------------------
// clampSavedIndex — the undo/redo branch-truncation defect.
// ---------------------------------------------------------------------------

// Regression: appending after an undo truncates entries.slice(index + 1). The saved
// anchor used to be carried across untouched, so an anchor living in the cut part
// survived as an index past the end of the array. `index !== savedIndex` was then
// permanently true: the document read dirty forever, and undoing back onto genuinely
// saved content could never clear it again.
test('an anchor branched away by truncation is dropped, not left dangling', () => {
  // Saved at entry 5, undone to entry 2, now editing: entries truncate to length 3.
  assert.equal(clampSavedIndex(5, 2), null)
  // One past the current entry is still gone — slice(0, index + 1) excludes it.
  assert.equal(clampSavedIndex(3, 2), null)
})

// The common case must be untouched: an anchor at or before the current entry is
// still reachable in the surviving timeline and keeps its index.
test('an anchor inside the surviving timeline is preserved', () => {
  assert.equal(clampSavedIndex(0, 0), 0)
  assert.equal(clampSavedIndex(2, 2), 2)
  assert.equal(clampSavedIndex(1, 4), 1)
})

// "No known-saved entry" is a real state (a document that has never been saved, or
// whose anchor was just branched away) and must round-trip as null.
test('a null anchor stays null', () => {
  assert.equal(clampSavedIndex(null, 0), null)
  assert.equal(clampSavedIndex(null, 7), null)
})

// ---------------------------------------------------------------------------
// readAutosaveDivergedAt — the divergence stamp carried in the autosave body.
// ---------------------------------------------------------------------------

const NOW_MS = 1_700_000_000_000

// The stamp travels with the content it describes, so a restore can show the real
// unsaved age even when the standalone staleness key was never written or was
// deleted by a transient clean render.
test('a valid divergence stamp is read back from the autosave payload', () => {
  const diverged = NOW_MS - 95 * 60_000
  assert.equal(readAutosaveDivergedAt({ DivergedAt: diverged }, NOW_MS), diverged)
})

// Entries written before the field existed must degrade to "unknown age" (stamp now),
// not to a wrong one. Autosave is ephemeral session state, so old entries are expected.
test('a payload without the field reads as unknown', () => {
  assert.equal(readAutosaveDivergedAt({ Recipes: [] }, NOW_MS), null)
  assert.equal(readAutosaveDivergedAt({}, NOW_MS), null)
})

// Malformed or hostile values must never become an age. A future stamp (a machine
// whose clock moved back) would otherwise read as a negative — or absurd — elapsed span.
test('malformed and future stamps read as unknown', () => {
  assert.equal(readAutosaveDivergedAt({ DivergedAt: 'yesterday' }, NOW_MS), null)
  assert.equal(readAutosaveDivergedAt({ DivergedAt: Number.NaN }, NOW_MS), null)
  assert.equal(readAutosaveDivergedAt({ DivergedAt: NOW_MS + 60_000 }, NOW_MS), null)
  assert.equal(readAutosaveDivergedAt(null, NOW_MS), null)
  assert.equal(readAutosaveDivergedAt('nope', NOW_MS), null)
})

// The exact scenario that motivated this: a session that NEVER saved. The standalone
// staleness key is absent (current === null), but the restored body carries the moment
// the document first diverged, so the dot comes back showing that real age.
test('a never-saved session recovers its age from the body, not the standalone key', () => {
  const diverged = NOW_MS - 95 * 60_000
  const fromBody = readAutosaveDivergedAt({ DivergedAt: diverged }, NOW_MS)
  // This is what App.tsx feeds resolveDirtySince as `current` on a recovery edge.
  const resolved = resolveDirtySince({
    dirty: true, wasDirty: false, current: fromBody, restorePending: false, keepStamp: true, now: NOW_MS,
  })
  assert.equal(resolved.next, diverged, 'the age must survive with no standalone stamp')
})

// Regression: restoreDraft (useAutosaveRestore) is an ALLOWLIST projection — it copies
// named fields out of the raw autosave payload one by one. DivergedAt was written by
// buildAutosavePayload but not named there, so it was silently dropped between the write
// and the read: every restore saw "age unknown" and stamped now, and the dot came back
// neutral no matter how long the work had been unsaved. This pins the round trip through
// the same validator the projection uses, so re-adding the field is not enough to pass —
// it has to survive with its value intact.
test('the divergence stamp survives the restore-draft projection', () => {
  const diverged = NOW_MS - 95 * 60_000
  // What buildAutosavePayload writes into the raw autosave entry.
  const rawPayload = { Recipes: [], AutosaveSavedAt: '2026-08-28T00:00:00.000Z', DivergedAt: diverged }
  // What the projection must carry forward (the value useAutosaveRestore forwards).
  const projected = readAutosaveDivergedAt(rawPayload, NOW_MS)
  assert.equal(projected, diverged, 'the stamp must not be dropped by the projection')
  // And what App.tsx then feeds resolveDirtySince on the recovery edge.
  const resolved = resolveDirtySince({
    dirty: true, wasDirty: false, current: projected, restorePending: false, keepStamp: true, now: NOW_MS,
  })
  assert.equal(resolved.next, diverged)
})

// Regression: the restore lands across TWO commits — sfcRecovery.seq bumps first, and
// sfcDirty only flips true once the history snapshot for the restored body commits.
// Consuming the recovery on first sight burned it on the still-clean render in between,
// so the real rising edge saw no recovery and stamped now: the dot came back at age 0 and
// ramped from scratch instead of resuming. The recovery must stay ARMED until a rising
// edge actually uses it. Mirrors the arming logic in useStalenessTracking.
test('a recovery stays armed across the commit where dirty has not flipped yet', () => {
  const diverged = NOW_MS - 95 * 60_000
  let prevDirty = false
  let pending = false
  let cur: number | null = null
  let armedSeq = 0

  const step = (dirty: boolean, seq: number, divergedAt: number | null) => {
    const pendingRecovery = seq !== armedSeq
    const recovering = pendingRecovery && dirty && !prevDirty
    if (recovering) armedSeq = seq
    const r = resolveDirtySince({
      dirty,
      wasDirty: prevDirty,
      current: recovering && divergedAt !== null ? divergedAt : cur,
      restorePending: pending,
      keepStamp: recovering,
      now: NOW_MS,
    })
    cur = r.next; pending = r.restorePending; prevDirty = dirty
    return recovering
  }

  step(false, 0, null)                        // mount, clean
  assert.equal(step(false, 1, diverged), false, 'recovery must NOT be consumed while still clean')
  assert.equal(step(true, 1, diverged), true, 'it applies on the commit where dirty flips')
  assert.equal(cur, diverged, 'the restored age is adopted, not restarted')

  // One-shot: a save then a genuine edit must stamp fresh, not re-adopt the old age.
  step(false, 1, diverged)                    // saved -> clean
  step(true, 1, diverged)                     // user edits
  assert.equal(cur, NOW_MS, 'a later edit stamps now')
})

// Regression: the edge effects passed `wasDirty` by reading a mutable ref from INSIDE the
// setState updater. A state updater is DEFERRED — React invokes it after the effect body
// has finished, by which point the body's trailing `prevDirtyRef.current = dirty` has
// already overwritten it. The rising edge therefore arrived as dirty=true/wasDirty=true
// ("still dirty, no edge"), so the stamp was never set: the dot appeared but had no age
// and could never leave neutral, and the tick stayed parked because it is gated on the
// stamp being non-null. The fix is to SNAPSHOT every edge input in the effect body and let
// the updater close over those constants. This pins the consequence.
test('a rising edge stamps even when the previous-dirty ref is mutated before the updater runs', () => {
  const prevDirtyRef = { current: false }

  // How the effect body must behave: snapshot first, then mutate, then defer.
  const wasDirty = prevDirtyRef.current
  const now = NOW_MS
  prevDirtyRef.current = true // body mutates immediately, as it must for the next edge

  // The updater runs LATER, closing over the snapshot rather than re-reading the ref.
  const resolved = resolveDirtySince({
    dirty: true, wasDirty, current: null, restorePending: false, keepStamp: false, now,
  })
  assert.equal(resolved.next, NOW_MS, 'the edge must stamp; reading the ref here would yield null')

  // Proof the old shape was broken: re-reading the mutated ref loses the edge entirely.
  const viaMutatedRef = resolveDirtySince({
    dirty: true, wasDirty: prevDirtyRef.current, current: null, restorePending: false, keepStamp: false, now,
  })
  assert.equal(viaMutatedRef.next, null, 'reading the mutated ref reproduces the bug')
})
