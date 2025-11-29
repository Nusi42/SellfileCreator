import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { RULE_SOURCE_KEEP_UNIQUES, canonicalRuleKey, type HsfRuleWithCfg } from '../lib/merge'
import { evaluateMatchesByConfig, type EvalResult } from '../lib/ruleEval'
import type { SellfileExportMode } from '../lib/hsfBuilder'
import {
  collectKeepUniqueCandidates,
  type KeepUniqueCandidateSnapshot,
  type KeepUniqueDetectionSnapshot,
  type KeepUniqueRule,
  computeKeepUniqueProtection,
  sanitizeKeepUniqueCountMode,
} from '../lib/keepUniques'
import type { TesterPreviewRow } from '../types/testerPreview'
import type { TesterPreviewMatch } from '../types/testerPreview'
import { sortTesterRows } from '../lib/testerSort'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { TesterMatchWorkerEvaluateItem, TesterMatchWorkerItemResult } from '../workers/testerMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import { getRuleConfigIndex } from '../lib/ruleConfigIndex'

export const TESTER_PREVIEW_CHUNK_SIZE = 250

const EMPTY_KEEP_UNIQUE_CANDIDATES: KeepUniqueCandidateSnapshot = {
  candidates: [],
  uniqueItemKeys: new Set<number>(),
}

// Lightweight hash to avoid logging giant signatures (not crypto-safe).
const hashSignature = (value: string): number => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export const fingerprintKeepUniqueDetection = (
  snapshot: KeepUniqueDetectionSnapshot | null,
): string | null => {
  // Null snapshots render as null fingerprints for quick equality checks.
  if (!snapshot) return null
  // Flatten entries into a compact string to cheaply compare runs.
  const parts: string[] = []
  for (const entry of snapshot.entries) {
    // Encode only primitives + joined arrays to avoid object churn.
    // Encode the 2×2 scope toggles explicitly so flips in the new UI grid
    // always mutate the fingerprint and force a fresh detection snapshot.
    const mode = sanitizeKeepUniqueCountMode(entry.countMode)
    parts.push([
      entry.ruleId ?? '',
      entry.ruleEnabled ? 1 : 0,
      mode.perRule ? 1 : 0,
      mode.perSet ? 1 : 0,
      mode.perFaction ? 1 : 0,
      mode.perMainStat ? 1 : 0,
      entry.groupsTracked,
      entry.perGroupRequiredCount,
      entry.requiredCount,
      entry.currentCount,
      entry.projectedCount,
      entry.deficit,
      entry.coveredByExisting ? 1 : 0,
      entry.itemKeys.join(','),
    ].join(':'))
  }
  // Join by semicolon to build deterministic signature.
  return parts.join(';')
}

const fingerprintMergedRules = (rules: readonly HsfRuleWithCfg[]): string => {
  if (!rules || rules.length === 0) return '0:0'
  let hash = 0
  for (let idx = 0; idx < rules.length; idx += 1) {
    const rule = rules[idx]
    if (!rule) continue
    const cfgIdx = getRuleConfigIndex(rule)
    const parts = [
      idx.toString(10),
      rule.__source ?? '',
      cfgIdx != null ? cfgIdx.toString(10) : 'none',
      rule.__keepUniqueRuleId ?? '',
      rule.__keepUniqueHash ?? '',
      String(rule.__keepUniqueRequired ?? ''),
      String(rule.__keepUniqueProjected ?? ''),
      String(rule.__keepUniqueDeficit ?? ''),
      canonicalRuleKey(rule),
    ]
    const keyHash = hashSignature(parts.join('|'))
    hash = ((hash << 5) - hash) + keyHash
    hash |= 0
  }
  return `${rules.length}:${hash}`
}

