import { use, Fragment } from 'react'
import { Box, Skeleton, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { SetIcon } from './SetIcon'
import { useI18n } from '../lib/i18n'
import {
  EVENT_SPOTLIGHT_DEFAULT,
  type DungeonSimDungeonResults,
} from '../lib/dungeonSimulator'
import { getLocalizedGearSetName } from '../lib/types'
import type { ArtifactSetId, LevelMilestone } from '../lib/types'
import type { SubstatTargetTable } from '../lib/hsfBuilder/types'
import type { DungeonSimCell } from '../lib/dungeonSimulator'
import MarkdownTooltip from './MarkdownTooltip'
import { useDungeonNoteSimulator, NOTE_SIM_CONFIGS } from '../hooks/useDungeonNoteSimulator'
import { NoteRenderContext } from './NoteDialog'

// ─── Shared percent formatting ────────────────────────────────────────────────

// One decimal is enough for the compact note-block summary.
const formatPct = (pct: number | null): string => {
  if (pct === null || !Number.isFinite(pct)) return '—'
  return `${pct.toFixed(1)}%`
}

// ─── Cell extraction helpers ──────────────────────────────────────────────────

// Sum kept + total across all sets to get the aggregate keep chance for a dungeon.
const aggregateCell = (dungeonResults: DungeonSimDungeonResults, level: LevelMilestone): DungeonSimCell | null => {
  let kept = 0
  let total = 0
  let found = false
  for (const setResults of Object.values(dungeonResults)) {
    const cell = setResults?.levels?.[level]
    if (!cell) continue
    kept += cell.kept
    total += cell.total
    found = true
  }
  if (!found || total === 0) return null
  return { kept, total, breakdown: [] }
}

// Return the cell for a single focused set at a level (for boost columns).
const focusedCell = (
  dungeonResults: DungeonSimDungeonResults,
  setId: ArtifactSetId,
  level: LevelMilestone,
): DungeonSimCell | null => {
  const cell = dungeonResults[setId]?.levels?.[level]
  if (!cell || cell.total === 0) return null
  return cell
}

// Compute keep-chance percentage.
// runs must be the total number of dungeon runs (not the drop count of a single set).
// For aggregate cells sum(set.total) == runs, so passing cell.total is valid there.
// For individual set cells, always pass aggregateCell.total as the denominator.
const cellPercent = (cell: DungeonSimCell | null, runs: number = cell?.total ?? 0): number | null => {
  if (!cell || runs <= 0) return null
  return (cell.kept / runs) * 100
}

// ─── Column descriptors ───────────────────────────────────────────────────────

// Maps each of the 6 display columns to its config id (Dragon + Fire Knight).
// Labels are computed dynamically at render time using i18n so they reflect the
// active locale — no hardcoded strings in the descriptor.
const NOTE_SIM_COLUMNS: readonly { configId: string }[] = [
  { configId: 'n20-off' },
  { configId: 'n25-off' },
  { configId: 'h10-off' },
  { configId: 'n20-3x'  },
  { configId: 'n25-3x'  },
  { configId: 'h10-3x'  },
] as const

// Ice Golem only shows the 3 no-boost columns (no focused set, no boost variants).
const NOTE_SIM_ICE_GOLEM_COLUMNS: readonly { configId: string }[] = [
  { configId: 'n20-off' },
  { configId: 'n25-off' },
  { configId: 'h10-off' },
] as const

// All 5 milestone levels as rows; level-up mode captures each checkpoint without extra CPU cost.
const NOTE_SIM_LEVELS: readonly LevelMilestone[] = [0, 4, 8, 12, 16] as const

// ─── Component ────────────────────────────────────────────────────────────────

export type DungeonSimulatorNoteBlockProps = Record<string, unknown>

export default function DungeonSimulatorNoteBlock(_props: DungeonSimulatorNoteBlockProps) {
  // Consume context before any conditional returns to satisfy the Rules of Hooks.
  const ctx = use(NoteRenderContext)
  const { t } = useI18n()

  const rules = ctx?.rules ?? []
  const substatTargets = ctx?.substatTargets ?? ({} as SubstatTargetTable)
  const pipelineRunning = ctx?.pipelineRunning ?? false

  // Run the sequential 6-config simulation; paused while the rule cache pipeline is active.
  const { resultsByConfig, configIndex, running } = useDungeonNoteSimulator({
    rules,
    substatTargets,
    // Gate simulation behind the rule cache pipeline so results are always current.
    enabled: !pipelineRunning && ctx !== null,
  })

  // Guard: context is required for meaningful rendering.
  if (!ctx) return null

  // ─── i18n helpers ─────────────────────────────────────────────────────────

  const dungeonLabel = (dungeonId: 'dragon' | 'fireKnight' | 'iceGolem') => {
    if (dungeonId === 'dragon') return t('dungeonDragon')
    if (dungeonId === 'fireKnight') return t('dungeonFireKnight')
    return t('dungeonIceGolem')
  }

  // Return the focused set id for a dungeon in a given config; Ice Golem always null.
  const getFocusId = (cfg: (typeof NOTE_SIM_CONFIGS)[number], dungeonId: 'dragon' | 'fireKnight' | 'iceGolem'): ArtifactSetId | null => {
    if (dungeonId === 'dragon') return cfg.dragonFocusSetId
    if (dungeonId === 'fireKnight') return cfg.fireKnightFocusSetId
    return null
  }

  // Resolve the localized column header for a column + dungeon combination.
  const colLabel = (col: { configId: string }, dungeonId: 'dragon' | 'fireKnight' | 'iceGolem'): string => {
    const cfg = NOTE_SIM_CONFIGS.find((c) => c.id === col.configId)
    if (!cfg) return col.configId
    const sel = cfg.selections[dungeonId]
    const modeLabel = sel?.mode === 'hard' ? t('dungeonDropsModeHard') : t('dungeonDropsModeNormal')
    const stageLabel = `${modeLabel} ${sel?.stage ?? '?'}`
    // Boost columns prefix with "3× SetName" (Ice Golem focus is always null).
    const focusId = getFocusId(cfg, dungeonId)
    if (focusId !== null) {
      const setName = getLocalizedGearSetName(focusId, t)
      return `${t('dungeonDropsBoost3x')} ${setName} · ${stageLabel}`
    }
    return stageLabel
  }

  // ─── Cell value resolution ────────────────────────────────────────────────

  // Resolve the keep-chance percentage for a cell (works for all three dungeons).
  const resolvePercent = (
    dungeonId: 'dragon' | 'fireKnight' | 'iceGolem',
    configId: string,
    level: LevelMilestone,
  ): number | null => {
    const spotlightResults = resultsByConfig.get(configId)
    const dungeonResults = spotlightResults?.[EVENT_SPOTLIGHT_DEFAULT]?.[dungeonId]
    if (!dungeonResults) return null
    const cfg = NOTE_SIM_CONFIGS.find((c) => c.id === configId)
    if (!cfg) return null
    // Aggregate cell always uses sum(set.total) as denominator, which equals total runs.
    const aggCell = aggregateCell(dungeonResults, level)
    if (!aggCell || aggCell.total <= 0) return null
    // Boost columns: focused-set keep chance, denominator = total runs (not set-specific drops).
    const focusId = getFocusId(cfg, dungeonId)
    if (focusId !== null) {
      return cellPercent(focusedCell(dungeonResults, focusId, level), aggCell.total)
    }
    // No-boost / Ice Golem columns: aggregate across all sets.
    return cellPercent(aggCell)
  }

  // Determine whether a column's config has been simulated yet.
  const isConfigPending = (configId: string): boolean => {
    if (!running && resultsByConfig.size === 0) return true
    const cfgIdx = NOTE_SIM_CONFIGS.findIndex((c) => c.id === configId)
    return cfgIdx > configIndex && !resultsByConfig.has(configId)
  }

  // ─── Tooltip content (JSX) ────────────────────────────────────────────────

  // Build a structured JSX tooltip for a cell, consisting of:
  //   • Header: dungeon · mode stage[ — 3× setName]
  //   • Keep chance at gear level +L: X.Y%  (from noteSimKeepChanceAtLevel)
  //   • Per-set breakdown as a two-column grid (name | pct), sorted by keep chance desc
  const buildTooltipContent = (
    dungeonId: 'dragon' | 'fireKnight' | 'iceGolem',
    configId: string,
    level: LevelMilestone,
  ): React.ReactNode => {
    const cfg = NOTE_SIM_CONFIGS.find((c) => c.id === configId)
    if (!cfg) return null

    // Header: DungeonName · ModeLabel Stage[ — 3× SetName]
    const sel = cfg.selections[dungeonId]
    const modeLabel = sel?.mode === 'hard' ? t('dungeonDropsModeHard') : t('dungeonDropsModeNormal')
    const stageDesc = sel ? `${modeLabel} ${sel.stage}` : '?'
    const focusId = getFocusId(cfg, dungeonId)
    const boostDesc = focusId !== null
      ? ` — ${t('dungeonDropsBoost3x')} ${getLocalizedGearSetName(focusId, t)}`
      : ''
    const header = `${dungeonLabel(dungeonId)} · ${stageDesc}${boostDesc}`

    // Look up the simulation results for this config + dungeon.
    const spotlightResults = resultsByConfig.get(configId)
    const dungeonResults = spotlightResults?.[EVENT_SPOTLIGHT_DEFAULT]?.[dungeonId]

    // Headline keep-chance: fraction of ALL runs (with the active boost) that produce a keeper.
    // Always the aggregate across all sets — consistent meaning regardless of boost mode.
    // The per-set grid below shows how each set contributes to that headline.
    const headlineCell = dungeonResults ? aggregateCell(dungeonResults, level) : null
    // Total runs = sum(set.total) for all sets = headlineCell.total.
    const totalRuns = headlineCell?.total ?? 0
    const keepLine = t('noteSimKeepChanceAtLevel', { level, pct: formatPct(cellPercent(headlineCell)) })

    // Per-set breakdown: all sets with any drops at this level, sorted by keep chance desc.
    // Percentages use total runs as denominator so values match the main Dungeon Simulator display.
    type SetRow = { setId: ArtifactSetId; name: string; pct: number | null }
    const setRows: SetRow[] = dungeonResults
      ? (Object.entries(dungeonResults) as [string, NonNullable<typeof dungeonResults[ArtifactSetId]>][])
          .filter(([, setRes]) => (setRes.levels[level]?.total ?? 0) > 0)
          .map(([setIdStr, setRes]) => ({
            setId: Number(setIdStr) as ArtifactSetId,
            name: getLocalizedGearSetName(Number(setIdStr) as ArtifactSetId, t),
            pct: cellPercent(setRes.levels[level] ?? null, totalRuns),
          }))
          .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
      : []

    // Shared monospace style for the per-set breakdown grid.
    const monoSx = { fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.5 }

    return (
      <Box sx={{ py: 0.25 }}>
        {/* Header */}
        <Box sx={{ fontWeight: 600 }}>{header}</Box>
        {/* Headline keep-chance — same value as the cell, shown here for context */}
        <Box sx={{ mb: setRows.length > 0 ? 0.75 : 0, color: 'text.secondary', fontSize: '0.8125rem' }}>
          {keepLine}
        </Box>
        {/* Per-set breakdown: icon | name | pct three-column grid */}
        {setRows.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '14px auto auto',
              columnGap: 1,
              alignItems: 'center',
              ...monoSx,
            }}
          >
            {setRows.map(({ setId, name, pct }) => (
              <Fragment key={name}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <SetIcon setId={setId} size={13} sx={{ opacity: 0.75 }} />
                </Box>
                <Box sx={{ color: 'text.secondary' }}>{name}</Box>
                <Box sx={{ textAlign: 'right' }}>{formatPct(pct)}</Box>
              </Fragment>
            ))}
          </Box>
        )}
      </Box>
    )
  }

  // ─── Shared table style tokens ────────────────────────────────────────────

  // Dense table cells: match the compact style used in other note blocks.
  const cellSx = { py: 0.25, px: 0.75, fontSize: '0.75rem', borderBottom: 0 }
  // Header cell: slightly bolder label.
  const headCellSx = { ...cellSx, fontWeight: 600, whiteSpace: 'nowrap' as const }

  // ─── Per-dungeon table (Dragon / Fire Knight) ─────────────────────────────

  const renderDungeonTable = (dungeonId: 'dragon' | 'fireKnight', isFirst: boolean) => (
    <Table
      size="small"
      sx={{ tableLayout: 'fixed', width: '100%', mb: 0 }}
    >
      <TableHead>
        {/* Section header spanning all columns */}
        <TableRow>
          <TableCell
            colSpan={NOTE_SIM_COLUMNS.length + 1}
            sx={{ ...headCellSx, pt: isFirst ? 0.5 : 1.5, pb: 0.25, pl: 0 }}
          >
            {dungeonLabel(dungeonId)}
          </TableCell>
        </TableRow>
        {/* Column labels row — computed from i18n so labels match the active locale */}
        <TableRow>
          {/* Empty cell for the row-label column */}
          <TableCell sx={{ ...headCellSx, pl: 0 }} />
          {NOTE_SIM_COLUMNS.map((col) => (
            <TableCell key={col.configId} align="right" sx={headCellSx}>
              {colLabel(col, dungeonId)}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {NOTE_SIM_LEVELS.map((level) => (
          <TableRow key={level}>
            {/* Level label — matches DungeonSimulatorTab convention */}
            <TableCell sx={{ ...cellSx, pl: 0, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {`+${level}`}
            </TableCell>
            {NOTE_SIM_COLUMNS.map((col) => {
              const pending = isConfigPending(col.configId)
              const pct = pending ? null : resolvePercent(dungeonId, col.configId, level)
              const tooltipContent = buildTooltipContent(dungeonId, col.configId, level)
              // Resolve which set is focused for this column + dungeon combination.
              const cfg = NOTE_SIM_CONFIGS.find((c) => c.id === col.configId)
              const focusId = cfg ? getFocusId(cfg, dungeonId) : null
              return (
                <TableCell key={col.configId} align="right" sx={cellSx}>
                  {pending || (running && pct === null) ? (
                    // Skeleton while the config hasn't produced results yet.
                    <Skeleton variant="text" width={36} sx={{ ml: 'auto', fontSize: '0.75rem' }} />
                  ) : (
                    <MarkdownTooltip render={tooltipContent} enterDelay={400} placement="top">
                      <Box component="span" sx={{ cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {/* Glyph indicating what the percentage represents:
                            Σ = aggregate across all sets (no-boost); set icon = boosted-set keep chance. */}
                        {focusId !== null
                          ? <SetIcon setId={focusId} size={11} sx={{ opacity: 0.6, flexShrink: 0 }} />
                          : <Box component="span" sx={{ fontSize: '0.6rem', opacity: 0.45, lineHeight: 1 }}>Σ</Box>
                        }
                        {formatPct(pct)}
                      </Box>
                    </MarkdownTooltip>
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  // ─── Ice Golem table (no boost, 3 columns only) ───────────────────────────

  // Ice Golem always shows aggregate keep chance with no boost or focus set.
  const renderIceGolemTable = () => (
    <Table
      size="small"
      sx={{ tableLayout: 'fixed', width: '100%', mb: 0 }}
    >
      <TableHead>
        {/* Section header spanning all columns */}
        <TableRow>
          <TableCell
            colSpan={NOTE_SIM_ICE_GOLEM_COLUMNS.length + 1}
            sx={{ ...headCellSx, pt: 1.5, pb: 0.25, pl: 0 }}
          >
            {dungeonLabel('iceGolem')}
          </TableCell>
        </TableRow>
        {/* Column labels: mode + stage only (no boost prefix) */}
        <TableRow>
          <TableCell sx={{ ...headCellSx, pl: 0 }} />
          {NOTE_SIM_ICE_GOLEM_COLUMNS.map((col) => (
            <TableCell key={col.configId} align="right" sx={headCellSx}>
              {colLabel(col, 'iceGolem')}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {NOTE_SIM_LEVELS.map((level) => (
          <TableRow key={level}>
            <TableCell sx={{ ...cellSx, pl: 0, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {`+${level}`}
            </TableCell>
            {NOTE_SIM_ICE_GOLEM_COLUMNS.map((col) => {
              const pending = isConfigPending(col.configId)
              const pct = pending ? null : resolvePercent('iceGolem', col.configId, level)
              const tooltipContent = buildTooltipContent('iceGolem', col.configId, level)
              return (
                <TableCell key={col.configId} align="right" sx={cellSx}>
                  {pending || (running && pct === null) ? (
                    <Skeleton variant="text" width={36} sx={{ ml: 'auto', fontSize: '0.75rem' }} />
                  ) : (
                    <MarkdownTooltip render={tooltipContent} enterDelay={400} placement="top">
                      <Box component="span" sx={{ cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {/* Always Σ for Ice Golem — no boost, pure aggregate. */}
                        <Box component="span" sx={{ fontSize: '0.6rem', opacity: 0.45, lineHeight: 1 }}>Σ</Box>
                        {formatPct(pct)}
                      </Box>
                    </MarkdownTooltip>
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  return (
    <Box sx={{ my: 0.5 }}>
      {renderDungeonTable('fireKnight', true)}
      {renderDungeonTable('dragon', false)}
      {renderIceGolemTable()}
    </Box>
  )
}
