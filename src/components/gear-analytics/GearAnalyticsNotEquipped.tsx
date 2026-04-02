/**
 * GearAnalyticsNotEquipped.tsx
 *
 * Two compact tables (Collection / Vault, stacked) of champions that are not
 * fully equipped (missing at least one of their 9 gear slots).
 *
 * Layout: champions flow into a column-grid — ROWS_PER_COL rows per column,
 * then wrap horizontally.  A horizontal scrollbar appears when more columns
 * than fit in the container.
 *
 * Sort control (ToggleButtonGroup): Off / All / Artifacts / Accessories.
 * Naked toggle (PersonOff icon): also show champions with 0 gear equipped
 * (requires champion roster data from the loaded data set).
 *
 * Grid cells:  ■ colored = slot equipped
 *              □ outline = slot empty
 *
 * Hovering a filled cell shows the equipped gear piece via GearInspectorGridCard.
 */
import { useMemo, useState, useEffect } from 'react'
import { Box, Collapse, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import {
  buildChampionGearProfiles,
  champProfileTiebreaker,
  isSlotAvailableAtAscensionLevel,
  MAIN_ARMOR_SLOTS,
  ACCESSORY_SLOTS,
  type ChampionGearProfile,
} from '../../lib/champAnalytics'
import { PREFERRED_ARTIFACT_TYPE_ORDER } from '../../lib/types'
import { artifactTypeI18nKey } from '../../lib/gearAnalytics'
import { EllipsisTooltip } from '../EllipsisTooltip'
import { championIconUrl } from '../../lib/iconMaps/championIconMap'
import { resolveRarityAccentColor } from '../../lib/rarityColors'
import {
  CHAMPION_ICON_BORDER_RADIUS_PX,
  GEAR_DB_DIFF_TOAST_CARD_SCALE,
  CHAMPION_ICON_LARGE_THRESHOLD,
} from '../../lib/constants'
import { useI18n } from '../../lib/i18n'
import { useSubstatColors } from '../../hooks/useSubstatColors'
import { useDisplayPreferences } from '../../state/preferencesState'
import MarkdownTooltip from '../MarkdownTooltip'
import { GearInspectorGridCard, getGearInspectorGridCardSizing } from '../GearInspectorGridCard'

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 20
/** Each slot cell in the 3×3 grid (px). */
const SLOT_CELL = 9
/** Gap between slot cells (px). */
const SLOT_GAP = 2
/** Compiled grid width: 3 cells + 2 gaps = 31px. */
const GRID_W = 3 * SLOT_CELL + 2 * SLOT_GAP
/** Height of one slot grid (3 rows × 9px + 2 × 2px gap = 31px) — tallest element in a row. */
const ROW_H = 3 * SLOT_CELL + 2 * SLOT_GAP
/** Fixed name-column width — keeps both tables stable as sort mode changes. */
const NAME_W = 115
/** Number of champion rows per column before wrapping to the next column. */
const ROWS_PER_COL = 5
/** Row gap (px) — matches MUI gap: 1. */
const ROW_GAP_PX = 8
/** Fixed height of the column-flow container: ROWS_PER_COL rows + (ROWS_PER_COL-1) gaps. */
const COL_H = ROWS_PER_COL * ROW_H + (ROWS_PER_COL - 1) * ROW_GAP_PX
/** Column count for gear preview card (matches safeguard candidate preview). */
const GEAR_CARD_COLUMNS = CHAMPION_ICON_LARGE_THRESHOLD
/** No rules context here — recipe names are not displayed in the card. */
const EMPTY_RECIPE_NAMES: Array<string | null> = []
/** All 9 slots in preferred display order, mapping 1:1 to a 3×3 grid. */
const SLOT_GRID: readonly number[] = PREFERRED_ARTIFACT_TYPE_ORDER as readonly number[]

// ── Sort mode ─────────────────────────────────────────────────────────────────

/** Controls champion sort order. 'off' = default tiebreaker; others = sort by
 *  missing count for that slot group (most missing first). */
type SortMode = 'off' | 'all' | 'artifacts' | 'accessories'

const LS_SORT_MODE = 'gearAnalytics.notEquippedSortMode'
const DEFAULT_SORT_MODE: SortMode = 'off'

function readSortMode(): SortMode {
  const v = localStorage.getItem(LS_SORT_MODE)
  if (v === 'off' || v === 'all' || v === 'artifacts' || v === 'accessories') return v
  return DEFAULT_SORT_MODE
}

/** Slot list used for sorting and the missing count badge per sort mode. */
const SORT_SLOTS: Readonly<Record<SortMode, readonly number[]>> = {
  off:         SLOT_GRID,
  all:         SLOT_GRID,
  artifacts:   MAIN_ARMOR_SLOTS,
  accessories: ACCESSORY_SLOTS,
}

/**
 * Count of empty slots in the given slot list that are also available for this
 * champion's ascension level. Locked slots (e.g. amulet before ascension level 5, banner
 * before ascension level 6) are excluded — they cannot be "missing" if they cannot be equipped.
 */
function missingCount(p: ChampionGearProfile, slots: readonly number[]): number {
  return slots.filter((s) => isSlotAvailableAtAscensionLevel(s, p.champAscensionLevel) && !p.slotsFilled.has(s)).length
}

// ── Gear preview card ─────────────────────────────────────────────────────────
// Defined at module level so React lint rules don't flag it as created during render.

type SlotCellPreviewProps = {
  row: GearInspectorPreviewRow
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
}

/** Scaled GearInspectorGridCard rendered inside a filled-slot hover tooltip. */
function SlotCellPreview({ row, substatColors, useStatButtonColors }: SlotCellPreviewProps) {
  const theme = useTheme()
  // Size the card identically to the safeguard candidate preview (same SSOT constants).
  const sizing = getGearInspectorGridCardSizing(theme, GEAR_CARD_COLUMNS, {
    showFirstMatchRow: false,
    showOtherMatchesRow: false,
  })
  const scale = GEAR_DB_DIFF_TOAST_CARD_SCALE
  const scaledW = Math.ceil(sizing.minWidthPx * scale)
  const scaledH = Math.ceil(sizing.cardHeightPx * scale)
  return (
    // Clip box sized to the scaled card so the tooltip balloon fits snugly.
    <Box sx={{ width: scaledW, height: scaledH, overflow: 'hidden', borderRadius: 1 }}>
      <Box sx={{
        width: sizing.minWidthPx, height: sizing.cardHeightPx,
        transform: `scale(${scale})`, transformOrigin: 'top left',
      }}>
        <GearInspectorGridCard
          row={row}
          substatColors={substatColors}
          useStatButtonColors={useStatButtonColors}
          suppressMatchDetails={true}
          showFirstMatchRow={false}
          showOtherMatchesRow={false}
          showMatchRecipeIndex={false}
          showMatchLineNumber={false}
          showChampionIcons={true}
          cardHeightPx={sizing.cardHeightPx}
          gridColumnCount={GEAR_CARD_COLUMNS}
          recipeNames={EMPTY_RECIPE_NAMES}
          cardPriority={{ base: 0, order: 0 }}
        />
      </Box>
    </Box>
  )
}

// ── Champion avatar ───────────────────────────────────────────────────────────

function ChampAvatar({ profile }: { profile: ChampionGearProfile }) {
  const theme = useTheme()
  // Use baseId for icon URL — alt-art champions share a base hero icon.
  const src = championIconUrl(profile.baseId ?? profile.championId)
  const borderColor = resolveRarityAccentColor(profile.rarity) ?? theme.palette.divider
  return (
    <Box sx={{
      width: AVATAR_SIZE, height: AVATAR_SIZE, flexShrink: 0,
      borderRadius: `${CHAMPION_ICON_BORDER_RADIUS_PX}px`,
      border: '1.5px solid', borderColor, overflow: 'hidden',
      bgcolor: src ? 'transparent' : `color-mix(in srgb, ${borderColor} 14%, transparent)`,
    }}>
      {src
        ? <Box component="img" src={src} alt={profile.championName} draggable={false}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', userSelect: 'none' }} />
        : <Typography sx={{ fontSize: AVATAR_SIZE * 0.5, fontWeight: 700, color: borderColor, lineHeight: `${AVATAR_SIZE}px`, textAlign: 'center', width: '100%' }}>
            {profile.championName.charAt(0).toUpperCase()}
          </Typography>
      }
    </Box>
  )
}

// ── 3×3 slot grid ─────────────────────────────────────────────────────────────

type SlotGridProps = {
  profile: ChampionGearProfile
  rowByChampSlot: ReadonlyMap<string, GearInspectorPreviewRow>
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
}

function SlotGrid({ profile, rowByChampSlot, substatColors, useStatButtonColors }: SlotGridProps) {
  const { t } = useI18n()
  return (
    // Three rows of three in PREFERRED_ARTIFACT_TYPE_ORDER.
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: `repeat(3, ${SLOT_CELL}px)`,
      gridTemplateRows: `repeat(3, ${SLOT_CELL}px)`,
      gap: `${SLOT_GAP}px`,
      flexShrink: 0,
    }}>
      {SLOT_GRID.map((slotId) => {
        const filled = profile.slotsFilled.has(slotId)
        const available = isSlotAvailableAtAscensionLevel(slotId, profile.champAscensionLevel)

        // Three visual states — sort mode has no effect on the grid display:
        //   filled    → primary.main solid    (slot has gear equipped)
        //   available → neutral outline       (slot is empty but can be filled)
        //   locked    → very dim, no border   (slot not yet unlocked for this ascension level)
        const cell = available
          ? (
            <Box sx={{
              width: SLOT_CELL, height: SLOT_CELL,
              borderRadius: '2px', boxSizing: 'border-box',
              bgcolor: filled ? 'primary.main' : 'transparent',
              border: '1px solid',
              borderColor: filled ? 'primary.main' : 'text.secondary',
              opacity: filled ? 0.8 : 0.35,
            }} />
          )
          : (
            // Locked slot: ascension level too low to equip this type.
            <Box sx={{
              width: SLOT_CELL, height: SLOT_CELL,
              borderRadius: '2px', boxSizing: 'border-box',
              bgcolor: 'action.disabledBackground',
              border: '1px dashed',
              borderColor: 'action.disabled',
              opacity: 0.3,
            }} />
          )

        // Filled slot: show the equipped gear piece via MarkdownTooltip (SSOT with safeguard preview).
        if (filled && available) {
          const previewRow = rowByChampSlot.get(`${profile.championId}_${slotId}`)
          if (previewRow) {
            return (
              <MarkdownTooltip
                key={slotId}
                render={<SlotCellPreview row={previewRow} substatColors={substatColors} useStatButtonColors={useStatButtonColors} />}
              >
                {cell}
              </MarkdownTooltip>
            )
          }
        }
        // Locked slot: explain why it is unavailable.
        if (!available) {
          return (
            <Tooltip key={slotId} title={`${t(artifactTypeI18nKey(slotId))} — ${t('gearAnalyticsSlotNotUnlocked')}`} placement="top" arrow>
              {cell}
            </Tooltip>
          )
        }
        // Empty available slot or no preview data: plain slot-name tooltip.
        return (
          <Tooltip key={slotId} title={t(artifactTypeI18nKey(slotId))} placement="top" arrow>
            {cell}
          </Tooltip>
        )
      })}
    </Box>
  )
}

