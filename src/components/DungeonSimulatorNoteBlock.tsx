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

// Spider only shows the 3 no-boost columns (accessories only, never boosted).
const NOTE_SIM_SPIDER_COLUMNS: readonly { configId: string }[] = [
  { configId: 'n20-off' },
  { configId: 'n25-off' },
  { configId: 'h10-off' },
] as const

// All 5 milestone levels as rows; level-up mode captures each checkpoint without extra CPU cost.
const NOTE_SIM_LEVELS: readonly LevelMilestone[] = [0, 4, 8, 12, 16] as const

// Fixed per-table widths (px). Each `<Table>` is `tableLayout:fixed` with one of these explicit
// widths (capped to the container via maxWidth:100%), so it sizes to a predictable width instead of
// `width:100%` stretching to fill its flex wrapper. That was the bug: in a wide note panel the two
// `width:100%` tables each filled a ~50% wrapper and the fixed columns overflowed, overlapping the
// sibling table. With explicit widths the pairs sit at their natural size, side by side, and the
// flex row simply wraps to stacked rows when the panel is too narrow for both.
//  - WIDE: 7-column boosted tables (Fire Knight / Dragon: label + 3 no-boost + 3 boost).
//  - NARROW: 4-column tables (Ice Golem / Spider: label + 3).
const NOTE_SIM_WIDE_TABLE_WIDTH_PX = 360 as const
const NOTE_SIM_NARROW_TABLE_WIDTH_PX = 240 as const

// ─── Component ────────────────────────────────────────────────────────────────

export type DungeonSimulatorNoteBlockProps = Record<string, unknown>

