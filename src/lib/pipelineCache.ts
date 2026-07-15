/**
 * pipelineCache — retention policy + byte-budget accounting for the App.tsx pipeline
 * result cache (the undo/redo / farming round-trip cache of processed worker results).
 *
 * Why a byte budget: a fixed entry count (the old 10-entry LRU) scales retention with
 * PAYLOAD size, and on large accounts one pipeline generation is huge (~45k merged rules
 * + a safeguard-detection snapshot whose placeholder lists exceed 200k objects). Ten such
 * generations retained ~2.5 GB and OOM'd the tab during farm runs / override churn (see
 * docs/technical/pipeline-memory.md). A byte budget keeps small-account behaviour
 * identical (count cap binds first) while big-account retention degrades to fewer
 * entries instead of a crash.
 *
 * Why refcounted identity accounting: consecutive generations SHARE object graphs — the
 * worker elides unchanged mergedRules / detection snapshots / improvement-chance entries
 * (see ruleCacheWorker's lastSent* sentinels), so ten cache entries may reference ONE
 * detection snapshot. Charging every entry the full graph would over-count ~10× and
 * evict a cache that actually holds one copy. `SharedGraphBudget` therefore counts each
 * distinct graph (by object identity) once, whatever the number of entries holding it.
 *
 * Performance contract: accounting runs ONLY on cache insert/evict (a handful of Map
 * operations + an O(#detection-entries) size estimate computed once per distinct graph).
 * Nothing here runs per frame, per row, or per keystroke.
 */

// ── Retention policy (SSOT for every pipeline-cache limit) ─────────────────────────
// Hard entry-count cap — binds first for small payloads, preserving the pre-budget
// behaviour (at most 10 generations) exactly.
export const PIPELINE_CACHE_MAX_ENTRIES = 10
// Entries older than this are evicted (sliding on hit); bounds retention by time even
// when the budget/count caps never bind.
export const PIPELINE_CACHE_TTL_MS = 3 * 60 * 1000
// Total estimated bytes across all cached generations (distinct graphs counted once).
export const PIPELINE_CACHE_BUDGET_BYTES = 600 * 1024 * 1024
// Never evict below this many entries, even over budget: the newest entry serves the
// current state and one more covers the single-step undo/redo round-trip. Worst case
// retention is therefore ~2 maximal generations, far below the OOM regime.
export const PIPELINE_CACHE_MIN_ENTRIES = 2

// ── Per-unit byte estimates ────────────────────────────────────────────────────────
// Coarse V8 object-graph sizes. Only the order of magnitude matters (they steer
// eviction pressure, not any user-visible value); measured anchor: 25,025 exported
// rules re-materialized as fresh objects cost ~11.7 MB ⇒ ~490 B/rule.
const RULE_BYTES = 500
// itemId + two EvalResult refs + matchingRecipeIndices/Decisions arrays.
const MATCH_BYTES = 300
// Row object + two GearInspectorPreviewMatch objects (~12 props each).
const ROW_BYTES = 400
// combination object + missing/reason + optional substatVariants/sample/watchCorners.
const PLACEHOLDER_BYTES = 250
// 10 scalar fields + ~4 substat objects.
const DETECTION_ARTIFACT_BYTES = 300
// Numeric array slot.
const ITEM_KEY_BYTES = 8
// artifactId + chancesByRuleOrdinal array.
const IMPROVEMENT_ENTRY_BYTES = 300

// Structural slice of a detection snapshot sufficient for size estimation — keeps this
// module decoupled from the full SafeguardDetectionSnapshot type (no App.tsx imports).
type DetectionEntriesLike = ReadonlyArray<{
  placeholders: readonly unknown[]
  artifacts: readonly unknown[]
  itemKeys: readonly number[]
}>

