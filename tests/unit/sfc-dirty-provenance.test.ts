import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  provenanceIsClean,
  provenanceKeepsStalenessStamp,
  type SfcProvenance,
} from '../../src/lib/sfcProvenance.js'
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