export default function DungeonSimulatorNoteBlock(_props: DungeonSimulatorNoteBlockProps) {
  // Consume context before any conditional returns to satisfy the Rules of Hooks.
  const ctx = use(NoteRenderContext)
  const { t } = useI18n()

  const rules = ctx?.rules ?? []
  const substatTargets = ctx?.substatTargets ?? ({} as SubstatTargetTable)
  const pipelineRunning = ctx?.pipelineRunning ?? false
  // Restart signal: advances only on user override edits, never on background pushes.
  const userOverrideEpoch = ctx?.userOverrideEpoch ?? 0

  // Run the sequential 6-config simulation; paused while the rule cache pipeline is active.
  const { resultsByConfig, running } = useDungeonNoteSimulator({
    rules,
    substatTargets,
    // Restart only on user override edits (open + epoch change) — not on background pushes.
    userOverrideEpoch,
    // Gate simulation behind the rule cache pipeline so results are always current.
    enabled: !pipelineRunning && ctx !== null,
  })

  // Guard: context is required for meaningful rendering.
  if (!ctx) return null

  // ─── i18n helpers ─────────────────────────────────────────────────────────

  const dungeonLabel = (dungeonId: 'dragon' | 'fireKnight' | 'iceGolem' | 'spider') => {
    if (dungeonId === 'dragon') return t('dungeonDragon')
    if (dungeonId === 'fireKnight') return t('dungeonFireKnight')
    if (dungeonId === 'spider') return t('dungeonSpider')
    return t('dungeonIceGolem')
  }

  // Return the focused set id for a dungeon in a given config; Ice Golem + Spider always null.
  const getFocusId = (cfg: (typeof NOTE_SIM_CONFIGS)[number], dungeonId: 'dragon' | 'fireKnight' | 'iceGolem' | 'spider'): ArtifactSetId | null => {
    if (dungeonId === 'dragon') return cfg.dragonFocusSetId
    if (dungeonId === 'fireKnight') return cfg.fireKnightFocusSetId
    return null
  }

  // Resolve the stage-only column header (mode + stage number, no boost prefix).
  // Boost group label is shown once as a colSpan header in the title row instead.
  const stageLabel = (col: { configId: string }, dungeonId: 'dragon' | 'fireKnight' | 'iceGolem' | 'spider'): string => {
    const cfg = NOTE_SIM_CONFIGS.find((c) => c.id === col.configId)
    if (!cfg) return col.configId
    const sel = cfg.selections[dungeonId]
    const modeLabel = sel?.mode === 'hard' ? t('dungeonDropsModeHard') : t('dungeonDropsModeNormal')
    return `${modeLabel} ${sel?.stage ?? '?'}`
  }

  // Resolve the "3× SetName" group label for the boost colspan header in the title row.
  // Returns null for dungeons with no boost (Ice Golem, Spider) and for the no-boost configs.
  const boostGroupLabel = (dungeonId: 'dragon' | 'fireKnight'): string | null => {
    // All boost configs use the same focus set per dungeon; look it up from any boost config.
    const cfg = NOTE_SIM_CONFIGS.find((c) => c.id === 'n20-3x')
    if (!cfg) return null
    const focusId = getFocusId(cfg, dungeonId)
    if (focusId === null) return null
    return `${t('dungeonDropsBoost3x')} ${getLocalizedGearSetName(focusId, t)}`
  }

  // ─── Cell value resolution ────────────────────────────────────────────────

  // Resolve the keep-chance percentage for a cell (works for all four dungeons).
  const resolvePercent = (
    dungeonId: 'dragon' | 'fireKnight' | 'iceGolem' | 'spider',
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

  // Determine whether a column's config has been simulated yet. With the round-robin
  // scheduler every config receives results together each round, so a column is "pending"
  // only until the first snapshot lands (after which all configs are present in the map).
  const isConfigPending = (configId: string): boolean => !resultsByConfig.has(configId)

  // ─── Tooltip content (JSX) ────────────────────────────────────────────────

  // Build a structured JSX tooltip for a cell, consisting of:
  //   • Header: dungeon · mode stage[ — 3× setName]
  //   • Keep chance at gear level +L: X.Y%  (from noteSimKeepChanceAtLevel)
  //   • Per-set breakdown as a two-column grid (name | pct), sorted by keep chance desc
  const buildTooltipContent = (
    dungeonId: 'dragon' | 'fireKnight' | 'iceGolem' | 'spider',
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
  // Header cell: slightly bolder label; allow wrapping so side-by-side tables fit.
  const headCellSx = { ...cellSx, fontWeight: 600 }

  // ─── Per-dungeon table (Dragon / Fire Knight) ─────────────────────────────

  const renderDungeonTable = (dungeonId: 'dragon' | 'fireKnight') => {
    // NOTE_SIM_COLUMNS = [n20-off, n25-off, h10-off, n20-3x, n25-3x, h10-3x]
    // Title row: dungeon name spans label col + 3 no-boost data cols (colSpan=4);
    //            boost group label spans the 3 boost data cols (colSpan=3).
    const boostLabel = boostGroupLabel(dungeonId)
    return (
    <Table
      size="small"
      sx={{ tableLayout: 'fixed', width: NOTE_SIM_WIDE_TABLE_WIDTH_PX, maxWidth: '100%', mb: 0 }}
    >
      <TableHead>
        {/* Title row: dungeon name left, boost group label right */}
        <TableRow>
          <TableCell colSpan={4} sx={{ ...headCellSx, pt: 0.5, pb: 0.25, pl: 0 }}>
            {dungeonLabel(dungeonId)}
          </TableCell>
          <TableCell colSpan={3} align="center" sx={{ ...headCellSx, pt: 0.5, pb: 0.25, opacity: 0.75 }}>
            {boostLabel}
          </TableCell>
        </TableRow>
        {/* Column stage labels — mode + stage only; boost group is shown above */}
        <TableRow>
          <TableCell sx={{ ...headCellSx, pl: 0 }} />
          {NOTE_SIM_COLUMNS.map((col) => (
            <TableCell key={col.configId} align="right" sx={headCellSx}>
              {stageLabel(col, dungeonId)}
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
                    // Mirror the actual cell structure so reserved space matches rendered content.
                    // Boost cells: icon(11) + gap(4) + text(~32) ≈ 47px; no-boost: Σ + text ≈ 36px.
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                      {focusId !== null
                        ? <Skeleton variant="rectangular" width={11} height={11} sx={{ borderRadius: 0.5, flexShrink: 0 }} />
                        : <Skeleton variant="text" width={8} sx={{ fontSize: '0.6rem' }} />
                      }
                      <Skeleton variant="text" width={32} sx={{ fontSize: '0.75rem' }} />
                    </Box>
                  ) : (
                    <MarkdownTooltip render={tooltipContent} enterDelay={400} placement="top">
                      <Box component="span" sx={{ cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {/* Glyph indicating what the percentage represents:
                            Σ = aggregate across all sets (no-boost); set icon = boosted-set keep chance. */}
                        {focusId !== null
                          ? <SetIcon setId={focusId} size={11} sx={{ opacity: 0.6, flexShrink: 0, mr: 0 }} />
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
  }

  // ─── No-boost-only table helper (Ice Golem + Spider share identical structure) ─

  // Renders a 3-column aggregate-only table for dungeons with no boost variants.
  const renderNoBoostTable = (
    dungeonId: 'iceGolem' | 'spider',
    columns: readonly { configId: string }[],
    ptTop: number,
  ) => (
    <Table
      size="small"
      sx={{ tableLayout: 'fixed', width: NOTE_SIM_NARROW_TABLE_WIDTH_PX, maxWidth: '100%', mb: 0 }}
    >
      <TableHead>
        {/* Section header spanning all columns */}
        <TableRow>
          <TableCell
            colSpan={columns.length + 1}
            sx={{ ...headCellSx, pt: ptTop, pb: 0.25, pl: 0 }}
          >
            {dungeonLabel(dungeonId)}
          </TableCell>
        </TableRow>
        {/* Column labels: mode + stage only (no boost prefix) */}
        <TableRow>
          <TableCell sx={{ ...headCellSx, pl: 0 }} />
          {columns.map((col) => (
            <TableCell key={col.configId} align="right" sx={headCellSx}>
              {stageLabel(col, dungeonId)}
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
            {columns.map((col) => {
              const pending = isConfigPending(col.configId)
              const pct = pending ? null : resolvePercent(dungeonId, col.configId, level)
              const tooltipContent = buildTooltipContent(dungeonId, col.configId, level)
              return (
                <TableCell key={col.configId} align="right" sx={cellSx}>
                  {pending || (running && pct === null) ? (
                    <Skeleton variant="text" width={36} sx={{ ml: 'auto', fontSize: '0.75rem' }} />
                  ) : (
                    <MarkdownTooltip render={tooltipContent} enterDelay={400} placement="top">
                      <Box component="span" sx={{ cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {/* Always Σ — no boost, pure aggregate for these dungeons. */}
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
    // Each table column grows from its natural width up to NOTE_SIM_TABLE_MAX_WIDTH_PX, then stops.
    // `flex: 1 1 <basis>` with a maxWidth lets a narrow panel still give each table its basis (the
    // 7-column boosted tables need more than the 4-column ones, so they get a larger basis), while a
    // very wide panel no longer stretches them to ~50% each — which previously drifted the pairs
    // apart with a big empty gap. minWidth keeps fixed-layout columns from being squeezed so tight
    // they overflow and overlap the sibling table.
    <Box sx={{ my: 0.5 }}>
      {/* Fire Knight + Dragon side by side. Tables carry their own fixed width, so the wrappers do
          NOT grow (flex: 0 0 auto) — that is what stops the wide tables from stretching/overlapping.
          flexWrap lets the second table drop below when the panel is too narrow for both. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start', justifyContent: 'flex-start' }}>
        <Box sx={{ flex: '0 0 auto', minWidth: 0 }}>{renderDungeonTable('fireKnight')}</Box>
        <Box sx={{ flex: '0 0 auto', minWidth: 0 }}>{renderDungeonTable('dragon')}</Box>
      </Box>
      {/* Ice Golem + Spider side by side */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start', justifyContent: 'flex-start' }}>
        <Box sx={{ flex: '0 0 auto', minWidth: 0 }}>
          {renderNoBoostTable('iceGolem', NOTE_SIM_ICE_GOLEM_COLUMNS, 1.5)}
        </Box>
        <Box sx={{ flex: '0 0 auto', minWidth: 0 }}>
          {renderNoBoostTable('spider', NOTE_SIM_SPIDER_COLUMNS, 1.5)}
        </Box>
      </Box>
    </Box>
  )
}
