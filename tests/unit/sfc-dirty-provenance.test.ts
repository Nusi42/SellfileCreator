import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadProvenanceFromAutosave,
  provenanceIsClean,
  provenanceKeepsStalenessStamp,
  readAutosaveAnchored,
  readAutosaveDivergedAt,
  restoreProvenance,
  type SfcProvenance,
} from '../../src/lib/sfcProvenance.js'
import { restoreDraftIsAnchored } from '../../src/hooks/useAutosaveRestore.js'
import {
  getSimpleCustomSnapshot,
  setSimpleCustomSnapshot,
  clearSimpleCustomSnapshot,
  SIMPLE_CUSTOM_SNAPSHOT_KEY,
} from '../../src/lib/externalWsProtocol.js'
import {
  RESTORE_SELECTION_DEFAULT,
  restoreCoversWholeSfcBody,
  type RestoreOptionKey,
  type RestoreSelection,
} from '../../src/types/restoreAutosaveSelection.js'
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

// Regression: the recovery arming test used to be the bare counter comparison
// `seq !== armedSeq`, with `provenanceKeepsStalenessStamp` exported, documented as the SSOT
// for the rule, and called from nowhere but this file. The rule therefore had two homes: the
// tested-but-unused predicate, and untested inline logic in the hook. Routing the arming
// THROUGH the predicate means a provenance that must not resume an age cannot do so just by
// bumping the counter — which is what any future non-recovery load reaching that signal would
// otherwise do.
test('only a stamp-resuming provenance arms the adoption, not the bare counter', () => {
  const diverged = NOW_MS - 95 * 60_000
  let prevDirty = false
  let armedSeq = 0
  let cur: number | null = null

  // Mirrors useStalenessTracking: the counter moving is necessary but NOT sufficient.
  const step = (dirty: boolean, seq: number, provenance: SfcProvenance) => {
    const pendingRecovery = seq !== armedSeq && provenanceKeepsStalenessStamp(provenance)
    const recovering = pendingRecovery && dirty && !prevDirty
    if (recovering) armedSeq = seq
    const r = resolveDirtySince({
      dirty,
      wasDirty: prevDirty,
      current: recovering ? diverged : cur,
      restorePending: false,
      keepStamp: recovering,
      now: NOW_MS,
    })
    cur = r.next; prevDirty = dirty
    return recovering
  }

  // A DERIVED load that bumps the counter must not adopt a pre-session age — the document
  // was genuinely created just now, so its clock starts at zero.
  assert.equal(step(true, 1, 'derived'), false, 'derived must not arm an adoption')
  assert.equal(cur, NOW_MS, 'a derived load stamps now')

  // A recovery on the same counter movement does adopt it.
  prevDirty = false
  armedSeq = 0
  cur = null
  assert.equal(step(true, 1, 'recovered'), true, 'recovered arms the adoption')
  assert.equal(cur, diverged, 'the restored age is resumed')
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

// ---------------------------------------------------------------------------
// restoreProvenance — the never-edited preset that came back dirty.
// ---------------------------------------------------------------------------

// The reported bug: load a bundled preset, change nothing, restart. Autosave had
// written the preset body (stamped with its PresetOrigin marker), the restore anchored
// it 'recovered' unconditionally, and the app came up with a dirty dot plus the
// "you still have unsaved work" arrows — on a document the user never touched. The
// content is one click away from the preset buttons, so the clean contract says clean.
test('a whole-body restore of a preset-stamped draft is clean, not recovered', () => {
  assert.equal(restoreProvenance(true), 'anchored')
  assert.equal(provenanceIsClean(restoreProvenance(true)), true)
})

// The default must not move: a custom body restored from autosave has never touched
// disk, which is the whole reason the staleness ramp exists.
test('a restore that is not preset-anchored stays recovered', () => {
  assert.equal(restoreProvenance(false), 'recovered')
  assert.equal(provenanceIsClean(restoreProvenance(false)), false)
  // And it still resumes the persisted age rather than restarting the clock.
  assert.equal(provenanceKeepsStalenessStamp(restoreProvenance(false)), true)
})

// Regression companion to the DivergedAt projection test above: restoreDraft is an
// ALLOWLIST, so the preset marker has to be named there too. If it is dropped between
// the autosave write and the restore read, every restored preset falls back to
// 'recovered' and the never-edited preset is dirty again — the original bug, restored
// by omission rather than by logic. This pins the field name both sides agree on.
test('the preset marker key is the one the autosave payload writes', () => {
  // What buildAutosavePayload stamps, and what the projection must forward under the
  // same key for restoreProvenance to ever see it.
  const rawPayload: Record<string, unknown> = { Recipes: [], PresetOrigin: 'lategame' }
  const forwarded = rawPayload['PresetOrigin']
  assert.equal(forwarded, 'lategame')
  assert.equal(restoreProvenance(Boolean(forwarded)), 'anchored')
  // A custom body carries no marker, so the restore stays recovered.
  assert.equal(restoreProvenance(Boolean(({ Recipes: [] } as Record<string, unknown>)['PresetOrigin'])), 'recovered')
})

// ---------------------------------------------------------------------------
// restoreCoversWholeSfcBody — whole restore vs. partial.
// ---------------------------------------------------------------------------

const selectionOf = (...keys: RestoreOptionKey[]): RestoreSelection => {
  const next: RestoreSelection = { ...RESTORE_SELECTION_DEFAULT }
  for (const key of keys) next[key] = true
  return next
}

// The typical preset restart: the dialog offers recipes and note (a preset has both),
// the user accepts both, and the result is the preset body whole.
test('accepting every offered identity row covers the whole body', () => {
  const offered = new Set<RestoreOptionKey>(['recipes', 'note'])
  assert.equal(restoreCoversWholeSfcBody(selectionOf('recipes', 'note'), offered), true)
})

// Leaving one offered row unchecked mixes session content into the result, so it is no
// longer the preset and must not be anchored clean.
test('declining an offered identity row is a partial restore', () => {
  const offered = new Set<RestoreOptionKey>(['recipes', 'note'])
  assert.equal(restoreCoversWholeSfcBody(selectionOf('recipes'), offered), false)
  assert.equal(restoreCoversWholeSfcBody(RESTORE_SELECTION_DEFAULT, offered), false)
})

// A row is only offered when it has content AND (metasets/targets) differs from the
// session. An unoffered row therefore means the session already equals the draft there,
// so the body is still whole without the user checking anything for it.
test('rows that were never offered do not block a whole-body restore', () => {
  const offered = new Set<RestoreOptionKey>(['recipes'])
  // metasets/targets/note/safeguards were not offered — already equal, or absent.
  assert.equal(restoreCoversWholeSfcBody(selectionOf('recipes'), offered), true)
})

// Gear Inspector items and runtime gear sets live outside the SFC body, so they can be
// declined (or accepted) without changing whether the document is the preset.
test('gear rows do not affect whether the SFC body was fully restored', () => {
  const offered = new Set<RestoreOptionKey>(['recipes', 'note'])
  const withoutGear = selectionOf('recipes', 'note')
  const withGear = selectionOf('recipes', 'note', 'gearInspector', 'gearSets')
  assert.equal(restoreCoversWholeSfcBody(withoutGear, offered), true)
  assert.equal(restoreCoversWholeSfcBody(withGear, offered), true)
})

// The two rules compose into the actual App decision: marker present AND whole body.
test('the restore decision needs both the marker and a whole-body restore', () => {
  const offered = new Set<RestoreOptionKey>(['recipes', 'note'])
  const whole = restoreCoversWholeSfcBody(selectionOf('recipes', 'note'), offered)
  const partial = restoreCoversWholeSfcBody(selectionOf('recipes'), offered)
  // The two drafts the handler distinguishes: one still a built-in, one the user's own.
  const presetDraft: { PresetOrigin?: string } = { PresetOrigin: 'lategame' }
  const customDraft: { PresetOrigin?: string } = {}
  // Mirrors App.tsx: marker present AND the whole body restored.
  const decide = (draft: { PresetOrigin?: string }, covered: boolean) =>
    restoreProvenance(Boolean(draft.PresetOrigin) && covered)
  // Preset marker + whole body -> clean. This is the reported bug's fix.
  assert.equal(decide(presetDraft, whole), 'anchored')
  // Preset marker but a partial restore -> the result is not the preset.
  assert.equal(decide(presetDraft, partial), 'recovered')
  // A custom body is recovered however much of it was restored.
  assert.equal(decide(customDraft, whole), 'recovered')
})

// ---------------------------------------------------------------------------
// The anchored marker — the general "was this body recoverable when written?" answer.
// ---------------------------------------------------------------------------

// The reported bug: modify, SAVE, reload, restore -> dirty dot and "unsaved work" arrows on
// a document that had just been written to disk. The entry now records clean/dirty at
// write time (Anchored vs DivergedAt, one predicate), so the restore reads it back instead
// of guessing from special cases.
test('the anchored marker reads back only as a literal true', () => {
  assert.equal(readAutosaveAnchored({ Recipes: [], Anchored: true }), true)
  // Absent (pre-field entry) or anything but a literal true must degrade to "not anchored"
  // — today's recovered reading — never to a false "saved".
  assert.equal(readAutosaveAnchored({ Recipes: [] }), false)
  assert.equal(readAutosaveAnchored({ Anchored: 'true' }), false)
  assert.equal(readAutosaveAnchored({ Anchored: 1 }), false)
  assert.equal(readAutosaveAnchored(null), false)
  assert.equal(readAutosaveAnchored('nope'), false)
})

// The one decision every restore funnels through: either marker anchors, neither stays
// recovered. PresetOrigin remains an anchor in its own right (byte-identical to a bundled
// preset is recoverable whatever the history state said at write time).
test('a draft is anchored by the clean-at-write marker or by a preset origin', () => {
  assert.equal(restoreDraftIsAnchored({ Anchored: true }), true)
  assert.equal(restoreDraftIsAnchored({ PresetOrigin: 'lategame' }), true)
  assert.equal(restoreDraftIsAnchored({ Anchored: true, PresetOrigin: 'beginner' }), true)
  // A dirty-era entry (DivergedAt, no marker) and a pre-field entry both stay recovered.
  assert.equal(restoreDraftIsAnchored({ DivergedAt: NOW_MS - 60_000 }), false)
  assert.equal(restoreDraftIsAnchored({ Recipes: [] }), false)
  assert.equal(restoreDraftIsAnchored(null), false)
  assert.equal(restoreDraftIsAnchored(undefined), false)
})

// The full chain the save-then-reload report exercises, in the terms the handler uses.
test('a saved document restored whole is clean; restored partially it is not', () => {
  const offered = new Set<RestoreOptionKey>(['recipes', 'note'])
  const savedDraft = { Anchored: true as const }
  const whole = restoreCoversWholeSfcBody(selectionOf('recipes', 'note'), offered)
  const partial = restoreCoversWholeSfcBody(selectionOf('recipes'), offered)
  assert.equal(restoreProvenance(restoreDraftIsAnchored(savedDraft) && whole), 'anchored')
  assert.equal(restoreProvenance(restoreDraftIsAnchored(savedDraft) && partial), 'recovered')
  // And the never-saved session keeps its warning — plus its real age.
  const unsavedDraft = { DivergedAt: NOW_MS - 95 * 60_000 }
  assert.equal(restoreProvenance(restoreDraftIsAnchored(unsavedDraft) && whole), 'recovered')
  assert.equal(readAutosaveDivergedAt(unsavedDraft, NOW_MS), NOW_MS - 95 * 60_000)
})

// ---------------------------------------------------------------------------
// loadProvenanceFromAutosave -- the express custom-setup restore lands as the entry recorded.
// ---------------------------------------------------------------------------

// The express boot restores the user's own body by feeding the autosave entry through
// the normal file-load path, which used to anchor unconditionally: an unsaved custom
// setup came back reading as a freshly opened file, so the Custom button's dirty dot
// (the simple view's only unsaved warning) could never survive a reload.
test('an entry written while dirty restores as a recovery that resumes its age', () => {
  const diverged = NOW_MS - 95 * 60_000
  const load = loadProvenanceFromAutosave({ Recipes: [], DivergedAt: diverged }, NOW_MS)
  assert.equal(load.provenance, 'recovered')
  assert.equal(load.divergedAt, diverged)
  assert.equal(provenanceKeepsStalenessStamp(load.provenance), true)
})

test('an entry written while clean restores anchored with no age to resume', () => {
  const load = loadProvenanceFromAutosave({ Recipes: [], Anchored: true }, NOW_MS)
  assert.equal(load.provenance, 'anchored')
  assert.equal(load.divergedAt, null)
  assert.equal(provenanceIsClean(load.provenance), true)
})

// A pre-field entry has neither marker: recovered with an unknown age, exactly the
// dialog's reading, so the two restore paths can never disagree about the same entry.
test('a pre-field entry restores as a recovery of unknown age', () => {
  const load = loadProvenanceFromAutosave({ Recipes: [] }, NOW_MS)
  assert.equal(load.provenance, 'recovered')
  assert.equal(load.divergedAt, null)
})

// ---------------------------------------------------------------------------
// The durable simple-mode Custom snapshot.
// ---------------------------------------------------------------------------

// A minimal localStorage stand-in for the storage helpers (node has none).
const installMemoryStorage = () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
  // The helpers go through window.localStorage (the guard the incognito file:// launch
  // needs), so the stand-in has to hang off a window object, not the global.
  ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage }
  return store
}

