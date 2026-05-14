/**
 * GearAnalyticsNotEquipped.tsx
 *
 * Two compact tables (Collection / Vault, stacked) of champions and their gear-slot
 * coverage. By default only champions with at least one empty slot are listed; the
 * "Show fully equipped" toggle expands the view to every champion.
 *
 * Layout: champions flow into a column-grid — ROWS_PER_COL rows per column,
 * then wrap horizontally.  A horizontal scrollbar appears when more columns
 * than fit in the container.
 *
 * Sort control (ToggleButtonGroup): By rank (default) / All / Artifacts / Accessories.
 * Simulate-sold toggle: treats every equipped piece the rules would sell as if its
 * slot were empty — slot cells turn red and missing counts grow.
 * Show-fully-equipped toggle: also lists champions whose available slots are all filled.
 *
 * Grid cells:  ■ primary  = slot equipped (kept)
 *              ■ error    = slot equipped but would be sold (only when sim is on)
 *              □ outline  = slot empty
 *              □ dashed   = slot locked (champion ascension level too low)
 *
 * Hovering a filled cell shows the equipped gear piece via GearInspectorGridCard.
 */
import { useMemo, useState, useEffect, useCallback } from 'react'
import { Box, Collapse, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from '@mui/material'
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import {
  buildChampionGearProfiles,
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

/** Controls champion sort order. 'rank' = in-game default roster order
 *  (used as the natural/default ordering); others = sort by missing count
 *  for that slot group (most missing first). */
type SortMode = 'rank' | 'all' | 'artifacts' | 'accessories'

const LS_SORT_MODE = 'gearAnalytics.visibleChampionsSortMode'
const DEFAULT_SORT_MODE: SortMode = 'rank'

function readSortMode(): SortMode {
  const v = localStorage.getItem(LS_SORT_MODE)
  // Migration: legacy 'off' value falls through to the new default ('rank') —
  // the old 'off' mode used a similar (but not identical) tiebreaker and is
  // intentionally retired in favor of the more accurate 'rank' comparator.
  if (v === 'rank' || v === 'all' || v === 'artifacts' || v === 'accessories') return v
  return DEFAULT_SORT_MODE
}

// ── Simulate-sold toggle ──────────────────────────────────────────────────────

/** Persisted on/off state for the "simulate sold gear" overlay. */
const LS_SIMULATE_SOLD = 'gearAnalytics.visibleChampionsSimulateSold'
const DEFAULT_SIMULATE_SOLD = false

function readSimulateSold(): boolean {
  return localStorage.getItem(LS_SIMULATE_SOLD) === '1'
}

// ── Show-fully-equipped toggle ────────────────────────────────────────────────

/** Persisted on/off state for the "show fully equipped champions" expansion. */
const LS_SHOW_FULLY_EQUIPPED = 'gearAnalytics.visibleChampionsShowFullyEquipped'
const DEFAULT_SHOW_FULLY_EQUIPPED = false

function readShowFullyEquipped(): boolean {
  return localStorage.getItem(LS_SHOW_FULLY_EQUIPPED) === '1'
}

/** Slot list used for sorting and the missing count badge per sort mode.
 *  'rank' has no slot-group constraint — it sorts by ascension/rarity tiebreakers. */
const SORT_SLOTS: Readonly<Record<SortMode, readonly number[]>> = {
  rank:        SLOT_GRID,
  all:         SLOT_GRID,
  artifacts:   MAIN_ARMOR_SLOTS,
  accessories: ACCESSORY_SLOTS,
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
    (s) => isSlotAvailableAtAscensionLevel(s, p.champion.ascensionLevel) && !effectivelyFilled.has(s),
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
  const sold = soldSlotsByChamp.get(p.champion.id)
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
  const src = championIconUrl(profile.champion.baseHeroId ?? profile.champion.id)
  const borderColor = resolveRarityAccentColor(profile.champion.rarity ?? 0) ?? theme.palette.divider
  return (
    <Box sx={{
      width: AVATAR_SIZE, height: AVATAR_SIZE, flexShrink: 0,
      borderRadius: `${CHAMPION_ICON_BORDER_RADIUS_PX}px`,
      border: '1.5px solid', borderColor, overflow: 'hidden',
      bgcolor: src ? 'transparent' : `color-mix(in srgb, ${borderColor} 14%, transparent)`,
    }}>
      {src
        ? <Box component="img" src={src} alt={profile.champion.name ?? String(profile.champion.id)} draggable={false}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', userSelect: 'none' }} />
        : <Typography sx={{ fontSize: AVATAR_SIZE * 0.5, fontWeight: 700, color: borderColor, lineHeight: `${AVATAR_SIZE}px`, textAlign: 'center', width: '100%' }}>
            {profile.champion.name ?? String(profile.champion.id).charAt(0).toUpperCase()}
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
  /** Shared Gear Inspector selection — used to highlight filled slots whose
   *  artifact id is in the selection set. Empty sentinel when parent didn't wire selection. */
  selectedArtifactIds: ReadonlySet<number>
  /** Click handler invoked with the row's artifact id when a filled slot is clicked.
   *  Undefined when selection wiring isn't provided — the grid stays read-only. */
  onToggleArtifactSelection: ((artifactId: number) => void) | undefined
}

function SlotGrid({ profile, rowByChampSlot, substatColors, useStatButtonColors, soldSlots, selectedArtifactIds, onToggleArtifactSelection }: SlotGridProps) {
  const { t } = useI18n()
  const theme = useTheme()
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
        const available = isSlotAvailableAtAscensionLevel(slotId, profile.champion.ascensionLevel)
        // Sold simulation only matters for currently-equipped slots; otherwise nothing to sell.
        const wouldSell = filled && soldSlots.has(slotId)
        // Resolve the equipped row once — both selection state and tooltip preview need it.
        const previewRow = filled ? rowByChampSlot.get(`${profile.champion.id}_${slotId}`) : undefined
        const artifactId = previewRow?.artifact.id ?? null
        // A slot is "selected" only if its underlying artifact id appears in the shared selection set.
        const selected = artifactId !== null && selectedArtifactIds.has(artifactId)
        const clickable = filled && available && artifactId !== null && onToggleArtifactSelection !== undefined
        // Click toggles selection. stopPropagation keeps tooltip wrappers from swallowing it.
        const handleClick: React.MouseEventHandler<HTMLDivElement> | undefined = clickable
          ? (e) => { e.stopPropagation(); onToggleArtifactSelection!(artifactId!) }
          : undefined

        // Four visual states — sort mode has no effect on the grid display:
        //   filled+kept → primary.main solid (slot has gear that stays)
        //   filled+sell → error.main solid   (sim is on; this piece would be sold)
        //   available   → neutral outline    (slot is empty but can be filled)
        //   locked      → very dim, no border (slot not yet unlocked for this ascension level)
        // Selection adds a yellow `outline` (warning.main) so it composes with any of the
        // four bg/border states above without changing the cell's footprint.
        const cell = available
          ? (
            <Box
              onClick={handleClick}
              sx={{
                width: SLOT_CELL, height: SLOT_CELL,
                borderRadius: '2px', boxSizing: 'border-box',
                bgcolor: filled ? (wouldSell ? 'error.main' : 'primary.main') : 'transparent',
                border: '1px solid',
                borderColor: filled ? (wouldSell ? 'error.main' : 'primary.main') : 'text.secondary',
                opacity: filled ? 0.85 : 0.35,
                cursor: clickable ? 'pointer' : 'default',
                // Outline (not border) so layout stays stable across selection toggles.
                outline: selected ? `1.5px solid ${theme.palette.warning.main}` : 'none',
                outlineOffset: selected ? '1px' : 0,
              }}
            />
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
        // previewRow was already resolved above (also used for selection state).
        if (filled && available && previewRow) {
          return (
            <MarkdownTooltip
              key={slotId}
              render={<SlotCellPreview row={previewRow} substatColors={substatColors} useStatButtonColors={useStatButtonColors} />}
            >
              {cell}
            </MarkdownTooltip>
          )
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
  /** Shared Gear Inspector selection — forwarded straight to SlotGrid. */
  selectedArtifactIds: ReadonlySet<number>
  /** Toggle handler — undefined when selection wiring is absent. */
  onToggleArtifactSelection: ((artifactId: number) => void) | undefined
}

function ChampRow({ profile: p, sortMode, rowByChampSlot, substatColors, useStatButtonColors, soldSlots, effectivelyFilled, selectedArtifactIds, onToggleArtifactSelection }: ChampRowProps) {
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
      <EllipsisTooltip title={p.champion.name ?? String(p.champion.id)}>
        <Box component="span" sx={{
          display: 'block', width: NAME_W,
          fontSize: '0.72rem', lineHeight: `${ROW_H}px`,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {p.champion.name ?? String(p.champion.id)}
        </Box>
      </EllipsisTooltip>
      <SlotGrid
        profile={p}
        rowByChampSlot={rowByChampSlot}
        substatColors={substatColors}
        useStatButtonColors={useStatButtonColors}
        soldSlots={soldSlots}
        selectedArtifactIds={selectedArtifactIds}
        onToggleArtifactSelection={onToggleArtifactSelection}
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
  /** Shared Gear Inspector selection (artifact ids) for slot highlight. */
  selectedArtifactIds: ReadonlySet<number>
  /** Toggle handler — undefined when selection wiring is absent. */
  onToggleArtifactSelection: ((artifactId: number) => void) | undefined
}

function LocationTable({ profiles, title, sortMode, rowByChampSlot, substatColors, useStatButtonColors, soldSlotsByChamp, simulateSold, selectedArtifactIds, onToggleArtifactSelection }: LocationTableProps) {
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
            const soldSlots = soldSlotsByChamp.get(p.champion.id) ?? EMPTY_SLOT_SET
            const effectivelyFilled = effectiveFilledSlots(p, soldSlotsByChamp, simulateSold)
            return (
              <ChampRow
                key={p.champion.id}
                profile={p}
                sortMode={sortMode}
                rowByChampSlot={rowByChampSlot}
                substatColors={substatColors}
                useStatButtonColors={useStatButtonColors}
                // When sim is off, soldSlots is the empty sentinel and the grid renders normally.
                soldSlots={simulateSold ? soldSlots : EMPTY_SLOT_SET}
                effectivelyFilled={effectivelyFilled}
                selectedArtifactIds={selectedArtifactIds}
                onToggleArtifactSelection={onToggleArtifactSelection}
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
  /** Shared Gear Inspector selection — read to highlight slots whose equipped artifact id
   *  is currently selected. Optional: when absent the grid stays read-only with no highlight. */
  selectedGearItemIds?: ReadonlySet<number>
  /** Setter for the shared selection — when present, clicking a filled slot toggles the
   *  equipped artifact's id in the set. Same signature as Gear Inspector's handler. */
  onGearItemsSelect?: (next: ReadonlySet<number>) => void
}

export function GearAnalyticsNotEquipped({ rows, resetKey, collapsed, onToggleCollapse, selectedGearItemIds, onGearItemsSelect }: Props) {
  const { t } = useI18n()
  const [substatColors] = useSubstatColors()
  // useStatButtonColors drives substat chip coloring inside the gear preview card.
  const { statButtonBorders } = useDisplayPreferences()

  const [sortMode, setSortMode] = useState<SortMode>(readSortMode)
  const [simulateSold, setSimulateSold] = useState<boolean>(readSimulateSold)
  const [showFullyEquipped, setShowFullyEquipped] = useState<boolean>(readShowFullyEquipped)

  useEffect(() => { localStorage.setItem(LS_SORT_MODE, sortMode) }, [sortMode])
  useEffect(() => { localStorage.setItem(LS_SIMULATE_SOLD, simulateSold ? '1' : '0') }, [simulateSold])
  useEffect(() => { localStorage.setItem(LS_SHOW_FULLY_EQUIPPED, showFullyEquipped ? '1' : '0') }, [showFullyEquipped])
  // Restore factory defaults when the parent increments resetKey.
  // "Adjust state directly during render" pattern avoids the one-render delay of useEffect.
  const [prevResetKey, setPrevResetKey] = useState<number | undefined>(resetKey)
  if (prevResetKey !== resetKey && resetKey !== undefined) {
    setPrevResetKey(resetKey)
    setSortMode(DEFAULT_SORT_MODE)
    setSimulateSold(DEFAULT_SIMULATE_SOLD)
    setShowFullyEquipped(DEFAULT_SHOW_FULLY_EQUIPPED)
  }

  // Build (championId_slotId) → row lookup for filled-slot gear previews.
  const rowByChampSlot = useMemo(() => {
    const map = new Map<string, GearInspectorPreviewRow>()
    for (const row of rows) {
      const championId = row.artifact.equippedChampion?.id
      if (championId != null) {
        map.set(`${championId}_${Number(row.artifact.slot)}`, row)
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
      const championId = row.artifact.equippedChampion?.id
      // Only equipped rows can have a "sold slot" — unequipped gear has no host champion.
      if (championId == null) continue
      // Outcome 'sell' is the canonical sell classification (see lib/gearAnalytics rowOutcome).
      if (rowOutcome(row) !== 'sell') continue
      let set = map.get(championId)
      if (!set) { set = new Set<number>(); map.set(championId, set) }
      set.add(Number(row.artifact.slot))
    }
    return map
  }, [rows])

  // Build the visible-champion list. Three toggles compose:
  //   • showFullyEquipped = false (default) → only champions missing ≥1 slot are listed.
  //   • showFullyEquipped = true            → every champion appears (fully-equipped land
  //     at the end of missing-count sorts, with a -0 badge).
  // The simulation-adjusted "effective filled" set still drives the missing-count check,
  // so toggling simulate-sold can move champions between the two buckets naturally.
  const visibleChampions = useMemo(() => {
    const profiles = buildChampionGearProfiles(rows)
    if (showFullyEquipped) return profiles
    return profiles.filter((p) => {
      const eff = effectiveFilledSlots(p, soldSlotsByChamp, simulateSold)
      return missingCount(p, SLOT_GRID, eff) > 0
    })
  }, [rows, soldSlotsByChamp, simulateSold, showFullyEquipped])

  // Sort: 'rank' = in-game roster comparator (default); others = most missing in
  // that slot group first, with champProfileRankComparator as the tail tiebreaker so
  // groups of champs with equal missing counts still flow in the natural roster order.
  const sorted = useMemo(() => {
    const copy = [...visibleChampions]
    if (sortMode === 'rank') {
      copy.sort(champProfileRankComparator)
    } else {
      const slots = SORT_SLOTS[sortMode]
      copy.sort((a, b) => {
        const da = missingCount(a, slots, effectiveFilledSlots(a, soldSlotsByChamp, simulateSold))
        const db = missingCount(b, slots, effectiveFilledSlots(b, soldSlotsByChamp, simulateSold))
        return db !== da ? db - da : champProfileRankComparator(a, b)
      })
    }
    return copy
  }, [visibleChampions, sortMode, soldSlotsByChamp, simulateSold])

  const collection = useMemo(() => sorted.filter((p) => p.champion.location === 'collection'), [sorted])
  const vault      = useMemo(() => sorted.filter((p) => p.champion.location === 'vault'),      [sorted])

  // Selection plumbing: hooks must run on every render (rules-of-hooks) — declare them
  // before the early-return below. The toggle handler no-ops when onGearItemsSelect is
  // undefined; consumers gate on the resolved onToggleArtifactSelection.
  const selectedArtifactIds = selectedGearItemIds ?? EMPTY_SLOT_SET
  const handleToggleArtifactSelection = useCallback((artifactId: number) => {
    if (!onGearItemsSelect) return
    // Build a fresh set; selectedGearItemIds is treated as readonly by callers.
    const next = new Set<number>(selectedGearItemIds ?? EMPTY_SLOT_SET)
    if (next.has(artifactId)) next.delete(artifactId)
    else next.add(artifactId)
    onGearItemsSelect(next)
  }, [onGearItemsSelect, selectedGearItemIds])
  const handleClearSelection = useCallback(() => {
    onGearItemsSelect?.(new Set())
  }, [onGearItemsSelect])

  if (collection.length === 0 && vault.length === 0) return null

  // Resolve to undefined when no setter is wired so SlotGrid can skip click bindings entirely.
  const onToggleArtifactSelection = onGearItemsSelect ? handleToggleArtifactSelection : undefined
  // Show the clear button only when the parent wired selection AND something is selected.
  const canClearSelection = onGearItemsSelect !== undefined && selectedArtifactIds.size > 0

  const tableProps = {
    sortMode,
    rowByChampSlot,
    substatColors,
    useStatButtonColors: statButtonBorders,
    soldSlotsByChamp,
    simulateSold,
    selectedArtifactIds,
    onToggleArtifactSelection,
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
          {/* Default/natural order — in-game roster sort via champProfileRankComparator. */}
          <ToggleButton value="rank" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsSlotModeRank')}
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
        {/* Standalone single-button toggle that expands the list to include fully-equipped champions. */}
        <Tooltip title={t('gearAnalyticsShowFullyEquippedDesc')} placement="top" arrow>
          <ToggleButtonGroup
            size="small"
            value={showFullyEquipped ? ['on'] : []}
            onChange={() => setShowFullyEquipped((v) => !v)}
            sx={{ ml: 0.25 }}
          >
            <ToggleButton value="on" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
              {t('gearAnalyticsShowFullyEquippedLabel')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Tooltip>
        {/* Clear shared Gear Inspector selection. Hidden when no parent wired selection;
            disabled when nothing is selected. Same i18n key as the Gear Inspector footer button. */}
        {onGearItemsSelect && (
          <Tooltip title={t('gearInspectorSelectionClearAll')} placement="top" arrow>
            <span>
              <IconButton
                size="small"
                onClick={handleClearSelection}
                disabled={!canClearSelection}
                aria-label={t('gearInspectorSelectionClearAll')}
                sx={{ ml: 0.25 }}
              >
                <PlaylistRemoveIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
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
