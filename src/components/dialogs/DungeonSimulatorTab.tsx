import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Box, ButtonBase, Divider, IconButton, MenuItem, Popover, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useI18n } from '../../lib/i18n'
import { ACCESSORY_NO_SET_ID, STANDARD_DIALOG_PADDING_BLOCK_UNITS, STANDARD_DIALOG_PADDING_INLINE_UNITS } from '../../lib/constants'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY, artifactTypeI18nKey, getLocalizedGearSetName, statVariantI18nKey, type ArtifactSetId, type ArtifactTypeId, type LevelMilestone } from '../../lib/types'
import type { HsfRuleWithCfg } from '../../lib/merge'
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
  type DungeonSimGenericQuery,
  type DungeonSimGenericStats,
  type DungeonSimProgress,
} from '../../lib/dungeonSimulator'
import type { SubstatColorMap } from '../../lib/renderColoredStatText'
import { PROGRESS_THROTTLE_MS } from '../../types/progress'
import { useDungeonSimulatorWorker } from '../../hooks/useDungeonSimulatorWorker'
import { useContextMenuPaperGuard } from '../../hooks/useContextMenuPaperGuard'
import { sanitizeStageSelection, useDungeonSimulatorPreferences } from '../../state/dungeonSimulatorPreferences'
import MarkdownTooltip from '../MarkdownTooltip'
import { measureCssWidth } from '../../lib/domMeasurements'

// Detail popover target for a single cell.
type DetailTarget = (
  | { kind: 'level'; dungeonId: DungeonId; setId: ArtifactSetId; level: LevelMilestone }
  | { kind: 'summary'; dungeonId: DungeonId; setId: ArtifactSetId }
)

// Keep dungeon labels centralized so each table shares the same i18n keys.
const DUNGEON_LABEL_KEYS: Record<DungeonId, string> = {
  iceGolem: 'dungeonIceGolem',
  fireKnight: 'dungeonFireKnight',
  spider: 'dungeonSpider',
  dragon: 'dungeonDragon',
  event: 'dungeonEvent',
}

// Consistent percent formatter keeps the grid and popover aligned.
const formatPercent = (value: number, digits = 2): string => `${value.toFixed(digits)}%`

// Cell percentages reflect kept drops as a share of all dungeon drops.
const formatCellPercent = (cell: DungeonSimCell, totalDrops: number): string => {
  if (totalDrops <= 0) return '—'
  return formatPercent((cell.kept / totalDrops) * 100)
}

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
  rules: HsfRuleWithCfg[]
  substatTargets: SubstatTargetTable
  // Provide the shared stat color map so the popover can match other UI.
  substatColors: SubstatColorMap
  // Flag for the "color stat text" display preference.
  useStatButtonColors: boolean
}

