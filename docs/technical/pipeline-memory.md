# Pipeline Memory: Farm-Run / Override-Churn OOM Analysis

Analysis of the 2026-07-15 tab-crash (OOM) reports: the app dies after several RSL
Helper farm runs, and occasionally when rapidly flipping dynamic-override answers in
the note dialog — in dev AND release builds. Reproduced, quantified, and root-caused
against the captured sessions committed as
`tests/fixtures/captures/session_260715_212027.627|212207.259.tar.zst`
(see [packet-capture.md](packet-capture.md) for the capture/fixture workflow).

## Symptoms and live telemetry

The captured farm session (`session_260715_212207.259`, 110 packets ≈ 940 MB raw) ends
at the live crash; its `console.log` records the dev heap telemetry: main-thread heap
oscillating **1.9 → 3.3 GB** across 29 pipeline runs, worker WASM linear memory ratcheting
**256 → 925 MB** (grow-only, by WebAssembly design). During farming RSL Helper resends the
**full ~7.7k-artifact list (~11.6 MB JSON) on every change** — a pickup of 1–2 items
retransmits everything — and the app pushed `uploadSellfile` HSFs of ~50.7k rules (~27 MB)
several times.

## Reproductions (all committed)

| Harness | Trigger | Result |
| --- | --- | --- |
| `tests/playwright/capture-replay-memory.spec.ts` | Replays the captured session against the production bundle, CDP-precise heap per burst | 277 MB → **3.1 GB plateau** by burst ~30, rising-sawtooth identical to live telemetry |
| `tests/playwright/override-churn-memory.spec.ts` | lategame.sfc + the account-d gear-DB fixture, rapid note-override flips, **no endpoint** | 464 MB → **2.27 GB** after 7 flips, GC dip, climbs again |
| `REPRO_SESSION=… npm run repro:capture-replay` (Node) | Same session through the production ingest+pipeline offline | Confirms per-build constants below; no UI/React involved |

Both browser triggers share one code path: every artifact change or override-answer change
launches a full worker pipeline whose result is structured-cloned to the main thread and
retained as a fresh `PipelineCacheEntry` generation (`src/App.tsx` `PIPELINE_CACHE_MAX = 10`).

Measurement note: `performance.memory.usedJSHeapSize` is **quantized** in Chromium and can
flat-line at one value for minutes; the specs use CDP `Performance.getMetrics`
(`JSHeapUsedSize`) instead.

## Root cause — what one pipeline generation costs

Per pipeline build on this real account (Node harness, constant across the session):