// Structural slice of App.tsx's PipelineCacheEntry — only the components that carry
// meaningful bytes. baseRules/finalSellRules/rulesByRecipe share their rule OBJECTS with
// mergedRules (split/index views), so only the mergedRules graph is charged; the extra
// array-of-reference overhead is noise at these scales.
export type BudgetedPipelineCacheEntry = {
  result: { matches: readonly unknown[] }
  processedSnapshot: { mergedRules: readonly unknown[] }
  processedRows: readonly unknown[] | null
  processedSafeguardDetection: { entries: DetectionEntriesLike } | null
  processedImprovementChance: ReadonlyMap<unknown, unknown> | null
}

/**
 * Byte budget over shared object graphs. Each graph (identified by object identity) is
 * measured once on first retain and charged once no matter how many cache entries hold
 * it; release decrements and frees the charge when the last holder goes away.
 */
export class SharedGraphBudget {
  // graph → its one-time byte estimate and current holder count.
  private readonly graphs = new Map<object, { bytes: number; holders: number }>()
  private total = 0

  /** Estimated bytes across all retained graphs (each counted once). */
  get totalBytes(): number { return this.total }

  /** Charge `graph` (measuring via `estimateBytes` only on its FIRST retain). */
  retain(graph: object | null | undefined, estimateBytes: () => number): void {
    if (!graph) return
    const existing = this.graphs.get(graph)
    if (existing) {
      existing.holders += 1
      return
    }
    const bytes = estimateBytes()
    this.graphs.set(graph, { bytes, holders: 1 })
    this.total += bytes
  }

  /** Release one hold on `graph`; frees its charge when the last holder releases. */
  release(graph: object | null | undefined): void {
    if (!graph) return
    const existing = this.graphs.get(graph)
    if (!existing) return
    existing.holders -= 1
    if (existing.holders <= 0) {
      this.graphs.delete(graph)
      this.total -= existing.bytes
    }
  }

  /** Drop all charges (wholesale cache clear). */
  clear(): void {
    this.graphs.clear()
    this.total = 0
  }
}

// One place enumerates an entry's budgeted graphs so retain and release can never
// disagree on what an entry holds (SSOT for the entry → graphs projection).
// Identity choices: the detection snapshot's ENTRIES array (not the outer snapshot
// object) because reuse restamps scannedAt into a fresh outer object while sharing the
// entries; the improvement MAP object; and the raw arrays for rules/matches/rows.
const budgetedGraphs = (
  entry: BudgetedPipelineCacheEntry,
): Array<[object | null, () => number]> => [
  [entry.processedSnapshot.mergedRules as unknown as object, () =>
    entry.processedSnapshot.mergedRules.length * RULE_BYTES],
  [entry.result.matches as unknown as object, () =>
    entry.result.matches.length * MATCH_BYTES],
  [entry.processedRows as unknown as object | null, () =>
    (entry.processedRows?.length ?? 0) * ROW_BYTES],
  [entry.processedSafeguardDetection?.entries as unknown as object | null, () => {
    // O(#entries) — ~150 safeguard rules, run once per DISTINCT snapshot graph.
    let bytes = 0
    for (const e of entry.processedSafeguardDetection?.entries ?? []) {
      bytes += e.placeholders.length * PLACEHOLDER_BYTES
        + e.artifacts.length * DETECTION_ARTIFACT_BYTES
        + e.itemKeys.length * ITEM_KEY_BYTES
    }
    return bytes
  }],
  [entry.processedImprovementChance as unknown as object | null, () =>
    (entry.processedImprovementChance?.size ?? 0) * IMPROVEMENT_ENTRY_BYTES],
]

/** Charge all of `entry`'s graphs against `budget` (insert-time bookkeeping). */
export const retainPipelineCacheEntry = (
  budget: SharedGraphBudget,
  entry: BudgetedPipelineCacheEntry,
): void => {
  for (const [graph, estimate] of budgetedGraphs(entry)) budget.retain(graph, estimate)
}

/** Release all of `entry`'s graphs from `budget` (evict-time bookkeeping). */
export const releasePipelineCacheEntry = (
  budget: SharedGraphBudget,
  entry: BudgetedPipelineCacheEntry,
): void => {
  for (const [graph] of budgetedGraphs(entry)) budget.release(graph)
}