type UseTesterMatchOrchestratorParams = {
  // Incoming artifacts to evaluate for matches.
  artifacts: NormalizedGearArtifact[]
  // Effective merged rules, including keep-unique injections.
  mergedRules: HsfRuleWithCfg[]
  // Config names to show in tester rows + match chips.
  configNames: (string | null)[]
  // Export modes aligned to configs for worker + fallback eval.
  configModes: SellfileExportMode[]
  // Currently rendered tester preview rows.
  testerPreviewRows: TesterPreviewRow[]
  // Setter for rows so callers keep ownership of state.
  setTesterPreviewRows: (value: TesterPreviewRow[] | ((prev: TesterPreviewRow[]) => TesterPreviewRow[])) => void
  // Whether the match worker is available.
  testerMatchWorkerSupported: boolean
  // Evaluator from worker hook or fallback.
  evaluateTesterMatchItems: (params: { items: TesterMatchWorkerEvaluateItem[]; onProgress?: (progress: ProgressSnapshot) => void }) => Promise<TesterMatchWorkerItemResult[]>
  // Keep-unique state shared with rule warm logic.
  keepUniquesActive: boolean
  // Keep-unique base rules allow calculating candidates without injected keep rules.
  keepUniqueBaseRules: HsfRuleWithCfg[]
  // Keep-unique rules resolved with metasets for detection.
  resolvedKeepUniqueRules: KeepUniqueRule[]
  // Detection signature so we can guard against redundant rebuilds.
  keepUniqueDetectionSignature: string | null
  // Setter to publish detection updates.
  setKeepUniqueDetection: (value: KeepUniqueDetectionSnapshot | null | ((prev: KeepUniqueDetectionSnapshot | null) => KeepUniqueDetectionSnapshot | null)) => void
  // Ref that tracks which detection signature has been applied to merged rules.
  keepUniqueScanAppliedRef: MutableRefObject<string | null>
  // Ref for the pending detection signature while detection is inflight.
  pendingKeepUniqueDetectionSigRef: MutableRefObject<string | null>
  rulesBuilding: boolean
  // Row-building flag used to coordinate with external status chips.
  testerRowsBuilding: boolean
  // Setter to toggle row-building flag from inside the orchestrator.
  setTesterRowsBuilding: (value: boolean | ((prev: boolean) => boolean)) => void
  // Last committed build id for tester rows.
  testerRowsCommittedBuildId: number
  // Setter for committed build id so consumers remain source of truth.
  setTesterRowsCommittedBuildId: (value: number | ((prev: number) => number)) => void
  // Setter for active build id exposed for external consumers.
  setTesterRowsActiveBuildId: (value: number | ((prev: number) => number)) => void
  // Setter tracking progress for status chips.
  setTesterRowsProgress: (value: ProgressSnapshot | null) => void
}

type UseTesterMatchOrchestratorResult = {
  // Candidate snapshot used by keep-unique protections downstream.
  keepUniqueCandidates: KeepUniqueCandidateSnapshot
}

type PreviewMatchDeps = {
  // Fingerprint of the rules used for the previous build.
  rulesSignature: string | null
  // Signature of config names to detect label changes that need rerender.
  namesSignature: string | null
}

