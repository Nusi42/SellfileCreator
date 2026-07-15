import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PIPELINE_CACHE_BUDGET_BYTES,
  PIPELINE_CACHE_MIN_ENTRIES,
  PIPELINE_CACHE_MAX_ENTRIES,
  SharedGraphBudget,
  retainPipelineCacheEntry,
  releasePipelineCacheEntry,
  type BudgetedPipelineCacheEntry,
} from '../../src/lib/pipelineCache.js'

// Minimal entry factory: component sizes are controlled per test; graphs default to
// fresh arrays/maps so identity-sharing is opt-in (mirrors how the worker's
// unchanged-elision shares graphs across consecutive real entries).
const makeEntry = (overrides?: Partial<BudgetedPipelineCacheEntry>): BudgetedPipelineCacheEntry => ({
  result: { matches: new Array(10) },
  processedSnapshot: { mergedRules: new Array(100) },
  processedRows: new Array(10),
  processedSafeguardDetection: {
    entries: [{ placeholders: new Array(50), artifacts: new Array(5), itemKeys: [1, 2, 3] }],
  },
  processedImprovementChance: new Map([[1, {}]]),
  ...overrides,
})

test('retain charges each distinct graph once; release frees on last holder', () => {
  const budget = new SharedGraphBudget()
  const graph = new Array(100)
  budget.retain(graph, () => 1000)
  // Second retain of the SAME graph must not re-measure or double-charge.
  budget.retain(graph, () => { throw new Error('re-measured a retained graph') })
  assert.equal(budget.totalBytes, 1000)
  budget.release(graph)
  // Still held once — charge remains.
  assert.equal(budget.totalBytes, 1000)
  budget.release(graph)
  assert.equal(budget.totalBytes, 0)
})

test('null/undefined graphs are ignored; unknown releases are no-ops', () => {
  const budget = new SharedGraphBudget()
  budget.retain(null, () => 999)
  budget.retain(undefined, () => 999)
  assert.equal(budget.totalBytes, 0)
  budget.release({})
  assert.equal(budget.totalBytes, 0)
})

test('entries sharing graphs cost one charge; releasing one entry keeps shared charges', () => {
  const budget = new SharedGraphBudget()
  const a = makeEntry()
  // b shares a's rules + detection graphs (the worker-elision sharing pattern); its
  // matches/rows are per-entry fresh.
  const b = makeEntry({
    processedSnapshot: a.processedSnapshot,
    processedSafeguardDetection: a.processedSafeguardDetection,
  })
  retainPipelineCacheEntry(budget, a)
  const afterA = budget.totalBytes
  retainPipelineCacheEntry(budget, b)
  // b adds only its own matches + rows + improvement map — strictly less than a full re-charge.
  const afterB = budget.totalBytes
  assert.ok(afterB > afterA, 'second entry adds its unshared graphs')
  assert.ok(afterB < afterA * 2, 'shared graphs are not double-charged')
  releasePipelineCacheEntry(budget, a)
  // The graphs still held by b (rules + detection) must remain charged.
  assert.ok(budget.totalBytes > 0)
  releasePipelineCacheEntry(budget, b)
  assert.equal(budget.totalBytes, 0)
})

test('retain/release round-trip over an entry is exactly balanced', () => {
  const budget = new SharedGraphBudget()
  const entry = makeEntry()
  retainPipelineCacheEntry(budget, entry)
  assert.ok(budget.totalBytes > 0)
  releasePipelineCacheEntry(budget, entry)
  assert.equal(budget.totalBytes, 0)
})

test('null components (rows/detection/improvement absent) are tolerated', () => {
  const budget = new SharedGraphBudget()
  const entry = makeEntry({
    processedRows: null,
    processedSafeguardDetection: null,
    processedImprovementChance: null,
  })
  retainPipelineCacheEntry(budget, entry)
  releasePipelineCacheEntry(budget, entry)
  assert.equal(budget.totalBytes, 0)
})

test('policy constants stay sane relative to each other', () => {
  // MIN floor below MAX cap, and a budget that always admits at least the floor's
  // worth of worst-case generations (sanity net for future constant edits).
  assert.ok(PIPELINE_CACHE_MIN_ENTRIES >= 1)
  assert.ok(PIPELINE_CACHE_MIN_ENTRIES < PIPELINE_CACHE_MAX_ENTRIES)
  assert.ok(PIPELINE_CACHE_BUDGET_BYTES >= 100 * 1024 * 1024)
})
