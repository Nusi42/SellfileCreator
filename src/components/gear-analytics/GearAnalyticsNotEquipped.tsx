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
 * Sort control (ToggleButtonGroup): Off / All / Artifacts / Accessories / By rank.
 * Simulate-sold toggle (rightmost): treats every equipped piece the rules would
 * sell as if its slot were empty — slot cells turn red and missing counts grow.
 *
 * Grid cells:  ■ primary  = slot equipped (kept)
 *              ■ error    = slot equipped but would be sold (only when sim is on)
 *              □ outline  = slot empty
 *              □ dashed   = slot locked (champion ascension level too low)
 *
 * Hovering a filled cell shows the equipped gear piece via GearInspectorGridCard.
 */
import { useMemo, useState, useEffect } from 'react'
import { Box, Collapse, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from '@mui/material'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import {
  buildChampionGearProfiles,
  champProfileTiebreaker,
  champProfileRankComparator,
  isSlotAvailableAtAscensionLevel,
  MAIN_ARMOR_SLOTS,
  ACCESSORY_SLOTS,
  type ChampionGearProfile,
} from '../../lib/champAnalytics'
import { PREFERRED_ARTIFACT_TYPE_ORDER } from '../../lib/types'
import { artifactTypeI18nKey, rowOutcome } from '../../lib/gearAnalytics'
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
import { GearAnalyticsChartHeader } from './GearAnalyticsChartHeader'

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
/** Shared empty-set sentinel for slot collections (avoids per-render allocation). */
const EMPTY_SLOT_SET: ReadonlySet<number> = new Set()

// ── Sort mode ─────────────────────────────────────────────────────────────────

/** Controls champion sort order. 'off' = default tiebreaker; 'rank' = in-game
 *  default roster order; others = sort by missing count for that slot group
 *  (most missing first). */
type SortMode = 'off' | 'all' | 'artifacts' | 'accessories' | 'rank'

const LS_SORT_MODE = 'gearAnalytics.notEquippedSortMode'
const DEFAULT_SORT_MODE: SortMode = 'off'

function readSortMode(): SortMode {
  const v = localStorage.getItem(LS_SORT_MODE)
  if (v === 'off' || v === 'all' || v === 'artifacts' || v === 'accessories' || v === 'rank') return v
  return DEFAULT_SORT_MODE
}

// ── Simulate-sold toggle ──────────────────────────────────────────────────────

/** Persisted on/off state for the "simulate sold gear" overlay. */
const LS_SIMULATE_SOLD = 'gearAnalytics.notEquippedSimulateSold'
const DEFAULT_SIMULATE_SOLD = false

function readSimulateSold(): boolean {
  return localStorage.getItem(LS_SIMULATE_SOLD) === '1'
}

/** Slot list used for sorting and the missing count badge per sort mode.
 *  'rank' has no slot-group constraint — it sorts by ascension/rarity tiebreakers. */
const SORT_SLOTS: Readonly<Record<SortMode, readonly number[]>> = {
  off:         SLOT_GRID,
  all:         SLOT_GRID,
  artifacts:   MAIN_ARMOR_SLOTS,
  accessories: ACCESSORY_SLOTS,
  rank:        SLOT_GRID,
}

/**
 * Count of "missing" slots in the given slot list — i.e. slots that are
 *   (1) available at the champion's ascension level (locked amulet/banner skipped), and
 *   (2) NOT considered "effectively filled" by the caller.
 * `effectivelyFilled` typically equals `p.slotsFilled` when the simulation toggle
 * is off; when on, equipped-but-would-be-sold slots are removed from it so they
 * count as missing.
 */
function missingCount(
  p: ChampionGearProfile,
  slots: readonly number[],
  effectivelyFilled: ReadonlySet<number>,
): number {
  return slots.filter(
    (s) => isSlotAvailableAtAscensionLevel(s, p.champAscensionLevel) && !effectivelyFilled.has(s),
  ).length
}

/**
 * Returns the per-champion "effectively filled" slot set used by the missing-count
 * helper and the slot grid. When `simulateSold` is on, slots holding a piece the
 * current rules would sell are dropped from the set — making the simulation flow
 * through the existing missing-count and sort code paths.
 */
function effectiveFilledSlots(
  p: ChampionGearProfile,
  soldSlotsByChamp: ReadonlyMap<number, ReadonlySet<number>>,
  simulateSold: boolean,
): ReadonlySet<number> {
  if (!simulateSold) return p.slotsFilled
  const sold = soldSlotsByChamp.get(p.championId)
  if (!sold || sold.size === 0) return p.slotsFilled
  // Build a fresh set minus the sold slots; ChampionGearProfile.slotsFilled is readonly.
  const next = new Set<number>(p.slotsFilled)
  for (const s of sold) next.delete(s)
  return next
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
  /** Set of slot IDs whose equipped piece would be sold under the active rules.
   *  Always provided; empty when the simulate-sold toggle is off. */
  soldSlots: ReadonlySet<number>
}

function SlotGrid({ profile, rowByChampSlot, substatColors, useStatButtonColors, soldSlots }: SlotGridProps) {
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
        // Sold simulation only matters for currently-equipped slots; otherwise nothing to sell.
        const wouldSell = filled && soldSlots.has(slotId)

        // Four visual states — sort mode has no effect on the grid display:
        //   filled+kept → primary.main solid (slot has gear that stays)
        //   filled+sell → error.main solid   (sim is on; this piece would be sold)
        //   available   → neutral outline    (slot is empty but can be filled)
        //   locked      → very dim, no border (slot not yet unlocked for this ascension level)
        const cell = available
          ? (
            <Box sx={{
              width: SLOT_CELL, height: SLOT_CELL,
              borderRadius: '2px', boxSizing: 'border-box',
              bgcolor: filled ? (wouldSell ? 'error.main' : 'primary.main') : 'transparent',
              border: '1px solid',
              borderColor: filled ? (wouldSell ? 'error.main' : 'primary.main') : 'text.secondary',
              opacity: filled ? 0.85 : 0.35,
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
  /** Slots whose equipped piece would be sold (already filtered by simulate-sold toggle). */
  soldSlots: ReadonlySet<number>
  /** Effective filled set passed in so missingCount matches the sort/badge logic above. */
  effectivelyFilled: ReadonlySet<number>
}

function ChampRow({ profile: p, sortMode, rowByChampSlot, substatColors, useStatButtonColors, soldSlots, effectivelyFilled }: ChampRowProps) {
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
        soldSlots={soldSlots}
      />
      {/* Missing count for the active sort dimension (red, tabular). */}
      <Typography sx={{
        fontSize: '0.65rem', color: 'error.main',
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        -{missingCount(p, slots, effectivelyFilled)}
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
  /** Champion-id → set of slots whose equipped piece would be sold (empty map when sim is off). */
  soldSlotsByChamp: ReadonlyMap<number, ReadonlySet<number>>
  /** Whether the simulate-sold toggle is currently engaged. */
  simulateSold: boolean
}

function LocationTable({ profiles, title, sortMode, rowByChampSlot, substatColors, useStatButtonColors, soldSlotsByChamp, simulateSold }: LocationTableProps) {
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
          {profiles.map((p) => {
            // Compute per-champion derived sets once per render. EMPTY_SET sentinel keeps
            // the SlotGrid prop type non-optional without per-cell allocations when sim is off.
            const soldSlots = soldSlotsByChamp.get(p.championId) ?? EMPTY_SLOT_SET
            const effectivelyFilled = effectiveFilledSlots(p, soldSlotsByChamp, simulateSold)
            return (
              <ChampRow
                key={p.championId}
                profile={p}
                sortMode={sortMode}
                rowByChampSlot={rowByChampSlot}
                substatColors={substatColors}
                useStatButtonColors={useStatButtonColors}
                // When sim is off, soldSlots is the empty sentinel and the grid renders normally.
                soldSlots={simulateSold ? soldSlots : EMPTY_SLOT_SET}
                effectivelyFilled={effectivelyFilled}
              />
            )
          })}
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
  const [simulateSold, setSimulateSold] = useState<boolean>(readSimulateSold)

  useEffect(() => { localStorage.setItem(LS_SORT_MODE, sortMode) }, [sortMode])
  useEffect(() => { localStorage.setItem(LS_SIMULATE_SOLD, simulateSold ? '1' : '0') }, [simulateSold])
  // Restore factory defaults when the parent increments resetKey.
  // "Adjust state directly during render" pattern avoids the one-render delay of useEffect.
  const [prevResetKey, setPrevResetKey] = useState<number | undefined>(resetKey)
  if (prevResetKey !== resetKey && resetKey !== undefined) {
    setPrevResetKey(resetKey)
    setSortMode(DEFAULT_SORT_MODE)
    setSimulateSold(DEFAULT_SIMULATE_SOLD)
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

  // Build (championId → set of slots whose equipped piece would be sold). The map
  // is keyed on rows regardless of the toggle so the React Hook deps stay simple;
  // callers gate use of the map on `simulateSold`.
  const soldSlotsByChamp = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const row of rows) {
      const { equippedToChampionId, slot } = row.artifact
      // Only equipped rows can have a "sold slot" — unequipped gear has no host champion.
      if (equippedToChampionId === null) continue
      // Outcome 'sell' is the canonical sell classification (see lib/gearAnalytics rowOutcome).
      if (rowOutcome(row) !== 'sell') continue
      let set = map.get(equippedToChampionId)
      if (!set) { set = new Set<number>(); map.set(equippedToChampionId, set) }
      set.add(Number(slot))
    }
    return map
  }, [rows])

  // Build profiles: champions with at least one missing slot — using the simulation-
  // adjusted "effective filled" set so that toggling sim adds/removes champions naturally.
  const notEquipped = useMemo(() => {
    const profiles = buildChampionGearProfiles(rows)
    return profiles.filter((p) => {
      const eff = effectiveFilledSlots(p, soldSlotsByChamp, simulateSold)
      return missingCount(p, SLOT_GRID, eff) > 0
    })
  }, [rows, soldSlotsByChamp, simulateSold])

  // Sort: 'off' = radar tiebreaker; 'rank' = in-game roster comparator;
  // others = most missing in that slot group first (also honors sim via effective filled).
  const sorted = useMemo(() => {
    const copy = [...notEquipped]
    if (sortMode === 'off') {
      copy.sort(champProfileTiebreaker)
    } else if (sortMode === 'rank') {
      copy.sort(champProfileRankComparator)
    } else {
      const slots = SORT_SLOTS[sortMode]
      copy.sort((a, b) => {
        const da = missingCount(a, slots, effectiveFilledSlots(a, soldSlotsByChamp, simulateSold))
        const db = missingCount(b, slots, effectiveFilledSlots(b, soldSlotsByChamp, simulateSold))
        return db !== da ? db - da : champProfileTiebreaker(a, b)
      })
    }
    return copy
  }, [notEquipped, sortMode, soldSlotsByChamp, simulateSold])

  const collection = useMemo(() => sorted.filter((p) => p.location === 'collection'), [sorted])
  const vault      = useMemo(() => sorted.filter((p) => p.location === 'vault'),      [sorted])

  if (collection.length === 0 && vault.length === 0) return null

  const tableProps = {
    sortMode,
    rowByChampSlot,
    substatColors,
    useStatButtonColors: statButtonBorders,
    soldSlotsByChamp,
    simulateSold,
  }

  return (
    <Box>
      {/* Title row — chevron toggles collapse; tooltip on the label for legend context. */}
      <GearAnalyticsChartHeader title={t('gearAnalyticsNotEquippedTitle')} description={t('gearAnalyticsNotEquippedTitleDesc')} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <Collapse in={!collapsed} timeout="auto">
      {/* Controls row: Sort label + mode group, then the simulate-sold toggle on the right. */}
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
          {/* In-game roster order; uses the dedicated champProfileRankComparator. */}
          <ToggleButton value="rank" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsSlotModeRank')}
          </ToggleButton>
        </ToggleButtonGroup>
        {/* Standalone single-button toggle for the simulate-sold overlay. */}
        <Tooltip title={t('gearAnalyticsSimulateSoldDesc')} placement="top" arrow>
          <ToggleButtonGroup
            size="small"
            value={simulateSold ? ['on'] : []}
            onChange={() => setSimulateSold((v) => !v)}
            sx={{ ml: 0.5 }}
          >
            <ToggleButton value="on" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
              {t('gearAnalyticsSimulateSoldLabel')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Tooltip>
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