export function useTesterMatchOrchestrator(params: UseTesterMatchOrchestratorParams): UseTesterMatchOrchestratorResult {
  const {
    artifacts,
    mergedRules,
    configNames,
    configModes,
    testerPreviewRows,
    setTesterPreviewRows,
    evaluateTesterMatchItems,
    keepUniquesActive,
    keepUniqueBaseRules,
    resolvedKeepUniqueRules,
    keepUniqueDetectionSignature,
    setKeepUniqueDetection,
    keepUniqueScanAppliedRef,
    pendingKeepUniqueDetectionSigRef,
    rulesBuilding,
    testerMatchWorkerSupported: rawTesterMatchWorkerSupported,
    testerRowsBuilding,
    setTesterRowsBuilding,
    testerRowsCommittedBuildId,
    setTesterRowsCommittedBuildId,
    setTesterRowsActiveBuildId,
    // App-supplied setter that feeds the determinate overlay on preview chips.
    setTesterRowsProgress,
  } = params
  // Keep-unique detection is enabled again.
  const keepUniqueDetectionDisabled = false
  // Re-enable the worker so heavy tester scans stay off the main thread whenever the browser allows it.
  const effectiveWorkerSupported = rawTesterMatchWorkerSupported

  // Track rows by item id so incremental rebuilds avoid churn.
  const testerPreviewRowMapRef = useRef<Map<number, TesterPreviewRow>>(new Map())
  // Remember prior dependencies to determine whether to rebuild.
  const testerPreviewMatchDepsRef = useRef<PreviewMatchDeps>({ rulesSignature: null, namesSignature: null })
  // Build id reference lets us cancel outdated async work.
  const testerRowsBuildIdRef = useRef(0)
  // Track artifacts for the in-flight build to avoid redundant restarts.
  const inFlightArtifactsRef = useRef<NormalizedGearArtifact[] | null>(null)
  // Remember last settled artifact list to short-circuit redundant rebuilds.
  const lastSettledArtifactsRef = useRef<NormalizedGearArtifact[] | null>(null)
  // Mirror building state to avoid stale closure checks.
  const testerRowsBuildingRef = useRef(testerRowsBuilding)
  // Mirror committed build id for downstream guards.
  const testerRowsCommittedBuildIdRef = useRef(testerRowsCommittedBuildId)
  // Track which rule signature has actually been rendered so we can detect pending rebuilds when signatures change.
  const testerRowsCommittedRulesSignatureRef = useRef<string | null>(null)

  // Keep building ref aligned with external state for correctness.
  useEffect(() => { testerRowsBuildingRef.current = testerRowsBuilding }, [testerRowsBuilding])
  // Keep committed build id ref aligned with latest commit.
  useEffect(() => { testerRowsCommittedBuildIdRef.current = testerRowsCommittedBuildId }, [testerRowsCommittedBuildId])

  const mergedRulesSignature = useMemo(() => fingerprintMergedRules(mergedRules), [mergedRules])

  // Core rebuild loop for tester matches with worker + fallback paths.
  useEffect(() => {
    // Defer rebuilding while upstream rules are still warming to avoid thrash.
    if (rulesBuilding) {
      inFlightArtifactsRef.current = null
      setTesterRowsProgress(null)
      return
    }
    // Build a simple signature for config names to detect label changes.
    const namesSignature = configNames.map((name) => name ?? '').join('\u0001')
    // Previous deps determine whether a rebuild is necessary.
    const prevMatchDeps = testerPreviewMatchDepsRef.current
    const rulesChangedSinceCommit = testerRowsCommittedRulesSignatureRef.current !== mergedRulesSignature
    const rowsSettled = !testerRowsBuildingRef.current && testerRowsCommittedBuildIdRef.current === testerRowsBuildIdRef.current
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
    const inFlightBuildId = testerRowsBuildIdRef.current
    const hasUncommittedBuild = testerRowsCommittedBuildIdRef.current < inFlightBuildId
    if (
      hasUncommittedBuild
      && testerRowsBuildingRef.current
      && inFlightArtifactsRef.current === artifacts
      && prevMatchDeps.rulesSignature === mergedRulesSignature
      && prevMatchDeps.namesSignature === namesSignature
    ) {
      return
    }
    // Force rebuild when rules or config names change.
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
    const nextBuildId = testerRowsBuildIdRef.current + 1
    if (noOpBuild) {
      testerPreviewMatchDepsRef.current = { rulesSignature: mergedRulesSignature, namesSignature }
      testerRowsBuildIdRef.current = nextBuildId
      setTesterRowsActiveBuildId(nextBuildId)
      setTesterRowsCommittedBuildId(nextBuildId)
      lastSettledArtifactsRef.current = artifacts
      setTesterRowsBuilding(false)
      setTesterRowsProgress(null)
      return
    }

    // Update dep snapshot immediately so concurrent triggers stay consistent.
    testerPreviewMatchDepsRef.current = { rulesSignature: mergedRulesSignature, namesSignature }
    testerRowsBuildIdRef.current = nextBuildId
    // Surface the active build id in shared state.
    setTesterRowsActiveBuildId(nextBuildId)
    const buildId = nextBuildId
    // If there are no dirty entries we can commit immediately.
    if (dirtyEntries.length === 0) {
      testerPreviewRowMapRef.current = nextRowMap
      setTesterPreviewRows(sortTesterRows(Array.from(nextRowMap.values())))
      setTesterRowsCommittedBuildId(buildId)
      testerRowsCommittedRulesSignatureRef.current = mergedRulesSignature
      lastSettledArtifactsRef.current = artifacts
      setTesterRowsBuilding(false)
      setTesterRowsProgress(null)
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
          matchingCfgIndices: [],
        })
      })
      testerPreviewRowMapRef.current = nextRowMap
      setTesterPreviewRows(sortTesterRows(Array.from(nextRowMap.values())))
      setTesterRowsCommittedBuildId(buildId)
      lastSettledArtifactsRef.current = artifacts
      setTesterRowsBuilding(false)
      setTesterRowsProgress(null)
      return
    }

    // Helper converts evaluator results to Preview matches.
    const toTesterPreviewMatch = (result: EvalResult | null): TesterPreviewMatch | null => {
      if (!result) return null
      const rule = mergedRules[result.ruleIndex]
      const cfgIdx = result.cfgIdx
      const cfgName = (cfgIdx != null && cfgIdx >= 0) ? (configNames[cfgIdx] ?? null) : null
      return {
        keep: result.keep,
        cfgIdx: cfgIdx ?? null,
        cfgName: cfgName && cfgName.length > 0 ? cfgName : null,
        ruleIndex: result.ruleIndex,
        ruleLabel: null,
        ruleSource: rule?.__source ?? null,
      }
    }

    // Keep-unique detection waits for latest scan to avoid flicker.
    // Hold the visible match rows whenever keep-unique protection is in flux so users never see stale overrides.
    const shouldHoldRowsBuilding = (): boolean => (
      keepUniquesActive
      && (
        Boolean(pendingKeepUniqueDetectionSigRef.current)
        || (
          Boolean(keepUniqueDetectionSignature)
          && keepUniqueDetectionSignature !== keepUniqueScanAppliedRef.current
        )
      )
    )

    // Capture previous rows to reuse keep-unique matches while frozen.
    const prevRowSnapshot = testerPreviewRowMapRef.current

    // Convert a single artifact into a preview row with computed matches.
  const toPreviewRow = (
    itemId: number,
    artifact: NormalizedGearArtifact,
    firstMatch: EvalResult | null,
    baseMatch: EvalResult | null,
    matchingConfigIndices: number[],
  ): TesterPreviewRow => {
    // Compute the displayed match (includes keep-unique rules).
    let match = toTesterPreviewMatch(firstMatch)
    // If keep-unique detection is pending, reuse prior keep-unique match.
    if (
      shouldHoldRowsBuilding()
      && (!match || match.ruleSource !== RULE_SOURCE_KEEP_UNIQUES)
      && prevRowSnapshot
    ) {
      const prevRow = prevRowSnapshot.get(itemId)
      if (prevRow?.match?.ruleSource === RULE_SOURCE_KEEP_UNIQUES) {
        match = prevRow.match
      }
    }
    return {
      artifact,
      match,
      baseMatch: toTesterPreviewMatch(baseMatch),
      matchingCfgIndices: matchingConfigIndices,
    }
  }

    // Start a worker-based build when supported.
    if (effectiveWorkerSupported) {
      inFlightArtifactsRef.current = artifacts
      setTesterRowsBuilding(true)
      if (dirtyEntries.length > 0) {
        // Worker mode: reset progress before handing items to the worker.
        setTesterRowsProgress({ completed: 0, total: dirtyEntries.length })
      } else {
        setTesterRowsProgress(null)
      }
      const artifactByItemId = new Map<number, NormalizedGearArtifact>()
      const itemsPayload = dirtyEntries.map(({ artifact, itemId }) => {
        artifactByItemId.set(itemId, artifact)
        return { itemId, item: artifact.testerItem }
      })
      let cancelled = false
      evaluateTesterMatchItems({
        items: itemsPayload,
        onProgress: (snapshot) => {
          if (testerRowsBuildIdRef.current !== buildId) return
          setTesterRowsProgress(snapshot)
        },
      })
        .then((results) => {
          if (cancelled || testerRowsBuildIdRef.current !== buildId) return
          results.forEach((result) => {
            const artifact = artifactByItemId.get(result.itemId)
            if (!artifact) return
            nextRowMap.set(result.itemId, toPreviewRow(
              result.itemId,
              artifact,
              result.firstMatch,
              result.firstNonExcludedMatch,
              result.matchingConfigIndices,
            ))
          })
          testerPreviewRowMapRef.current = nextRowMap
          const sortedRows = sortTesterRows(Array.from(nextRowMap.values()))
          setTesterPreviewRows(sortedRows)
          setTesterRowsCommittedBuildId(buildId)
          testerRowsCommittedRulesSignatureRef.current = mergedRulesSignature
          lastSettledArtifactsRef.current = artifacts
          inFlightArtifactsRef.current = null
          // Release building flag even when keep-unique hold is active so the UI does not spin forever.
          if (testerRowsBuildIdRef.current === buildId) {
            setTesterRowsBuilding(false)
            setTesterRowsProgress(null)
          }
        })
        .catch(() => {
          if (cancelled) return
          inFlightArtifactsRef.current = null
          if (testerRowsBuildIdRef.current === buildId) {
            setTesterRowsBuilding(false)
            setTesterRowsProgress(null)
          }
        })
      return () => {
        cancelled = true
        inFlightArtifactsRef.current = null
        // Ensure the building flag releases if this run is aborted.
        if (testerRowsBuildIdRef.current === buildId) {
          setTesterRowsBuilding(false)
          setTesterRowsProgress(null)
        }
      }
    }

    // Fallback path chunked to keep UI responsive.
    inFlightArtifactsRef.current = artifacts
    setTesterRowsBuilding(true)
    if (dirtyEntries.length > 0) {
      // Manual evaluation still reports determinate progress so the UI stays consistent.
      setTesterRowsProgress({ completed: 0, total: dirtyEntries.length })
    } else {
      setTesterRowsProgress(null)
    }
    let cancelled = false

    // Evaluates one artifact synchronously.
    const buildRow = (artifact: NormalizedGearArtifact, itemId: number): TesterPreviewRow => {
      // Evaluate full rule set (including keep-unique injections) for the primary match,
      // and a keep-unique-excluded view for baseMatch so detection still sees the baseline.
      const fullEval = evaluateMatchesByConfig(mergedRules, artifact.testerItem, { configModes })
      const baseEval = evaluateMatchesByConfig(
        mergedRules,
        artifact.testerItem,
        { configModes, excludeSources: [RULE_SOURCE_KEEP_UNIQUES] },
      )
      return toPreviewRow(itemId, artifact, fullEval.firstMatch, baseEval.firstMatch, fullEval.matchingConfigIndices)
    }

    // Process all dirty entries synchronously for now (no chunked timeouts).
    for (let cursor = 0; cursor < dirtyEntries.length; cursor += 1) {
      if (cancelled || testerRowsBuildIdRef.current !== buildId) break
      const entry = dirtyEntries[cursor]
      if (!entry) continue
      nextRowMap.set(entry.itemId, buildRow(entry.artifact, entry.itemId))
      setTesterRowsProgress({ completed: cursor + 1, total: dirtyEntries.length })
    }
    if (!cancelled && testerRowsBuildIdRef.current === buildId) {
      testerPreviewRowMapRef.current = nextRowMap
      const sortedRows = sortTesterRows(Array.from(nextRowMap.values()))
      setTesterPreviewRows(sortedRows)
      setTesterRowsCommittedBuildId(buildId)
      testerRowsCommittedRulesSignatureRef.current = mergedRulesSignature
      lastSettledArtifactsRef.current = artifacts
      inFlightArtifactsRef.current = null
      if (testerRowsBuildIdRef.current === buildId) {
        setTesterRowsBuilding(false)
        setTesterRowsProgress(null)
      }
    }
    return () => {
      cancelled = true
      inFlightArtifactsRef.current = null
      if (testerRowsBuildIdRef.current === buildId) {
        setTesterRowsBuilding(false)
        setTesterRowsProgress(null)
      }
    }
  }, [
    artifacts,
    mergedRules,
    mergedRulesSignature,
    configNames,
    configModes,
    evaluateTesterMatchItems,
    keepUniquesActive,
    keepUniqueDetectionSignature,
    keepUniqueScanAppliedRef,
    pendingKeepUniqueDetectionSigRef,
    setTesterPreviewRows,
    setTesterRowsBuilding,
    setTesterRowsCommittedBuildId,
    setTesterRowsActiveBuildId,
    setTesterRowsProgress,
    effectiveWorkerSupported,
    keepUniqueDetectionDisabled,
    testerRowsBuilding,
    rulesBuilding,
  ])

  // Keep-unique candidate snapshot shared with detectors downstream.
  const keepUniqueCandidates = useMemo<KeepUniqueCandidateSnapshot>(() => {
    if (!testerPreviewRows.length) return EMPTY_KEEP_UNIQUE_CANDIDATES
    return collectKeepUniqueCandidates({
      rows: testerPreviewRows,
      baseRules: keepUniqueBaseRules,
      configModes,
    })
  }, [testerPreviewRows, keepUniqueBaseRules, configModes])

  // Keep-unique detection refresh runs when candidates or rules change.
  useEffect(() => {
    // Only run detection when rows are settled.
    const rowsUpToDate = testerRowsCommittedBuildId >= testerRowsBuildIdRef.current && !testerRowsBuilding
    // When disabled, clear any cached detection + pending signatures.
    if (!keepUniquesActive) {
      keepUniqueScanAppliedRef.current = null
      pendingKeepUniqueDetectionSigRef.current = null
      setKeepUniqueDetection(null)
      return
    }
    // Defer until rows catch up to the latest build.
    if (testerRowsBuilding || !rowsUpToDate) return
    if (testerPreviewRows.length === 0 || keepUniqueCandidates.candidates.length === 0) {
      keepUniqueScanAppliedRef.current = null
      pendingKeepUniqueDetectionSigRef.current = null
      setKeepUniqueDetection(null)
      return
    }

    // Compute keep-unique protection snapshot without deferring to a timeout.
    const snapshot = computeKeepUniqueProtection({
      candidates: keepUniqueCandidates.candidates,
      rules: resolvedKeepUniqueRules,
      enabled: keepUniquesActive,
    })
    const snapshotSignature = fingerprintKeepUniqueDetection(snapshot)
    setKeepUniqueDetection((prev) => {
      // When there was no prior snapshot, always apply and record signature.
      if (!prev) {
        pendingKeepUniqueDetectionSigRef.current = snapshotSignature
        return snapshot
      }
      // Compare lengths + entry fields; if identical, reuse previous snapshot.
      if (prev.entries.length !== snapshot.entries.length) {
        pendingKeepUniqueDetectionSigRef.current = snapshotSignature
        return snapshot
      }
      for (let idx = 0; idx < snapshot.entries.length; idx += 1) {
        const nextEntry = snapshot.entries[idx]
        const prevEntry = prev.entries[idx]
        if (!nextEntry || !prevEntry) {
          pendingKeepUniqueDetectionSigRef.current = snapshotSignature
          return snapshot
        }
        if (
          nextEntry.ruleId !== prevEntry.ruleId
          || nextEntry.ruleEnabled !== prevEntry.ruleEnabled
          || nextEntry.requiredCount !== prevEntry.requiredCount
          || nextEntry.currentCount !== prevEntry.currentCount
          || nextEntry.projectedCount !== prevEntry.projectedCount
          || nextEntry.deficit !== prevEntry.deficit
          || nextEntry.coveredByExisting !== prevEntry.coveredByExisting
          || nextEntry.itemKeys.length !== prevEntry.itemKeys.length
          || nextEntry.artifacts.length !== prevEntry.artifacts.length
        ) {
          pendingKeepUniqueDetectionSigRef.current = snapshotSignature
          return snapshot
        }
      }
      return prev
    })
  }, [
    resolvedKeepUniqueRules,
    keepUniquesActive,
    keepUniqueCandidates,
    keepUniqueDetectionSignature,
    testerPreviewRows.length,
    testerRowsBuilding,
    testerRowsCommittedBuildId,
    setKeepUniqueDetection,
    keepUniqueScanAppliedRef,
    pendingKeepUniqueDetectionSigRef,
  ])

  // Carry keep-unique detection metadata back to caller.
  return { keepUniqueCandidates }
}
