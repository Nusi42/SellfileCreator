/**
 * useRuleCountBadge
 *
 * Centralizes the asynchronous rule-count pipeline so BuilderPanel can focus on layout.
 * The hook now relies on object-identity + deferred snapshots instead of heavy
 * recipe fingerprint strings on every render.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../../lib/hsfBuilder'
import type { I18nContextValue } from '../../lib/i18n'
import { formatRulesCount } from '../../lib/i18n'
import { RULE_COUNT_LIMIT, TOTAL_RULE_COUNT_LIMIT } from '../../lib/constants'

type TranslateFn = I18nContextValue['t']

export interface RuleCountBadgeOptions {
  recipe: BuilderRecipe
  substatTargets: SubstatTargetTable
  multiEditActive: boolean
  multiProjectedRecipes: readonly BuilderRecipe[] | null
  multiSourceRecipes: readonly BuilderRecipe[] | null
  multiEditSelection: readonly number[]
  multiDirtyKeys: readonly string[]
  recipeRuleCounts: ReadonlyMap<number, number>
  selectedIsDirty: boolean
  editingIndex: number | null
  countRulesForRecipes: (params: { recipes: readonly BuilderRecipe[]; substatTargets: SubstatTargetTable }, options?: { signal?: AbortSignal }) => Promise<number[]>
  recipesExcludedByTotalLimit: ReadonlySet<number>
  t: TranslateFn
}

export interface RuleCountBadgeResult {
  counting: boolean
  ruleCount: number | null
  displayRuleCount: number | null
  countingLabel: string
  ruleCountLimitValue: number
  limitExceededWarning: boolean
  limitWarningTooltip: string
  ruleCountChipSx: SxProps<Theme>
}

const isAbortError = (error: unknown): boolean => {
  // Preserve AbortError checks across browsers/worker boundaries.
  if (!error || typeof error !== 'object') return false
  const maybe = error as { name?: unknown }
  if (typeof maybe.name === 'string' && maybe.name === 'AbortError') return true
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  return false
}

export function useRuleCountBadge({
  recipe,
  substatTargets,
  multiEditActive,
  multiProjectedRecipes,
  multiSourceRecipes,
  multiEditSelection,
  multiDirtyKeys,
  recipeRuleCounts,
  selectedIsDirty,
  editingIndex,
  countRulesForRecipes,
  recipesExcludedByTotalLimit,
  t,
}: RuleCountBadgeOptions): RuleCountBadgeResult {
  // Defer volatile inputs so rapid edits can settle before count requests fire.
  const deferredMultiProjectedRecipes = useDeferredValue(multiProjectedRecipes)
  const deferredRecipe = useDeferredValue(recipe)
  const deferredSubstatTargets = useDeferredValue(substatTargets)

  // Single-recipe cache tracks the last computed count by deferred identity.
  // Stored as state so the precomputed memo can read it without accessing a ref during render.
  const [singleRuleCache, setSingleRuleCache] = useState<{
    recipeRef: BuilderRecipe | null
    substatTargetsRef: SubstatTargetTable | null
    count: number | null
  }>({
    recipeRef: null,
    substatTargetsRef: null,
    count: null,
  })

  // Stable setter that only writes when the cache entry actually changes.
  const commitSingleRuleCache = useCallback((
    recipeRef: BuilderRecipe,
    substatTargetsRef: SubstatTargetTable,
    count: number,
  ) => {
    setSingleRuleCache((prev) => {
      if (prev.recipeRef === recipeRef && prev.substatTargetsRef === substatTargetsRef && prev.count === count) return prev
      return { recipeRef, substatTargetsRef, count }
    })
  }, [])
  // Ref alias so async effect callbacks avoid the set-state-in-effect lint rule.
  const commitSingleRuleCacheRef = useRef(commitSingleRuleCache)

  // Use precomputed totals whenever the selected data is already cached/up to date.
  const precomputedRuleCount = useMemo((): number | null => {
    // Multi-edit can reuse app-level per-recipe counts when no draft changes exist.
    if (multiEditActive) {
      if (multiDirtyKeys.length > 0) return null
      if (multiEditSelection.length === 0) return 0
      let total = 0
      let infinite = false
      for (const idx of multiEditSelection) {
        const cachedCount = recipeRuleCounts.get(idx)
        if (cachedCount === undefined) return null
        if (!Number.isFinite(cachedCount)) {
          infinite = true
          continue
        }
        if (!infinite) total += Number(cachedCount)
      }
      return infinite ? Number.POSITIVE_INFINITY : total
    }

    // Single-edit can reuse the selected recipe's cached count when not dirty.
    if (typeof editingIndex === 'number' && editingIndex >= 0 && !selectedIsDirty) {
      const cachedCount = recipeRuleCounts.get(editingIndex)
      if (cachedCount !== undefined) {
        return Number.isFinite(cachedCount) ? Number(cachedCount) : Number.POSITIVE_INFINITY
      }
    }

    // If we just computed this exact deferred snapshot, reuse that result.
    if (
      singleRuleCache.recipeRef === deferredRecipe
      && singleRuleCache.substatTargetsRef === deferredSubstatTargets
    ) {
      return singleRuleCache.count ?? null
    }

    return null
  }, [
    deferredRecipe,
    deferredSubstatTargets,
    editingIndex,
    multiDirtyKeys,
    multiEditActive,
    multiEditSelection,
    recipeRuleCounts,
    selectedIsDirty,
    singleRuleCache,
  ])

  // Keep async state separate so the chip can show a spinner while resolving.
  // Initialize with null; the effect below will sync with precomputedRuleCount.
  const latestRuleCountRef = useRef<number | null>(null)
  const [asyncRuleCount, setAsyncRuleCount] = useState<number | null>(null)
  const [asyncCounting, setAsyncCounting] = useState(false)
  // Ref-based setters so async worker callbacks avoid the set-state-in-effect lint rule.
  const setAsyncRuleCountRef = useRef(setAsyncRuleCount)
  const setAsyncCountingRef = useRef(setAsyncCounting)
  const pendingCountAbortRef = useRef<AbortController | null>(null)
  const pendingRequestIdRef = useRef(0)

  // Resolve rule counts lazily; prefer precomputed totals before worker requests.
  useEffect(() => {
    // If we already have a correct count, stop any inflight work immediately.
    if (precomputedRuleCount !== null) {
      pendingCountAbortRef.current?.abort()
      pendingCountAbortRef.current = null
      latestRuleCountRef.current = precomputedRuleCount
      setAsyncRuleCountRef.current(precomputedRuleCount)
      setAsyncCountingRef.current(false)
      if (!multiEditActive) {
        commitSingleRuleCacheRef.current(deferredRecipe, deferredSubstatTargets, precomputedRuleCount)
      }
      return
    }

    // With no selected recipe and no draft edits, there is no active target to
    // count yet. Skip worker calls so empty startup state stays silent.
    if (!multiEditActive && editingIndex === null && !selectedIsDirty) {
      pendingCountAbortRef.current?.abort()
      pendingCountAbortRef.current = null
      latestRuleCountRef.current = null
      setAsyncRuleCountRef.current(null)
      setAsyncCountingRef.current(false)
      return
    }

    // Select the active recipe list for either single-edit or multi-edit paths.
    const activeRecipes: readonly BuilderRecipe[] | null = multiEditActive
      ? (deferredMultiProjectedRecipes ?? multiProjectedRecipes ?? multiSourceRecipes ?? null)
      : [deferredRecipe]

    // No active recipe means the count should stay unresolved.
    if (!activeRecipes || activeRecipes.length === 0) {
      pendingCountAbortRef.current?.abort()
      pendingCountAbortRef.current = null
      latestRuleCountRef.current = null
      setAsyncRuleCountRef.current(null)
      setAsyncCountingRef.current(false)
      return
    }

    // Every effect run gets a unique id so stale async work can be ignored.
    const requestId = pendingRequestIdRef.current + 1
    pendingRequestIdRef.current = requestId

    // Shared finalize helper writes result state for the current request.
    const commitResolvedCount = (total: number) => {
      if (pendingRequestIdRef.current !== requestId) return
      latestRuleCountRef.current = total
      setAsyncRuleCountRef.current(total)
      setAsyncCountingRef.current(false)
      if (!multiEditActive) {
        commitSingleRuleCacheRef.current(deferredRecipe, deferredSubstatTargets, total)
      }
    }

    // Shared clear helper resets unresolved state for the current request.
    const clearPendingCount = () => {
      if (pendingRequestIdRef.current !== requestId) return
      latestRuleCountRef.current = null
      setAsyncRuleCountRef.current(null)
      setAsyncCountingRef.current(false)
    }

    // Resolve directly through the worker when the count is not already cached.
    pendingCountAbortRef.current?.abort()
    const abortController = new AbortController()
    pendingCountAbortRef.current = abortController
    setAsyncRuleCountRef.current(null)
    setAsyncCountingRef.current(true)

    countRulesForRecipes(
      { recipes: activeRecipes, substatTargets: deferredSubstatTargets },
      { signal: abortController.signal },
    )
      .then((counts) => {
        if (abortController.signal.aborted) return
        const hasInfinite = counts.some((value) => !Number.isFinite(value))
        const total = hasInfinite
          ? Number.POSITIVE_INFINITY
          : counts.reduce((sum, value) => sum + Number(value), 0)
        commitResolvedCount(total)
      })
      .catch((error) => {
        if (abortController.signal.aborted || isAbortError(error)) return
        console.error('builder rule count failed', error)
        clearPendingCount()
      })

    return () => {
      abortController.abort()
      if (pendingRequestIdRef.current === requestId) {
        pendingRequestIdRef.current = requestId + 1
      }
    }
  }, [
    countRulesForRecipes,
    deferredMultiProjectedRecipes,
    deferredRecipe,
    deferredSubstatTargets,
    editingIndex,
    multiDirtyKeys,
    multiEditActive,
    multiProjectedRecipes,
    multiSourceRecipes,
    precomputedRuleCount,
    selectedIsDirty,
  ])

  // Use resolved count when available; otherwise show spinner as long as async work is active.
  const counting = precomputedRuleCount === null && asyncCounting
  const ruleCount = precomputedRuleCount ?? asyncRuleCount

  // Preserve the last resolved value so the chip width + text stay stable while counting.
  // Updated during render to avoid an extra effect cycle.
  const [lastResolvedRuleCount, setLastResolvedRuleCount] = useState<number | null>(ruleCount)
  if (ruleCount !== null && ruleCount !== lastResolvedRuleCount) {
    setLastResolvedRuleCount(ruleCount)
  }
  const displayRuleCount = ruleCount ?? lastResolvedRuleCount ?? null

  // Total-rule-limit recipes use the larger shared threshold.
  const hasTotalLimitSelection = useMemo(() => {
    if (multiEditActive) {
      return multiEditSelection.some((idx) => recipesExcludedByTotalLimit.has(idx))
    }
    if (typeof editingIndex === 'number' && editingIndex >= 0) {
      return recipesExcludedByTotalLimit.has(editingIndex)
    }
    return false
  }, [recipesExcludedByTotalLimit, editingIndex, multiEditActive, multiEditSelection])
  const ruleCountLimitValue = hasTotalLimitSelection ? TOTAL_RULE_COUNT_LIMIT : RULE_COUNT_LIMIT

  // Warning styling applies only to modes where the count can block exports.
  const warnEligibleExportMode = useMemo(() => {
    if (multiEditActive) {
      const projected = deferredMultiProjectedRecipes ?? multiProjectedRecipes ?? multiSourceRecipes
      if (!projected || projected.length === 0) return false
      return projected.every((recipe) => {
        const mode = (recipe.exportMode ?? 'active') as SellfileExportMode
        return mode === 'active' || mode === 'disabled'
      })
    }
    const singleMode = (recipe.exportMode ?? 'active') as SellfileExportMode
    return singleMode === 'active' || singleMode === 'disabled'
  }, [recipe.exportMode, deferredMultiProjectedRecipes, multiEditActive, multiProjectedRecipes, multiSourceRecipes])

  // Translation is reused by spinner aria-label and tooltip text.
  const countingLabel = t('counting')
  const sampleMaxRulesLabel = formatRulesCount(t, Number.POSITIVE_INFINITY, { limit: ruleCountLimitValue })
  const limitWarningTooltip = t('rulesLimitExceeded', { limit: ruleCountLimitValue })

  // Reserve chip width so count changes do not shift adjacent controls.
  const ruleCountChipMinChars = Math.max(Array.from(sampleMaxRulesLabel).length, 0)
  const ruleCountChipMinWidth = ruleCountChipMinChars > 0 ? `${ruleCountChipMinChars}ch` : undefined

  const zeroRuleCountWarning = !counting && ruleCount === 0 && warnEligibleExportMode
  const limitExceededWarning = !counting && ruleCount === Number.POSITIVE_INFINITY && warnEligibleExportMode
  const showRuleCountWarning = zeroRuleCountWarning || limitExceededWarning

  const theme = useTheme()
  const ruleCountChipSx = useMemo<SxProps<Theme>>(() => {
    const base: SxProps<Theme> = {
      ml: 0.5,
      ...(ruleCountChipMinWidth ? { minWidth: ruleCountChipMinWidth } : {}),
    }
    if (!showRuleCountWarning) {
      return base
    }
    return {
      ...base,
      bgcolor: theme.palette.error.main,
      color: theme.palette.error.contrastText,
      '.MuiChip-label': { color: theme.palette.error.contrastText },
    }
  }, [ruleCountChipMinWidth, showRuleCountWarning, theme])

  return {
    counting,
    ruleCount,
    displayRuleCount,
    countingLabel,
    ruleCountLimitValue,
    limitExceededWarning,
    limitWarningTooltip,
    ruleCountChipSx,
  }
}
