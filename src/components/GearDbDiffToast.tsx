import { Box, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import { CHAMPION_ICON_LARGE_THRESHOLD, GEAR_DB_DIFF_TOAST_CARD_SCALE, GLYPH_ARROW_RIGHT } from '../lib/constants'
import { buildPreviewArtifactFromGearInspectorItem } from '../lib/gearInspectorPreviewArtifacts'
import type { TestItem } from '../lib/ruleEval'
import type { MatchingRecipeDecision } from '../lib/ruleEval'
import type { SubstatColorMap } from '../lib/renderColoredStatText'
import type { GearInspectorPreviewMatch, GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import type { GearArtifactSnapshot, GearDbDiffToastEntry, GearDbDiffToastPayload } from '../lib/gearDbDiffToast'
// GearInspectorGridCard and getGearInspectorGridCardSizing were extracted from GearInspectorItemsGrid
// into a dedicated module to keep both files under the 1,500-line cap.
import { GearInspectorGridCard, getGearInspectorGridCardSizing } from './GearInspectorGridCard'
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
const EMPTY_MATCHING_CONFIG_DECISIONS: MatchingRecipeDecision[] = []
const EMPTY_MATCHING_CONFIG_INDICES: number[] = []
const EMPTY_CONFIG_NAMES: Array<string | null> = []

// Badge tones for add/remove placeholders.
type BadgeTone = 'added' | 'removed' | null
// Single-sided batches (all adds or all removals) can render in a dense 2-column grid.
type SingleSidedDiffKind = 'added' | 'removed'

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
  // Added-only and removed-only batches do not need synthetic empty-side cards.
  const singleSidedKind = resolveSingleSidedDiffKind(payload.entries)
  // Stack header, list, and overflow summary vertically.
  return (
    <Stack
      spacing={TOAST_ENTRY_GAP_UNITS}
      sx={{
        minWidth: 260,
        maxWidth: 520,
        // Clip wide diff-card content instead of exposing a horizontal scrollbar in the toast.
        overflowX: 'hidden',
      }}
    >
      {headerLineNodes.length > 0 ? (
        <Stack spacing={0.35}>
          {/* Positional keys: string lines can repeat (same localized text),
              and JSX nodes have no stable identity, so a positional index is correct. */}
          {headerLineNodes.map((line, nodeSeq) => (
            <Typography
              // eslint-disable-next-line @eslint-react/no-array-index-key -- see comment above; list is render-derived, never reordered
              key={`hdr-${nodeSeq}`}
              variant="body2"
              sx={{ fontSize: `${TOAST_HEADER_FONT_SIZE_REM}rem`, lineHeight: 1.35 }}
            >
              {line}
            </Typography>
          ))}
        </Stack>
      ) : null}
      {payload.entries.length > 0 ? (
        singleSidedKind ? (
          <GearDbDiffSingleSidedGrid
            entries={payload.entries}
            kind={singleSidedKind}
            substatColors={substatColors}
            useStatButtonColors={useStatButtonColors}
          />
        ) : (
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
        )
      ) : null}
      {payload.overflowCount > 0 ? (
        <Typography variant="caption" color="text.secondary">
          {t('historyRecipesMoreLine', { count: payload.overflowCount })}
        </Typography>
      ) : null}
    </Stack>
  )
}

/**
 * Detect whether every diff entry is one-sided in the same direction.
 */
function resolveSingleSidedDiffKind(entries: GearDbDiffToastEntry[]): SingleSidedDiffKind | null {
  // Empty lists fall back to the standard renderer.
  if (entries.length === 0) return null
  // Resolve a uniform single-sided kind in one pass.
  let singleSidedKind: SingleSidedDiffKind | null = null
  for (const entry of entries) {
    if (entry.kind === 'added' && entry.before === null && entry.after !== null) {
      if (singleSidedKind === null) {
        singleSidedKind = 'added'
        continue
      }
      if (singleSidedKind === 'added') continue
      return null
    }
    if (entry.kind === 'removed' && entry.before !== null && entry.after === null) {
      if (singleSidedKind === null) {
        singleSidedKind = 'removed'
        continue
      }
      if (singleSidedKind === 'removed') continue
      return null
    }
    // Updates or malformed one-sided rows are not eligible.
    return null
  }
  if (singleSidedKind) return singleSidedKind
  // Mixed/update batches keep before/after rows with arrows.
  return null
}

type ToastItemProps = {
  entry: GearDbDiffToastEntry
  substatColors: SubstatColorMap
  useStatButtonColors: boolean
}

/**
 * Render a single before/after diff row using scaled Gear Inspector cards.
 */
function GearDbDiffToastItem({ entry, substatColors, useStatButtonColors }: ToastItemProps) {
  // Use theme colors for added/removed cues.
  const theme = useTheme()
  // Match rows are only needed when either side has a Gear Inspector match.
  const showMatchRow = Boolean(entry.beforeMatch || entry.afterMatch)
  // Compute the base card sizing once so both sides stay aligned.
  const cardSizing = getGearInspectorGridCardSizing(theme, TOAST_CARD_COLUMN_COUNT, {
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
      <ScaledGearInspectorGridCard
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
      <ScaledGearInspectorGridCard
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
        // Keep oversized rows clipped inside the toast body.
        overflowX: 'hidden',
      }}
    >
      {left}
      {/* Use the shared arrow glyph so diff previews stay consistent. */}
      <Typography variant="body2" sx={{ color: (theme.vars?.palette.info.main ?? theme.palette.info.main), fontWeight: 600 }}>
        {GLYPH_ARROW_RIGHT}
      </Typography>
      {right}
    </Box>
  )
}

