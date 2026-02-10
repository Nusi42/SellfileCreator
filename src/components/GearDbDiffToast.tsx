import { Box, Stack, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import { CHAMPION_ICON_LARGE_THRESHOLD, GEAR_DB_DIFF_TOAST_CARD_SCALE, GLYPH_ARROW_RIGHT } from '../lib/constants'
import { buildPreviewArtifactFromTesterItem } from '../lib/testerPreviewArtifacts'
import type { TestItem } from '../lib/ruleEval'
import type { MatchingConfigDecision } from '../lib/ruleEval'
import type { SubstatColorMap } from '../lib/renderColoredStatText'
import type { TesterPreviewMatch, TesterPreviewRow } from '../types/testerPreview'
import type { GearArtifactSnapshot, GearDbDiffToastEntry, GearDbDiffToastPayload } from '../lib/gearDbDiffToast'
import { TesterGridCard, getTesterGridCardSizing } from './TesterItemsGrid'
import { buildGearDbDiffSummaryLineNodes } from './GearDbDiffSummaryLine'

// Use a tight gap so five entries can still fit in the toast window.
const TOAST_ENTRY_GAP_UNITS = 1
// Smaller fonts keep the toast visually lightweight.
const TOAST_HEADER_FONT_SIZE_REM = 0.85
// Scale the card down so two entries fit comfortably in the toast.
const TOAST_CARD_SCALE = GEAR_DB_DIFF_TOAST_CARD_SCALE
// Use a wider column count so ascension renders as a block (avoids inline wrapping).
const TOAST_CARD_COLUMN_COUNT = CHAMPION_ICON_LARGE_THRESHOLD
// Toast previews do not show secondary match rows.
const TOAST_SHOW_OTHER_MATCH_ROWS = false
// Fixed match rows keep the before/after heights aligned when matches exist.
const TOAST_CARD_PRIORITY_BASE = 0

// Shared empty arrays avoid re-allocating on every toast render.
const EMPTY_MATCHING_CONFIG_DECISIONS: MatchingConfigDecision[] = []
const EMPTY_MATCHING_CONFIG_INDICES: number[] = []
const EMPTY_CONFIG_NAMES: Array<string | null> = []

// Badge tones for add/remove placeholders.
type BadgeTone = 'added' | 'removed' | null

/**
 * Render the endpoint diff toast body: header lines + per-item diffs.
 */
export function GearDbDiffToast({
  payload,
  substatColors,
  useStatButtonColors,
  // Count pill is only used for the green success toast background.
  useCountPill = false,
}: {
  payload: GearDbDiffToastPayload
  substatColors: SubstatColorMap
  useStatButtonColors: boolean
  useCountPill?: boolean
}) {
  // Localize static copy inside the toast itself.
  const { t } = useI18n()
  // Trim header lines up front so layout stays tight.
  // Filter empty headers so we do not render blank typography rows.
  const headerLines = payload.headerLines.map((line) => line.trim()).filter((line) => line.length > 0)
  // Prefer structured line specs so diff summaries can render with icon glyphs.
  const headerLineNodes = payload.lineSpecs && payload.lineSpecs.length > 0
    ? buildGearDbDiffSummaryLineNodes(payload.lineSpecs, t, { useCountPill })
    : headerLines
  // Stack header, list, and overflow summary vertically.
  return (
    <Stack spacing={TOAST_ENTRY_GAP_UNITS} sx={{ minWidth: 260, maxWidth: 520 }}>
      {headerLineNodes.length > 0 ? (
        <Stack spacing={0.35}>
          {headerLineNodes.map((line, index) => (
            <Typography
              key={`gear-db-diff-header-${index}`}
              variant="body2"
              sx={{ fontSize: `${TOAST_HEADER_FONT_SIZE_REM}rem`, lineHeight: 1.35 }}
            >
              {line}
            </Typography>
          ))}
        </Stack>
      ) : null}
      {payload.entries.length > 0 ? (
        <Stack spacing={TOAST_ENTRY_GAP_UNITS}>
          {payload.entries.map((entry) => (
            <GearDbDiffToastItem
              key={`gear-db-diff-item-${entry.id}`}
              entry={entry}
              substatColors={substatColors}
              useStatButtonColors={useStatButtonColors}
            />
          ))}
        </Stack>
      ) : null}
      {payload.overflowCount > 0 ? (
        <Typography variant="caption" color="text.secondary">
          {t('historyConfigsMoreLine', { count: payload.overflowCount })}
        </Typography>
      ) : null}
    </Stack>
  )
}

type ToastItemProps = {
  entry: GearDbDiffToastEntry
  substatColors: SubstatColorMap
  useStatButtonColors: boolean
}

/**
 * Render a single before/after diff row using scaled tester cards.
 */
function GearDbDiffToastItem({ entry, substatColors, useStatButtonColors }: ToastItemProps) {
  // Use theme colors for added/removed cues.
  const theme = useTheme()
  // Match rows are only needed when either side has a tester match.
  const showMatchRow = Boolean(entry.beforeMatch || entry.afterMatch)
  // Compute the base card sizing once so both sides stay aligned.
  const cardSizing = getTesterGridCardSizing(theme, TOAST_CARD_COLUMN_COUNT, {
    showFirstMatchRow: showMatchRow,
    showOtherMatchesRow: TOAST_SHOW_OTHER_MATCH_ROWS,
  })
  // Apply the scale to get the visible card dimensions.
  const scaledWidthPx = Math.ceil(cardSizing.minWidthPx * TOAST_CARD_SCALE)
  const scaledHeightPx = Math.ceil(cardSizing.cardHeightPx * TOAST_CARD_SCALE)
  // Shared sizing payload keeps before/after cards aligned.
  const sizing = {
    cardSizing,
    scaledWidthPx,
    scaledHeightPx,
  }
  // Precompute the left-hand side based on diff type.
  const left = entry.before
    ? (
      <ScaledTesterGridCard
        snapshot={entry.before}
        match={entry.beforeMatch}
        showMatchRow={showMatchRow}
        size={sizing}
        substatColors={substatColors}
        useStatButtonColors={useStatButtonColors}
        priorityOrder={0}
      />
    )
    : <EmptyDiffCard tone={entry.kind === 'added' ? 'added' : null} size={sizing} />
  // Precompute the right-hand side based on diff type.
  const right = entry.after
    ? (
      <ScaledTesterGridCard
        snapshot={entry.after}
        match={entry.afterMatch}
        showMatchRow={showMatchRow}
        size={sizing}
        substatColors={substatColors}
        useStatButtonColors={useStatButtonColors}
        priorityOrder={1}
      />
    )
    : <EmptyDiffCard tone={entry.kind === 'removed' ? 'removed' : null} size={sizing} />

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto auto auto',
        alignItems: 'center',
        columnGap: 0.75,
      }}
    >
      {left}
      {/* Use the shared arrow glyph so diff previews stay consistent. */}
      <Typography variant="body2" sx={{ color: theme.palette.info.main, fontWeight: 600 }}>
        {GLYPH_ARROW_RIGHT}
      </Typography>
      {right}
    </Box>
  )
}

