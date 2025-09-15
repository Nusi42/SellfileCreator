import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import {
  factionCodeToName,
  formatRank,
  labelOfVariant,
  rarityCodeToName,
  artifactSetName,
  compareVariants,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  artifactTypeName,
  compareArtifactTypes,
} from '../lib/types'
import { NBSP } from '../lib/constants'
import { CHIP_ROLL_BADGE_FONT_SIZE_PX, CHIP_ROLL_BADGE_SIZE_PX } from '../lib/constants'
import { resolveAutoRarityCode } from '../lib/hsfBuilder'
import { artifactTypeIconFor } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import { useScrollingFlag } from '../hooks/useScrollingFlag'

export default function ConfigChip({
  index,
  cfg,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onMoveTop,
  onMoveBottom,
  onPasteAfter,
  selected,
  onSelect,
  onCopy,
  isLast,
  linkedHover,
  onHover,
  metasets,
  substatColors,
  useStatButtonColors,
  isDuplicate,
  duplicateOfIndex,
}: {
  index: number
  cfg: BuilderConfig
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveTop: () => void
  onMoveBottom: () => void
  onPasteAfter: () => void
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onCopy: () => void
  isLast: boolean
  linkedHover: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  isDuplicate?: boolean
  duplicateOfIndex?: number
}) {
  // Build compact summary without redundant labels; act is rendered separately
  const actText = cfg.keep ? 'Keep' : 'Sell'
  const restSummary = summaryParts(cfg, metasets, { substatColors, useStatButtonColors })
  const keepColor = cfg.keep ? 'success.main' : 'error.main'
  const isDisabled = cfg.enabled === false
  const [menu, setMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  useEffect(() => {
    if (!menu?.open) return
    const handler = (e: MouseEvent) => { e.preventDefault() }
    window.addEventListener('contextmenu', handler)
    return () => { window.removeEventListener('contextmenu', handler) }
  }, [menu?.open])
  const [overName, setOverName] = useState(false)
  const [overControls, setOverControls] = useState(false)
  const [chipHover, setChipHover] = useState(false)
  const scrolling = useScrollingFlag()
  const nameRef = useRef<HTMLElement | null>(null)
  const [nameEllipsized, setNameEllipsized] = useState(false)
  const measureNameEllipsis = () => {
    try {
      const el = nameRef.current
      if (!el) return false
      const cs = getComputedStyle(el)
      const isEllipsisStyle = (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap'
      const rectW = Math.floor(el.getBoundingClientRect().width || 0)
      const scrollW = Math.floor(el.scrollWidth || 0)
      return isEllipsisStyle && scrollW > 0 && rectW + 2 < scrollW
    } catch { return false }
  }
  return (
    <Tooltip
      title={isDuplicate && typeof duplicateOfIndex === 'number' ? `This is a duplicate of config #${duplicateOfIndex + 1}` : 'Click to edit this config'}
      // Suppress while scrolling so the tooltip doesn't appear at a stale anchor.
      open={chipHover && !(overName && nameEllipsized) && !overControls && !scrolling}
    >
    <Box
      id={`cfg-chip-${index}`}
      data-tour-id={selected ? 'chip.selected' : undefined}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        maxWidth: '100%',
        overflow: 'hidden',
        border: '1px solid',
        // Selection has highest priority, then hover, then duplicate warning.
        borderColor: selected ? 'primary.main' : (linkedHover ? 'primary.main' : (isDuplicate ? 'error.main' : 'divider')),
        backgroundColor: selected ? 'action.selected' : (linkedHover ? 'action.hover' : 'transparent'),
        borderRadius: 5,
        pl: 1.2,
        pr: 0.5,
        py: 0.5,
        cursor: 'pointer',
      }}
      onClick={(e) => onSelect(e)}
      onMouseEnter={() => { onHover(true); setChipHover(true) }}
      onMouseLeave={() => { onHover(false); setChipHover(false) }}
      onContextMenu={(e) => { try { e.preventDefault(); e.stopPropagation() } catch {} setMenu({ open: true, x: e.clientX, y: e.clientY }) }}
    >
      <Typography
        variant="caption"
        sx={{
          mr: 0.5,
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          // Clamp the text summary to 2 lines and let the browser
          // decide where to truncate. This replaces ad-hoc per-field
          // character limits and makes better use of available width.
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          wordBreak: 'break-word',
        }}
      >
          <Box component="span" sx={{ display: 'inline' }}>
          {`${index + 1}. `}
          {isDisabled ? (
            <Box component="span" sx={{ color: 'common.white', textDecoration: 'line-through' }}>
              <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
            </Box>
          ) : (
            <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
          )}
          {cfg.name ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', maxWidth: '45%', minWidth: 0, verticalAlign: 'baseline' }} onMouseEnter={() => { setOverName(true); setNameEllipsized(measureNameEllipsis()) }} onMouseLeave={() => { setOverName(false); setNameEllipsized(false) }}>
              <Box component="span" sx={{ px: 0.25, lineHeight: 'inherit' }}>—</Box>
              <EllipsisTooltip title={cfg.name}>
                <Box
                  component="span"
                  data-ellipsis-target
                  ref={(el) => { nameRef.current = el as unknown as HTMLElement | null }}
                  sx={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 'inherit',
                  }}
                >
                  {cfg.name}
                </Box>
              </EllipsisTooltip>
            </Box>
          ) : null}
          {restSummary && (
            <>
              {' | '}
              {restSummary}
            </>
          )}
        </Box>
      </Typography>
      <Tooltip title="Move up">
        <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Move down">
        <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={isLast}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Duplicate">
        <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate() }}><ContentCopyIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Delete">
        <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete() }} color="error"><DeleteIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        {...(menu?.open ? { anchorPosition: { top: menu.y, left: menu.x } } : {})}
        slotProps={{ paper: { 'data-tour-id': 'chip.menu' } as unknown as MuiPaperProps }}
      >
        <MenuItem onClick={() => { setMenu(null); onDuplicate() }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveTop() }} disabled={index === 0}>Move to Top</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveUp() }} disabled={index === 0}>Move Up</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveDown() }} disabled={isLast}>Move Down</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveBottom() }} disabled={isLast}>Move to Bottom</MenuItem>
        <MenuItem onClick={async () => { setMenu(null); onCopy() }}>Copy to Clipboard</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onPasteAfter() }}>Paste after</MenuItem>
        <Divider />
        <MenuItem onClick={() => { setMenu(null); onDelete() }} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>
    </Box>
    </Tooltip>
  )
}