- **45,524 final merged rules** (~21 MB as JS objects per independent clone; the app
  pushed 50.7k live with the user's override answers),
- **210,279 safeguard placeholder objects** in the detection snapshot
  (`SafeguardPlaceholderRequest` — improvement-watch placeholders persist at zero
  deficit over the expected slot×set×faction domain, so the count is dominated by
  zero-deficit corner-probe entries), est. 40–80 MB per clone,
- 3,821 protected-artifact entries + per-artifact `matches` + improvement-chance entries
  + 7.7k processed preview rows.

≈ **200+ MB per generation** once the entry's `result`, `processedSnapshot`,
`processedRows`, detection snapshot and improvement-chance map are counted. The pipeline
cache retains up to **10 generations** (LRU + 3 min TTL) → ~2–2.5 GB steady state, plus
per-run transients (worker→main structured clone, post-processing, 27 MB push envelope)
→ the observed 3.1–3.3 GB peaks → OOM on lower-headroom machines/WebViews.

The kicker: **the detection outcome and merged rules never changed during the whole
captured session** (constant 45,524 / 3,821 / 210,279), yet every build re-cloned and
re-retained full independent copies.

The worker already elides *some* of this: when `MergedOutputSignature` (incl.
`detectionKey`) is unchanged it sends `null` for the three rule fields
(`src/workers/ruleCacheWorker.ts` ~888–929). But `matches`, `safeguardDetection`
(the 210k placeholders) and `improvementChanceEntries` are sent **unconditionally**
(~937–939), even when the already-computed `detectionKey` proves them identical.

WASM side: the 925 MB linear-memory high-water comes from serializing these payloads
across the boundary each build (45k rules in, 210k placeholders + matches out); linear
memory never shrinks and the worker intentionally never cycles
(`src/hooks/useRuleCacheWorker.ts` ~210–229).

Secondary contributors (not the root cause):

- Dev-only `?capturePackets` retains each frame's pretty-printed multi-MB string in the
  serial POST chain until drained (`src/lib/packetCapture.ts` `postChain`) — inflates
  dev capture sessions only.
- Session 1 (`…212027.627`) shows a **1.75 GB main heap right after autosave restore**,
  before any endpoint frame — the restore path (multi-account state + boot-time pipeline
  cascade) deserves its own follow-up.

## Mitigations (no functional loss)

1. **Unchanged-elision extended to the remaining payload fields** *(implemented)*.
   The worker reuses `detectionKey` to send `safeguardDetection: null` +
   `safeguardDetectionUnchanged` when content-identical to the previous send (main
   thread reuses `lastDetectionRef`, as `lastRulesRef` already does for rules); same
   for `improvementChanceEntries` via the compute-memo key. Cache generations now share
   ONE object graph while nothing changes — for the captured session this collapses ~10
   independent copies to ~1. `matches` stays uncached-elided: it changes whenever
   artifacts change (every farm burst), so elision would never fire.
   Included fix: the main thread records payload content into the fallback refs BEFORE
   any early return — previously a response dropped by a caller abort desynced
   `lastRulesRef` from the worker's `lastSentSignature`, letting a later "unchanged"
   elision resurrect stale rules (a pre-existing latent bug, not just a memory issue).
2. **Byte-budgeted pipeline cache** *(implemented — `src/lib/pipelineCache.ts`)*.
   600 MiB budget with a 2-entry floor and the old 10-entry cap retained; accounting is
   refcounted by object identity (`SharedGraphBudget`) so graphs shared across entries
   via (1) are charged once. Costs a handful of Map ops at insert/evict only — nothing
   per frame. All cache mutations flow through one insert/delete/clear SSOT in App.tsx.
3. **Placeholders are wasm-resident** *(implemented)*. Placeholder objects
   never cross the JS boundary at all anymore: detection moves them into an engine-side
   hand-off store (`stash_detection_placeholders` in
   `wasm/rule_engine_core/src/safeguards/mod.rs`), and JS snapshots carry only a
   per-entry `placeholderCount` + an engine-computed `placeholderFingerprint` plus a
   snapshot-level `placeholderStateId`. Merge-time rule emission rehydrates the store
   inside the engine (`rehydrate_detection_placeholders`), validating the state id +
   per-entry hashes — a stale store fails the merge loudly instead of silently dropping
   placeholder rules. Composition note: on the reference account ALL 210,279 placeholders
   are deficit placeholders (`missing > 0`, mostly-empty expected groups) that legitimately
   drive merge-time keep rules — so "drop dead weight" was not an option; removing the
   boundary crossing was. Side effects: the worker's `detectionKey` fold is now
   O(entries) instead of O(placeholders), the merge payload no longer serializes the
   placeholder lists in either direction, and detection snapshots retained by the
   pipeline cache shrink accordingly. Detection snapshots are not persisted (verified:
   no sfcIO/autosave consumer), so no migration path was needed. Rule-output parity
   verified exactly on the capture session (finalRules/protected/Σcount unchanged).
4. **Idle-gated worker recycle** *(implemented)*. When the worker has been fully idle
   for 60 s and its linear memory exceeds 3× the 256 MiB pre-grow (768 MiB), it is
   replaced once, releasing the grow-only reservation. Under-load cycling remains
   forbidden (the documented dead-heap stacking failure); at idle only one dead heap
   exists and GC has quiet time to reclaim it.
5. **Smaller wins** *(implemented)*: the endpoint push no longer materializes the
   download Blob (a throwaway multi-MB pretty-print) just to read its MIME type
   (`HSF_EXPORT_CONTENT_TYPE` SSOT in hsfIO); the dev capture queue got coalescing
   backpressure (see packet-capture.md — newest frame per method always kept, so a
   replayed capture still ends on the latest state).

## Measured outcome

Post-mitigation, both reproductions measure RETAINED heap (forced GC before each
sample — `tests/playwright/heap-metrics.ts`, the measurement SSOT for these specs;
un-GC'd `usedJSHeapSize` counts collectable garbage and is useless for assertions):

| Scenario | Pre-fix | Post-fix |
| --- | --- | --- |
| Farm-run replay (25 bursts) | ratchets past +2.5 GB, still climbing | **plateaus at +678 MB**, flat from ~burst 13 |
| Override churn (12 rounds) | peaks +1.8 GB and climbing | **plateaus at +677 MB**, flat from round 4 |
| Worker WASM high-water | 925 MB live | 729 MB, reclaimed by the idle recycle above 768 MB |

The plateau ≈ the 600 MiB cache budget + the live display generation — exactly the
designed bound. On the real user workload (stable override answers → detection content
constant across a farm session) the elision additionally collapses cached generations
to one shared graph, so real sessions sit well below the spec plateau.

## Regression guardrails

`capture-replay-memory.spec.ts` (dev cap: first 25 bursts, full: whole session — see
`CAPTURE_REPLAY_BURSTS` in `tests/playwright/iteration-counts.ts`) asserts retained
growth ≤ 1200 MB and WASM high-water ≤ 1024 MB; `override-churn-memory.spec.ts` asserts
retained growth ≤ 1200 MB (both ~1.8× the observed plateau). Each burst/round also logs
`settleMs`/`measureMs` so a slow run names its slow step. Related coverage:
`endpoint-incremental-updates.spec.ts` keeps its tighter ±300 MB bound on the synthetic
growing-inventory axis (finer-grained leak detector than the real-traffic ceilings here);
`binary-endpoint-fragmentation.spec.ts` covers the binary-push/allocator axis. The
now-redundant piece is `endpoint-replay.spec.ts`'s `json per-type burst does not leak
memory` variant (logs growth but asserts nothing) — a candidate for retirement.

Known loose end: two runner-only intermittent stalls were observed during validation
(every burst blocking its full settle budget; app healthy and retained numbers normal in
the same runs; not reproducible outside the Playwright runner or in subsequent runs).
The per-step duration logs above exist to pin it down if it recurs.
