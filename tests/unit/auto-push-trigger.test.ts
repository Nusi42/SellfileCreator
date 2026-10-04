import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextFrame } from '../../src/lib/nextFrame.js'
import { keptAttemptedHash, shouldAutoPush, type AutoPushInputs } from '../../src/lib/autoPushTrigger.js'

// ---------------------------------------------------------------------------
// Auto-push trigger. Each case replays the effect the way App.tsx runs it: keep (or drop)
// the attempted fingerprint, ask shouldAutoPush, and on a push record the document tried.
// The two sequences below are the ones the old clean→dirty edge trigger got wrong.
// ---------------------------------------------------------------------------

const base: AutoPushInputs = {
  enabled: true,
  connected: true,
  dirty: true,
  inFlight: false,
  docHash: 'A',
  attemptedHash: null,
}

// One effect run: returns whether it pushed and the attempted fingerprint it leaves behind.
const run = (s: AutoPushInputs): { pushed: boolean; attempted: string | null } => {
  const kept = keptAttemptedHash(s)
  if (!shouldAutoPush(s)) return { pushed: false, attempted: kept }
  return { pushed: true, attempted: s.docHash }
}

test('an edit made while a push is in flight is pushed once that push settles', () => {
  // Edit A → push A.
  let r = run(base)
  assert.equal(r.pushed, true)
  // Edit B lands while A is still uploading: wait, do not pile up a second upload.
  r = run({ ...base, inFlight: true, docHash: 'B', attemptedHash: r.attempted })
  assert.equal(r.pushed, false)
  // A settles (baseline = A, document = B, still dirty): B goes out. The edge trigger
  // never fired here — dirty had stayed true the whole time.
  r = run({ ...base, docHash: 'B', attemptedHash: r.attempted })
  assert.equal(r.pushed, true)
  assert.equal(r.attempted, 'B')
})

test('a failed push is not retried in a loop, but the next edit pushes again', () => {
  let r = run(base)
  assert.equal(r.pushed, true)
  // The push failed: still dirty, same document — no retry on every re-render.
  r = run({ ...base, attemptedHash: r.attempted })
  assert.equal(r.pushed, false)
  // The user edits again: the edge trigger stayed silent here; this pushes.
  r = run({ ...base, docHash: 'A2', attemptedHash: r.attempted })
  assert.equal(r.pushed, true)
})

test('reconnecting or switching auto-push on retries a document that could not be delivered', () => {
  let r = run(base)
  // The socket drops before the upload lands; the attempt is forgotten while offline.
  r = run({ ...base, connected: false, attemptedHash: r.attempted })
  assert.equal(r.pushed, false)
  assert.equal(r.attempted, null)
  // Back online with the same, still-unpushed document: it goes out.
  assert.equal(run({ ...base, attemptedHash: r.attempted }).pushed, true)
  // Same for toggling auto-push off and on.
  r = run({ ...base, enabled: false, attemptedHash: 'A' })
  assert.equal(run({ ...base, attemptedHash: r.attempted }).pushed, true)
})

test('a clean document is never pushed', () => {
  assert.equal(run({ ...base, dirty: false }).pushed, false)
})

test('nextFrame resolves even when no animation frame ever comes (a hidden embed)', async () => {
  // Model a document the browser is not painting: rAF accepts the callback and never calls it.
  const g = globalThis as unknown as { window?: unknown }
  const had = 'window' in g
  const prev = g.window
  g.window = {
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  }
  try {
    // A bare rAF await would hang here forever and fail the test by timeout.
    await nextFrame()
  } finally {
    if (had) g.window = prev
    else delete g.window
  }
})