function summaryParts(
  cfg: BuilderConfig,
  metasets: Metaset[],
  opts: { substatColors: Record<number, { fg: string; bg: string }>; useStatButtonColors: boolean }
): JSX.Element | null {
  const parts: Array<JSX.Element> = []
  const addText = (text: string) => { if (text) parts.push(<Box key={`t-${parts.length}`} component="span">{text}</Box>) }
  const addNode = (node: JSX.Element) => parts.push(<Box key={`n-${parts.length}`} component="span">{node}</Box>)

  // Rank + Rarity (combined). Insert a non‑breaking space between them to avoid orphaned rarity.
  {
    const rank = formatRank(cfg.rankCode)
    const effectiveRarityCode = (cfg.rarityMode === 'auto') ? resolveAutoRarityCode(cfg) : cfg.rarityCode
    let rarity = rarityCodeToName(effectiveRarityCode)
    // When Rarity=Auto and Keep Mode is Late, the builder expands into
    // multiple rarity branches (≥ Epic base + ≥ Legendary at 4/8/12).
    // Add a subtle indicator after the rarity text to reflect this.
    const isLate = ((cfg.earlyKeepMode ?? 'early') === 'late')
    // Multi-branch when Late+Auto and base is below Legendary: show +
    const multiRarity = (cfg.rarityMode === 'auto') && isLate && (effectiveRarityCode !== 16)
    if (multiRarity) rarity = `${rarity}${NBSP}+`
    const combined = [rank, rarity].filter(Boolean).join(NBSP)
    if (combined) addText(combined)
  }

  // Keep mode indicator: show a compact emoji for timing to make it explicit.
  // 🌅 for Early, 🌙 for Late.
  {
    const mode = (cfg.earlyKeepMode ?? 'early')
    addText(mode === 'late' ? '🌙' : '🌅')
  }

  // Faction
  if (cfg.factionCode && cfg.factionCode !== 0) addText(factionCodeToName(cfg.factionCode))

  // Slots (artifact types) — render icons used by the Builder for consistency
  // Why: visual parity with Builder; icons are easier to scan than text here.
  {
    const types = (cfg as unknown as { artifactTypes?: number[] }).artifactTypes
    if (types && types.length > 0) {
      const sorted = [...types].sort(compareArtifactTypes)
      const nodes = sorted.map((t, i) => {
        const Icon = artifactTypeIconFor(t)
        if (Icon) {
          return (
            // Inline icon baseline tends to sit a bit high next to caption text;
            // nudge it down slightly for visual centering in the chip.
            <Box key={`slot-${t}-${i}`} component="span" sx={{ display: 'inline-flex', alignItems: 'center', mr: 0.5, verticalAlign: '-0.20em' }}>
              <Icon fontSize="inherit" />
            </Box>
          )
        }
        // Fallback to text if icon not found (should not happen)
        return (
          <Box key={`slot-${t}-${i}`} component="span" sx={{ mr: 0.5 }}>{artifactTypeName(t)}</Box>
        )
      })
      addNode(<>{nodes}</>)
    }
  }

  // Main stats (colored if enabled) — follows Slots
  {
    const v = ((cfg as unknown as { mainStatsV?: number[] }).mainStatsV ?? []).slice()
    // Preferred stat ordering used across the app (same as substat chips/table)
    v.sort(compareVariants)
    if (v.length > 0) {
      const nodes = v.map((vk, i) => {
        const name = labelOfVariant(vk)
        const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
        return (
          <Box key={`m-${vk}-${i}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>{name}</Box>
        )
      })
      const interleaved: JSX.Element[] = []
      nodes.forEach((n, i) => { interleaved.push(n); if (i < nodes.length - 1) interleaved.push(<Box key={`m-sep-${i}`} component="span">, </Box>) })
      addNode(<>{interleaved}</>)
    }
  }

  // Substats (colored if enabled)
  {
    const sv = ((cfg as unknown as { substatsV?: number[] }).substatsV ?? []).slice()
    // Sort substats by the same preferred order
    sv.sort(compareVariants)
    const fv = (cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV ?? []
    const bounds = (cfg as unknown as { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> }).substatRollBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> | undefined
    if (sv.length > 0) {
      const fixedSet = new Set<number>(fv as number[])
      const nodes = sv.map((vk, i) => {
        const name = labelOfVariant(vk)
        const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
        // Render per-substat roll bounds using a compact, readable indicator circle
        // like the Builder’s roll badge, but without fill: a red (cap) or green (min/any)
        // outlined circle with the number inside. This avoids the cryptic ">= 4r" text.
        const b = bounds ? bounds[vk] : undefined
        const min = (b && typeof b.min === 'number') ? Math.max(0, Math.min(5, Math.floor(b.min))) : undefined
        const max = (b && typeof b.max === 'number') ? Math.max(0, Math.min(5, Math.floor(b.max))) : undefined
        const showCap = max !== undefined
        const showMin = !showCap && (min !== undefined)

        // Indicator: show only one state. UI enforces mutual exclusivity; if both present (legacy), prefer cap.
        const indicator = (showCap || showMin) ? (
          <Box
            key={`ri-${vk}-${i}`}
            component="span"
            title={showCap ? `Max rolls: ${max}` : (showMin ? `Min rolls: ${min}` : '')}
            sx={{
              ml: 0.5,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: CHIP_ROLL_BADGE_SIZE_PX,
              height: CHIP_ROLL_BADGE_SIZE_PX,
              borderRadius: '50%',
              border: '1.2px solid',
              lineHeight: 1,
              fontSize: CHIP_ROLL_BADGE_FONT_SIZE_PX,
              // No fill per request; ring color indicates intent; number uses a high-contrast white
              bgcolor: 'transparent',
              color: 'common.white',
              borderColor: showCap ? 'error.main' : (showMin ? 'success.main' : 'text.secondary'),
              // Subtle baseline alignment
              position: 'relative',
              top: '0px',
              userSelect: 'none',
            }}
          >
            {showCap ? String(max) : (showMin ? String(min) : '')}
          </Box>
        ) : null

        return (
          <Box key={`s-${vk}-${i}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>
            {name}
            {fixedSet.has(vk as number) ? '🔒' : ''}
            {indicator}
          </Box>
        )
      })
      const interleaved: JSX.Element[] = []
      nodes.forEach((n, i) => { interleaved.push(n); if (i < nodes.length - 1) interleaved.push(<Box key={`s-sep-${i}`} component="span">, </Box>) })
      addNode(<><Box component="span">{`Subs:${NBSP}`}</Box>{interleaved}</>)
    } else {
      addText(`Subs:${NBSP}Any`)
    }
  }

  // Required Substats count (show only when > 0)
  if ((cfg.minCount ?? 0) > 0) { addText(`Req:${NBSP}${cfg.minCount}`) }

  // Min required rolls (aggregate across selected; show only when > 0)
  if ((cfg.minRequiredRolls ?? 0) > 0) {
    // Compact math-like notation to indicate total roll requirement.
    // Show a lock when the aggregate target applies only to locked substats.
    const lockedScope = (cfg.substatMinTarget === 'locked')
    addText(`Σr${NBSP}≥${NBSP}${cfg.minRequiredRolls}${lockedScope ? `${NBSP}🔒` : ''}`)
  }

  // Sets (cropped at 50 chars), sorted by game order for consistency
  {
    const setIdsSorted = (cfg.artifactSets ?? []).slice().sort((a, b) => Number(a) - Number(b))
    const setNames = setIdsSorted.map(artifactSetName)
    const metaNames = (cfg.artifactMetaSets ?? []).map(id => metasets.find(m => m.id === id)?.name || id)
    const setsJoined = [...metaNames, ...setNames].join(', ')
    if (setsJoined) {
      // Rely on the 2-line clamp on the chip text container to truncate;
      // avoid fixed character clipping here to maximize useful information.
      addText(setsJoined)
    }
  }

  if (parts.length === 0) return null
  // Interleave with separators
  const withSeps: JSX.Element[] = []
  parts.forEach((p, i) => { withSeps.push(p); if (i < parts.length - 1) withSeps.push(<Box key={`sep-${i}`} component="span"> | </Box>) })
  return <>{withSeps}</>
}
/**
 * ConfigChip
 *
 * Compact, clickable summary for a single BuilderConfig with context menu
 * actions (duplicate, move, copy, delete). Renders the human-readable summary.
 */
