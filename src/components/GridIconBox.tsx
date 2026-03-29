import { Box } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import { createElement, type MouseEvent, type ReactNode } from 'react'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon } from './SetIcon'
import { WithSetTooltip } from './SetTooltip'
import { ACCESSORY_NO_SET_ID } from '../lib/constants'
import { gearSetSlotIconUrl } from '../lib/iconMaps/setSlotIconMap'
import type { ArtifactSetId, ArtifactTypeId, FactionId, RankValue } from '../lib/types'
import { ArtifactSet } from '../lib/types'
import { resolveRarityAccentColor } from '../lib/rarityColors'
// MarkdownTooltip keeps reroll/outcome/tooltips consistent with the new global styling.
import MarkdownTooltip from './MarkdownTooltip'

const GRID_ICON_BOX_SIZE_PX = 88
const GRID_ICON_BORDER_RADIUS_PX = 8
const GRID_ICON_BORDER_WIDTH_PX = 2
// 2-chip stacked overlay positions (improvement chance + substat rating).
const STACKED_OVERLAY_TOP_Y_PERCENT = 23
const STACKED_OVERLAY_CENTER_Y_PERCENT = 53
// 3-chip stacked overlay positions (adds safeguard rank as third slot).
const TRIPLE_OVERLAY_TOP_Y_PERCENT = 20
const TRIPLE_OVERLAY_CENTER_Y_PERCENT = 50
const TRIPLE_OVERLAY_BOTTOM_Y_PERCENT = 80

const ACCESSORY_BADGED_SET_IDS = new Set<number>([
  ArtifactSet.Refresh,
  ArtifactSet.Cleansing,
  ArtifactSet.Bloodshield,
  ArtifactSet.Reaction,
  ArtifactSet.Revenge,
].map(Number))

type OutcomeIndicatorProps = {
  tone: string
  glyph: ReactNode
  label?: string
  canJump?: boolean
  onClick?: (() => void)
  inactive?: boolean
}

// Chip overlay shape — each chip can carry its own tooltip, isolated from the card icon tooltip.
type OverlayChip = {
  text: string
  color?: string
  onClick?: () => void
  // Per-chip tooltip content — shown when hovering this chip only.
  // When render is provided it takes priority over markdown (same as MarkdownTooltip behavior).
  tooltipMarkdown?: string
  tooltipRender?: ReactNode
}

type GridIconBoxProps = {
  setId?: ArtifactSetId | number
  slotId: ArtifactTypeId | number
  factionId?: FactionId | number | null
  rarity?: RankValue | number
  rank?: RankValue | number
  ascensionRolls?: number | null | undefined
  setLabel?: string
  setTooltipName?: string | null | undefined
  slotLabel?: string
  outcome?: OutcomeIndicatorProps
  rerollLabel?: string | undefined
  rerollTooltip?: string | undefined
  levelLabel?: string | undefined
  size?: number
  showRankStarsBackground?: boolean
  // Plain-text gear hover content shown when hovering the icon (not chips).
  // Chips have their own isolated tooltips via tooltipMarkdown/tooltipRender on OverlayChip.
  gearTooltip?: string | null
  // Rich render node for the gear icon hover tooltip (e.g. an improvement-chance breakdown).
  // When set, takes priority over gearTooltip plain text (same as MarkdownTooltip render priority).
  gearTooltipRender?: ReactNode
  // Substat rating chip — bottom slot in triple mode, center in single/double.
  centerOverlay?: OverlayChip | null
  // Improvement chance chip — top slot in all modes.
  topOverlay?: OverlayChip | null
  // Safeguard rank chip — center slot in triple mode, collapses to center in single/double.
  bottomOverlay?: OverlayChip | null
  // How many overlay TYPES are globally toggled on.
  // Determines chip size and Y positions so every card in the grid is visually consistent,
  // regardless of which individual chips have data for a given card.
  // 1 → large chip at 50%; 2 → medium chips at 23%/53%; 3 → small chips at 20%/50%/80%.
  overlaySlotCount?: 1 | 2 | 3
}

/**
 * Module-level wrapper that resolves the slot icon by type ID.
 * Uses createElement instead of JSX so the lint rule does not flag the dynamic lookup as
 * "component created during render" — the underlying icons are pre-built module-level singletons.
 */
function SlotIconByType({ slotId }: { slotId: ArtifactTypeId | number }) {
  const Icon = artifactTypeIconFor(slotId as ArtifactTypeId)
  if (!Icon) return null
  return createElement(Icon, { fontSize: 'inherit' })
}

