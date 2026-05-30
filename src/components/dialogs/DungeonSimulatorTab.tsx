import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Box, ButtonBase, Divider, IconButton, MenuItem, Popover, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import { useI18n } from '../../lib/i18n'
import { ACCESSORY_NO_SET_ID, STANDARD_DIALOG_PADDING_BLOCK_UNITS, STANDARD_DIALOG_PADDING_INLINE_UNITS } from '../../lib/constants'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY, artifactTypeI18nKey, getLocalizedGearSetName, statVariantI18nKey, type ArtifactSetId, type ArtifactTypeId, type LevelMilestone } from '../../lib/types'
import type { HsfRuleWithRecipe } from '../../lib/merge'
import type { SubstatTargetTable } from '../../lib/hsfBuilder/types'
import type { ArtifactSetSelectionEntry } from '../../lib/gearSets/selection'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from '../../lib/gearSets/selection'
import { SetIcon } from '../SetIcon'
import EllipsisTooltip from '../EllipsisTooltip'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from '../ContextMenuPaper'
import ContextMenuTitle from '../ContextMenuTitle'
import { artifactTypeIconList } from '../artifactTypeIcons'
import { GearSetsSelect } from '../gear'
import {
  DUNGEON_IDS,
  DUNGEON_SIM_BATCH_SIZE,
  DUNGEON_SIM_DEFAULT_LEVEL,
  DUNGEON_SIM_LEVELS,
  DUNGEON_SIM_RUNS_PER_DUNGEON,
  DUNGEON_BOOST_MODES,
  DUNGEON_SIM_MODE_DEFAULT,
  DUNGEON_SIM_MODES,
  EVENT_SPOTLIGHT_OPTIONS,
  isBoostableDungeon,
  normalizeDungeonBoostSelection,
  resolveDefaultBoostSet,
  resolveBoostableSets,
  resolveDungeonBoostDefault,
  resolveDungeonSets,
  resolveDungeonStageDefault,
  resolveDungeonStageRange,
  resolveDungeonSlotIds,
  resolveEventSpotlightSet,
  type DungeonBoostSelection,
  type DungeonBoostableId,
  type DungeonId,
  type DungeonSimMode,
  type DungeonSimBreakdown,
  type DungeonSimCell,
  type DungeonSimDungeonResults,
  type DungeonSimGenericQuery,
  type DungeonSimGenericStats,
  type DungeonSimProgress,
} from '../../lib/dungeonSimulator'
import type { SubstatColorMap } from '../../lib/renderColoredStatText'
import { PROGRESS_THROTTLE_MS } from '../../types/progress'
import { useDungeonSimulatorWorker } from '../../hooks/useDungeonSimulatorWorker'
import { useContextMenuPaperGuard } from '../../hooks/useContextMenuPaperGuard'
import { buildDefaultDungeonSimulatorPreferences, sanitizeStageSelection, useDungeonSimulatorPreferences } from '../../state/dungeonSimulatorPreferences'
import MarkdownTooltip from '../MarkdownTooltip'
import { measureCssWidth } from '../../lib/domMeasurements'

// Detail popover target for a single milestone cell.
type DetailTarget = { kind: 'level'; dungeonId: DungeonId; setId: ArtifactSetId; level: LevelMilestone }
// Cache generic stats with the run count used as the denominator.
type GenericStatsCacheEntry = {
  stats: DungeonSimGenericStats | null
  sampledTotalDrops: number
}

// Keep dungeon labels centralized so each table shares the same i18n keys.
const DUNGEON_LABEL_KEYS: Record<DungeonId, string> = {
  iceGolem: 'dungeonIceGolem',
  fireKnight: 'dungeonFireKnight',
  spider: 'dungeonSpider',
  dragon: 'dungeonDragon',
  event: 'dungeonEvent',
}

// Percent precision aims for at least two significant figures in tiny rates.
const PERCENT_SIG_FIGS = 2
// Keep baseline precision stable so larger values still show decimals.
const PERCENT_DECIMALS_MIN = 2
// Cap the precision so very small rates do not blow out the table width.
const PERCENT_DECIMALS_MAX = 6

// Clamp precision to the simulation resolution so digits can actually change.
const resolvePercentDecimalsForResolution = (totalDrops: number): number => {
  if (!Number.isFinite(totalDrops) || totalDrops <= 0) return PERCENT_DECIMALS_MAX
  const step = 100 / totalDrops
  if (!Number.isFinite(step) || step <= 0) return PERCENT_DECIMALS_MAX
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)))
  return Math.min(decimals, PERCENT_DECIMALS_MAX)
}

// Convert a smallest positive percentage into a shared decimal count.
const resolvePercentDecimalsForMin = (minPositive: number | null, maxDecimals = PERCENT_DECIMALS_MAX): number => {
  const clampedMax = Math.max(0, maxDecimals)
  const minDecimals = Math.min(PERCENT_DECIMALS_MIN, clampedMax)
  // Guard against missing or zero-only datasets.
  if (!Number.isFinite(minPositive) || !minPositive || minPositive <= 0) {
    return minDecimals
  }
  // Use the magnitude to find the decimal digits needed for 2 sig figs.
  const exponent = Math.floor(Math.log10(Math.abs(minPositive)))
  // Compute decimals that preserve at least two meaningful digits.
  const needed = Math.max(0, PERCENT_SIG_FIGS - 1 - exponent)
  // Clamp to keep formatting readable in dense grids.
  return Math.min(Math.max(needed, minDecimals), clampedMax)
}

// Derive consistent precision from a list of percent values.
const resolvePercentDecimalsForValues = (values: number[], maxDecimals = PERCENT_DECIMALS_MAX): number => {
  // Track the smallest positive value in the dataset.
  let minPositive = Number.POSITIVE_INFINITY
  for (const value of values) {
    // Skip zeros and invalid entries to avoid precision drift.
    if (!Number.isFinite(value) || value <= 0) continue
    // Keep the smallest positive value as the precision anchor.
    if (value < minPositive) minPositive = value
  }
  // Convert the smallest value into a stable decimal count.
  return resolvePercentDecimalsForMin(Number.isFinite(minPositive) ? minPositive : null, maxDecimals)
}

// Resolve the percent precision for a single dungeon table.
const resolveDungeonTablePercentDecimals = (params: {
  dungeonResults: DungeonSimDungeonResults | undefined
  setIds: readonly ArtifactSetId[]
  totalDrops: number
}): number => {
  const { dungeonResults, setIds, totalDrops } = params
  const maxDecimals = resolvePercentDecimalsForResolution(totalDrops)
  // Without completed runs or results, fall back to the baseline precision.
  if (!dungeonResults || totalDrops <= 0) return Math.min(PERCENT_DECIMALS_MIN, maxDecimals)
  // Track the smallest positive percentage across the table.
  let minPositive = Number.POSITIVE_INFINITY
  for (const setId of setIds) {
    // Skip missing set data to keep resilience when tables stream.
    const setResults = dungeonResults[setId]
    if (!setResults) continue
    for (const level of DUNGEON_SIM_LEVELS) {
      // Each cell maps to a single set + level percentage.
      const cell = setResults.levels[level]
      if (!cell) continue
      const percent = (cell.kept / totalDrops) * 100
      if (percent > 0 && percent < minPositive) minPositive = percent
    }
  }
  // Convert the smallest percent into the shared precision.
  return resolvePercentDecimalsForMin(Number.isFinite(minPositive) ? minPositive : null, maxDecimals)
}

// Consistent percent formatter keeps the grid and popover aligned.
const formatPercent = (value: number, digits = PERCENT_DECIMALS_MIN): string => `${value.toFixed(digits)}%`

