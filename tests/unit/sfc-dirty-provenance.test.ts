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