export default function GridIconBox({
  setId,
  slotId,
  factionId,
  rarity,
  rank,
  ascensionRolls,
  setLabel,
  setTooltipName,
  slotLabel,
  outcome,
  rerollLabel,
  rerollTooltip,
  levelLabel,
  size = GRID_ICON_BOX_SIZE_PX,
  showRankStarsBackground = true,
  gearTooltip,
  gearTooltipRender,
  centerOverlay,
  topOverlay,
  bottomOverlay,
  overlaySlotCount = 1,
}: GridIconBoxProps) {
  const theme = useTheme()
  const slotArtSrc = gearSetSlotIconUrl(
    setId,
    slotId,
    factionId != null ? { factionId } : undefined,
  )
  const normalizedSetLabel = typeof setLabel === 'string' && setLabel.trim().length > 0 ? setLabel : undefined
  const normalizedSetTooltipName = typeof setTooltipName === 'string' && setTooltipName.trim().length > 0 ? setTooltipName : undefined
  const setIconLabel = normalizedSetLabel ?? normalizedSetTooltipName ?? null
  const borderColor = resolveRarityAccentColor(rarity) ?? theme.palette.divider
  const numericRank = Math.max(0, Math.min(6, Math.round(Number(rank) || 0)))
  const ascensionStars = Math.max(0, Math.min(numericRank, Math.round(Number(ascensionRolls) || 0)))
  const hasRealSet = Number.isFinite(Number(setId)) && Number(setId) > 0
  // Check if a fallback slot icon exists (used when no set-specific art is available).
  const hasSlotIcon = artifactTypeIconFor(slotId as ArtifactTypeId) != null

  // Derive Y positions and font sizing from the global slot count — not from per-card data presence.
  // This ensures chips sit at the same position across all cards in the grid.
  const isTriple = overlaySlotCount === 3
  const isStacked = overlaySlotCount >= 2
  const topY    = isTriple ? TRIPLE_OVERLAY_TOP_Y_PERCENT    : STACKED_OVERLAY_TOP_Y_PERCENT
  const centerY = isTriple ? TRIPLE_OVERLAY_CENTER_Y_PERCENT : (isStacked ? STACKED_OVERLAY_CENTER_Y_PERCENT : 50)
  const bottomY = TRIPLE_OVERLAY_BOTTOM_Y_PERCENT
  // Font size shrinks as more chips compete for vertical space.
  const chipFontSizePx = (slots: 1 | 2 | 3) =>
    slots === 3 ? Math.min(12, Math.max(10, Math.round(size * 0.21)))
  : slots === 2 ? Math.min(13, Math.max(10, Math.round(size * 0.25)))
  :               Math.min(16, Math.max(13, Math.round(size * 0.34)))
  const chipFontSize = theme.typography.pxToRem(chipFontSizePx(overlaySlotCount))
  const chipPx = isStacked ? 0.65 : 0.85
  const chipPy = isStacked ? 0.2 : 0.35
  const chipLineHeight = isStacked ? 1.05 : 1.1
  const chipLetterSpacing = isStacked ? 0.15 : 0.2

  const slotVisualNode = slotArtSrc ? (
    <Box
      sx={{
        color: 'text.primary',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'inherit',
        overflow: 'hidden',
        width: '100%',
        flex: '1 0 auto',
      }}
    >
      <Box
        component="img"
        src={slotArtSrc}
        alt={normalizedSetLabel || slotLabel || normalizedSetTooltipName || ''}
        draggable={false}
        onDragStart={(event) => { event.preventDefault(); event.stopPropagation() }}
        sx={{
          width: `calc(100% + ${GRID_ICON_BORDER_WIDTH_PX}px)`,
          height: `calc(100% + ${GRID_ICON_BORDER_WIDTH_PX}px)`,
          maxWidth: 'none',
          maxHeight: 'none',
          margin: `-${GRID_ICON_BORDER_WIDTH_PX}px`,
          objectFit: 'cover',
          userSelect: 'none',
          WebkitUserDrag: 'none',
        }}
      />
    </Box>
  ) : hasSlotIcon ? (
    <Box sx={{ color: 'text.primary', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', flex: '1 0 auto' }}>
      <Box sx={{ fontSize: '3.25rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SlotIconByType slotId={slotId} />
      </Box>
    </Box>
  ) : null
  const setIconContent = (
    <Box
      sx={{
        position: 'absolute',
        left: -10,
        bottom: -10,
        bgcolor: 'background.paper',
        borderRadius: 1,
        p: 0.25,
        boxShadow: 2,
        border: '2px solid',
        borderColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
      }}
    >
      <SetIcon
        setId={setId as ArtifactSetId}
        size={20}
        sx={{ mr: 0, display: 'block' }}
        {...(setIconLabel ? { label: setIconLabel } : {})}
      />
    </Box>
  )
  const tooltipProps = normalizedSetLabel ? { displayName: normalizedSetLabel, showName: true } : undefined
  const setIconOverlay = hasRealSet && !slotArtSrc ? (
    normalizedSetTooltipName ? (
      <WithSetTooltip name={normalizedSetTooltipName} {...(tooltipProps ?? {})}>
        {setIconContent}
      </WithSetTooltip>
    ) : setIconContent
  ) : null
  const rerollNode = rerollLabel ? (
    // Render reroll explanations via MarkdownTooltip so long translations wrap cleanly.
    <MarkdownTooltip markdown={rerollTooltip ?? ''}>
      <Box
        sx={{
          position: 'absolute',
          right: -8,
          top: -8,
          bgcolor: 'background.paper',
          borderRadius: '50%',
          width: 16,
          height: 16,
          boxShadow: 2,
          border: '2px solid',
          borderColor,
          fontSize: '0.65rem',
          fontWeight: 600,
          color: 'text.primary',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {rerollLabel}
      </Box>
    </MarkdownTooltip>
  ) : null
  const levelNode = levelLabel ? (
    <Box
      sx={{
        position: 'absolute',
        right: -10,
        bottom: -10,
        bgcolor: 'background.paper',
        borderRadius: 1,
        px: 0.75,
        py: 0.25,
        boxShadow: 2,
        border: '2px solid',
        borderColor,
        fontSize: '0.7rem',
        fontWeight: 600,
        color: 'text.primary',
      }}
    >
      {levelLabel}
    </Box>
  ) : null
  const noSetBadgeSrc = gearSetSlotIconUrl(
    ACCESSORY_NO_SET_ID,
    slotId,
    factionId != null ? { factionId } : undefined,
  )
  const accessoryBadge = slotArtSrc && noSetBadgeSrc && ACCESSORY_BADGED_SET_IDS.has(Number(setId)) ? (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: 24,
        height: 24,
        borderRadius: 3,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <Box
        component="img"
        src={noSetBadgeSrc}
        alt=""
        draggable={false}
        onDragStart={(event) => { event.preventDefault(); event.stopPropagation() }}
        sx={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 36,
          height: 36,
          objectFit: 'none',
          objectPosition: 'left bottom',
          transform: 'scale(0.6666667)',
          transformOrigin: 'left bottom',
          userSelect: 'none',
          WebkitUserDrag: 'none',
        }}
      />
    </Box>
  ) : null

  const outcomeNode = outcome && outcome.glyph ? (
    // Outcome chips may carry multi-line text; MarkdownTooltip keeps the formatting consistent.
    <MarkdownTooltip markdown={outcome.label ?? ''}>
      <Box
        component={outcome.canJump && !outcome.inactive ? 'button' : 'div'}
        type={outcome.canJump && !outcome.inactive ? 'button' : undefined}
        onClick={outcome.canJump && !outcome.inactive ? outcome.onClick : undefined}
        sx={{
          position: 'absolute',
          left: -8,
          top: -8,
          width: 16,
          height: 16,
          borderRadius: '50%',
          bgcolor: 'background.paper',
          border: '2px solid',
          borderColor: outcome.tone,
          color: outcome.tone,
          boxShadow: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '0.55rem',
          // Frozen rebuilds keep the badge visible but low-opacity + read-only.
          opacity: outcome.inactive ? 0.45 : 1,
          cursor: outcome.canJump && !outcome.inactive ? 'pointer' : undefined,
        }}
      >
        {outcome.glyph}
      </Box>
    </MarkdownTooltip>
  ) : null

  const hasCenterOverlay = typeof centerOverlay?.text === 'string' && centerOverlay.text.trim().length > 0
  const hasTopOverlay = typeof topOverlay?.text === 'string' && topOverlay.text.trim().length > 0
  const hasBottomOverlay = typeof bottomOverlay?.text === 'string' && bottomOverlay.text.trim().length > 0

  // Shared chip style shared across all three overlay slots for visual consistency.
  const overlayChipSx = (color: string | undefined, _clickable: boolean, yPercent: number) => ({
    position: 'absolute' as const,
    left: '50%',
    top: `${yPercent}%`,
    transform: 'translate(-50%, -50%)',
    px: chipPx,
    py: chipPy,
    borderRadius: 6,
    border: '1px solid',
    borderColor: color ?? alpha(theme.palette.text.primary, isStacked ? 0.5 : 0.55),
    backgroundColor: alpha(theme.palette.background.paper, 0.9),
    color: color ?? theme.palette.text.primary,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: chipFontSize,
    lineHeight: chipLineHeight,
    letterSpacing: chipLetterSpacing,
    boxShadow: theme.shadows[2],
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  })

  // Build a positioned overlay chip, optionally wrapped in MarkdownTooltip when tooltip data is present.
  // Each chip intercepts its own hover events so the gear icon tooltip only fires in the gaps.
  const buildChipNode = (
    chip: OverlayChip | null | undefined,
    hasContent: boolean,
    yPercent: number,
  ): ReactNode => {
    if (!hasContent || !chip) return null
    const clickable = Boolean(chip.onClick)
    const hasTooltip = Boolean(chip.tooltipMarkdown) || Boolean(chip.tooltipRender)
    const chipEl = (
      <Box
        component={clickable ? 'button' : 'div'}
        type={clickable ? 'button' : undefined}
        onClick={clickable
          ? (event: MouseEvent<HTMLButtonElement>) => {
              // Prevent overlay clicks from bubbling to underlying card interactions.
              event.stopPropagation()
              chip.onClick?.()
            }
          : undefined}
        sx={{
          ...overlayChipSx(chip.color, clickable, yPercent),
          // Chips with click or tooltip must accept pointer events; pure display chips pass through.
          pointerEvents: (clickable || hasTooltip) ? 'auto' : 'none',
          cursor: clickable ? 'pointer' : 'default',
          ...(clickable ? { appearance: 'none', fontFamily: 'inherit' } : {}),
        }}
      >
        {chip.text}
      </Box>
    )
    // When this chip has tooltip content, wrap it — the chip stays isolated from the card icon tooltip.
    if (hasTooltip) {
      return (
        <MarkdownTooltip
          markdown={chip.tooltipMarkdown ?? ''}
          {...(chip.tooltipRender !== undefined ? { render: chip.tooltipRender } : {})}
        >
          {chipEl}
        </MarkdownTooltip>
      )
    }
    return chipEl
  }

  const centerOverlayNode = buildChipNode(centerOverlay, hasCenterOverlay, centerY)
  const topOverlayNode = buildChipNode(topOverlay, hasTopOverlay, topY)

  // Bottom chip renders whenever it has data; in triple mode it sits at the 80% position,
  // otherwise it collapses into the center Y position (53% for 2-slot, 50% for single).
  // This allows the safeguard rank chip to appear independently without requiring all 3 overlays.
  const bottomEffectiveY = isTriple ? bottomY : centerY
  const bottomOverlayNode = buildChipNode(bottomOverlay, hasBottomOverlay, bottomEffectiveY)

  const iconNode = (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${GRID_ICON_BORDER_RADIUS_PX}px`,
        border: `${GRID_ICON_BORDER_WIDTH_PX}px solid`,
        borderColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        bgcolor: theme.palette.background.default,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {numericRank > 0 ? (
        <Box
          sx={{
            position: 'absolute',
            top: -10,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            pointerEvents: 'none',
            px: 1,
            py: 0.25,
            background: showRankStarsBackground ? 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0))' : undefined,
          }}
        >
          {Array.from({ length: numericRank }, (_, i) => i).map((starPos) => (
            <StarRoundedIcon
              key={`rank-star-${starPos}`}
              sx={{
                fontSize: '0.95rem',
                color: starPos < ascensionStars ? '#a855f7' : '#fcd34d',
                ml: starPos === 0 ? 0 : '-6px',
              }}
            />
          ))}
        </Box>
      ) : null}
      {slotVisualNode}
      {accessoryBadge}
      {setIconOverlay}
      {rerollNode}
      {levelNode}
      {outcomeNode}
      {/* Transparent catch-all behind chips — captures gear tooltip hover in non-chip areas.
          Must be before chips in the DOM so chips (which are later = higher z-stacking) sit on top
          and intercept their own hover events, isolating per-chip tooltips from this one. */}
      {(gearTooltip || gearTooltipRender) && (
        <MarkdownTooltip
          markdown={gearTooltip ?? ''}
          {...(gearTooltipRender !== undefined ? { render: gearTooltipRender } : {})}
        >
          <Box sx={{ position: 'absolute', inset: 0 }} />
        </MarkdownTooltip>
      )}
      {topOverlayNode}
      {centerOverlayNode}
      {bottomOverlayNode}
    </Box>
  )
  return iconNode
}

export {
  GRID_ICON_BOX_SIZE_PX,
}
