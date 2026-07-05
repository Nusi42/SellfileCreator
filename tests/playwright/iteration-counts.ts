// Centralized dev-vs-release iteration counts for the heavy endpoint/leak stress specs.
//
// Why this exists: the leak / fragmentation / incremental specs prove "no unbounded
// growth across many rounds". The audit value comes from the round COUNT, but those
// rounds are the single biggest wall-clock cost in the per-iteration dev loop. So the
// counts are split: a SHORT dev count that still exercises every code path (≥2–3 rounds
// catches a per-round leak's first step), and a FULL release count that proves flatness
// over a wide margin.
//
// Toggle: set E2E_FULL=1 (release:win does this) → full counts. Default (dev) → short.
// This is the ONE place the toggle is read; specs import named counts from here so the
// dev/release split is reviewable in a single file (One Definition Rule).

// True when the suite should run its full, release-grade iteration counts.
// release:win sets E2E_FULL=1; the everyday dev loop leaves it unset for a fast run.
export const E2E_FULL = process.env.E2E_FULL === '1'

// Pick the full count when E2E_FULL is set, otherwise the short dev count.
// Named wrapper (not inline ternaries) so every spec's intent reads the same way.
const pick = (full: number, dev: number): number => (E2E_FULL ? full : dev)

// endpoint-replay: JSON-RPC burst replayed N× to stress the WASM boundary.
// Dev 3 is already the documented release minimum; full keeps headroom for a deeper pass.
export const REPLAY_ROUNDS = pick(3, 3)
// endpoint-replay memory-leak variant: rounds with per-round revision bumps.
// Dev 3 catches a first leak step; full 20 proves flatness over a wide margin.
export const MEMORY_LEAK_ROUNDS = pick(20, 3)

// binary-endpoint-memory: rounds of rapid binary-push bursts.
// Dev 2 exercises the rapid-arrival path; full 8 sustains it for leak detection.
export const BINARY_MEMORY_ROUNDS = pick(8, 2)

// endpoint-incremental-updates: reveal one withheld artifact per round, growing the
// dataset monotonically. The pre-fix leak stepped within ~15 rounds, so dev 15 still
// reproduces a real leak; full 60 gives the wide flatness margin (and Firefox headroom).
export const INCREMENTAL_REVEAL_ROUNDS = pick(20, 15)

// binary-endpoint-fragmentation: cross-product of account modes × keep-toggle × DBs.
// The fragmentation signal needs allocation SIZES to churn run-to-run, which a subset
// still does (multiple modes + both keep states + multiple DBs). Dev caps the DBs per
// rule-set to the first 2 so the matrix stays varied but short; full uses every DB.
export const FRAGMENTATION_DBS_PER_RULESET = pick(Infinity, 2)
