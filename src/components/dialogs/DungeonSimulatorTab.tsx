import { useRef, useState, type MouseEvent } from 'react'
import { Box, ButtonBase, Divider, IconButton, MenuItem, Popover, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useI18n } from '../../lib/i18n'
import { ACCESSORY_NO_SET_ID, STANDARD_DIALOG_PADDING_BLOCK_UNITS, STANDARD_DIALOG_PADDING_INLINE_UNITS } from '../../lib/constants'
import { artifactTypeI18nKey, getLocalizedGearSetName, statVariantI18nKey, type ArtifactSetId, type LevelMilestone } from '../../lib/types'
import type { HsfRuleWithCfg } from '../../lib/merge'
import type { SubstatTargetTable } from '../../lib/hsfBuilder/types'
import { SetIcon } from '../SetIcon'
import EllipsisTooltip from '../EllipsisTooltip'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from '../ContextMenuPaper'
import ContextMenuTitle from '../ContextMenuTitle'
import {
  DUNGEON_IDS,
  DUNGEON_SIM_BATCH_SIZE,
  DUNGEON_SIM_LEVELS,
  DUNGEON_SIM_RUNS_PER_DUNGEON,
  EVENT_SPOTLIGHT_OPTIONS,
  resolveDungeonSets,
  resolveDungeonStageDefault,
  resolveDungeonStageRange,
  resolveEventSpotlightSet,
  type DungeonId,
  type DungeonSimBreakdown,
  type DungeonSimCell,
  type DungeonSimProgress,
} from '../../lib/dungeonSimulator'
import { PROGRESS_THROTTLE_MS } from '../../types/progress'
import { useDungeonSimulatorWorker } from '../../hooks/useDungeonSimulatorWorker'
import { useContextMenuPaperGuard } from '../../hooks/useContextMenuPaperGuard'
import { sanitizeStageSelection, useDungeonSimulatorPreferences } from '../../state/dungeonSimulatorPreferences'
import MarkdownTooltip from '../MarkdownTooltip'

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

// Keep detail rows stable by sorting on kept count then slot/main id.
const sortBreakdown = (entries: DungeonSimBreakdown[]): DungeonSimBreakdown[] => (
  entries
    .filter((entry) => entry.kept > 0)
    .sort((a, b) => {
      if (b.kept !== a.kept) return b.kept - a.kept
      if (b.total !== a.total) return b.total - a.total
      if (Number(a.slot) !== Number(b.slot)) return Number(a.slot) - Number(b.slot)
      return Number(a.main) - Number(b.main)
    })
)

export type DungeonSimulatorTabProps = {
  rules: HsfRuleWithCfg[]
  substatTargets: SubstatTargetTable
}

export default function DungeonSimulatorTab(props: DungeonSimulatorTabProps) {
  const { rules, substatTargets } = props
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
  const { results: simulation, progress } = useDungeonSimulatorWorker({
    rules,
    substatTargets,
    selections: prefs.stages,
    spotlight: prefs.eventSpotlight,
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

  // Filter + sort breakdown entries for the selected cell.
  // This ensures the popover lists the most relevant slot/main stats first.
  const detailBreakdown = resolvedDetailCell
    ? sortBreakdown(resolvedDetailCell.breakdown)
    : []
  // Header run counter reflects the current completed/total runs.
  const runProgressLabel = formatRunProgress(progress)

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
        {/* Intro copy + assumptions (runs) live above the tables. */}
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {t('dungeonDropsIntro')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('dungeonDropsRunNote', { runs: runProgressLabel })}
            </Typography>
          </Stack>
          <MarkdownTooltip markdown={t('dungeonDropsInfoTooltip')}>
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
          // Single-set tables should size to content so Spider doesn't waste horizontal space.
          // Multi-set tables keep full width to avoid uneven column sizing.
          const isSingleSetTable = setIds.length <= 1
          return (
            <Box key={dungeonId} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {/* Dungeon headings + controls keep selection changes local to each table. */}
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle1">{dungeonLabel}</Typography>
                {!isEventDungeon ? (
                  // Normal/Hard toggle only applies to non-event dungeons.
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {t('dungeonDropsModeLabel')}
                    </Typography>
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
                ) : null}
                {/* Stage selector always renders so level picks stay visible. */}
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {t('dungeonDropsStageLabel')}
                  </Typography>
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
                {dungeonId === 'event' ? (
                  // Spotlight toggle is specific to the event dungeon.
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {t('dungeonDropsSpotlightLabel')}
                    </Typography>
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
                ) : null}
                {/* Spacer pushes the rest of the row left-aligned. */}
                <Box sx={{ marginLeft: 'auto' }} />
              </Stack>
              {/* Fixed layout keeps each dungeon table within its container width. */}
              {/* Single-set tables opt into inline width so they don't sprawl. */}
              <Table
                size="small"
                sx={{
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
                    // Collapsed tables show the "any level" summary row only.
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
            sx: { p: 2, maxWidth: 360 },
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
              <Stack spacing={0.25}>
                {detailBreakdown.map((entry) => {
                  // Slot + main stat pairs identify what was kept.
                  const label = `${t(artifactTypeI18nKey(entry.slot))} • ${t(statVariantI18nKey(entry.main))}`
                  const value = detailTotalDrops > 0 ? (entry.kept / detailTotalDrops) * 100 : 0
                  return (
                    <Box key={`${entry.slot}-${entry.main}`} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>{label}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPercent(value)}</Typography>
                    </Box>
                  )
                })}
              </Stack>
            )}
          </Stack>
        </Stack>
      </Popover>
    </Box>
  )
}