type ScaledTesterGridCardProps = {
  snapshot: GearArtifactSnapshot
  match: TesterPreviewMatch | null
  showMatchRow: boolean
  size: { cardSizing: { cardHeightPx: number; minWidthPx: number }; scaledWidthPx: number; scaledHeightPx: number }
  substatColors: SubstatColorMap
  useStatButtonColors: boolean
  priorityOrder: number
}

/**
 * Render a tester card scaled down for toast previews.
 */
function ScaledTesterGridCard({
  snapshot,
  match,
  showMatchRow,
  size,
  substatColors,
  useStatButtonColors,
  priorityOrder,
}: ScaledTesterGridCardProps) {
  // Build a full tester preview row from the snapshot payload.
  const row = buildTesterPreviewRow(snapshot, match)
  // Fixed size wrapper keeps the scaled card aligned with its sibling.
  return (
    <Box
      sx={{
        width: size.scaledWidthPx,
        height: size.scaledHeightPx,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          width: size.cardSizing.minWidthPx,
          height: size.cardSizing.cardHeightPx,
          transform: `scale(${TOAST_CARD_SCALE})`,
          transformOrigin: 'top left',
        }}
      >
        <TesterGridCard
          row={row}
          substatColors={substatColors}
          useStatButtonColors={useStatButtonColors}
          suppressMatchDetails={false}
          showFirstMatchRow={showMatchRow}
          showOtherMatchesRow={TOAST_SHOW_OTHER_MATCH_ROWS}
          showMatchConfigIndex={false}
          showMatchLineNumber={false}
          // Surface champion avatars in the diff preview for quick context.
          showChampionIcons={true}
          cardHeightPx={size.cardSizing.cardHeightPx}
          gridColumnCount={TOAST_CARD_COLUMN_COUNT}
          configNames={EMPTY_CONFIG_NAMES}
          highlightedRowPredicate={null}
          dimUnhighlightedRows={false}
          cardPriority={{ base: TOAST_CARD_PRIORITY_BASE, order: priorityOrder }}
        />
      </Box>
    </Box>
  )
}