export default function DungeonSimulatorTab(props: DungeonSimulatorTabProps) {
  const { rules, substatTargets, substatColors, useStatButtonColors } = props
  const { t, lang } = useI18n()
  // Persisted mode/stage/spotlight selections keep the simulator stable across sessions.
  const [prefs, setPrefs] = useDungeonSimulatorPreferences()
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
    runs: DUNGEON_SIM_RUNS_PER_DUNGEON,
    batchSize: DUNGEON_SIM_BATCH_SIZE,
    throttleMs: PROGRESS_THROTTLE_MS,
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
  // Cache generic substat odds per slot/main to avoid repeat worker queries.
  const [genericStatsByKey, setGenericStatsByKey] = useState<Record<string, DungeonSimGenericStats | null>>({})
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
  useLayoutEffect(() => {
    if (!running) return
    setGenericStatsByKey({})
    setGenericLoadingByKey({})
  }, [running])

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

  const toggleDungeonCollapsed = (dungeonId: DungeonId) => {
    // Persisted collapse state keeps large tables compact between sessions.
    setPrefs((prev) => ({
      // Persisted collapsed state keeps each dungeon table compact across sessions.
      ...prev,
      collapsed: { ...prev.collapsed, [dungeonId]: !prev.collapsed[dungeonId] },
    }))
  }

  // Resolve the selected cell once, keeping render logic straightforward.
  // Popover rendering should never re-derive selectors inline.
  const resolvedDetailCell: DungeonSimCell | null = detailTarget
    ? detailTarget.kind === 'summary'
      ? simulation?.[detailTarget.dungeonId]?.[detailTarget.setId]?.summary ?? null
      : simulation?.[detailTarget.dungeonId]?.[detailTarget.setId]?.levels?.[detailTarget.level] ?? null
    : null

  // Total drops per dungeon stage uses completed runs so partial batches still read correctly.
  // This keeps streaming updates aligned with the current batch count.
  const detailTotalDrops = detailTarget
    ? progress?.completedByDungeon?.[detailTarget.dungeonId] ?? 0
    : 0

  // Precompute labels for the popover header.
  // Keep this outside render loops so the popover stays cheap.
  const detailSetLabel = detailTarget
    ? formatSetLabel({ setId: detailTarget.setId, translate: t, lang })
    : ''

  const detailDungeonLabel = detailTarget
    ? t(DUNGEON_LABEL_KEYS[detailTarget.dungeonId])
    : ''

  const detailLevelLabel = detailTarget
    ? detailTarget.kind === 'summary'
      ? t('dungeonDropsAnyLevel')
      : `+${detailTarget.level}`
    : ''
  // For substat details, fall back to +16 when the summary row is active.
  const detailLevelForSubstats: LevelMilestone = detailTarget
    ? (detailTarget.kind === 'summary' ? 16 : detailTarget.level)
    : 16
  // Build a stable cache key for generic substat odds per slot/main row.
  const buildGenericStatsKey = (query: DungeonSimGenericQuery): string => (
    `${query.dungeonId}:${query.setId}:${query.level}:${query.slot}:${query.main}:${query.spotlight}`
  )
  const requestGenericStatsForKey = (key: string, query: DungeonSimGenericQuery) => {
    // Avoid duplicate requests while a hover fetch is already in flight.
    if (genericLoadingRef.current[key]) return
    // Keep the first computed stats so repeat hovers stay instant.
    if (genericStatsRef.current[key]) return
    setGenericLoadingByKey((prev) => ({ ...prev, [key]: true }))
    requestGenericStats(query).then((stats) => {
      setGenericStatsByKey((prev) => ({ ...prev, [key]: stats }))
      setGenericLoadingByKey((prev) => ({ ...prev, [key]: false }))
    })
  }

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
  ) => {
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
    return (
      <Stack spacing={1} sx={{ minWidth: 210, maxWidth: 320 }}>
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
              // Fixed columns keep the tooltip compact while allowing header wrap.
              gridTemplateColumns: 'minmax(0, 1fr) repeat(2, minmax(0, 86px))',
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
                  {formatPercent(((stats.specificAtLeast[idx] ?? 0) * reachRate) * 100)}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
                  {formatPercent((stats.specificAtLeast[idx] ?? 0) * 100)}
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
              // Keep numeric columns narrow so the tooltip stays within its max width.
              gridTemplateColumns: 'minmax(0, 1fr) repeat(4, minmax(0, 60px))',
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
  const labelMeasureRefs = useRef<Map<DungeonId, HTMLSpanElement | null>>(new Map())
  const [labelWidthPx, setLabelWidthPx] = useState(0)
  // Measure the widest dungeon label so all rows align.
  useLayoutEffect(() => {
    let maxWidth = 0
    for (const dungeonId of DUNGEON_IDS) {
      const node = labelMeasureRefs.current.get(dungeonId)
      if (!node) continue
      maxWidth = Math.max(maxWidth, measureCssWidth(node))
    }
    if (maxWidth > 0 && Math.abs(maxWidth - labelWidthPx) > 1) {
      setLabelWidthPx(Math.ceil(maxWidth))
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
                labelMeasureRefs.current.set(dungeonId, node)
              }}
            >
              {t(DUNGEON_LABEL_KEYS[dungeonId])}
            </Typography>
          ))}
        </Box>
        {/* Intro copy + assumptions (runs) live above the tables. */}
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {t('dungeonDropsIntro')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('dungeonDropsRunNote', { runs: runProgressLabel })}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
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
          const isCollapsed = prefs.collapsed?.[dungeonId] ?? true
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
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Box sx={{ width: labelWidthPx > 0 ? `${labelWidthPx}px` : 'auto' }}>
                  <Typography variant="subtitle1">{dungeonLabel}</Typography>
                </Box>
                {/* Mode/spotlight toggles live in the same slot to keep Stage aligned. */}
                {(() => {
                  if (isEventDungeon) {
                    return (
                      <Stack direction="row" spacing={0.75} alignItems="center">
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
                    )
                  }
                  return (
                    <Stack direction="row" spacing={0.75} alignItems="center">
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
                  )
                })()}
                {/* Stage selector always renders so level picks stay visible. */}
                <Stack direction="row" spacing={0.75} alignItems="center">
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
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
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
                        updateDungeonBoost(dungeonId, { setId: nextSet })
                      }}
                      allowedSetIds={boostOptions}
                      showMetasets={false}
                      metasets={[]}
                      anyLabel={t('dungeonDropsBoostNone')}
                      singleSelect
                      size="small"
                      disabled={boostMode === 'off'}
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
                      <IconButton
                        size="small"
                        onClick={() => toggleDungeonCollapsed(dungeonId)}
                        aria-label={isCollapsed ? t('dungeonDropsExpandLabel') : t('dungeonDropsCollapseLabel')}
                      >
                        {isCollapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 70 }}>{t('colLevel')}</TableCell>
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
                          <Stack spacing={0.25} alignItems="center" sx={{ minWidth: 0, width: '100%' }}>
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
                    // Collapsed tables show the +16 summary row only.
                    <TableRow key={`${dungeonId}-summary`}>
                      <TableCell sx={{ width: 36, px: 0.5 }} />
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', width: 70 }}>
                        {t('dungeonDropsAnyLevel')}
                      </TableCell>
                      {setIds.map((setId) => {
                        const cell = dungeonResults?.[setId]?.summary
                        const content = cell ? formatCellPercent(cell, totalDrops) : '—'
                        return (
                          <TableCell key={`${dungeonId}-${setId}-summary`} sx={{ px: 0.5 }}>
                            <ButtonBase
                              onClick={(event) => {
                                if (!cell) return
                                handleCellClick(event, { kind: 'summary', dungeonId, setId })
                              }}
                              sx={(theme) => ({
                                width: '100%',
                                justifyContent: 'center',
                                py: 0.75,
                                borderRadius: 1,
                                color: theme.palette.text.primary,
                                '&:hover': { backgroundColor: theme.palette.action.hover },
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
                        <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', width: 70 }}>{`+${level}`}</TableCell>
                        {setIds.map((setId) => {
                          // Cells map to a specific dungeon/set/level triple.
                          const cell = dungeonResults?.[setId]?.levels?.[level]
                          const content = cell ? formatCellPercent(cell, totalDrops) : '—'
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
                                  color: theme.palette.text.primary,
                                  '&:hover': { backgroundColor: theme.palette.action.hover },
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
          paper: buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: detailPopoverGuard,
            onRequestClose: handleDetailClose,
            closeLabel: t('close'),
            ref: detailPopoverPaperRef,
            // Keep the detail popover wide enough for label/value pairs to coexist.
            sx: { p: 2, maxWidth: DETAIL_POPOVER_MAX_WIDTH_PX, minWidth: DETAIL_POPOVER_MIN_WIDTH_PX },
          }),
        }}
      >
        <Stack spacing={1}>
          {/* ContextMenuTitle keeps the popout header aligned with the shared menu style. */}
          <ContextMenuTitle
            title={detailDungeonLabel}
            description={detailTarget ? t('dungeonDropsPopoverHeader', { set: detailSetLabel, level: detailLevelLabel }) : null}
          />
          {/* Summary line shows kept share + counts. */}
          <Typography variant="body2">
            {resolvedDetailCell
              ? t('dungeonDropsPopoverSummary', {
                percent: formatCellPercent(resolvedDetailCell, detailTotalDrops),
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
                        border: `1px solid ${theme.palette.divider}`,
                        px: 0.75,
                        py: 0.6,
                        minWidth: 0,
                      })}
                    >
                      <Stack spacing={0.4}>
                        {/* Slot header shows the icon + label to mirror builder layout. */}
                        <Stack direction="row" spacing={0.5} alignItems="center">
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
                              const genericStats = genericKey ? (genericStatsByKey[genericKey] ?? null) : null
                              const genericLoading = genericKey ? Boolean(genericLoadingByKey[genericKey]) : false
                              return (
                                <MarkdownTooltip
                                  key={`${entry.slot}-${entry.main}`}
                                  render={renderGenericTooltipContent(genericStats, genericLoading, detailTotalDrops)}
                                  hoverIntent="informational"
                                  placement="right"
                                  maxWidth={320}
                                  onOpen={() => {
                                    if (!genericQuery) return
                                    requestGenericStatsForKey(genericKey, genericQuery)
                                  }}
                                >
                                  <ButtonBase
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
                                      '&:hover': { backgroundColor: theme.palette.action.hover },
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
                                      {formatPercent(value)}
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
