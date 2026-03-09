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
// Stacked overlay chips need breathing room so chance + rating remain visually distinct.
const STACKED_OVERLAY_TOP_Y_PERCENT = 23
const STACKED_OVERLAY_CENTER_Y_PERCENT = 53

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
  gearTooltip?: string | null
  centerOverlay?: {
    // Overlay text rendered at the visual center of the icon (e.g., normalized scores).
    text: string
    // Accent color applied to the overlay text + border; callers supply a range-mapped color.
    color?: string
  } | null
  topOverlay?: {
    // Secondary overlay text shown above center (for stacked overlay signals).
    text: string
    // Accent color applied to the overlay text + border; callers supply a range-mapped color.
    color?: string
    // Optional tooltip copy rendered on hover.
    tooltipMarkdown?: string
    // Optional rich tooltip content; when present it takes precedence over markdown text.
    tooltipRender?: ReactNode
    // Optional click-through action (used by safeguard chance overlay navigation).
    onClick?: () => void
  } | null
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
  centerOverlay,
  topOverlay,
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
  // When both overlays are enabled, keep both chips compact so they can stack cleanly.
  const stackedOverlayMode = hasCenterOverlay && hasTopOverlay

  const centerOverlayNode = hasCenterOverlay ? (
    <Box
      // Overlay is informational; keep it click-through so existing icon tooltips/interactions win.
      sx={(theme) => {
        // Single-overlay mode mirrors the larger rating chip; stacked mode mirrors the compact chance chip.
        const compact = stackedOverlayMode
        const overlayY = compact ? `${STACKED_OVERLAY_CENTER_Y_PERCENT}%` : '50%'
        return {
          position: 'absolute',
          left: '50%',
          top: overlayY,
          transform: 'translate(-50%, -50%)',
          px: compact ? 0.65 : 0.85,
          py: compact ? 0.2 : 0.35,
          borderRadius: 6,
          border: '1px solid',
          borderColor: centerOverlay?.color ?? alpha(theme.palette.text.primary, compact ? 0.5 : 0.55),
          backgroundColor: alpha(theme.palette.background.paper, 0.9),
          color: centerOverlay?.color ?? theme.palette.text.primary,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          fontSize: theme.typography.pxToRem(
            compact
              ? Math.min(13, Math.max(10, Math.round(size * 0.25)))
              : Math.min(16, Math.max(13, Math.round(size * 0.34))),
          ),
          lineHeight: compact ? 1.05 : 1.1,
          letterSpacing: compact ? 0.15 : 0.2,
          boxShadow: theme.shadows[2],
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }
      }}
    >
      {centerOverlay?.text}
    </Box>
  ) : null
  const topOverlayClickable = Boolean(topOverlay?.onClick)
  const topOverlayTooltip = typeof topOverlay?.tooltipMarkdown === 'string' ? topOverlay.tooltipMarkdown.trim() : ''
  const topOverlayHasRenderTooltip = topOverlay?.tooltipRender != null
  const topOverlayInteractive = topOverlayClickable || topOverlayTooltip.length > 0 || topOverlayHasRenderTooltip
  const topOverlayNode = hasTopOverlay ? (
    <Box
      component={topOverlayClickable ? 'button' : 'div'}
      type={topOverlayClickable ? 'button' : undefined}
      onClick={topOverlayClickable
        ? (event: MouseEvent<HTMLButtonElement>) => {
            // Keep overlay clicks from triggering underlying card interactions.
            event.stopPropagation()
            topOverlay.onClick?.()
          }
        : undefined}
      sx={(theme) => {
        // If chance is the only overlay, render it with the same prominent style as the rating chip.
        const prominent = !stackedOverlayMode
        const overlayY = prominent ? '50%' : `${STACKED_OVERLAY_TOP_Y_PERCENT}%`
        return {
          position: 'absolute',
          left: '50%',
          top: overlayY,
          transform: 'translate(-50%, -50%)',
          px: prominent ? 0.85 : 0.65,
          py: prominent ? 0.35 : 0.2,
          borderRadius: 6,
          border: '1px solid',
          borderColor: topOverlay?.color ?? alpha(theme.palette.text.primary, prominent ? 0.55 : 0.5),
          backgroundColor: alpha(theme.palette.background.paper, 0.9),
          color: topOverlay?.color ?? theme.palette.text.primary,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          fontSize: theme.typography.pxToRem(
            prominent
              ? Math.min(16, Math.max(13, Math.round(size * 0.34)))
              : Math.min(13, Math.max(10, Math.round(size * 0.25))),
          ),
          lineHeight: prominent ? 1.1 : 1.05,
          letterSpacing: prominent ? 0.2 : 0.15,
          boxShadow: theme.shadows[2],
          pointerEvents: topOverlayInteractive ? 'auto' : 'none',
          cursor: topOverlayClickable ? 'pointer' : (topOverlayInteractive ? 'help' : 'default'),
          userSelect: 'none',
          whiteSpace: 'nowrap',
          // Reset native button chrome so clickable overlays keep visual parity.
          appearance: 'none',
          fontFamily: 'inherit',
        }
      }}
    >
      {topOverlay.text}
    </Box>
  ) : null
  const topOverlayWrappedNode = topOverlayNode && (topOverlayTooltip.length > 0 || topOverlayHasRenderTooltip)
    ? (
      // Tooltip exposes chance-calculation context without adding permanent card clutter.
      <MarkdownTooltip markdown={topOverlayTooltip} render={topOverlay?.tooltipRender}>
        {topOverlayNode}
      </MarkdownTooltip>
    )
    : topOverlayNode

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
      {topOverlayWrappedNode}
      {centerOverlayNode}
    </Box>
  )
  if (gearTooltip) {
    // Gear hover copy runs through MarkdownTooltip so translations keep the shared delay + styling.
    return (
      <MarkdownTooltip markdown={gearTooltip}>
        {iconNode}
      </MarkdownTooltip>
    )
  }
  return iconNode
}

export {
  GRID_ICON_BOX_SIZE_PX,
}
