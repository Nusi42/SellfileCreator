import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import type { ReactNode } from 'react'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon } from './SetIcon'
import { WithSetTooltip } from './SetTooltip'
import { ACCESSORY_NO_SET_ID } from '../lib/constants'
import { gearSetSlotIconUrl } from '../lib/iconMaps/setSlotIconMap'
import type { ArtifactSetId, ArtifactTypeId, FactionId, RankValue } from '../lib/types'
import { ArtifactSet } from '../lib/types'
// MarkdownTooltip keeps reroll/outcome/tooltips consistent with the new global styling.
import MarkdownTooltip from './MarkdownTooltip'

const GRID_ICON_BOX_SIZE_PX = 88
const GRID_ICON_BORDER_RADIUS_PX = 8
const GRID_ICON_BORDER_WIDTH_PX = 2

const RARITY_BORDER_COLORS: Record<number, string> = {
  1: '#9ca3af',
  2: '#34d399',
  3: '#60a5fa',
  4: '#7c3aed',
  5: '#f9a825',
  6: '#8b0000',
}

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
  const numericRarity = Number(rarity)
  const borderColor = RARITY_BORDER_COLORS[Number.isFinite(numericRarity) ? numericRarity : 0] ?? theme.palette.divider
  const numericRank = Math.max(0, Math.min(6, Math.round(Number(rank) || 0)))
  const ascensionStars = Math.max(0, Math.min(numericRank, Math.round(Number(ascensionRolls) || 0)))
  const hasRealSet = Number.isFinite(Number(setId)) && Number(setId) > 0
  const SlotIcon = artifactTypeIconFor(slotId as ArtifactTypeId)
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
  ) : SlotIcon ? (
    <Box sx={{ color: 'text.primary', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', flex: '1 0 auto' }}>
      <Box sx={{ fontSize: '3.25rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SlotIcon fontSize="inherit" />
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
        component={outcome.canJump ? 'button' : 'div'}
        type={outcome.canJump ? 'button' : undefined}
        onClick={outcome.canJump ? outcome.onClick : undefined}
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
          cursor: outcome.canJump ? 'pointer' : undefined,
        }}
      >
        {outcome.glyph}
      </Box>
    </MarkdownTooltip>
  ) : null

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
          {Array.from({ length: numericRank }).map((_, idx) => (
            <StarRoundedIcon
              key={`rank-star-${idx}`}
              sx={{
                fontSize: '0.95rem',
                color: idx < ascensionStars ? '#a855f7' : '#fcd34d',
                ml: idx === 0 ? 0 : '-6px',
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
