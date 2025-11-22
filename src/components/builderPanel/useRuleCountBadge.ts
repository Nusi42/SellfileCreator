/**
 * useRuleCountBadge
 *
 * Centralizes the asynchronous rule-count pipeline so BuilderPanel can focus on layout.
 * The hook mirrors the existing logic: it debounces fingerprints, reuses worker caches,
 * and surfaces chip styling metadata along with formatted tooltip strings.
 */
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import type { BuilderConfig, SellfileExportMode, SubstatTargetTable } from '../../lib/hsfBuilder'
import type { I18nContextValue } from '../../lib/i18n'
import { formatRulesCount } from '../../lib/i18n'
import { RULE_COUNT_LIMIT, TOTAL_RULE_COUNT_LIMIT } from '../../lib/constants'
import { fingerprintConfigForRules } from '../../lib/ruleCache'

type TranslateFn = I18nContextValue['t']

export interface RuleCountBadgeOptions {
  cfg: BuilderConfig
  substatTargets: SubstatTargetTable
  ruleSubstatTargetsKey: string
  multiEditActive: boolean
  multiProjectedConfigs: readonly BuilderConfig[] | null
  multiSourceConfigs: readonly BuilderConfig[] | null
  multiEditSelection: readonly number[]
  multiDirtyKeys: readonly string[]
  configRuleCounts: ReadonlyMap<number, number>
  configRuleFingerprints: readonly string[]
  selectedIsDirty: boolean
  editingIndex: number | null
  countRulesForConfigs: (params: { configs: readonly BuilderConfig[]; substatTargets: SubstatTargetTable }, options?: { signal?: AbortSignal }) => Promise<number[]>
  awaitRuleCounts?: (() => { token: number; promise: Promise<Map<number, number>> } | null) | null
  rulesBuilding: boolean
  configsExcludedByTotalLimit: ReadonlySet<number>
  t: TranslateFn
}

export interface RuleCountBadgeResult {
  counting: boolean
  ruleCount: number | null
  countingLabel: string
  ruleCountLimitValue: number
  limitExceededWarning: boolean
  limitWarningTooltip: string
  ruleCountChipSx: SxProps<Theme>
}