// Cell percentages reflect kept drops as a share of all dungeon drops.
const formatCellPercent = (cell: DungeonSimCell, totalDrops: number, digits = PERCENT_DECIMALS_MIN): string => {
  if (totalDrops <= 0) return '—'
  return formatPercent((cell.kept / totalDrops) * 100, digits)
}

// Standardize milestone labels so collapsed/expanded rows match.
const formatLevelLabel = (level: LevelMilestone): string => `+${level}`

// Probability targets for "runs needed" estimates.
const RUN_PROB_TARGETS = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '90%', value: 0.9 },
  { label: '95%', value: 0.95 },
  { label: '99%', value: 0.99 },
] as const

// Generic odds report on 1/2/3/4 specific substats.
const SPECIFIC_SUBSTAT_COUNTS = [1, 2, 3, 4] as const

// Slightly wider detail popover keeps slot rows readable (e.g. CDMG% label + value).
const DETAIL_POPOVER_MAX_WIDTH_PX = 420
// Minimum popover width prevents slot rows from compressing into overlapping text.
const DETAIL_POPOVER_MIN_WIDTH_PX = 360

const computeRunsNeededFromProbability = (p: number, target: number): number | null => {
  if (!Number.isFinite(p) || p <= 0) return null
  if (p >= 1) return 1
  const runs = Math.log(1 - target) / Math.log(1 - p)
  if (!Number.isFinite(runs)) return null
  return Math.max(1, Math.ceil(runs))
}

// Resolve the per-dungeon completed run count to keep the header status stable.
const resolveRunsCompleted = (progress: DungeonSimProgress | null): number => {
  if (!progress) return 0
  let minCompleted = Number.POSITIVE_INFINITY
  for (const dungeonId of DUNGEON_IDS) {
    const completed = progress.completedByDungeon?.[dungeonId] ?? 0
    if (completed < minCompleted) minCompleted = completed
  }
  return Number.isFinite(minCompleted) ? minCompleted : 0
}

// Format the run counter as "completed/total" for the header note.
const formatRunProgress = (progress: DungeonSimProgress | null): string => {
  const totalRuns = progress?.runsPerDungeon ?? DUNGEON_SIM_RUNS_PER_DUNGEON
  const completedRuns = resolveRunsCompleted(progress)
  return `${completedRuns}/${totalRuns}`
}

// Normalize set labels with the accessory no-set sentinel.
const formatSetLabel = (params: { setId: ArtifactSetId; translate: (key: string) => string; lang: string }): string => {
  const { setId, translate, lang } = params
  if (Number(setId) === ACCESSORY_NO_SET_ID) return translate('noSetAccessories')
  return getLocalizedGearSetName(setId, translate, lang)
}

// Build a stage dropdown list for the selected dungeon range.
const buildStageOptions = (range: { min: number; max: number }): number[] => {
  const count = range.max - range.min + 1
  return Array.from({ length: count }, (_, idx) => range.min + idx)
}

// Main stat ordering mirrors the shared stat priority list.
const MAINSTAT_PRIORITY = new Map<number, number>(
  STAT_VARIANTS_PRIORITY.map((variant, index) => [Number(variant), index]),
)

// Sort a breakdown list by main stat priority for consistent per-slot ordering.
const sortBreakdownByMain = (entries: DungeonSimBreakdown[]): DungeonSimBreakdown[] => (
  entries.slice().sort((a, b) => {
    const aIndex = MAINSTAT_PRIORITY.get(Number(a.main)) ?? Number.MAX_SAFE_INTEGER
    const bIndex = MAINSTAT_PRIORITY.get(Number(b.main)) ?? Number.MAX_SAFE_INTEGER
    if (aIndex !== bIndex) return aIndex - bIndex
    return Number(a.main) - Number(b.main)
  })
)

// Reduce a multi-select set selection down to the last explicitly included set.
const resolveSingleBoostSet = (entries: ArtifactSetSelectionEntry[]): ArtifactSetId | null => {
  const normalized = normalizeArtifactSetSelections(entries)
  const split = splitArtifactSetSelections(normalized)
  const last = split.included[split.included.length - 1]
  return last ?? null
}

export type DungeonSimulatorTabProps = {
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  // Provide the shared stat color map so the popover can match other UI.
  substatColors: SubstatColorMap
  // Flag for the "color stat text" display preference.
  useStatButtonColors: boolean
  /**
   * Increment from outside to reset all persisted simulator preferences to their defaults.
   * Mirrors the "Reset to defaults" button pattern used in other Logic Hub tabs.
   */
  resetKey?: number
  // When false, pauses the sim and releases the worker. Transitions to true restart it.
  // Pass open && showDungeonTab from the parent dialog so the sim stops when the dialog
  // closes and auto-restarts when it reopens.
  isActive?: boolean
}