type SingleSidedGridProps = {
  entries: GearDbDiffToastEntry[]
  kind: SingleSidedDiffKind
  substatColors: SubstatColorMap
  useStatButtonColors: boolean
}

/**
 * Render add-only/remove-only batches as compact two-column cards.
 */
function GearDbDiffSingleSidedGrid({
  entries,
  kind,
  substatColors,
  useStatButtonColors,
}: SingleSidedGridProps) {
  // Use theme-driven sizing so this grid matches the standard diff rows.
  const theme = useTheme()
  // Keep card heights uniform: if any card needs the match row, reserve it for all.
  const showMatchRow = entries.some((entry) => kind === 'added'
    ? Boolean(entry.afterMatch)
    : Boolean(entry.beforeMatch))
  // Reuse the same sizing pipeline as the before/after renderer.
  const cardSizing = getGearInspectorGridCardSizing(theme, TOAST_CARD_COLUMN_COUNT, {
    showFirstMatchRow: showMatchRow,
    showOtherMatchesRow: TOAST_SHOW_OTHER_MATCH_ROWS,
  })
  // Apply the shared scale so toast/history cards remain visually identical.
  const scaledWidthPx = Math.ceil(cardSizing.minWidthPx * TOAST_CARD_SCALE)
  const scaledHeightPx = Math.ceil(cardSizing.cardHeightPx * TOAST_CARD_SCALE)
  const size = {
    cardSizing,
    scaledWidthPx,
    scaledHeightPx,
  }
  // Render cards in two columns without empty placeholders.
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto auto',
        columnGap: 0.75,
        rowGap: TOAST_ENTRY_GAP_UNITS,
        // Diff cards can be wider than the toast on small viewports; clip instead of scrolling.
        overflowX: 'hidden',
      }}
    >
      {entries.map((entry, index) => {
        // Added entries render the `after` state; removals render `before`.
        const snapshot = kind === 'added' ? entry.after : entry.before
        // Single-sided detection guarantees the relevant snapshot exists.
        if (!snapshot) return null
        const match = kind === 'added' ? entry.afterMatch : entry.beforeMatch
        return (
          <ScaledGearInspectorGridCard
            key={`gear-db-diff-single-sided-${entry.id}`}
            snapshot={snapshot}
            match={match}
            showMatchRow={showMatchRow}
            size={size}
            substatColors={substatColors}
            useStatButtonColors={useStatButtonColors}
            priorityOrder={index}
            tone={kind === 'added' ? 'added' : 'removed'}
          />
        )
      })}
    </Box>
  )
}

type ScaledGearInspectorGridCardProps = {
  snapshot: GearArtifactSnapshot
  match: GearInspectorPreviewMatch | null
  showMatchRow: boolean
  size: { cardSizing: { cardHeightPx: number; minWidthPx: number }; scaledWidthPx: number; scaledHeightPx: number }
  substatColors: SubstatColorMap
  useStatButtonColors: boolean
  priorityOrder: number
  tone?: BadgeTone
}

/**
 * Render a Gear Inspector card scaled down for toast previews.
 */
