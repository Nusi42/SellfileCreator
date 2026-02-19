import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { RULE_SOURCE_SAFEGUARDS } from '../lib/merge'
import { evaluateMatchesByRecipe, type EvalResult, type MatchingRecipeDecision } from '../lib/ruleEval'
import type { SellfileExportMode } from '../lib/hsfBuilder'
import {
  collectAndComputeSafeguardProtection,
  type SafeguardCandidateSnapshot,
  type SafeguardDetectionSnapshot,
  type SafeguardRule,
  resolveSafeguardRuleLabel,
} from '../lib/safeguards'
import { fingerprintSafeguardDetection } from '../lib/safeguardFingerprint'
import type { TesterPreviewRow } from '../types/testerPreview'
import type { TesterPreviewMatch } from '../types/testerPreview'
import { sortTesterRows } from '../lib/testerSort'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { TesterMatchWorkerEvaluateItem, TesterMatchWorkerItemResult } from '../workers/testerMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import { resolveMatchRecipeName } from '../lib/ruleRecipeIndex'
import { PERF_EVENTS, markPerfEvent } from '../lib/perfTimeline'
import { fingerprintMergedRulesWithLoadedWasm } from '../lib/wasm/wasmRuleEngine'

export const TESTER_PREVIEW_CHUNK_SIZE = 250

// Merge still exports the legacy rule type name; keep a local recipe alias in this hook.
type HsfRuleWithRecipe = ReturnType<(typeof import('../lib/merge'))['computeMergedRules']>[number]

const EMPTY_SAFEGUARD_CANDIDATES: SafeguardCandidateSnapshot = {
  candidates: [],
  uniqueItemKeys: new Set<number>(),
}

const EMPTY_SAFEGUARD_DETECTION: SafeguardDetectionSnapshot = {
  scannedAt: 0,
  entries: [],
}

const fingerprintMergedRules = (rules: readonly HsfRuleWithRecipe[]): string => {
  // Fingerprinting is wasm-only; callers must warm up before this hook runs.
  return fingerprintMergedRulesWithLoadedWasm(rules)
}

// Dev-only perf marker helper keeps call sites compact while honoring DEV gating.
type PerfEventPayload = Record<string, string | number | boolean | null>
// Allow lazy payload creation so release builds avoid data allocations entirely.
type PerfEventPayloadFactory = () => PerfEventPayload
const maybeMarkPerfEvent = (label: string, data?: PerfEventPayload | PerfEventPayloadFactory): void => {
  // Avoid emitting perf markers outside dev builds.
  if (!import.meta.env.DEV) return
  // Resolve data lazily so payload objects are only built in dev.
  const resolved = typeof data === 'function' ? data() : data
  markPerfEvent(label, resolved)
}

type UseTesterMatchOrchestratorParams = {
  // Incoming artifacts to evaluate for matches.
  artifacts: NormalizedGearArtifact[]
  // Effective merged rules, including safeguard injections.
  mergedRules: HsfRuleWithRecipe[]
  // Recipe names to show in gear entries + match chips.
  recipeNames: (string | null)[]
  // Export modes aligned to recipes for worker + fallback eval.
  recipeModes: SellfileExportMode[]
  // Currently rendered tester preview rows.
  testerPreviewRows: TesterPreviewRow[]
  // Setter for rows so callers keep ownership of state.
  setTesterPreviewRows: (value: TesterPreviewRow[] | ((prev: TesterPreviewRow[]) => TesterPreviewRow[])) => void
  // Whether the match worker is available.
  testerMatchWorkerSupported: boolean
  // Evaluator from worker hook or fallback.
  evaluateTesterMatchItems: (params: { items: TesterMatchWorkerEvaluateItem[]; onProgress?: (progress: ProgressSnapshot) => void }) => Promise<TesterMatchWorkerItemResult[]>
  // Safeguard state shared with rule warm logic.
  safeguardsActive: boolean
  // Safeguard base rules allow calculating candidates without injected safeguard rules.
  safeguardBaseRules: HsfRuleWithRecipe[]
  // Safeguard rules resolved with metasets for detection.
  resolvedSafeguardRules: SafeguardRule[]
  // Optional recipe indices to ignore when tallying safeguard coverage.
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
  // Detection signature so we can guard against redundant rebuilds.
  safeguardDetectionSignature: string | null
  // Setter to publish detection updates.
  setSafeguardDetection: (value: SafeguardDetectionSnapshot | null | ((prev: SafeguardDetectionSnapshot | null) => SafeguardDetectionSnapshot | null)) => void
  // Ref that tracks which detection signature has been applied to merged rules.
  safeguardScanAppliedRef: MutableRefObject<string | null>
  // Ref for the pending detection signature while detection is inflight.
  pendingSafeguardDetectionSigRef: MutableRefObject<string | null>
  rulesBuilding: boolean
  // Row-building flag used to coordinate with external status chips.
  gearEntriesBuilding: boolean
  // Setter to toggle row-building flag from inside the orchestrator.
  setGearEntriesBuilding: (value: boolean | ((prev: boolean) => boolean)) => void
  // Last committed build id for gear entries.
  gearEntriesCommittedBuildId: number
  // Setter for committed build id so consumers remain source of truth.
  setGearEntriesCommittedBuildId: (value: number | ((prev: number) => number)) => void
  // Setter for active build id exposed for external consumers.
  setGearEntriesActiveBuildId: (value: number | ((prev: number) => number)) => void
  // Setter tracking progress for status chips.
  setGearEntriesProgress: (value: ProgressSnapshot | null) => void
}