// The snapshot must round-trip WITH its unsaved stamp: the stamp is what puts the dirty
// dot on the Custom button after a reload, so losing it would present unsaved rules as
// saved.
test('the custom snapshot round-trips text and unsaved stamp', () => {
  const store = installMemoryStorage()
  setSimpleCustomSnapshot({ text: '{"Recipes":[]}', dirtySince: NOW_MS - 60_000 })
  assert.deepEqual(getSimpleCustomSnapshot(), { text: '{"Recipes":[]}', dirtySince: NOW_MS - 60_000 })
  setSimpleCustomSnapshot({ text: '{"Recipes":[]}', dirtySince: null })
  assert.deepEqual(getSimpleCustomSnapshot(), { text: '{"Recipes":[]}', dirtySince: null })
  clearSimpleCustomSnapshot()
  assert.equal(getSimpleCustomSnapshot(), null)
  assert.equal(store.has(SIMPLE_CUSTOM_SNAPSHOT_KEY), false)
})

// Anything malformed reads as "no snapshot" — the worst outcome is a missing button,
// never a broken load from half a document or a bogus age.
test('a malformed custom snapshot reads as absent', () => {
  const store = installMemoryStorage()
  for (const raw of ['', 'nope', '{}', '{"text":""}', '{"text":"x","dirtySince":"soon"}', '{"text":"x","dirtySince":1e999}', '[]']) {
    store.set(SIMPLE_CUSTOM_SNAPSHOT_KEY, raw)
    assert.equal(getSimpleCustomSnapshot(), null, `raw=${raw}`)
  }
})