export function useRuleCountBadge({
  cfg,
  substatTargets,
  ruleSubstatTargetsKey,
  multiEditActive,
  multiProjectedConfigs,
  multiSourceConfigs,
  multiEditSelection,
  multiDirtyKeys,
  configRuleCounts,
  configRuleFingerprints,
  selectedIsDirty,
  editingIndex,
  countRulesForConfigs,
  awaitRuleCounts,
  rulesBuilding,
  configsExcludedByTotalLimit,
  t,
}: RuleCountBadgeOptions): RuleCountBadgeResult {
  // Debounced rule count for the current builder config
  const immediateRuleFingerprint = useMemo(
    () => fingerprintConfigForRules(cfg, ruleSubstatTargetsKey),
    [cfg, ruleSubstatTargetsKey],
  )
  const deferredMultiProjectedConfigs = useDeferredValue(multiProjectedConfigs)
  const deferredCfg = useDeferredValue(cfg)
  const deferredSubstatTargets = useDeferredValue(substatTargets)
  const builderRuleFingerprint = useMemo(
    () => fingerprintConfigForRules(deferredCfg, ruleSubstatTargetsKey),
    [deferredCfg, ruleSubstatTargetsKey],
  )
  // Multi-edit snapshots build a composite fingerprint so shared worker requests reuse cached totals.
  const multiRuleFingerprint = useMemo(() => {
    if (!multiEditActive) return null
    const projected = deferredMultiProjectedConfigs ?? multiProjectedConfigs ?? multiSourceConfigs
    if (!projected || projected.length === 0) return null
    const parts: string[] = []
    for (const config of projected) {
      parts.push(fingerprintConfigForRules(config, ruleSubstatTargetsKey))
    }
    return parts.join('|')
  }, [
    multiEditActive,
    deferredMultiProjectedConfigs,
    multiProjectedConfigs,
    multiSourceConfigs,
    ruleSubstatTargetsKey,
  ])
  const selectedRuleFingerprint = (typeof editingIndex === 'number' && editingIndex >= 0)
    ? (configRuleFingerprints[editingIndex] ?? null)
    : null

  const singleRuleCacheRef = useRef<{ cfgRef: BuilderConfig | null; substatTargetsRef: SubstatTargetTable | null; fingerprint: string | null; count: number | null }>({
    cfgRef: null,
    substatTargetsRef: null,
    fingerprint: null,
    count: null,
  })
  const previousEditingIndexRef = useRef<number | null>(editingIndex)
  const editingSelectionChanged = previousEditingIndexRef.current !== editingIndex

  const precomputedRuleCount = useMemo((): number | null => {
    if (multiEditActive) {
      if (multiDirtyKeys.length > 0) return null
      if (multiEditSelection.length === 0) {
        return 0
      }
      let total = 0
      for (const idx of multiEditSelection) {
        const cachedCount = configRuleCounts.get(idx)
        if (cachedCount === undefined) {
          return null
        }
        total += cachedCount
      }
      return total
    }
    if (typeof editingIndex === 'number' && editingIndex >= 0) {
      const cachedCount = configRuleCounts.get(editingIndex)
      if (cachedCount === undefined) {
        return null
      }
      if (!selectedIsDirty) {
        const fingerprintMatches = !selectedRuleFingerprint || immediateRuleFingerprint === selectedRuleFingerprint
        if (fingerprintMatches) {
          return cachedCount
        }
        return null
      }
      if (editingSelectionChanged) {
        return cachedCount
      }
    }
    if (!multiEditActive) {
      const cache = singleRuleCacheRef.current
      const fingerprintMatchesCache = Boolean(cache.fingerprint && cache.fingerprint === builderRuleFingerprint)
      const configMatches = cache.cfgRef === deferredCfg
      const substatTargetsMatch = cache.substatTargetsRef === deferredSubstatTargets
      if (fingerprintMatchesCache && configMatches && substatTargetsMatch) {
        return cache.count ?? null
      }
    }
    return null
  }, [
    builderRuleFingerprint,
    immediateRuleFingerprint,
    configRuleCounts,
    editingIndex,
    multiDirtyKeys,
    multiEditActive,
    multiEditSelection,
    selectedIsDirty,
    selectedRuleFingerprint,
    deferredCfg,
    deferredSubstatTargets,
    editingSelectionChanged,
  ])

  // Rule counts are resolved asynchronously via the worker helper to avoid UI stalls on large configs.
  const latestRuleCountRef = useRef<number | null>(precomputedRuleCount)
  const [asyncRuleCount, setAsyncRuleCount] = useState<number | null>(() => precomputedRuleCount)
  const [asyncCounting, setAsyncCounting] = useState(false)
  const lastRuleFingerprintRef = useRef<string | null>(precomputedRuleCount !== null ? (multiEditActive ? multiRuleFingerprint : builderRuleFingerprint) : null)
  const pendingCountAbortRef = useRef<AbortController | null>(null)
  const pendingFingerprintRef = useRef<string | null>(null)
  const previousActiveRuleFingerprintRef = useRef<string | null>(multiEditActive ? multiRuleFingerprint : builderRuleFingerprint)

  useLayoutEffect(() => {
    const fingerprint = multiEditActive ? multiRuleFingerprint : builderRuleFingerprint
    const previous = previousActiveRuleFingerprintRef.current
    previousActiveRuleFingerprintRef.current = fingerprint
    if (precomputedRuleCount !== null) return
    if (!fingerprint) return
    if (previous && previous === fingerprint) return
    setAsyncRuleCount(null)
    latestRuleCountRef.current = null
    lastRuleFingerprintRef.current = null
  }, [builderRuleFingerprint, multiEditActive, multiRuleFingerprint, precomputedRuleCount])

  // Resolve rule counts lazily; reuse cached answers before dispatching worker jobs.
  useEffect(() => {
    if (precomputedRuleCount !== null) {
      pendingCountAbortRef.current?.abort()
      pendingCountAbortRef.current = null
      pendingFingerprintRef.current = null
      lastRuleFingerprintRef.current = multiEditActive ? multiRuleFingerprint : builderRuleFingerprint
      latestRuleCountRef.current = precomputedRuleCount
      setAsyncRuleCount(precomputedRuleCount)
      setAsyncCounting(false)
      if (!multiEditActive) {
        singleRuleCacheRef.current = {
          cfgRef: deferredCfg,
          substatTargetsRef: deferredSubstatTargets,
          fingerprint: builderRuleFingerprint,
          count: precomputedRuleCount,
        }
      }
      return
    }

    const activeConfigs: readonly BuilderConfig[] | null = multiEditActive
      ? (deferredMultiProjectedConfigs ?? multiProjectedConfigs ?? multiSourceConfigs ?? null)
      : [deferredCfg]
    if (!activeConfigs || activeConfigs.length === 0) {
      pendingCountAbortRef.current?.abort()
      pendingCountAbortRef.current = null
      pendingFingerprintRef.current = null
      lastRuleFingerprintRef.current = null
      latestRuleCountRef.current = null
      setAsyncRuleCount(null)
      setAsyncCounting(false)
      return
    }

    const fingerprint = multiEditActive ? multiRuleFingerprint : builderRuleFingerprint
    if (!fingerprint) {
      pendingCountAbortRef.current?.abort()
      pendingCountAbortRef.current = null
      setAsyncCounting(false)
      return
    }

    if (lastRuleFingerprintRef.current === fingerprint) {
      setAsyncCounting(false)
      setAsyncRuleCount(latestRuleCountRef.current ?? null)
      return
    }

    if (pendingFingerprintRef.current === fingerprint) {
      setAsyncCounting(true)
      return
    }

    const cleanupFns: Array<() => void> = []
    latestRuleCountRef.current = null
    setAsyncRuleCount(null)

    const isAbortError = (error: unknown): boolean => {
      if (!error || typeof error !== 'object') return false
      const maybe = error as { name?: unknown }
      if (typeof maybe.name === 'string' && maybe.name === 'AbortError') return true
      if (typeof DOMException !== 'undefined' && error instanceof DOMException) return error.name === 'AbortError'
      return false
    }

    const sumCountsFromMap = (map: Map<number, number>): number | null => {
      if (multiEditActive) {
        if (multiEditSelection.length === 0) return 0
        let total = 0
        let infinite = false
        for (const idx of multiEditSelection) {
          const value = map.get(idx)
          if (value === undefined) return null
          if (!Number.isFinite(value)) {
            infinite = true
            continue
          }
          if (!infinite) total += Number(value)
        }
        return infinite ? Number.POSITIVE_INFINITY : total
      }
      if (typeof editingIndex === 'number' && editingIndex >= 0) {
        const value = map.get(editingIndex)
        if (value === undefined) return null
        return Number.isFinite(value) ? Number(value) : Number.POSITIVE_INFINITY
      }
      return null
    }

    const tryResolveViaWarm = (): boolean => {
      if (!awaitRuleCounts) return false
      if (!rulesBuilding) return false
      if (multiEditActive && multiDirtyKeys.length > 0) return false
      if (!multiEditActive && selectedIsDirty) return false
      const handle = awaitRuleCounts()
      if (!handle) return false
      const { promise } = handle
      pendingCountAbortRef.current?.abort()
      pendingCountAbortRef.current = null
      pendingFingerprintRef.current = fingerprint
      let cancelled = false
      const cleanup = () => {
        cancelled = true
        if (pendingFingerprintRef.current === fingerprint) {
          pendingFingerprintRef.current = null
        }
      }
      cleanupFns.push(cleanup)
      setAsyncCounting(true)

      promise
        .then((countsMap) => {
          if (cancelled) return
          if (pendingFingerprintRef.current !== fingerprint) return
          const total = sumCountsFromMap(countsMap)
          if (total === null) {
            pendingFingerprintRef.current = null
            setAsyncCounting(false)
            setAsyncRuleCount(null)
            return
          }
          pendingFingerprintRef.current = null
          lastRuleFingerprintRef.current = fingerprint
          latestRuleCountRef.current = total
          if (!multiEditActive) {
            singleRuleCacheRef.current = {
              cfgRef: deferredCfg,
              substatTargetsRef: deferredSubstatTargets,
              fingerprint,
              count: total,
            }
          }
          setAsyncRuleCount(total)
          setAsyncCounting(false)
        })
        .catch((error) => {
          if (cancelled) return
          if (!isAbortError(error)) {
            console.error('builder warm rule count failed', error)
          }
          pendingFingerprintRef.current = null
          lastRuleFingerprintRef.current = null
          latestRuleCountRef.current = null
          setAsyncCounting(false)
          setAsyncRuleCount(null)
        })

      return true
    }

    if (tryResolveViaWarm()) {
      return () => {
        for (const fn of cleanupFns) fn()
      }
    }

    pendingCountAbortRef.current?.abort()
    const abortController = new AbortController()
    pendingCountAbortRef.current = abortController
    pendingFingerprintRef.current = fingerprint
    setAsyncCounting(true)

    countRulesForConfigs({ configs: activeConfigs, substatTargets: deferredSubstatTargets }, { signal: abortController.signal })
      .then((counts) => {
        if (abortController.signal.aborted) return
        const hasInfinite = counts.some((value) => !Number.isFinite(value))
        const total = hasInfinite
          ? Number.POSITIVE_INFINITY
          : counts.reduce((sum, value) => sum + Number(value), 0)
        pendingFingerprintRef.current = null
        lastRuleFingerprintRef.current = fingerprint
        latestRuleCountRef.current = total
        if (!multiEditActive) {
          singleRuleCacheRef.current = {
            cfgRef: deferredCfg,
            substatTargetsRef: deferredSubstatTargets,
            fingerprint,
            count: total,
          }
        }
        setAsyncRuleCount(total)
        setAsyncCounting(false)
      })
      .catch((error) => {
        if (abortController.signal.aborted || isAbortError(error)) return
        pendingFingerprintRef.current = null
        lastRuleFingerprintRef.current = null
        latestRuleCountRef.current = null
        setAsyncCounting(false)
        setAsyncRuleCount(null)
        console.error('builder rule count failed', error)
      })

    cleanupFns.push(() => {
      abortController.abort()
      if (pendingFingerprintRef.current === fingerprint) {
        pendingFingerprintRef.current = null
      }
    })

    return () => {
      for (const fn of cleanupFns) fn()
    }
  }, [
    awaitRuleCounts,
    builderRuleFingerprint,
    countRulesForConfigs,
    deferredCfg,
    deferredSubstatTargets,
    deferredMultiProjectedConfigs,
    multiDirtyKeys,
    multiEditActive,
    multiEditSelection,
    multiProjectedConfigs,
    multiRuleFingerprint,
    multiSourceConfigs,
    precomputedRuleCount,
    rulesBuilding,
    editingIndex,
    selectedIsDirty,
  ])

  const activeRuleFingerprint = multiEditActive ? multiRuleFingerprint : builderRuleFingerprint
  const hasResolvedCountForActiveFingerprint = Boolean(
    activeRuleFingerprint &&
    lastRuleFingerprintRef.current &&
    lastRuleFingerprintRef.current === activeRuleFingerprint,
  )
  const resolvedAsyncRuleCount = hasResolvedCountForActiveFingerprint
    ? (asyncRuleCount ?? latestRuleCountRef.current)
    : null
  const counting = precomputedRuleCount === null && (!hasResolvedCountForActiveFingerprint || asyncCounting)
  const ruleCount = precomputedRuleCount ?? resolvedAsyncRuleCount
  const hasTotalLimitSelection = useMemo(() => {
    if (multiEditActive) {
      return multiEditSelection.some((idx) => configsExcludedByTotalLimit.has(idx))
    }
    if (typeof editingIndex === 'number' && editingIndex >= 0) {
      return configsExcludedByTotalLimit.has(editingIndex)
    }
    return false
  }, [configsExcludedByTotalLimit, editingIndex, multiEditActive, multiEditSelection])
  const ruleCountLimitValue = hasTotalLimitSelection ? TOTAL_RULE_COUNT_LIMIT : RULE_COUNT_LIMIT
  const warnEligibleExportMode = useMemo(() => {
    if (multiEditActive) {
      const projected = deferredMultiProjectedConfigs ?? multiProjectedConfigs ?? multiSourceConfigs
      if (!projected || projected.length === 0) return false
      return projected.every((config) => {
        const mode = (config.exportMode ?? 'active') as SellfileExportMode
        return mode === 'active' || mode === 'disabled'
      })
    }
    const singleMode = (cfg.exportMode ?? 'active') as SellfileExportMode
    return singleMode === 'active' || singleMode === 'disabled'
  }, [cfg.exportMode, deferredMultiProjectedConfigs, multiEditActive, multiProjectedConfigs, multiSourceConfigs])
  // Flag zero-rule outputs so we can warn via the status chip before committing.
  const countingLabel = t('counting')
  const sampleMaxRulesLabel = formatRulesCount(t, Number.POSITIVE_INFINITY, { limit: ruleCountLimitValue })
  const limitWarningTooltip = useMemo(() => t('rulesLimitExceeded', { limit: ruleCountLimitValue }), [ruleCountLimitValue, t])
  const ruleCountChipMinChars = Math.max(
    Array.from(countingLabel).length,
    Array.from(sampleMaxRulesLabel).length,
    0,
  )
  // Reserve width so the chip stays stable while the async placeholder swaps with the resolved count.
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

  useEffect(() => {
    previousEditingIndexRef.current = editingIndex
  }, [editingIndex])

  return {
    counting,
    ruleCount,
    countingLabel,
    ruleCountLimitValue,
    limitExceededWarning,
    limitWarningTooltip,
    ruleCountChipSx,
  }
}