// ── Champion row ──────────────────────────────────────────────────────────────

type ChampRowProps = {
  profile: ChampionGearProfile
  sortMode: SortMode
  rowByChampSlot: ReadonlyMap<string, GearInspectorPreviewRow>
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
}

function ChampRow({ profile: p, sortMode, rowByChampSlot, substatColors, useStatButtonColors }: ChampRowProps) {
  // Slot list matching the sort mode — drives the missing count badge.
  const slots = SORT_SLOTS[sortMode]
  return (
    // CSS grid with fixed column widths keeps row width stable across sort mode changes.
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: `${AVATAR_SIZE}px ${NAME_W}px ${GRID_W}px 18px`,
      alignItems: 'center',
      columnGap: 1,
    }}>
      <ChampAvatar profile={p} />
      {/* Name truncated at NAME_W; EllipsisTooltip shows OS tooltip only when ellipsed.
          lineHeight fills the full ROW_H so the hover target spans the entire row height,
          preventing rapid onMouseLeave when the cursor strays above/below the text. */}
      <EllipsisTooltip title={p.championName}>
        <Box component="span" sx={{
          display: 'block', width: NAME_W,
          fontSize: '0.72rem', lineHeight: `${ROW_H}px`,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {p.championName}
        </Box>
      </EllipsisTooltip>
      <SlotGrid
        profile={p}
        rowByChampSlot={rowByChampSlot}
        substatColors={substatColors}
        useStatButtonColors={useStatButtonColors}
      />
      {/* Missing count for the active sort dimension (red, tabular). */}
      <Typography sx={{
        fontSize: '0.65rem', color: 'error.main',
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        -{missingCount(p, slots)}
      </Typography>
    </Box>
  )
}

// ── Location sub-table ─────────────────────────────────────────────────────────

type LocationTableProps = {
  profiles: readonly ChampionGearProfile[]
  title: string
  sortMode: SortMode
  rowByChampSlot: ReadonlyMap<string, GearInspectorPreviewRow>
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
}

function LocationTable({ profiles, title, sortMode, rowByChampSlot, substatColors, useStatButtonColors }: LocationTableProps) {
  if (profiles.length === 0) return null
  return (
    <Box>
      {/* Location label (Collection / Vault). */}
      <Typography variant="caption" color="text.secondary" sx={{
        fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase',
        fontSize: '0.65rem', display: 'block', mb: 0.75,
      }}>
        {title}
      </Typography>
      {/* Outer: provides horizontal scrollbar when columns exceed container width. */}
      <Box sx={{ overflowX: 'auto' }}>
        {/*
         * Inner: column-flow — items fill ROWS_PER_COL rows then wrap to the next column.
         * display: 'inline-flex' sizes the container to its content so the outer can scroll.
         */}
        <Box sx={{
          display: 'inline-flex',
          flexDirection: 'column',
          flexWrap: 'wrap',
          height: COL_H,
          rowGap: 1,     // 8px between rows
          columnGap: 2,  // 16px between columns
        }}>
          {profiles.map((p) => (
            <ChampRow
              key={p.championId}
              profile={p}
              sortMode={sortMode}
              rowByChampSlot={rowByChampSlot}
              substatColors={substatColors}
              useStatButtonColors={useStatButtonColors}
            />
          ))}
        </Box>
      </Box>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  rows: readonly GearInspectorPreviewRow[]
  /** Increment from outside to reset all controls to their factory defaults. */
  resetKey?: number
  /** When true, the chart body is hidden and only the title row remains visible. */
  collapsed?: boolean
  /** Called when the user clicks the collapse chevron; applyToAll = Ctrl/Cmd+click or right-click. */
  onToggleCollapse?: (applyToAll: boolean) => void
}

export function GearAnalyticsNotEquipped({ rows, resetKey, collapsed, onToggleCollapse }: Props) {
  const { t } = useI18n()
  const [substatColors] = useSubstatColors()
  // useStatButtonColors drives substat chip coloring inside the gear preview card.
  const { statButtonBorders } = useDisplayPreferences()

  const [sortMode, setSortMode] = useState<SortMode>(readSortMode)

  useEffect(() => { localStorage.setItem(LS_SORT_MODE, sortMode) }, [sortMode])
  // Restore factory defaults when the parent increments resetKey.
  // "Adjust state directly during render" pattern avoids the one-render delay of useEffect.
  const [prevResetKey, setPrevResetKey] = useState<number | undefined>(resetKey)
  if (prevResetKey !== resetKey && resetKey !== undefined) {
    setPrevResetKey(resetKey)
    setSortMode(DEFAULT_SORT_MODE)
  }

  // Build (championId_slotId) → row lookup for filled-slot gear previews.
  const rowByChampSlot = useMemo(() => {
    const map = new Map<string, GearInspectorPreviewRow>()
    for (const row of rows) {
      const { equippedToChampionId, slot } = row.artifact
      if (equippedToChampionId !== null) {
        map.set(`${equippedToChampionId}_${Number(slot)}`, row)
      }
    }
    return map
  }, [rows])

  // Build profiles: champions missing at least one of their 9 gear slots.
  const notEquipped = useMemo(() => {
    const profiles = buildChampionGearProfiles(rows)
    return profiles.filter((p) => missingCount(p, SLOT_GRID) > 0)
  }, [rows])

  // Sort: 'off' = radar tiebreaker; others = most missing in that slot group first.
  const sorted = useMemo(() => {
    const copy = [...notEquipped]
    if (sortMode === 'off') {
      copy.sort(champProfileTiebreaker)
    } else {
      const slots = SORT_SLOTS[sortMode]
      copy.sort((a, b) => {
        const da = missingCount(a, slots)
        const db = missingCount(b, slots)
        return db !== da ? db - da : champProfileTiebreaker(a, b)
      })
    }
    return copy
  }, [notEquipped, sortMode])

  const collection = useMemo(() => sorted.filter((p) => p.location === 'collection'), [sorted])
  const vault      = useMemo(() => sorted.filter((p) => p.location === 'vault'),      [sorted])

  if (collection.length === 0 && vault.length === 0) return null

  const tableProps = { sortMode, rowByChampSlot, substatColors, useStatButtonColors: statButtonBorders }

  return (
    <Box>
      {/* Title row — chevron toggles collapse; tooltip on the label for legend context. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, minWidth: 0 }}>
        {onToggleCollapse && (
          <IconButton
            size="small"
            onClick={(e) => onToggleCollapse(e.ctrlKey || e.metaKey)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCollapse(true) }}
            sx={{ p: 0.25, flexShrink: 0 }}
          >
            {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
          </IconButton>
        )}
        <Tooltip title={t('gearAnalyticsNotEquippedTitleDesc')} arrow placement="top-start">
          <Typography variant="caption" color="text.secondary" sx={{
            fontWeight: 600, letterSpacing: 0.3,
            textTransform: 'uppercase', fontSize: '0.68rem',
            display: 'inline-block', cursor: 'help',
          }}>
            {t('gearAnalyticsNotEquippedTitle')}
          </Typography>
        </Tooltip>
      </Box>
      <Collapse in={!collapsed} timeout="auto">
      {/* Controls row: Sort label + mode group. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          {t('gearAnalyticsSortLabel')}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sortMode}
          onChange={(_e, val) => { if (val !== null) setSortMode(val as SortMode) }}
        >
          <ToggleButton value="off" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsSortOff')}
          </ToggleButton>
          <ToggleButton value="all" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsSlotModeAll')}
          </ToggleButton>
          <ToggleButton value="artifacts" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsSlotModeArtifacts')}
          </ToggleButton>
          <ToggleButton value="accessories" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsSlotModeAccessories')}
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Collection and Vault sub-tables, stacked vertically (collection on top). */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <LocationTable {...tableProps} profiles={collection} title={t('gearAnalyticsChampLocationCollection')} />
        <LocationTable {...tableProps} profiles={vault}      title={t('gearAnalyticsChampLocationVault')} />
      </Box>
      </Collapse>
    </Box>
  )
}