type EmptyDiffCardProps = {
  tone: BadgeTone
  size: { scaledWidthPx: number; scaledHeightPx: number }
}

/**
 * Render a placeholder when an item only exists on one side of the diff.
 */
function EmptyDiffCard({ tone, size }: EmptyDiffCardProps) {
  // Reuse the tester unknown token so placeholders stay consistent.
  const { t } = useI18n()
  const theme = useTheme()
  // Tint the border when the diff implies add/remove intent.
  const borderColor = tone === 'added'
    ? alpha(theme.palette.success.main, 0.4)
    : tone === 'removed'
      ? alpha(theme.palette.error.main, 0.4)
      : theme.palette.divider
  // Use a subtle background wash to match the border cue.
  const background = tone === 'added'
    ? alpha(theme.palette.success.main, 0.08)
    : tone === 'removed'
      ? alpha(theme.palette.error.main, 0.08)
      : theme.palette.background.paper
  return (
    <Box
      sx={{
        width: size.scaledWidthPx,
        height: size.scaledHeightPx,
        border: `1px dashed ${borderColor}`,
        borderRadius: 1,
        bgcolor: background,
        px: 1,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.palette.text.secondary,
        fontSize: '0.75rem',
      }}
    >
      {t('testerValueUnknown')}
    </Box>
  )
}

/**
 * Build a tester preview row from a Gear DB snapshot so the card renderer can reuse it.
 */
function buildTesterPreviewRow(snapshot: GearArtifactSnapshot, match: TesterPreviewMatch | null): TesterPreviewRow {
  // Preview extras let the tester renderer reuse the gear DB stats directly.
  const previewExtras = {
    id: snapshot.id,
    source: snapshot.source,
    rerollCount: snapshot.rerollCount,
    equippedToChampionId: snapshot.equippedToChampionId,
    equippedChampionBaseId: snapshot.equippedChampionBaseId,
    equippedChampionRarity: snapshot.equippedChampionRarity,
    equippedChampionName: snapshot.equippedChampionName,
    equippedChampionLocation: snapshot.equippedChampionLocation,
    mainStat: snapshot.mainStat,
    substats: snapshot.substats,
    ascension: snapshot.ascension,
    exactLevel: snapshot.exactLevel ?? null,
    // Last-used timestamps are intentionally omitted from diff previews.
    lastUseLocalTimestamp: null,
  }
  // Minimal test item is enough because preview extras hold the UI details.
  const testerItem: TestItem = {
    slot: snapshot.slot,
    set: snapshot.set,
    rank: snapshot.rank,
    rarity: snapshot.rarity,
    level: snapshot.level,
    faction: snapshot.faction,
    ...(snapshot.mainStat ? { main: snapshot.mainStat.variant } : {}),
    previewExtras,
  }
  // Translate to the normalized artifact shape used by the tester grid card.
  const artifact = buildPreviewArtifactFromTesterItem(testerItem)
  return {
    artifact,
    match,
    baseMatch: null,
    matchingCfgIndices: EMPTY_MATCHING_CONFIG_INDICES,
    matchingConfigDecisions: EMPTY_MATCHING_CONFIG_DECISIONS,
  }
}