type UseTesterMatchOrchestratorResult = {
  // Candidate snapshot used by safeguard protections downstream.
  safeguardCandidates: SafeguardCandidateSnapshot
}

type PreviewMatchDeps = {
  // Fingerprint of the rules used for the previous build.
  rulesSignature: string | null
  // Signature of recipe names to detect label changes that need rerender.
  namesSignature: string | null
}

export function useTesterMatchOrchestrator(params: UseTesterMatchOrchestratorParams): UseTesterMatchOrchestratorResult {
  const {
    artifacts,
    mergedRules,
    recipeNames,
    recipeModes,
    testerPreviewRows,
    setTesterPreviewRows,
    evaluateTesterMatchItems,
    safeguardsActive,
    safeguardBaseRules,
    // Forward ignore-tag indices for safeguard candidate evaluation.
    ignoreSafeguardRecipeIndices,
    resolvedSafeguardRules,
    safeguardDetectionSignature,
    setSafeguardDetection,
    safeguardScanAppliedRef,
    pendingSafeguardDetectionSigRef,
    rulesBuilding,
    testerMatchWorkerSupported: rawTesterMatchWorkerSupported,
    gearEntriesBuilding,
    setGearEntriesBuilding,
    gearEntriesCommittedBuildId,
    setGearEntriesCommittedBuildId,
    setGearEntriesActiveBuildId,
    // App-supplied setter that feeds the determinate overlay on preview chips.
    setGearEntriesProgress,
  } = params
  // Safeguard detection is enabled again.
  const safeguardDetectionDisabled = false
  // Re-enable the worker so heavy tester scans stay off the main thread whenever the browser allows it.
  const effectiveWorkerSupported = rawTesterMatchWorkerSupported

  // Track rows by item id so incremental rebuilds avoid churn.
  const testerPreviewRowMapRef = useRef<Map<number, TesterPreviewRow>>(new Map())
  // Remember prior dependencies to determine whether to rebuild.
  const testerPreviewMatchDepsRef = useRef<PreviewMatchDeps>({ rulesSignature: null, namesSignature: null })
  // Build id reference lets us cancel outdated async work.
  const gearEntriesBuildIdRef = useRef(0)
  // Track artifacts for the in-flight build to avoid redundant restarts.
  const inFlightArtifactsRef = useRef<NormalizedGearArtifact[] | null>(null)
  // Remember last settled artifact list to short-circuit redundant rebuilds.
  const lastSettledArtifactsRef = useRef<NormalizedGearArtifact[] | null>(null)
  // Mirror building state to avoid stale closure checks.
  const gearEntriesBuildingRef = useRef(gearEntriesBuilding)
  // Mirror committed build id for downstream guards.
  const gearEntriesCommittedBuildIdRef = useRef(gearEntriesCommittedBuildId)
  // Track which rule signature has actually been rendered so we can detect pending rebuilds when signatures change.
  const gearEntriesCommittedRulesSignatureRef = useRef<string | null>(null)

  // Keep building ref aligned with external state for correctness.
  useEffect(() => { gearEntriesBuildingRef.current = gearEntriesBuilding }, [gearEntriesBuilding])
  // Keep committed build id ref aligned with latest commit.
  useEffect(() => { gearEntriesCommittedBuildIdRef.current = gearEntriesCommittedBuildId }, [gearEntriesCommittedBuildId])

  const mergedRulesSignature = useMemo(() => fingerprintMergedRules(mergedRules), [mergedRules])

  // Core rebuild loop for tester matches with worker + fallback paths.
  useEffect(() => {
    // Defer rebuilding while upstream rules are still warming to avoid thrash.
    if (rulesBuilding) {
      inFlightArtifactsRef.current = null
      setGearEntriesProgress(null)
      return
    }
    // Build a simple signature for recipe names to detect label changes.
    const namesSignature = recipeNames.map((name) => name ?? '').join('\u0001')
    // Previous deps determine whether a rebuild is necessary.
    const prevMatchDeps = testerPreviewMatchDepsRef.current
    const rulesChangedSinceCommit = gearEntriesCommittedRulesSignatureRef.current !== mergedRulesSignature
    const rowsSettled = !gearEntriesBuildingRef.current && gearEntriesCommittedBuildIdRef.current === gearEntriesBuildIdRef.current
    if (
      rowsSettled
      && prevMatchDeps.rulesSignature === mergedRulesSignature
      && prevMatchDeps.namesSignature === namesSignature
      && lastSettledArtifactsRef.current === artifacts
      && !rulesChangedSinceCommit
    ) {
      lastSettledArtifactsRef.current = artifacts
      return
    }
    // Avoid restarting a build when the same inputs are already being processed.
    const inFlightBuildId = gearEntriesBuildIdRef.current
    const hasUncommittedBuild = gearEntriesCommittedBuildIdRef.current < inFlightBuildId
    if (
      hasUncommittedBuild
      && gearEntriesBuildingRef.current
      && inFlightArtifactsRef.current === artifacts
      && prevMatchDeps.rulesSignature === mergedRulesSignature
      && prevMatchDeps.namesSignature === namesSignature
    ) {
      return
    }
    // Force rebuild when rules or recipe names change.
    const rulesChanged = prevMatchDeps.rulesSignature !== mergedRulesSignature
    const namesChanged = prevMatchDeps.namesSignature !== namesSignature
    const forceRebuildAllRows = rulesChanged || namesChanged || rulesChangedSinceCommit
    // Previous rows by item id allow incremental diffs.
    const prevRowMap = testerPreviewRowMapRef.current
    // Start with a shallow clone we can mutate safely.
    const nextRowMap = new Map(prevRowMap)
    // Track which item ids still exist after update.
    const seenItemIds = new Set<number>()
    // Collect rows that need recomputation.
    let dirtyEntries: Array<{ artifact: NormalizedGearArtifact; itemId: number }> = []

    // Identify dirty rows by comparing object identity of artifacts.
    artifacts.forEach((artifact) => {
      const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
      if (!Number.isFinite(itemId)) return
      seenItemIds.add(itemId)
      const prevRow = prevRowMap.get(itemId)
      if (!prevRow || prevRow.artifact !== artifact) {
        dirtyEntries.push({ artifact, itemId })
      }
    })

    // Drop rows whose artifacts were removed.
    for (const [itemId] of prevRowMap) {
      if (!seenItemIds.has(itemId)) {
        nextRowMap.delete(itemId)
      }
    }

    // If rules or names changed, everything is dirty regardless of identity.
    if (forceRebuildAllRows) {
      dirtyEntries = []
      artifacts.forEach((artifact) => {
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
        if (!Number.isFinite(itemId)) return
        dirtyEntries.push({ artifact, itemId })
      })
    }
    const noOpBuild = dirtyEntries.length === 0 && nextRowMap.size === prevRowMap.size
    const nextBuildId = gearEntriesBuildIdRef.current + 1
    // Record the rebuild request so Playwright can correlate downstream steps.
    maybeMarkPerfEvent(PERF_EVENTS.testerMatchBuildStart, () => ({
      buildId: nextBuildId,
      artifacts: artifacts.length,
      dirty: dirtyEntries.length,
      rulesChanged,
      namesChanged,
      worker: effectiveWorkerSupported,
      safeguards: safeguardsActive,
    }))
    if (noOpBuild) {
      // Mark no-op rebuilds so we can spot unnecessary churn.
      maybeMarkPerfEvent(PERF_EVENTS.testerMatchBuildNoop, () => ({ buildId: nextBuildId }))
      testerPreviewMatchDepsRef.current = { rulesSignature: mergedRulesSignature, namesSignature }
      gearEntriesBuildIdRef.current = nextBuildId
      setGearEntriesActiveBuildId(nextBuildId)
      setGearEntriesCommittedBuildId(nextBuildId)
      lastSettledArtifactsRef.current = artifacts
      setGearEntriesBuilding(false)
      setGearEntriesProgress(null)
      return
    }

    // Update dep snapshot immediately so concurrent triggers stay consistent.
    testerPreviewMatchDepsRef.current = { rulesSignature: mergedRulesSignature, namesSignature }
    gearEntriesBuildIdRef.current = nextBuildId
    // Surface the active build id in shared state.
    setGearEntriesActiveBuildId(nextBuildId)
    const buildId = nextBuildId
    // If there are no dirty entries we can commit immediately.
    if (dirtyEntries.length === 0) {
      testerPreviewRowMapRef.current = nextRowMap
      setTesterPreviewRows(sortTesterRows(Array.from(nextRowMap.values())))
      setGearEntriesCommittedBuildId(buildId)
      gearEntriesCommittedRulesSignatureRef.current = mergedRulesSignature
      lastSettledArtifactsRef.current = artifacts
      setGearEntriesBuilding(false)
      setGearEntriesProgress(null)
      // Record immediate commits for instrumentation.
      maybeMarkPerfEvent(PERF_EVENTS.testerMatchBuildCommit, () => ({ buildId }))
      return
    }

    // When there are no rules, clear matches without extra work.
    const hasRules = mergedRules.length > 0
    if (!hasRules) {
      dirtyEntries.forEach((entry) => {
        nextRowMap.set(entry.itemId, {
          artifact: entry.artifact,
          match: null,
          baseMatch: null,
          matchingRecipeIndices: [],
          matchingRecipeDecisions: [],
        })
      })
      testerPreviewRowMapRef.current = nextRowMap
      setTesterPreviewRows(sortTesterRows(Array.from(nextRowMap.values())))
      setGearEntriesCommittedBuildId(buildId)
      lastSettledArtifactsRef.current = artifacts
      setGearEntriesBuilding(false)
      setGearEntriesProgress(null)
      // Track no-rule clears to separate them from full eval passes.
      maybeMarkPerfEvent(PERF_EVENTS.testerMatchBuildNoRules, () => ({ buildId }))
      return
    }

    // Helper converts evaluator results to Preview matches.
    const toTesterPreviewMatch = (result: EvalResult | null): TesterPreviewMatch | null => {
      if (!result) return null
      const rule = mergedRules[result.ruleIndex]
      const recipeIdx = result.recipeIdx
      const recipeName = resolveMatchRecipeName(recipeIdx, recipeNames, rule)
      const safeguardLabel = rule?.__source === RULE_SOURCE_SAFEGUARDS
        ? resolveSafeguardRuleLabel(rule)
        : null
      const effectiveRecipeName = recipeName && recipeName.length > 0 ? recipeName : safeguardLabel
      return {
        keep: result.keep,
        recipeIdx: recipeIdx ?? null,
        recipeName: effectiveRecipeName && effectiveRecipeName.length > 0 ? effectiveRecipeName : null,
        ruleIndex: result.ruleIndex,
        ruleLabel: safeguardLabel ?? null,
        ruleSource: rule?.__source ?? null,
      }
    }

    // Safeguard detection waits for latest scan to avoid flicker.
    // Hold the visible match rows whenever safeguard protection is in flux so users never see stale overrides.
    const shouldHoldRowsBuilding = (): boolean => (
      safeguardsActive
      && (
        Boolean(pendingSafeguardDetectionSigRef.current)
        || (
          Boolean(safeguardDetectionSignature)
          && safeguardDetectionSignature !== safeguardScanAppliedRef.current
        )
      )
    )

    // Capture previous rows to reuse safeguard matches while frozen.
    const prevRowSnapshot = testerPreviewRowMapRef.current

    // Convert a single artifact into a preview row with computed matches.
  const toPreviewRow = (
    itemId: number,
    artifact: NormalizedGearArtifact,
    firstMatch: EvalResult | null,
    baseMatch: EvalResult | null,
    matchingRecipeIndices: number[],
    matchingRecipeDecisions: MatchingRecipeDecision[],
  ): TesterPreviewRow => {
    // Compute the displayed match (includes safeguard rules).
    let match = toTesterPreviewMatch(firstMatch)
    // If safeguard detection is pending, reuse prior safeguard match.
    if (
      shouldHoldRowsBuilding()
      && (!match || match.ruleSource !== RULE_SOURCE_SAFEGUARDS)
      && prevRowSnapshot
    ) {
      const prevRow = prevRowSnapshot.get(itemId)
      if (prevRow?.match?.ruleSource === RULE_SOURCE_SAFEGUARDS) {
        match = prevRow.match
      }
    }
    return {
      artifact,
      match,
      baseMatch: toTesterPreviewMatch(baseMatch),
      matchingRecipeIndices: matchingRecipeIndices,
      matchingRecipeDecisions,
    }
  }

    // Start a worker-based build when supported.
    if (effectiveWorkerSupported) {
      inFlightArtifactsRef.current = artifacts
      setGearEntriesBuilding(true)
      if (dirtyEntries.length > 0) {
        // Worker mode: reset progress before handing items to the worker.
        setGearEntriesProgress({ completed: 0, total: dirtyEntries.length })
      } else {
        setGearEntriesProgress(null)
      }
      const artifactByItemId = new Map<number, NormalizedGearArtifact>()
      const itemsPayload = dirtyEntries.map(({ artifact, itemId }) => {
        artifactByItemId.set(itemId, artifact)
        return { itemId, item: artifact.testerItem }
      })
      let cancelled = false
      // Mark the start of worker evaluation for the rebuild.
      maybeMarkPerfEvent(PERF_EVENTS.testerMatchEvalStart, () => ({
        buildId,
        dirty: dirtyEntries.length,
        mode: 'worker',
      }))
      evaluateTesterMatchItems({
        items: itemsPayload,
        onProgress: (snapshot) => {
          if (gearEntriesBuildIdRef.current !== buildId) return
          setGearEntriesProgress(snapshot)
        },
      })
        .then((results) => {
          if (cancelled || gearEntriesBuildIdRef.current !== buildId) return
          // Mark evaluation completion before row transforms begin.
          maybeMarkPerfEvent(PERF_EVENTS.testerMatchEvalDone, () => ({
            buildId,
            results: results.length,
            mode: 'worker',
          }))
          results.forEach((result) => {
            const artifact = artifactByItemId.get(result.itemId)
            if (!artifact) return
            nextRowMap.set(result.itemId, toPreviewRow(
              result.itemId,
              artifact,
              result.firstMatch,
              result.firstNonExcludedMatch,
              result.matchingRecipeIndices,
              result.matchingRecipeDecisions,
            ))
          })
          testerPreviewRowMapRef.current = nextRowMap
          const sortedRows = sortTesterRows(Array.from(nextRowMap.values()))
          setTesterPreviewRows(sortedRows)
          setGearEntriesCommittedBuildId(buildId)
          gearEntriesCommittedRulesSignatureRef.current = mergedRulesSignature
          lastSettledArtifactsRef.current = artifacts
          inFlightArtifactsRef.current = null
          // Release building flag even when safeguard hold is active so the UI does not spin forever.
          if (gearEntriesBuildIdRef.current === buildId) {
            setGearEntriesBuilding(false)
            setGearEntriesProgress(null)
          }
          // Commit marker helps profile total end-to-end time.
          maybeMarkPerfEvent(PERF_EVENTS.testerMatchBuildCommit, () => ({ buildId }))
        })
        .catch(() => {
          if (cancelled) return
          inFlightArtifactsRef.current = null
          if (gearEntriesBuildIdRef.current === buildId) {
            setGearEntriesBuilding(false)
            setGearEntriesProgress(null)
          }
          // Cancel marker tracks aborted or failed worker runs.
          maybeMarkPerfEvent(PERF_EVENTS.testerMatchBuildCancelled, () => ({ buildId }))
        })
      return () => {
        cancelled = true
        inFlightArtifactsRef.current = null
        // Ensure the building flag releases if this run is aborted.
        if (gearEntriesBuildIdRef.current === buildId) {
          setGearEntriesBuilding(false)
          setGearEntriesProgress(null)
        }
      }
    }

    // Fallback path chunked to keep UI responsive.
    inFlightArtifactsRef.current = artifacts
    setGearEntriesBuilding(true)
    if (dirtyEntries.length > 0) {
      // Manual evaluation still reports determinate progress so the UI stays consistent.
      setGearEntriesProgress({ completed: 0, total: dirtyEntries.length })
    } else {
      setGearEntriesProgress(null)
    }
    let cancelled = false
    // Mark the start of fallback evaluation.
    maybeMarkPerfEvent(PERF_EVENTS.testerMatchEvalFallbackStart, () => ({
      buildId,
      dirty: dirtyEntries.length,
    }))

    // Evaluates one artifact synchronously.
    const buildRow = (artifact: NormalizedGearArtifact, itemId: number): TesterPreviewRow => {
      // Evaluate full rule set (including safeguard injections) for the primary match,
      // and a safeguard-excluded view for baseMatch so detection still sees the baseline.
      const fullEval = evaluateMatchesByRecipe(
        mergedRules,
        artifact.testerItem,
        {
          recipeModes,
          ...(ignoreSafeguardRecipeIndices ? { ignoreSafeguardRecipeIndices } : {}),
        },
      )
      const baseEval = evaluateMatchesByRecipe(
        mergedRules,
        artifact.testerItem,
        { recipeModes, excludeSources: [RULE_SOURCE_SAFEGUARDS] },
      )
      return toPreviewRow(
        itemId,
        artifact,
        fullEval.firstMatch,
        baseEval.firstMatch,
        fullEval.matchingRecipeIndices,
        fullEval.matchingRecipeDecisions,
      )
    }

    // Process all dirty entries synchronously for now (no chunked timeouts).
    for (let cursor = 0; cursor < dirtyEntries.length; cursor += 1) {
      if (cancelled || gearEntriesBuildIdRef.current !== buildId) break
      const entry = dirtyEntries[cursor]
      if (!entry) continue
      nextRowMap.set(entry.itemId, buildRow(entry.artifact, entry.itemId))
      setGearEntriesProgress({ completed: cursor + 1, total: dirtyEntries.length })
    }
    if (!cancelled && gearEntriesBuildIdRef.current === buildId) {
      testerPreviewRowMapRef.current = nextRowMap
      const sortedRows = sortTesterRows(Array.from(nextRowMap.values()))
      setTesterPreviewRows(sortedRows)
      setGearEntriesCommittedBuildId(buildId)
      gearEntriesCommittedRulesSignatureRef.current = mergedRulesSignature
      lastSettledArtifactsRef.current = artifacts
      inFlightArtifactsRef.current = null
      if (gearEntriesBuildIdRef.current === buildId) {
        setGearEntriesBuilding(false)
        setGearEntriesProgress(null)
      }
      // Mark fallback completion once rows commit.
      maybeMarkPerfEvent(PERF_EVENTS.testerMatchEvalFallbackDone, () => ({
        buildId,
        rows: sortedRows.length,
      }))
      // Mirror the commit marker so timings align with worker runs.
      maybeMarkPerfEvent(PERF_EVENTS.testerMatchBuildCommit, () => ({ buildId }))
    }
    return () => {
      cancelled = true
      inFlightArtifactsRef.current = null
      if (gearEntriesBuildIdRef.current === buildId) {
        setGearEntriesBuilding(false)
        setGearEntriesProgress(null)
      }
    }
  }, [
    artifacts,
    mergedRules,
    mergedRulesSignature,
    recipeNames,
    recipeModes,
    evaluateTesterMatchItems,
    safeguardsActive,
    ignoreSafeguardRecipeIndices,
    safeguardDetectionSignature,
    safeguardScanAppliedRef,
    pendingSafeguardDetectionSigRef,
    setTesterPreviewRows,
    setGearEntriesBuilding,
    setGearEntriesCommittedBuildId,
    setGearEntriesActiveBuildId,
    setGearEntriesProgress,
    effectiveWorkerSupported,
    safeguardDetectionDisabled,
    gearEntriesBuilding,
    rulesBuilding,
  ])

  // Safeguard combined snapshot runs collect + detection in one wasm call.
  const safeguardCombined = useMemo(() => {
    // Avoid scan work when rows are empty or safeguards are disabled.
    if (!testerPreviewRows.length || !safeguardsActive) {
      return {
        candidates: EMPTY_SAFEGUARD_CANDIDATES,
        detection: EMPTY_SAFEGUARD_DETECTION,
      }
    }
    return collectAndComputeSafeguardProtection({
      rows: testerPreviewRows,
      baseRules: safeguardBaseRules,
      recipeModes,
      rules: resolvedSafeguardRules,
      enabled: safeguardsActive,
      // Skip recipes tagged to ignore safeguard coverage.
      ...(ignoreSafeguardRecipeIndices ? { ignoreSafeguardRecipeIndices } : {}),
    })
  }, [
    testerPreviewRows,
    safeguardsActive,
    safeguardBaseRules,
    recipeModes,
    resolvedSafeguardRules,
    ignoreSafeguardRecipeIndices,
  ])

  // Keep returning candidate metadata for downstream UI callers.
  const safeguardCandidates = safeguardCombined.candidates

  // Safeguard detection refresh runs when candidates or rules change.
  useEffect(() => {
    // Only run detection when rows are settled.
    const rowsUpToDate = gearEntriesCommittedBuildId >= gearEntriesBuildIdRef.current && !gearEntriesBuilding
    // When disabled, clear any cached detection + pending signatures.
    if (!safeguardsActive) {
      safeguardScanAppliedRef.current = null
      pendingSafeguardDetectionSigRef.current = null
      setSafeguardDetection(null)
      return
    }
    // Defer until rows catch up to the latest build.
    if (gearEntriesBuilding || !rowsUpToDate) return
    if (testerPreviewRows.length === 0 || safeguardCandidates.candidates.length === 0) {
      safeguardScanAppliedRef.current = null
      pendingSafeguardDetectionSigRef.current = null
      setSafeguardDetection(null)
      return
    }

    // Detection payload already comes from the combined collect+detect scan.
    const snapshot = safeguardCombined.detection
    const snapshotSignature = fingerprintSafeguardDetection(snapshot)
    setSafeguardDetection((prev) => {
      // When there was no prior snapshot, always apply and record signature.
      if (!prev) {
        pendingSafeguardDetectionSigRef.current = snapshotSignature
        return snapshot
      }
      // Compare lengths + entry fields; if identical, reuse previous snapshot.
      if (prev.entries.length !== snapshot.entries.length) {
        pendingSafeguardDetectionSigRef.current = snapshotSignature
        return snapshot
      }
      for (let idx = 0; idx < snapshot.entries.length; idx += 1) {
        const nextEntry = snapshot.entries[idx]
        const prevEntry = prev.entries[idx]
        if (!nextEntry || !prevEntry) {
          pendingSafeguardDetectionSigRef.current = snapshotSignature
          return snapshot
        }
        if (
          nextEntry.ruleId !== prevEntry.ruleId
          || nextEntry.ruleActivation !== prevEntry.ruleActivation
          || nextEntry.requiredCount !== prevEntry.requiredCount
          || nextEntry.currentCount !== prevEntry.currentCount
          || nextEntry.projectedCount !== prevEntry.projectedCount
          || nextEntry.deficit !== prevEntry.deficit
          || nextEntry.coveredByExisting !== prevEntry.coveredByExisting
          || nextEntry.itemKeys.length !== prevEntry.itemKeys.length
          || nextEntry.artifacts.length !== prevEntry.artifacts.length
          || nextEntry.placeholders.length !== prevEntry.placeholders.length
        ) {
          pendingSafeguardDetectionSigRef.current = snapshotSignature
          return snapshot
        }
      }
      return prev
    })
  }, [
    safeguardsActive,
    safeguardCombined,
    safeguardCandidates,
    safeguardDetectionSignature,
    testerPreviewRows.length,
    gearEntriesBuilding,
    gearEntriesCommittedBuildId,
    setSafeguardDetection,
    safeguardScanAppliedRef,
    pendingSafeguardDetectionSigRef,
  ])

  // Carry safeguard detection metadata back to caller.
  return { safeguardCandidates }
}