function ScaledGearInspectorGridCard({
  snapshot,
  match,
  showMatchRow,
  size,
  substatColors,
  useStatButtonColors,
  priorityOrder,
  tone = null,
}: ScaledGearInspectorGridCardProps) {
  // Build a full Gear Inspector preview row from the snapshot payload.
  const row = buildGearInspectorPreviewRow(snapshot, match)
  const theme = useTheme()
  // Single-sided add/remove grids tint borders so direction is obvious at a glance.
  const accentBorderColor = tone === 'added'
    ? 'rgba(var(--mui-palette-success-mainChannel) / 0.55)'
    : tone === 'removed'
      ? 'rgba(var(--mui-palette-error-mainChannel) / 0.55)'
      : null
  // Fixed size wrapper keeps the scaled card aligned with its sibling.
  return (
    <Box
      sx={{
        width: size.scaledWidthPx,
        height: size.scaledHeightPx,
        position: 'relative',
        flexShrink: 0,
        borderRadius: 1,
        boxSizing: 'border-box',
        // Clip Gear Inspector card overflow inside history preview wrappers so no nested card scroll regions appear.
        overflow: 'hidden',
        ...(accentBorderColor ? { border: `1px solid ${accentBorderColor}` } : {}),
        // In light mode, darken the card uniformly so it doesn't read as stark white
        // against the toast/tooltip background. Affects all internals (GridIconBox etc.)
        // without touching any internal colour values.
        ...theme.applyStyles('light', { filter: 'brightness(0.92)' }),
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
        <GearInspectorGridCard
          row={row}
          substatColors={substatColors}
          useStatButtonColors={useStatButtonColors}
          suppressMatchDetails={false}
          showFirstMatchRow={showMatchRow}
          showOtherMatchesRow={TOAST_SHOW_OTHER_MATCH_ROWS}
          showMatchRecipeIndex={false}
          showMatchLineNumber={false}
          // Surface champion avatars in the diff preview for quick context.
          showChampionIcons={true}
          cardHeightPx={size.cardSizing.cardHeightPx}
          gridColumnCount={TOAST_CARD_COLUMN_COUNT}
          recipeNames={EMPTY_CONFIG_NAMES}
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
  // Reuse the Gear Inspector unknown token so placeholders stay consistent.
  const { t } = useI18n()
  const theme = useTheme()
  // Tint the border when the diff implies add/remove intent.
  const borderColor = tone === 'added'
    ? 'rgba(var(--mui-palette-success-mainChannel) / 0.4)'
    : tone === 'removed'
      ? 'rgba(var(--mui-palette-error-mainChannel) / 0.4)'
      : theme.palette.divider
  // Use a subtle background wash to match the border cue.
  const background = tone === 'added'
    ? 'rgba(var(--mui-palette-success-mainChannel) / 0.08)'
    : tone === 'removed'
      ? 'rgba(var(--mui-palette-error-mainChannel) / 0.08)'
      : (theme.vars?.palette.background.paper ?? theme.palette.background.paper)
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
        color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
        fontSize: '0.75rem',
      }}
    >
      {t('gearInspectorValueUnknown')}
    </Box>
  )
}

/**
 * Build a Gear Inspector preview row from a Gear DB snapshot so the card renderer can reuse it.
 */
function buildGearInspectorPreviewRow(snapshot: GearArtifactSnapshot, match: GearInspectorPreviewMatch | null): GearInspectorPreviewRow {
  // Preview extras let the Gear Inspector renderer reuse the gear DB stats directly.
  const previewExtras = {
    id: snapshot.id,
    source: snapshot.source,
    rerollCount: snapshot.rerollCount,
    // Single nested champion reference replaces the previous flat
    // equippedChampion* set; renderers read fields via `previewExtras.equippedChampion?.X`.
    equippedChampion: snapshot.equippedChampion,
    mainStat: snapshot.mainStat,
    substats: snapshot.substats,
    ascension: snapshot.ascension,
    exactLevel: snapshot.exactLevel ?? null,
    // Last-used timestamps are intentionally omitted from diff previews.
    lastUseLocalTimestamp: null,
  }
  // Minimal test item is enough because preview extras hold the UI details.
  const gearInspectorItem: TestItem = {
    slot: snapshot.slot,
    set: snapshot.set,
    rank: snapshot.rank,
    rarity: snapshot.rarity,
    level: snapshot.level,
    faction: snapshot.faction,
    ...(snapshot.mainStat ? { main: snapshot.mainStat.variant } : {}),
    previewExtras,
  }
  // Translate to the normalized artifact shape used by the Gear Inspector grid card.
  const artifact = buildPreviewArtifactFromGearInspectorItem(gearInspectorItem)
  return {
    artifact,
    match,
    baseMatch: null,
    matchingRecipeIndices: EMPTY_MATCHING_CONFIG_INDICES,
    matchingRecipeDecisions: EMPTY_MATCHING_CONFIG_DECISIONS,
  }
}