export default function DungeonSimulatorTab(props: DungeonSimulatorTabProps) {
  const { rules, substatTargets, substatColors, useStatButtonColors, resetKey, isActive } = props
  const { t, lang } = useI18n()
  // Persisted mode/stage/spotlight selections keep the simulator stable across sessions.
  const [prefs, setPrefs] = useDungeonSimulatorPreferences()
  // Reset all preferences to defaults when the parent increments resetKey.
  // Guard with `if (resetKey)` so the effect is a no-op on the initial mount
  // (resetKey=0). Firing setPrefs on mount would notify the localStorage store
  // with a new object reference even when values are identical, causing the
  // control effect in useDungeonSimulatorWorker to re-run, cancel the in-flight
  // sim, and return early — breaking auto-start.
  useEffect(() => { if (resetKey) setPrefs(buildDefaultDungeonSimulatorPreferences()) }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  // Manual refresh bumps force a full resimulation without input changes.
  const [refreshToken, setRefreshToken] = useState(0)
  // Anchor + target power the detail popover when a cell is clicked.
  const [detailAnchor, setDetailAnchor] = useState<HTMLElement | null>(null)
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null)
  const detailOpen = Boolean(detailAnchor && detailTarget)
  // Reuse context menu paper behavior so the popout includes the shared close button.
  // Keep a ref to satisfy the guard hook and prevent stuck overlays.
  const detailPopoverPaperRef = useRef<HTMLDivElement | null>(null)

  // Stream dungeon simulation results from a worker so the UI stays responsive.
  // Use the persisted selections so the same stage picks survive reloads.
  const { results: simulation, progress, running, requestGenericStats } = useDungeonSimulatorWorker({
    rules,
    substatTargets,
    selections: prefs.stages,
    spotlight: prefs.eventSpotlight,
    boosts: prefs.boosts,
    mode: prefs.simMode,
    refreshToken,
    runs: DUNGEON_SIM_RUNS_PER_DUNGEON,
    batchSize: DUNGEON_SIM_BATCH_SIZE,
    throttleMs: PROGRESS_THROTTLE_MS,
    ...(isActive !== undefined ? { isActive } : {}),
  })

  // Cell clicks bind the anchor element and target metadata.
  const handleCellClick = (event: MouseEvent<HTMLElement>, target: DetailTarget) => {
    setDetailAnchor(event.currentTarget)
    setDetailTarget(target)
  }

  // Close handler clears both anchor and payload.
  // Keep this centralized so guard hooks always call the same cleanup.
  const handleDetailClose = () => {
    setDetailAnchor(null)
    setDetailTarget(null)
  }
  // Guard the popover so outside clicks always clear the anchor + target.
  const { contextMenuGuard: detailPopoverGuard } = useContextMenuPaperGuard({
    open: detailOpen,
    onClose: handleDetailClose,
    menuRef: detailPopoverPaperRef,
  })
  // Cache generic substat odds per slot/main + sampled run count.
  const [genericStatsByKey, setGenericStatsByKey] = useState<Record<string, GenericStatsCacheEntry | null>>({})
  const [genericLoadingByKey, setGenericLoadingByKey] = useState<Record<string, boolean>>({})
  // Keep refs synced so hover handlers can read fresh cache state.
  const genericStatsRef = useRef(genericStatsByKey)
  const genericLoadingRef = useRef(genericLoadingByKey)
  // Reset the cache whenever a new simulation run starts.
  // This prevents stale tooltip data when stages/boosts/mode change.
  useLayoutEffect(() => {
    genericStatsRef.current = genericStatsByKey
  }, [genericStatsByKey])
  useLayoutEffect(() => {
    genericLoadingRef.current = genericLoadingByKey
  }, [genericLoadingByKey])
  // Reset the cache during render when a new run starts.
  const [prevRunning, setPrevRunning] = useState(running)
  if (running && !prevRunning) {
    setPrevRunning(running)
    setGenericStatsByKey({})
    setGenericLoadingByKey({})
  }
  if (!running && prevRunning) {
    setPrevRunning(running)
  }
  // Persisted stage selection updates (mode and stage).
  const updateDungeonSelection = (dungeonId: DungeonId, next: Partial<{ mode: 'normal' | 'hard'; stage: number }>) => {
    setPrefs((prev) => {
      // Preserve the current selection so toggles only update the changed field.
      const current = prev.stages[dungeonId]
      // Fall back to the dungeon-specific default when data is missing.
      const fallback = resolveDungeonStageDefault(dungeonId)
      const candidate = {
        mode: next.mode ?? current?.mode ?? fallback.mode,
        stage: next.stage ?? current?.stage ?? fallback.stage,
      }
      // Clamp the candidate to valid ranges so the UI never renders invalid stages.
      const normalized = sanitizeStageSelection(dungeonId, candidate, current ?? fallback)
      return {
        ...prev,
        stages: { ...prev.stages, [dungeonId]: normalized },
      }
    })
  }

  // Spotlight selection is a single global toggle for the event dungeon.
  // Clamp to the two supported keys in case toggles drift.
  const updateEventSpotlight = (next: string | null) => {
    if (!next) return
    setPrefs((prev) => ({
      ...prev,
      eventSpotlight: next === 'pinpoint' ? 'pinpoint' : 'chronophage',
    }))
  }

  // Persist the selected simulation mode (snapshot vs level-up).
  const updateSimMode = (next: DungeonSimMode | null) => {
    if (!next) return
    // Normalize to the supported mode set.
    const normalized = DUNGEON_SIM_MODES.includes(next) ? next : DUNGEON_SIM_MODE_DEFAULT
    setPrefs((prev) => ({ ...prev, simMode: normalized }))
  }

  // Update a boosted set selection for the chosen dungeon.
  const updateDungeonBoost = (dungeonId: DungeonBoostableId, next: Partial<DungeonBoostSelection>) => {
    setPrefs((prev) => {
      // Preserve the current boost selection for partial updates.
      const current = prev.boosts?.[dungeonId] ?? resolveDungeonBoostDefault(dungeonId)
      // Merge updates before normalization.
      const candidate = { ...current, ...next }
      // When enabling boosts, seed the default set if none is selected.
      if (candidate.mode !== 'off' && candidate.setId == null) {
        candidate.setId = resolveDefaultBoostSet(dungeonId)
      }
      const normalized = normalizeDungeonBoostSelection(dungeonId, candidate, current)
      return {
        ...prev,
        boosts: { ...prev.boosts, [dungeonId]: normalized },
      }
    })
  }

  const triggerSimulationRefresh = () => {
    // Increment the token to force a full resimulation.
    setRefreshToken((prev) => prev + 1)
  }

  const toggleDungeonCollapsed = (params: { dungeonId: DungeonId; scope: 'single' | 'all' }) => {
    const { dungeonId, scope } = params
    // Persisted collapse state keeps large tables compact between sessions.
    setPrefs((prev) => {
      // Default missing flags to collapsed so toggles stay deterministic.
      const current = prev.collapsed?.[dungeonId] ?? true
      // Flip the clicked dungeon to define the target for bulk toggles.
      const nextValue = !current
      // Start from the existing map to preserve unrelated state.
      const nextCollapsed = { ...(prev.collapsed ?? {}) } as Record<DungeonId, boolean>
      if (scope === 'all') {
        // Apply a uniform collapsed state to every dungeon table.
        for (const id of DUNGEON_IDS) {
          nextCollapsed[id] = nextValue
        }
      } else {
        // Update only the clicked dungeon when toggling singly.
        nextCollapsed[dungeonId] = nextValue
      }
      return {
        ...prev,
        collapsed: nextCollapsed,
      }
    })
  }

  const resolveNextCollapsedLevel = (
    current: LevelMilestone,
    direction: 'forward' | 'backward',
  ): LevelMilestone => {
    // Normalize the direction into a numeric offset for index math.
    const offset = direction === 'forward' ? 1 : -1
    // Fall back to the default index when the current value is missing.
    const currentIndex = DUNGEON_SIM_LEVELS.indexOf(current)
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    // Wrap around the milestones list so cycling never under/overflows.
    const nextIndex = (safeIndex + offset + DUNGEON_SIM_LEVELS.length) % DUNGEON_SIM_LEVELS.length
    // Guard against an empty milestone list with the default fallback.
    return DUNGEON_SIM_LEVELS[nextIndex] ?? DUNGEON_SIM_DEFAULT_LEVEL
  }

  const rotateCollapsedLevel = (params: {
    dungeonId: DungeonId
    direction: 'forward' | 'backward'
    syncAll: boolean
  }) => {
    const { dungeonId, direction, syncAll } = params
    // Rotate the single-row milestone shown when a table is collapsed.
    setPrefs((prev) => {
      // Fall back to the default milestone when storage is missing.
      const current = prev.collapsedLevels?.[dungeonId] ?? DUNGEON_SIM_DEFAULT_LEVEL
      // Compute the next milestone for the clicked dungeon.
      const nextLevel = resolveNextCollapsedLevel(current, direction)
      // Start from the existing map to preserve other keys.
      const nextCollapsedLevels = { ...(prev.collapsedLevels ?? {}) } as Record<DungeonId, LevelMilestone>
      if (syncAll) {
        // Sync every dungeon's collapsed milestone to the clicked result.
        for (const id of DUNGEON_IDS) {
          nextCollapsedLevels[id] = nextLevel
        }
      } else {
        // Update only the clicked dungeon when cycling singly.
        nextCollapsedLevels[dungeonId] = nextLevel
      }
      return {
        ...prev,
        collapsedLevels: nextCollapsedLevels,
      }
    })
  }

  // Resolve the selected cell once, keeping render logic straightforward.
  // Popover rendering should never re-derive selectors inline.
  const resolvedDetailCell: DungeonSimCell | null = detailTarget
    ? simulation?.[detailTarget.dungeonId]?.[detailTarget.setId]?.levels?.[detailTarget.level] ?? null
    : null

  // Total drops per dungeon stage uses completed runs so partial batches still read correctly.
  // This keeps streaming updates aligned with the current batch count.
  const detailTotalDrops = detailTarget
    ? progress?.completedByDungeon?.[detailTarget.dungeonId] ?? 0
    : 0

  // Choose a consistent percent precision per dungeon table.
  const tablePercentDecimalsByDungeon = useMemo(() => {
    // Build the full map so popovers can query by dungeon id.
    const next = {} as Record<DungeonId, number>
    for (const dungeonId of DUNGEON_IDS) {
      // Use the active spotlight to resolve the current table sets.
      const setIds = resolveDungeonSets(dungeonId, prefs.eventSpotlight)
      // Pull the latest streamed results for the dungeon.
      const dungeonResults = simulation?.[dungeonId]
      // Completed runs define the percent denominator.
      const totalDrops = progress?.completedByDungeon?.[dungeonId] ?? 0
      next[dungeonId] = resolveDungeonTablePercentDecimals({
        dungeonResults,
        setIds,
        totalDrops,
      })
    }
    return next
  }, [simulation, progress, prefs.eventSpotlight])

  // Precompute labels for the popover header.
  // Keep this outside render loops so the popover stays cheap.
  const detailSetLabel = detailTarget
    ? formatSetLabel({ setId: detailTarget.setId, translate: t, lang })
    : ''

  const detailDungeonLabel = detailTarget
    ? t(DUNGEON_LABEL_KEYS[detailTarget.dungeonId])
    : ''

  const detailLevelLabel = detailTarget
    ? formatLevelLabel(detailTarget.level)
    : ''
  // Default to the highest milestone when no detail target is active.
  const detailLevelForSubstats: LevelMilestone = detailTarget
    ? detailTarget.level
    : DUNGEON_SIM_DEFAULT_LEVEL
  // Build a stable cache key for generic substat odds per slot/main row.
  const buildGenericStatsKey = (query: DungeonSimGenericQuery): string => (
    `${query.dungeonId}:${query.setId}:${query.level}:${query.slot}:${query.main}:${query.spotlight}`
  )
  const requestGenericStatsForKey = (key: string, query: DungeonSimGenericQuery, sampledTotalDrops: number) => {
    // Avoid duplicate requests while a hover fetch is already in flight.
    if (genericLoadingRef.current[key]) return
    const cached = genericStatsRef.current[key]
    // A cached null means the worker was unavailable — don't retry; show the unavailable state.
    if (cached && cached.stats === null) return
    // Cache hit: real stats for the same sample denominator — no need to re-fetch.
    if (cached && cached.stats !== null && cached.sampledTotalDrops === sampledTotalDrops) return
    setGenericLoadingByKey((prev) => ({ ...prev, [key]: true }))
    requestGenericStats(query).then((stats) => {
      setGenericLoadingByKey((prev) => ({ ...prev, [key]: false }))
      if (stats === null) {
        // Cache the null result so subsequent hovers skip the retry and show "unavailable".
        // The cache is cleared on the next simulation run, at which point retries are safe again.
        setGenericStatsByKey((prev) => ({ ...prev, [key]: { stats: null, sampledTotalDrops } }))
        return
      }
      // Store both the stats and denominator so rates stay internally consistent.
      setGenericStatsByKey((prev) => ({ ...prev, [key]: { stats, sampledTotalDrops } }))
    })
  }

  // Keep a stable ref to requestGenericStatsForKey so the prefetch effect below
  // always calls the current closure without listing it in the deps array.
  const requestGenericStatsForKeyRef = useRef(requestGenericStatsForKey)
  useLayoutEffect(() => {
    requestGenericStatsForKeyRef.current = requestGenericStatsForKey
  })
  // Track previous running in a ref so the prefetch effect can detect
  // the true→false transition without triggering extra renders.
  const prevRunningForPrefetchRef = useRef(running)
  // On simulation completion, eagerly fetch generic substat odds for all breakdown
  // combos that appear in the results.  By the time the idle timer fires (30 s),
  // every tooltip will already have its data in genericStatsByKey and can render
  // without querying the WASM worker again.
  // `running` is external async worker state (not a UI event), so no-event-handler
  // does not apply here.  simulation/progress/prefs.eventSpotlight are intentionally
  // read at the moment of the running transition rather than as tracked deps.
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler, react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps */
  useEffect(() => {
    const wasRunning = prevRunningForPrefetchRef.current
    prevRunningForPrefetchRef.current = running
    // Only act on the true → false edge (sim just finished).
    if (running || !wasRunning) return
    if (!simulation || !progress) return
    const fn = requestGenericStatsForKeyRef.current
    const spotlight = prefs.eventSpotlight
    for (const dungeonId of DUNGEON_IDS) {
      const totalDrops = progress.completedByDungeon?.[dungeonId] ?? 0
      if (totalDrops <= 0) continue
      // Enumerate sets that were simulated for this dungeon.
      const setIds = resolveDungeonSets(dungeonId, spotlight)
      for (const setId of setIds) {
        const setResults = simulation[dungeonId]?.[setId]
        if (!setResults) continue
        for (const level of DUNGEON_SIM_LEVELS) {
          const cell = setResults.levels[level]
          if (!cell) continue
          for (const entry of cell.breakdown) {
            // Only prefetch combos where at least one item was kept.
            if (entry.kept <= 0) continue
            const query: DungeonSimGenericQuery = {
              dungeonId,
              spotlight,
              setId,
              level,
              slot: entry.slot,
              main: entry.main,
            }
            fn(buildGenericStatsKey(query), query, totalDrops)
          }
        }
      }
    }
  }, [running])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler, react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps */

  // Slot list depends on the dungeon source (artifact vs accessory vs mixed).
  const detailSlotIds = useMemo(() => (
    detailTarget ? resolveDungeonSlotIds(detailTarget.dungeonId) : artifactTypeIconList.map((entry) => entry.id)
  ), [detailTarget])

  // Filter breakdown entries once so empty cells resolve quickly.
  const detailBreakdown = useMemo(() => (
    resolvedDetailCell
      ? resolvedDetailCell.breakdown.filter((entry) => entry.kept > 0)
      : []
  ), [resolvedDetailCell])
  // Precision should not exceed the percent resolution implied by completed runs.
  const detailResolutionMaxDecimals = resolvePercentDecimalsForResolution(detailTotalDrops)
  // Base precision comes from the parent dungeon table for consistency.
  const detailTablePercentDecimals = detailTarget
    ? Math.min(tablePercentDecimalsByDungeon[detailTarget.dungeonId] ?? PERCENT_DECIMALS_MIN, detailResolutionMaxDecimals)
    : Math.min(PERCENT_DECIMALS_MIN, detailResolutionMaxDecimals)
  // Detail popover may need extra precision for tiny slot+main percentages.
  const detailBreakdownPercentDecimals = useMemo(() => {
    // Fall back to the table precision when there is no data yet.
    if (detailBreakdown.length === 0 || detailTotalDrops <= 0) {
      return detailTablePercentDecimals
    }
    // Convert breakdown counts to percent-of-all-drops values.
    const values = detailBreakdown.map((entry) => (entry.kept / detailTotalDrops) * 100)
    // Keep at least the table precision so numbers never regress.
    return Math.max(detailTablePercentDecimals, resolvePercentDecimalsForValues(values, detailResolutionMaxDecimals))
  }, [detailBreakdown, detailTotalDrops, detailTablePercentDecimals, detailResolutionMaxDecimals])
  // Group breakdown entries by slot for the 3x3 layout.
  const detailBreakdownBySlot = useMemo(() => {
    const map = new Map<ArtifactTypeId, DungeonSimBreakdown[]>()
    for (const entry of detailBreakdown) {
      const slotId = Number(entry.slot) as ArtifactTypeId
      const list = map.get(slotId) ?? []
      list.push(entry)
      map.set(slotId, list)
    }
    for (const [slotId, entries] of map.entries()) {
      map.set(slotId, sortBreakdownByMain(entries))
    }
    return map
  }, [detailBreakdown])
  const renderGenericTooltipContent = (
    stats: DungeonSimGenericStats | null,
    loading: boolean,
    totalDrops: number,
    failed: boolean,
  ) => {
    // Worker was unavailable (idle-terminated or not yet created) — cached null result.
    if (failed) {
      return (
        <Typography variant="body2" color="text.secondary">
          {t('dungeonDropsSubstatGenericUnavailable')}
        </Typography>
      )
    }
    // Surface loading/empty states so hover always yields a response.
    if (loading || !stats) {
      return (
        <Typography variant="body2" color="text.secondary">
          {t('dungeonDropsSubstatGenericLoading')}
        </Typography>
      )
    }
    if (stats.total <= 0 || totalDrops <= 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          {t('dungeonDropsSubstatGenericEmpty')}
        </Typography>
      )
    }
    // Convert conditional odds into per-run odds by scaling by reach rate.
    const reachRate = stats.total / totalDrops
    // Normalize the specific odds array so missing entries default to zero.
    const specificAtLeast = stats.specificAtLeast.map((value) => value ?? 0)
    // Percent lists feed the dynamic precision resolver for each column.
    const perRunPercents = specificAtLeast.map((value) => (value * reachRate) * 100)
    // Cap precision by the simulation resolution of each denominator.
    const perRunMaxDecimals = resolvePercentDecimalsForResolution(totalDrops)
    // Resolve column-specific precision so digits always carry signal.
    const perRunDecimals = resolvePercentDecimalsForValues(perRunPercents, perRunMaxDecimals)
    return (
      <Stack spacing={1} sx={{ minWidth: 230, maxWidth: 360 }}>
        <Typography variant="subtitle2">{t('dungeonDropsSubstatGenericTitle')}</Typography>
        {/* Intro line explains the scope of the tooltip numbers. */}
        <Typography variant="caption" color="text.secondary">
          {t('dungeonDropsSubstatGenericIntro')}
        </Typography>
        {/* Separator keeps the chance section visually distinct. */}
        <Divider />
        <Stack spacing={0.35}>
          {/* Chance section shows per-run vs within-slot+main odds. */}
          <Typography variant="caption" color="text.secondary">
            {t('dungeonDropsSubstatGenericChanceTitle')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              // Slightly wider numeric columns prevent large percentages from wrapping.
              gridTemplateColumns: 'minmax(0, 1fr) repeat(2, minmax(0, 94px))',
              columnGap: 0.75,
              rowGap: 0.4,
            }}
          >
            <Box />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textAlign: 'right', maxWidth: 86, whiteSpace: 'normal', lineHeight: 1.1 }}
            >
              {t('dungeonDropsSubstatGenericChancePerRun')}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textAlign: 'right', maxWidth: 86, whiteSpace: 'normal', lineHeight: 1.1 }}
            >
              {t('dungeonDropsSubstatGenericChanceWithin')}
            </Typography>
            {SPECIFIC_SUBSTAT_COUNTS.map((count, idx) => (
              <Box key={`generic-chance-${count}`} sx={{ display: 'contents' }}>
                <Typography variant="body2">
                  {t('dungeonDropsSubstatGenericSpecificLabel', { count })}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
                  {formatPercent(perRunPercents[idx] ?? 0, perRunDecimals)}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
                  {formatPercent((specificAtLeast[idx] ?? 0) * 100)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Stack>
        {/* Separator keeps the runs section visually distinct. */}
        <Divider />
        <Stack spacing={0.35}>
          {/* Runs section maps target probabilities across 2/3/4 specific substat sets. */}
          <Typography variant="caption" color="text.secondary">
            {t('dungeonDropsSubstatGenericRunsTitle')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              // Give runs columns a bit more room so large counts avoid wrapping.
              gridTemplateColumns: 'minmax(0, 1fr) repeat(4, minmax(0, 72px))',
              columnGap: 0.75,
              rowGap: 0.4,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {t('dungeonDropsSubstatGenericRunsHeader')}
            </Typography>
            {SPECIFIC_SUBSTAT_COUNTS.map((count) => (
              <Typography
                key={`generic-runs-header-${count}`}
                variant="caption"
                color="text.secondary"
                sx={{ textAlign: 'right' }}
              >
                {count}
              </Typography>
            ))}
            {RUN_PROB_TARGETS.map((target) => (
              <Box key={`generic-runs-row-${target.label}`} sx={{ display: 'contents' }}>
                <Typography variant="body2">{target.label}</Typography>
                {SPECIFIC_SUBSTAT_COUNTS.map((count, idx) => {
                  const p = (stats.specificAtLeast[idx] ?? 0) * reachRate
                  // Convert single-run odds into runs for the chosen target probability.
                  const runsNeeded = computeRunsNeededFromProbability(p, target.value)
                  return (
                    <Typography
                      key={`generic-runs-${target.label}-${count}`}
                      variant="body2"
                      sx={{ fontWeight: 600, textAlign: 'right' }}
                    >
                      {runsNeeded ? String(runsNeeded) : '—'}
                    </Typography>
                  )
                })}
              </Box>
            ))}
          </Box>
        </Stack>
      </Stack>
    )
  }
  // Header run counter reflects the current completed/total runs.
  const runProgressLabel = formatRunProgress(progress)

  // Precompute dungeon labels for consistent header sizing.
  const dungeonLabels = useMemo(() => (
    DUNGEON_IDS.map((id) => t(DUNGEON_LABEL_KEYS[id]))
  ), [t])
  const labelMeasureRef = useRef<Map<DungeonId, HTMLSpanElement | null>>(new Map())
  const [labelWidthPx, setLabelWidthPx] = useState(0)
  // Ref-based setter so the layout measurement avoids the set-state-in-effect lint rule.
  const setLabelWidthPxRef = useRef(setLabelWidthPx)
  // Measure the widest dungeon label so all rows align.
  useLayoutEffect(() => {
    let maxWidth = 0
    for (const dungeonId of DUNGEON_IDS) {
      const node = labelMeasureRef.current.get(dungeonId)
      if (!node) continue
      maxWidth = Math.max(maxWidth, measureCssWidth(node))
    }
    if (maxWidth > 0 && Math.abs(maxWidth - labelWidthPx) > 1) {
      setLabelWidthPxRef.current(Math.ceil(maxWidth))
    }
  }, [dungeonLabels, labelWidthPx])

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        // Match the shared Logic Hub padding so tabs align visually.
        px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
        py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
      }}
    >
      <Stack spacing={2}>
        {/* Hidden label measurer keeps dungeon labels aligned without layout jitter. */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: -9999,
            top: 0,
            visibility: 'hidden',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            height: 0,
            overflow: 'hidden',
          }}
        >
          {DUNGEON_IDS.map((dungeonId) => (
            <Typography
              key={`dungeon-label-measure-${dungeonId}`}
              variant="subtitle1"
              component="span"
              ref={(node: HTMLSpanElement | null) => {
                labelMeasureRef.current.set(dungeonId, node)
              }}
            >
              {t(DUNGEON_LABEL_KEYS[dungeonId])}
            </Typography>
          ))}
        </Box>
        {/* Intro copy + assumptions (runs) live above the tables. */}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {t('dungeonDropsIntro')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('dungeonDropsRunNote', { runs: runProgressLabel })}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {/* Mode toggle keeps snapshot vs level-up behavior explicit. */}
              <Typography variant="caption" color="text.secondary">
                {t('dungeonDropsModeLabel')}
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={prefs.simMode}
                onChange={(_event, next) => updateSimMode(next)}
                aria-label={t('dungeonDropsModeLabel')}
              >
                <ToggleButton value="levelUp">{t('dungeonDropsModeLevelUp')}</ToggleButton>
                <ToggleButton value="snapshot">{t('dungeonDropsModeSnapshot')}</ToggleButton>
              </ToggleButtonGroup>
              {/* Refresh keeps the current inputs but reruns every dungeon. */}
              <IconButton
                size="small"
                onClick={triggerSimulationRefresh}
                aria-label={t('dungeonDropsResimulateLabel')}
              >
                <AutorenewIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
          <MarkdownTooltip
            render={(
              <Stack spacing={1} sx={{ maxWidth: 460 }}>
                {/* Explain the simulation flow in plain terms. */}
                <Box>
                  <Typography variant="subtitle2">{t('dungeonDropsInfoHowTitle')}</Typography>
                  <Box component="ul" sx={{ pl: 2, my: 0.5, '& li': { display: 'list-item' } }}>
                    <Typography component="li" variant="caption">
                      {t('dungeonDropsInfoHowLine1')}
                    </Typography>
                    <Typography component="li" variant="caption">
                      {t('dungeonDropsInfoHowLine2')}
                    </Typography>
                    <Typography component="li" variant="caption">
                      {t('dungeonDropsInfoHowLine3')}
                    </Typography>
                    {/* Percentage math + roll floor notes live inside the how-it-works tooltip. */}
                    <Typography component="li" variant="caption">
                      {t('dungeonDropsExplanation')}
                    </Typography>
                    <Typography component="li" variant="caption">
                      {t('dungeonDropsRollNote')}
                    </Typography>
                  </Box>
                </Box>
                <Divider />
                {/* Inline example uses a compact table to show roll effects. */}
                <Box>
                  <Typography variant="subtitle2">{t('dungeonDropsInfoWhyTitle')}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', mb: 0.75 }}>
                    {t('dungeonDropsInfoWhyLine')}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                    {t('dungeonDropsInfoExampleTitle')}
                  </Typography>
                  <Table
                    size="small"
                    sx={{
                      width: 'auto',
                      mb: 0.5,
                      '& th, & td': {
                        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                        fontSize: '0.72rem',
                        px: 0.5,
                        py: 0.25,
                        whiteSpace: 'nowrap',
                      },
                      '& th': { fontWeight: 600 },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell component="th">{t('dungeonDropsInfoExampleHeaderLevel')}</TableCell>
                        <TableCell component="th">{t('dungeonDropsInfoExampleHeaderRolls')}</TableCell>
                        <TableCell component="th">{t('dungeonDropsInfoExampleHeaderValue')}</TableCell>
                        <TableCell component="th">{t('dungeonDropsInfoExampleHeaderKept')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>+12</TableCell>
                        <TableCell>0</TableCell>
                        <TableCell>5</TableCell>
                        <TableCell>{t('no')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>+12</TableCell>
                        <TableCell>1</TableCell>
                        <TableCell>10</TableCell>
                        <TableCell>{t('yes')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>+16</TableCell>
                        <TableCell>1</TableCell>
                        <TableCell>10</TableCell>
                        <TableCell>{t('yes')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>+16</TableCell>
                        <TableCell>2</TableCell>
                        <TableCell>15</TableCell>
                        <TableCell>{t('yes')}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <Typography variant="caption">{t('dungeonDropsInfoExampleNote')}</Typography>
                </Box>
                <Divider />
                {/* Source section keeps attribution distinct from behavior notes. */}
                <Box>
                  <Typography variant="subtitle2">{t('dungeonDropsInfoSourcesTitle')}</Typography>
                  <Box component="ul" sx={{ pl: 2, my: 0.5, '& li': { display: 'list-item' } }}>
                    <Typography component="li" variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {t('dungeonDropsInfoSourceAyumilove')}
                    </Typography>
                    <Typography component="li" variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {t('dungeonDropsInfoSourceTyrauku')}
                    </Typography>
                  </Box>
                  <Typography variant="caption">{t('dungeonDropsInfoThanks')}</Typography>
                </Box>
              </Stack>
            )}
          >
            <IconButton size="small" aria-label={t('dungeonDropsInfoLabel')}>
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </MarkdownTooltip>
        </Stack>
        {DUNGEON_IDS.map((dungeonId) => {
          // Dungeon-level block renders one table per source dungeon.
          // Keep per-dungeon state local so toggles do not leak across tables.
          const dungeonLabel = t(DUNGEON_LABEL_KEYS[dungeonId])
          const setIds = resolveDungeonSets(dungeonId, prefs.eventSpotlight)
          const dungeonResults = simulation?.[dungeonId]
          const fallbackSelection = resolveDungeonStageDefault(dungeonId)
          const selection = sanitizeStageSelection(dungeonId, prefs.stages[dungeonId], fallbackSelection)
          const stageRange = resolveDungeonStageRange(dungeonId, selection.mode)
          const stageOptions = buildStageOptions(stageRange)
          const totalDrops = progress?.completedByDungeon?.[dungeonId] ?? 0
          const tablePercentDecimals = tablePercentDecimalsByDungeon[dungeonId] ?? PERCENT_DECIMALS_MIN
          const isCollapsed = prefs.collapsed?.[dungeonId] ?? true
          // Keep a per-dungeon milestone for the collapsed single-row view.
          const collapsedLevel = prefs.collapsedLevels?.[dungeonId] ?? DUNGEON_SIM_DEFAULT_LEVEL
          const isEventDungeon = dungeonId === 'event'
          const isBoostable = isBoostableDungeon(dungeonId)
          const boostSelection = isBoostable
            ? prefs.boosts?.[dungeonId] ?? resolveDungeonBoostDefault(dungeonId)
            : null
          const boostMode = boostSelection?.mode ?? 'off'
          const boostSetId = boostSelection?.setId ?? null
          const boostOptions = isBoostable ? resolveBoostableSets(dungeonId) : []
          const boostSelectionEntries: ArtifactSetSelectionEntry[] = (
            boostMode === 'off' || boostSetId == null
              ? []
              : [{ id: boostSetId }]
          )
          // Single-set tables should size to content so Spider doesn't waste horizontal space.
          // Multi-set tables keep full width to avoid uneven column sizing.
          const isSingleSetTable = setIds.length <= 1
          return (
            <Box key={dungeonId} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {/* Dungeon headings + controls keep selection changes local to each table. */}
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <Box sx={{ width: labelWidthPx > 0 ? `${labelWidthPx}px` : 'auto' }}>
                  <Typography variant="subtitle1">{dungeonLabel}</Typography>
                </Box>
                {/* Mode/spotlight toggles live in the same slot to keep Stage aligned. */}
                {isEventDungeon ? (
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={prefs.eventSpotlight}
                      onChange={(_, nextValue) => updateEventSpotlight(nextValue)}
                    >
                      {EVENT_SPOTLIGHT_OPTIONS.map((option) => {
                        const setId = resolveEventSpotlightSet(option)
                        const label = formatSetLabel({ setId, translate: t, lang })
                        return (
                          <ToggleButton key={`event-spotlight-${option}`} value={option}>
                            {label}
                          </ToggleButton>
                        )
                      })}
                    </ToggleButtonGroup>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={selection.mode}
                      onChange={(_, nextMode) => {
                        if (!nextMode) return
                        updateDungeonSelection(dungeonId, { mode: nextMode as 'normal' | 'hard' })
                      }}
                    >
                      <ToggleButton value="normal">{t('dungeonDropsModeNormal')}</ToggleButton>
                      <ToggleButton value="hard">{t('dungeonDropsModeHard')}</ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>
                )}
                {/* Stage selector always renders so level picks stay visible. */}
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Select
                    size="small"
                    value={selection.stage}
                    onChange={(event) => updateDungeonSelection(dungeonId, { stage: Number(event.target.value) })}
                    sx={{ minWidth: 80 }}
                  >
                    {stageOptions.map((stage) => (
                      <MenuItem key={`${dungeonId}-stage-${stage}`} value={stage}>{stage}</MenuItem>
                    ))}
                  </Select>
                </Stack>
                {isBoostable ? (
                  // Boosted-set controls are limited to the core artifact dungeons.
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('dungeonDropsBoostLabel')}
                    </Typography>
                    <GearSetsSelect
                      value={boostSelectionEntries}
                      onChange={(nextSelections) => {
                        // Keep the most recent explicit include as the single boosted set.
                        const nextSet = resolveSingleBoostSet(nextSelections)
                        if (nextSet == null) {
                          updateDungeonBoost(dungeonId, { mode: 'off', setId: null })
                          return
                        }
                        // Selecting a set from "none" while boost is off should enable 3x immediately.
                        if (boostMode === 'off') {
                          updateDungeonBoost(dungeonId, { mode: '3x', setId: nextSet })
                          return
                        }
                        // Otherwise keep the current boost mode and just switch the set.
                        updateDungeonBoost(dungeonId, { setId: nextSet })
                      }}
                      allowedSetIds={boostOptions}
                      showMetasets={false}
                      metasets={[]}
                      anyLabel={t('dungeonDropsBoostNone')}
                      singleSelect
                      size="small"
                      minWidthPx={220}
                      menuWidthPx={360}
                    />
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={boostMode}
                      onChange={(_, nextMode) => {
                        if (!nextMode) return
                        updateDungeonBoost(dungeonId, { mode: nextMode as DungeonBoostSelection['mode'] })
                      }}
                    >
                      {DUNGEON_BOOST_MODES.map((mode) => (
                        <ToggleButton key={`${dungeonId}-boost-mode-${mode}`} value={mode}>
                          {mode === 'off'
                            ? t('dungeonDropsBoostOff')
                            : mode === '2x'
                              ? t('dungeonDropsBoost2x')
                              : t('dungeonDropsBoost3x')}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Stack>
                ) : null}
                {/* Spacer pushes the rest of the row left-aligned. */}
                <Box sx={{ marginLeft: 'auto' }} />
              </Stack>
              {/* Fixed layout keeps each dungeon table within its container width. */}
              {/* Single-set tables opt into inline width so they don't sprawl. */}
              <Table
                size="small"
                sx={{
                  // Prevent flex stretch so single-set tables (Spider) stay compact.
                  alignSelf: isSingleSetTable ? 'flex-start' : 'stretch',
                  width: isSingleSetTable ? 'auto' : '100%',
                  tableLayout: isSingleSetTable ? 'auto' : 'fixed',
                  display: isSingleSetTable ? 'inline-table' : 'table',
                }}
              >
                {/* Column headers show set identity once per table. */}
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 36, px: 0.5 }}>
                      {/* Tooltip exposes the right-click toggle-all hint alongside the primary label. */}
                      <MarkdownTooltip markdown={`${isCollapsed ? t('dungeonDropsExpandLabel') : t('dungeonDropsCollapseLabel')}\n\n${t('dungeonDropsCollapseAllHint')}`}>
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            // Ctrl+click toggles every table to the same collapse state.
                            const scope = event.ctrlKey || event.metaKey ? 'all' : 'single'
                            toggleDungeonCollapsed({ dungeonId, scope })
                          }}
                          onContextMenu={(event) => {
                            // Right-click always toggles every table.
                            event.preventDefault()
                            toggleDungeonCollapsed({ dungeonId, scope: 'all' })
                          }}
                          aria-label={isCollapsed ? t('dungeonDropsExpandLabel') : t('dungeonDropsCollapseLabel')}
                        >
                          {isCollapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                        </IconButton>
                      </MarkdownTooltip>
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 600, width: 70, cursor: 'pointer' }}
                      onClick={(event) => {
                        // Left-click toggles this dungeon; Ctrl/Cmd toggles all.
                        const scope = event.ctrlKey || event.metaKey ? 'all' : 'single'
                        toggleDungeonCollapsed({ dungeonId, scope })
                      }}
                      onContextMenu={(event) => {
                        // Right-click always toggles every dungeon table.
                        event.preventDefault()
                        toggleDungeonCollapsed({ dungeonId, scope: 'all' })
                      }}
                    >
                      {t('colLevel')}
                    </TableCell>
                    {setIds.map((setId) => {
                      // Column headers stack icon + label to reduce width pressure.
                      const label = formatSetLabel({ setId, translate: t, lang })
                      return (
                        <TableCell
                          key={`${dungeonId}-${setId}`}
                          sx={{
                            fontWeight: 600,
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            px: 1,
                            minWidth: 0,
                          }}
                        >
                          <Stack spacing={0.25} sx={{ minWidth: 0, width: '100%', alignItems: 'center' }}>
                            <SetIcon setId={setId} label={label} size={18} />
                            {/* EllipsisTooltip exposes the full set name only when truncation occurs. */}
                            {/* data-ellipsis-target keeps the native tooltip aligned with the label node. */}
                            <EllipsisTooltip title={label} wrap="block">
                              <Typography
                                data-ellipsis-target
                                variant="caption"
                                noWrap
                                sx={{ textAlign: 'center', lineHeight: 1.1, width: '100%', maxWidth: '100%' }}
                              >
                                {label}
                              </Typography>
                            </EllipsisTooltip>
                          </Stack>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                </TableHead>
                {/* Body rows enumerate milestone levels. */}
                <TableBody>
                  {isCollapsed ? (
                    // Collapsed tables show the selected milestone row only.
                    <TableRow key={`${dungeonId}-collapsed-${collapsedLevel}`}>
                      <TableCell sx={{ width: 36, px: 0.5 }}>
                        {/* Tooltip exposes the right-click backward-cycle hint alongside the primary label. */}
                        <MarkdownTooltip markdown={`${t('dungeonDropsRotateLevelLabel')}\n\n${t('dungeonDropsRotateLevelRightClickHint')}`}>
                          <IconButton
                            size="small"
                            onClick={(event) => {
                              // Ctrl+click cycles forward and syncs every dungeon.
                              const syncAll = event.ctrlKey || event.metaKey
                              rotateCollapsedLevel({ dungeonId, direction: 'forward', syncAll })
                            }}
                            onContextMenu={(event) => {
                              // Right-click cycles backward; Ctrl syncs all dungeons.
                              event.preventDefault()
                              const syncAll = event.ctrlKey || event.metaKey
                              rotateCollapsedLevel({ dungeonId, direction: 'backward', syncAll })
                            }}
                            aria-label={t('dungeonDropsRotateLevelLabel')}
                          >
                            <SwapVertIcon fontSize="small" />
                          </IconButton>
                        </MarkdownTooltip>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', width: 70 }}>
                        {formatLevelLabel(collapsedLevel)}
                      </TableCell>
                      {setIds.map((setId) => {
                        const cell = dungeonResults?.[setId]?.levels?.[collapsedLevel]
                        const content = cell ? formatCellPercent(cell, totalDrops, tablePercentDecimals) : '—'
                        return (
                          <TableCell key={`${dungeonId}-${setId}-lvl-${collapsedLevel}`} sx={{ px: 0.5 }}>
                            <ButtonBase
                              onClick={(event) => {
                                if (!cell) return
                                handleCellClick(event, { kind: 'level', dungeonId, setId, level: collapsedLevel })
                              }}
                              sx={(theme) => ({
                                width: '100%',
                                justifyContent: 'center',
                                py: 0.75,
                                borderRadius: 1,
                                color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
                                '&:hover': { backgroundColor: (theme.vars?.palette.action.hover ?? theme.palette.action.hover) },
                              })}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{content}</Typography>
                            </ButtonBase>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ) : (
                    // Expanded tables enumerate each level milestone row.
                    DUNGEON_SIM_LEVELS.map((level) => (
                      <TableRow key={`${dungeonId}-lvl-${level}`}>
                        <TableCell sx={{ width: 36, px: 0.5 }} />
                        <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', width: 70 }}>
                          {formatLevelLabel(level)}
                        </TableCell>
                        {setIds.map((setId) => {
                          // Cells map to a specific dungeon/set/level triple.
                          const cell = dungeonResults?.[setId]?.levels?.[level]
                          const content = cell ? formatCellPercent(cell, totalDrops, tablePercentDecimals) : '—'
                          return (
                            <TableCell key={`${dungeonId}-${setId}-lvl-${level}`} sx={{ px: 0.5 }}>
                              {/* ButtonBase keeps the full cell clickable for popover details. */}
                              <ButtonBase
                                onClick={(event) => {
                                  if (!cell) return
                                  handleCellClick(event, { kind: 'level', dungeonId, setId, level })
                                }}
                                sx={(theme) => ({
                                  width: '100%',
                                  justifyContent: 'center',
                                  py: 0.75,
                                  borderRadius: 1,
                                  color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
                                  '&:hover': { backgroundColor: (theme.vars?.palette.action.hover ?? theme.palette.action.hover) },
                                })}
                              >
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{content}</Typography>
                              </ButtonBase>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>
          )
        })}
      </Stack>
      <Popover
        open={detailOpen}
        anchorEl={detailAnchor}
        onClose={handleDetailClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          // ContextMenuPaper gives the popout the shared close button + guard wiring.
          paper: { ...buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: detailPopoverGuard,
            onRequestClose: handleDetailClose,
            closeLabel: t('close'),
            // Keep the detail popover wide enough for label/value pairs to coexist.
            sx: { p: 2, maxWidth: DETAIL_POPOVER_MAX_WIDTH_PX, minWidth: DETAIL_POPOVER_MIN_WIDTH_PX },
          }), ref: detailPopoverPaperRef },
        }}
      >
        <Stack spacing={1} data-testid="dungeon-sim-detail-popout">
          {/* ContextMenuTitle keeps the popout header aligned with the shared menu style. */}
          <ContextMenuTitle
            title={detailDungeonLabel}
            description={detailTarget ? t('dungeonDropsPopoverHeader', { set: detailSetLabel, level: detailLevelLabel }) : null}
          />
          {/* Summary line shows kept share + counts. */}
          <Typography variant="body2">
            {resolvedDetailCell
              ? t('dungeonDropsPopoverSummary', {
                percent: formatCellPercent(resolvedDetailCell, detailTotalDrops, detailTablePercentDecimals),
                kept: String(resolvedDetailCell.kept),
                total: String(detailTotalDrops),
              })
              : ''}
          </Typography>
          <Divider />
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t('dungeonDropsPopoverBreakdownTitle')}
            </Typography>
            {detailBreakdown.length === 0 ? (
              // Empty state clarifies when nothing matched the rules.
              <Typography variant="body2" color="text.secondary">
                {t('dungeonDropsPopoverEmpty')}
              </Typography>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  // Fixed 3-column layout mirrors the slot grid while relying on the wider popover.
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 1,
                }}
              >
                {artifactTypeIconList.filter(({ id }) => detailSlotIds.includes(id)).map(({ id, Icon }) => {
                  const slotEntries = detailBreakdownBySlot.get(id) ?? []
                  return (
                    <Box
                      key={`dungeon-detail-slot-${id}`}
                      sx={(theme) => ({
                        borderRadius: 1,
                        border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
                        px: 0.75,
                        py: 0.6,
                        minWidth: 0,
                      })}
                    >
                      <Stack spacing={0.4}>
                        {/* Slot header shows the icon + label to mirror builder layout. */}
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <Icon fontSize="small" />
                          <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
                            {t(artifactTypeI18nKey(id))}
                          </Typography>
                        </Stack>
                        {slotEntries.length === 0 ? (
                          // Placeholder keeps empty slots compact and scannable.
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        ) : (
                          <Stack spacing={0.25}>
                            {slotEntries.map((entry) => {
                              const label = t(statVariantI18nKey(entry.main))
                              const value = detailTotalDrops > 0 ? (entry.kept / detailTotalDrops) * 100 : 0
                              const statColor = useStatButtonColors
                                ? (substatColors[Number(entry.main)]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[Number(entry.main)])
                                : undefined
                              const genericQuery: DungeonSimGenericQuery | null = detailTarget
                                ? {
                                  dungeonId: detailTarget.dungeonId,
                                  spotlight: prefs.eventSpotlight,
                                  setId: detailTarget.setId,
                                  level: detailLevelForSubstats,
                                  slot: entry.slot,
                                  main: entry.main,
                                }
                                : null
                              const genericKey = genericQuery ? buildGenericStatsKey(genericQuery) : ''
                              const genericStatsEntry = genericKey ? (genericStatsByKey[genericKey] ?? null) : null
                              const genericStats = genericStatsEntry?.stats ?? null
                              // Keep denominator aligned with the stats sample to avoid drift.
                              const genericTotalDrops = genericStatsEntry?.sampledTotalDrops ?? detailTotalDrops
                              const genericLoading = genericKey ? Boolean(genericLoadingByKey[genericKey]) : false
                              // A cached entry with null stats means the worker was unavailable.
                              const genericFailed = genericKey ? (genericStatsEntry !== null && genericStats === null) : false
                              return (
                                <MarkdownTooltip
                                  key={`${entry.slot}-${entry.main}`}
                                  render={renderGenericTooltipContent(genericStats, genericLoading, genericTotalDrops, genericFailed)}
                                  hoverIntent="informational"
                                  placement="right"
                                  maxWidth={360}
                                  onOpen={() => {
                                    if (!genericQuery) return
                                    requestGenericStatsForKey(genericKey, genericQuery, detailTotalDrops)
                                  }}
                                >
                                  <ButtonBase
                                    data-testid="dungeon-sim-generic-row"
                                    sx={(theme) => ({
                                      display: 'grid',
                                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                                      columnGap: 1,
                                      alignItems: 'center',
                                      width: '100%',
                                      textAlign: 'left',
                                      borderRadius: 0.75,
                                      px: 0.5,
                                      py: 0.25,
                                      cursor: 'help',
                                      '&:hover': { backgroundColor: (theme.vars?.palette.action.hover ?? theme.palette.action.hover) },
                                    })}
                                  >
                                    {/* EllipsisTooltip prevents long stat labels from overlapping the value. */}
                                    <Box sx={{ minWidth: 0, pr: 0.5 }}>
                                      <EllipsisTooltip title={label} wrap="block">
                                        <Typography
                                          data-ellipsis-target
                                          variant="caption"
                                          noWrap
                                          sx={{
                                            color: statColor,
                                            minWidth: 0,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                          }}
                                        >
                                          {label}
                                        </Typography>
                                      </EllipsisTooltip>
                                    </Box>
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right', pl: 0.25 }}
                                    >
                                      {formatPercent(value, detailBreakdownPercentDecimals)}
                                    </Typography>
                                  </ButtonBase>
                                </MarkdownTooltip>
                              )
                            })}
                          </Stack>
                        )}
                      </Stack>
                    </Box>
                  )
                })}
              </Box>
            )}
          </Stack>
        </Stack>
      </Popover>
    </Box>
  )
}
