import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import {
  factionCodeToName,
  labelOfVariant,
  artifactSetName,
  compareVariants,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  artifactTypeName,
  artifactTypeI18nKey,
  compareArtifactTypes,
  artifactSetI18nKey,
  statVariantI18nKey,
  factionI18nKey,
} from '../lib/types'
import { NBSP, CHIP_ROLL_BADGE_FONT_SIZE_PX, CHIP_ROLL_BADGE_SIZE_PX, HOVER_BG_ALPHA, SELECTED_HOVER_BG_ALPHA } from '../lib/constants'
import { resolveAutoRarityCode } from '../lib/hsfBuilder'
import { artifactTypeIconFor } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import { useScrollingFlag } from '../hooks/useScrollingFlag'
import { useI18n } from '../lib/i18n'
import { FactionIcon } from './FactionIcon'
import { useDisplayPreferences } from '../state/preferencesState'
import { SetIcon } from './SetIcon'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById } from '../lib/metasetIcons'
import type { MetasetIconId } from '../lib/metasetIcons'
import type { SellfileVisibility } from '../lib/hsfBuilder'

// Separate baseline nudges keep bitmap faction icons and font slot icons visually centered.
const CONFIG_CHIP_FACTION_ICON_OFFSET_EM = -0.45
const CONFIG_CHIP_SLOT_ICON_OFFSET_EM = -0.20
const CONFIG_CHIP_SET_ICON_OFFSET_EM = -0.35
const CONFIG_CHIP_SET_ICON_TRANSLATE_Y_PX = 4
const CONFIG_CHIP_SET_ICON_TRANSLATE_WITH_TEXT_PX = -1

const DRAFT_SOLID_BORDER_WIDTH_PX = 2
const DRAFT_HASHED_BASE_BORDER_WIDTH_PX = 1.5
const DRAFT_HASHED_BORDER_WIDTH_STEP_PX = 0.3
const DRAFT_HASHED_MIN_BORDER_WIDTH_PX = 0.8
const DRAFT_HASHED_LINE_ALPHA_BASE = 0.75
const DRAFT_HASHED_LINE_ALPHA_STEP = 0.15
const DRAFT_HASHED_LINE_ALPHA_MIN = 0.3

const NAME_COLOR_DIRECTIVE_PATTERN = /^\s*(#\s*)?\[\s*#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\s*\]/

type NameColorDirective = {
  displayName: string
  resolvedColor: string
  hasExplicitColor: boolean
}

function parseNameColorDirectives(rawName: string | undefined, fallbackColor: string): NameColorDirective {
  const source = rawName ?? ''
  const match = source.match(NAME_COLOR_DIRECTIVE_PATTERN)
  if (!match || !match[2]) {
    return { displayName: source, resolvedColor: fallbackColor, hasExplicitColor: false }
  }
  const displayName = source.slice(match[0].length).trimStart()
  return { displayName, resolvedColor: `#${match[2].toUpperCase()}`, hasExplicitColor: true }
}

type DraftDividerDecoration = {
  displayName: string
  hasLabel: boolean
  borderStyle: 'solid' | 'dashed' | 'dotted'
  borderWidthPx: number
  lineColor: string
  textColor: string
  minLineWidthPx: number
}

// Draft dividers treat leading directives as styling hints instead of text (e.g. "#" for dashed lines, "[FFAA00]" for color).
function deriveDraftDividerDecoration(rawName: string | undefined, baseColor: string): DraftDividerDecoration {
  const trimmed = (rawName ?? '').trim()
  const hashMatch = trimmed.match(/^(#+)/)
  const hashPrefix = hashMatch?.[1] ?? ''
  const hashCount = hashPrefix.length

  const rest = trimmed.slice(hashPrefix.length).trimStart()
  const { displayName, resolvedColor } = parseNameColorDirectives(rest, baseColor)
  const hasLabel = displayName.length > 0

  if (hashCount === 0) {
    return {
      displayName,
      hasLabel,
      borderStyle: 'solid',
      borderWidthPx: DRAFT_SOLID_BORDER_WIDTH_PX,
      lineColor: resolvedColor,
      textColor: resolvedColor,
      minLineWidthPx: hasLabel ? 16 : 32,
    }
  }

  const intensityStep = Math.max(0, hashCount - 1)
  const borderWidth = Math.max(DRAFT_HASHED_MIN_BORDER_WIDTH_PX, DRAFT_HASHED_BASE_BORDER_WIDTH_PX - intensityStep * DRAFT_HASHED_BORDER_WIDTH_STEP_PX)
  const lineAlpha = Math.max(DRAFT_HASHED_LINE_ALPHA_MIN, DRAFT_HASHED_LINE_ALPHA_BASE - intensityStep * DRAFT_HASHED_LINE_ALPHA_STEP)
  const lineColor = alpha(resolvedColor, lineAlpha)
  const textColor = resolvedColor
  const borderStyle: 'dashed' | 'dotted' = hashCount >= 3 ? 'dotted' : 'dashed'

  return {
    displayName,
    hasLabel,
    borderStyle,
    borderWidthPx: borderWidth,
    lineColor,
    textColor,
    minLineWidthPx: hasLabel ? 16 : 32,
  }
}

interface ConfigChipProps {
  index: number
  cfg: BuilderConfig
  visualVariant?: 'interactive' | 'static'
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
  onCopyDev?: () => void
  isLast: boolean
  linkedHover: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  isDuplicate?: boolean
  duplicateOfIndex?: number
}

function ConfigChip({
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
  visualVariant,
  onSelect,
  onCopy,
  onCopyDev,
  isLast,
  linkedHover,
  onHover,
  metasets,
  substatColors,
  isDuplicate,
  duplicateOfIndex,
}: ConfigChipProps) {
  const { t } = useI18n()
  const { showFactionIcons, statButtonBorders, showSetIcons } = useDisplayPreferences()
  const theme = useTheme()
  const primaryColor = theme.palette.primary.main
  const nameDecoration = useMemo(
    () => parseNameColorDirectives(cfg.name, primaryColor),
    [cfg.name, primaryColor],
  )
  // Dev builds expose extra clipboard utilities via the chip context menu.
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  const visibility: SellfileVisibility = cfg.visibility
  const isDraft = visibility === 'draft'
  const isHidden = visibility === 'hidden'
  const draftDecoration = useMemo(
    () => deriveDraftDividerDecoration(cfg.name, primaryColor),
    [cfg.name, primaryColor],
  )
  // Build compact summary without redundant labels; act is rendered separately
  const actText = cfg.keep ? t('keepValueKeep') : t('keepValueSell')
  const restSummary = useMemo(
    () => summaryParts(cfg, metasets, { substatColors, useStatButtonColors: statButtonBorders, showFactionIcons, showSetIcons, t }),
    [cfg, metasets, substatColors, statButtonBorders, showFactionIcons, showSetIcons, t],
  )
  const keepColor = cfg.keep ? 'success.main' : 'error.main'
  const isDisabled = isHidden
  const showDuplicateFrame = !isDraft && isDuplicate
  const [menu, setMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  const backgroundMode = visualVariant ?? 'interactive'
  useEffect(() => {
    const handler = (e: MouseEvent) => { e.preventDefault() }
    const cleanup = menu?.open
      ? (() => {
        window.addEventListener('contextmenu', handler)
        return () => { window.removeEventListener('contextmenu', handler) }
      })()
      : undefined
    return cleanup
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
  const tooltipTitle = useMemo(() => {
    if (showDuplicateFrame && typeof duplicateOfIndex === 'number') {
      return t('chipTooltipDuplicateOf', { n: duplicateOfIndex + 1 })
    }
    return null
  }, [duplicateOfIndex, showDuplicateFrame, t])
  const showTooltip = Boolean(tooltipTitle)

  const chipNode = (
    <Box
      id={`cfg-chip-${index}`}
      data-tour-id={selected ? 'chip.selected' : undefined}
      sx={(theme) => {
        const hoverBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? HOVER_BG_ALPHA.dark : HOVER_BG_ALPHA.light)
        const selectedHoverBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? SELECTED_HOVER_BG_ALPHA.dark : SELECTED_HOVER_BG_ALPHA.light)
        const isStatic = backgroundMode === 'static'
        const staticBg = isStatic
          ? (theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.white, 0.08)
            : alpha(theme.palette.common.black, 0.05))
          : null
        const backgroundColor = isStatic
          ? staticBg
          : linkedHover
            ? (selected ? selectedHoverBg : hoverBg)
            : (selected ? theme.palette.action.selected : 'transparent')
        const borderColor = selected
          ? theme.palette.primary.main
          : (linkedHover ? theme.palette.primary.main : (showDuplicateFrame ? theme.palette.error.main : theme.palette.divider))
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: isDraft ? (draftDecoration.hasLabel ? 1.5 : 0) : 0.5,
          maxWidth: '100%',
          overflow: isStatic ? 'visible' : 'hidden',
          border: '1px solid',
          // Selection has highest priority, then hover, then duplicate warning.
          borderColor,
          backgroundColor,
          borderRadius: 5,
          pl: isDraft ? 1.25 : 1.2,
          pr: isDraft ? 1.25 : 0.5,
          py: 0.5,
          cursor: isStatic ? 'default' : 'pointer',
          flexWrap: isStatic ? 'wrap' : 'nowrap',
          ...(isDraft ? { flex: '0 0 100%', justifyContent: 'center' } : {}),
        }
      }}
      onClick={(e) => onSelect(e)}
      onMouseEnter={() => { onHover(true); setChipHover(true) }}
      onMouseLeave={() => { onHover(false); setChipHover(false) }}
      onContextMenu={(e) => { try { e.preventDefault(); e.stopPropagation() } catch {} setMenu({ open: true, x: e.clientX, y: e.clientY }) }}
    >
      {isDraft ? (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          gap: draftDecoration.hasLabel ? 1.5 : 0,
          minHeight: 20,
        }}
        >
          {draftDecoration.hasLabel ? (
            <>
              <Box sx={{
                flexGrow: 1,
                minWidth: draftDecoration.minLineWidthPx,
                borderBottom: `${draftDecoration.borderWidthPx}px ${draftDecoration.borderStyle} ${draftDecoration.lineColor}`,
              }}
              />
              <EllipsisTooltip title={draftDecoration.displayName}>
                <Typography
                  variant="caption"
                  data-ellipsis-target
                  sx={{
                    flex: '0 1 auto',
                    maxWidth: '100%',
                    px: 1,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: 600,
                    minWidth: 0,
                    color: draftDecoration.textColor,
                  }}
                  onMouseEnter={() => { setOverName(true); setNameEllipsized(measureNameEllipsis()) }}
                  onMouseLeave={() => { setOverName(false); setNameEllipsized(false) }}
                  ref={(el) => { nameRef.current = el as unknown as HTMLElement | null }}
                >
                  {draftDecoration.displayName}
                </Typography>
              </EllipsisTooltip>
              <Box sx={{
                flexGrow: 1,
                minWidth: draftDecoration.minLineWidthPx,
                borderBottom: `${draftDecoration.borderWidthPx}px ${draftDecoration.borderStyle} ${draftDecoration.lineColor}`,
              }}
              />
            </>
          ) : (
            <Box sx={{
              flexGrow: 1,
              minWidth: draftDecoration.minLineWidthPx,
              borderBottom: `${draftDecoration.borderWidthPx}px ${draftDecoration.borderStyle} ${draftDecoration.lineColor}`,
            }}
            />
          )}
        </Box>
      ) : (
        <Typography
          variant="caption"
          sx={{
            mr: 0.5,
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            // Clamp the text summary to 2 lines and let the browser decide where to truncate.
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
            {nameDecoration.displayName ? (
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  maxWidth: '45%',
                  minWidth: 0,
                  verticalAlign: 'baseline',
                }}
                onMouseEnter={() => { setOverName(true); setNameEllipsized(measureNameEllipsis()) }}
                onMouseLeave={() => { setOverName(false); setNameEllipsized(false) }}
              >
                <Box component="span" sx={{ px: 0.25, lineHeight: 'inherit' }}>—</Box>
                <EllipsisTooltip title={nameDecoration.displayName}>
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
                      color: nameDecoration.hasExplicitColor ? nameDecoration.resolvedColor : undefined,
                    }}
                  >
                    {nameDecoration.displayName}
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
      )}
      {!isDraft ? (
        <>
          <Tooltip title={t('chipBtnMoveUp')} slotProps={{ popper: { disablePortal: true } }}>
            <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t('chipBtnMoveDown')} slotProps={{ popper: { disablePortal: true } }}>
            <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={isLast}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t('chipBtnDuplicate')} slotProps={{ popper: { disablePortal: true } }}>
            <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate() }}><ContentCopyIcon fontSize="inherit" /></IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t('chipBtnDelete')} slotProps={{ popper: { disablePortal: true } }}>
            <span onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete() }} color="error"><DeleteIcon fontSize="inherit" /></IconButton>
            </span>
          </Tooltip>
        </>
      ) : null}
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        {...(menu?.open ? { anchorPosition: { top: menu.y, left: menu.x } } : {})}
        slotProps={{ paper: { 'data-tour-id': 'chip.menu' } as unknown as MuiPaperProps }}
      >
        <MenuItem onClick={() => { setMenu(null); onDuplicate() }}>{t('chipMenuDuplicate')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveTop() }} disabled={index === 0}>{t('chipMenuMoveTop')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveUp() }} disabled={index === 0}>{t('chipMenuMoveUp')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveDown() }} disabled={isLast}>{t('chipMenuMoveDown')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveBottom() }} disabled={isLast}>{t('chipMenuMoveBottom')}</MenuItem>
        <MenuItem onClick={async () => { setMenu(null); onCopy() }}>{t('chipMenuCopy')}</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onPasteAfter() }}>{t('chipMenuPasteAfter')}</MenuItem>
        {isDev && onCopyDev ? (
          <MenuItem onClick={async () => { setMenu(null); try { await onCopyDev() } catch {} }}>Copy config + rules (dev)</MenuItem>
        ) : null}
        <Divider />
        <MenuItem onClick={() => { setMenu(null); onDelete() }} sx={{ color: 'error.main' }}>{t('chipMenuDelete')}</MenuItem>
      </Menu>
    </Box>
  )

  if (showTooltip) {
    return (
      <Tooltip
        title={tooltipTitle}
        slotProps={{ popper: { disablePortal: true } }}
        open={chipHover && !(overName && nameEllipsized) && !overControls && !scrolling}
      >
        {chipNode}
      </Tooltip>
    )
  }

  return chipNode
}

function areConfigChipPropsEqual(prev: Readonly<ConfigChipProps>, next: Readonly<ConfigChipProps>): boolean {
  return prev.cfg === next.cfg
    && prev.index === next.index
    && prev.selected === next.selected
    && prev.isLast === next.isLast
    && prev.visualVariant === next.visualVariant
    && prev.linkedHover === next.linkedHover
    && prev.isDuplicate === next.isDuplicate
    && prev.duplicateOfIndex === next.duplicateOfIndex
    && prev.substatColors === next.substatColors
    && prev.metasets === next.metasets
}

export default memo(ConfigChip, areConfigChipPropsEqual)


function summaryParts(
  cfg: BuilderConfig,
  metasets: Metaset[],
  opts: {
    substatColors: Record<number, { fg: string; bg: string }>
    useStatButtonColors: boolean
    showFactionIcons: boolean
    showSetIcons: boolean
    t?: (key: string, params?: Record<string, string | number>) => string
  }
): JSX.Element | null {
  const parts: Array<JSX.Element> = []
  const addText = (text: string) => { if (text) parts.push(<Box key={`t-${parts.length}`} component="span">{text}</Box>) }
  const addNode = (node: JSX.Element) => parts.push(<Box key={`n-${parts.length}`} component="span">{node}</Box>)

  // Rank + Rarity (combined). Insert a non‑breaking space between them to avoid orphaned rarity.
  {
    // Localized rank label using existing star keys
    const chipRankLabel = (code?: number): string => {
      const n = Number(code ?? 0)
      if (n === 0) return ''
      const tr = opts.t
      const star = (s: number): string => {
        if (!tr) return `${s}★`
        switch (s) {
          case 1: return tr('star1')
          case 2: return tr('star2')
          case 3: return tr('star3')
          case 4: return tr('star4')
          case 5: return tr('star5')
          case 6: return tr('star6')
          default: return `${s}★`
        }
      }
      if (n >= 1 && n <= 6) return star(n)
      if (n >= 7 && n <= 11) return `≥${NBSP}${star(n - 6)}`
      if (n >= 12 && n <= 16) return `≤${NBSP}${star(n - 10)}`
      return String(n)
    }

    const rank = chipRankLabel(cfg.rankCode)
    const effectiveRarityCode = (cfg.rarityMode === 'auto') ? resolveAutoRarityCode(cfg) : cfg.rarityCode
    // Localized rarity label using existing rarity keys
    const chipRarityLabel = (code?: number): string => {
      const n = Number(code ?? 0)
      const tr = opts.t
      const name = (id: 'rarityCommon'|'rarityUncommon'|'rarityRare'|'rarityEpic'|'rarityLegendary'|'rarityMythical'): string => tr ? tr(id) : id.replace('rarity', '')
      if (n === 0) return ''
      if (n === 1) return name('rarityCommon')
      if (n === 2) return name('rarityUncommon')
      if (n === 3) return name('rarityRare')
      if (n === 4) return name('rarityEpic')
      if (n === 5) return name('rarityLegendary')
      if (n === 15) return name('rarityMythical')
      if (n === 16) return `≥${NBSP}${name('rarityLegendary')}`
      if (n === 6) return `≥${NBSP}${name('rarityCommon')}`
      if (n === 7) return `≥${NBSP}${name('rarityUncommon')}`
      if (n === 8) return `≥${NBSP}${name('rarityRare')}`
      if (n === 9) return `≥${NBSP}${name('rarityEpic')}`
      if (n === 10) return `≤${NBSP}${name('rarityUncommon')}`
      if (n === 11) return `≤${NBSP}${name('rarityRare')}`
      if (n === 12) return `≤${NBSP}${name('rarityEpic')}`
      if (n === 13) return `≤${NBSP}${name('rarityLegendary')}`
      if (n === 14) return `≤${NBSP}${name('rarityMythical')}`
      return String(n)
    }

    let rarity = chipRarityLabel(effectiveRarityCode)
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
  if (cfg.factionCode && cfg.factionCode !== 0) {
    const tr = opts.t
    const label = tr ? tr(factionI18nKey(cfg.factionCode)) : factionCodeToName(cfg.factionCode)
    if (opts.showFactionIcons) {
      addNode(
        <Box
          component="span"
          title={label}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            verticalAlign: `${CONFIG_CHIP_FACTION_ICON_OFFSET_EM}em`,
          }}
        >
          <FactionIcon faction={cfg.factionCode} size={18} sx={{ mr: 0.25 }} />
        </Box>
      )
    } else {
      addText(label)
    }
  }

  // Slots (artifact types) — render icons used by the Builder for consistency
  // Why: visual parity with Builder; icons are easier to scan than text here.
  {
    const types = (cfg as unknown as { artifactTypes?: number[] }).artifactTypes
    if (types && types.length > 0) {
      const sorted = [...types].sort(compareArtifactTypes)
      const nodes = sorted.map((typeId, i) => {
        const Icon = artifactTypeIconFor(typeId)
        if (Icon) {
          return (
            // Inline icon baseline tends to sit a bit high next to caption text;
            // nudge it down slightly for visual centering in the chip.
            <Box
              key={`slot-${typeId}-${i}`}
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                mr: 0.5,
                verticalAlign: `${CONFIG_CHIP_SLOT_ICON_OFFSET_EM}em`,
              }}
            >
              <Icon fontSize="inherit" />
            </Box>
          )
        }
        // Fallback to text if icon not found (should not happen)
        const tr = opts.t
        return (
          <Box key={`slot-${typeId}-${i}`} component="span" sx={{ mr: 0.5 }}>{tr ? tr(artifactTypeI18nKey(typeId)) : artifactTypeName(typeId)}</Box>
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
        const name = (opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
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
        const name = (opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
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
            title={(() => {
              const tr = opts.t
              if (showCap) return tr ? tr('chipMaxRolls', { n: String(max ?? '') }) : `Max rolls: ${String(max ?? '')}`
              if (showMin) return tr ? tr('chipMinRolls', { n: String(min ?? '') }) : `Min rolls: ${String(min ?? '')}`
              return ''
            })()}
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
      addNode(<><Box component="span">{`${(opts.t ? opts.t('chipSubs') : 'Subs')}:${NBSP}`}</Box>{interleaved}</>)
    } else {
      const tr = opts.t
      addText(`${tr ? tr('chipSubs') : 'Subs'}:${NBSP}${tr ? tr('any') : 'Any'}`)
    }
  }

  // Required Substats count (show only when > 0)
  if ((cfg.minCount ?? 0) > 0) {
    const base = opts.t ? opts.t('chipReq') : 'Req'
    const label = cfg.autoSubstatFlex ? `${base}★` : base
    addText(`${label}:${NBSP}${cfg.minCount}`)
  }

  // Min required rolls (aggregate across selected; show only when > 0)
  if ((cfg.minRequiredRolls ?? 0) > 0) {
    // Compact math-like notation to indicate total roll requirement.
    // Show a lock when the aggregate target applies only to locked substats.
    const lockedScope = (cfg.substatMinTarget === 'locked')
    addText(`Σr${NBSP}≥${NBSP}${cfg.minRequiredRolls}${lockedScope ? `${NBSP}🔒` : ''}`)
  }

  // Sets (icons when enabled) — render metasets as text and artifacts with icons respecting the preference toggle
  {
    const setIdsSorted = (cfg.artifactSets ?? []).slice().sort((a, b) => Number(a) - Number(b))
    const metaEntries = (cfg.artifactMetaSets ?? []).map((metaId, idx) => {
      const meta = metasets.find(m => m.id === metaId)
      const iconId = (meta?.iconId ?? DEFAULT_METASET_ICON_ID) as MetasetIconId
      return { key: `${metaId}-${idx}`, name: meta?.name || metaId, iconId }
    })

    if (opts.showSetIcons) {
      const metasetTextEntries = metaEntries.filter(entry => entry.iconId === DEFAULT_METASET_ICON_ID)
      const metasetIconEntries = metaEntries.filter(entry => entry.iconId !== DEFAULT_METASET_ICON_ID)
      const metasetTextParts = metasetTextEntries.map(entry => String(entry.name))
      const metasetText = metasetTextParts.join(`,${NBSP}`)
      const metasetTextTitle = metasetTextParts.join(', ')
      const shouldAppendTrailingNbsp = Boolean(metasetText && (metasetIconEntries.length > 0 || setIdsSorted.length > 0))
      const metasetNodes: JSX.Element[] = []

      if (metasetText) {
        metasetNodes.push(
          <Box
            key="metaset-text"
            component="span"
            sx={{ whiteSpace: 'nowrap' }}
            title={metasetTextTitle}
          >
            {shouldAppendTrailingNbsp ? `${metasetText}${NBSP}` : metasetText}
          </Box>,
        )
      }

      metasetIconEntries.forEach((entry) => {
        const option = metasetIconOptionById(entry.iconId)
        metasetNodes.push(
          <Box
            key={`meta-set-${entry.key}-icon`}
            component="span"
            title={String(entry.name)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              verticalAlign: `${CONFIG_CHIP_SET_ICON_OFFSET_EM}em`,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            {option.glyph}
          </Box>,
        )
      })

      const hasTextualMetaset = metasetTextEntries.length > 0
      const iconTranslatePx = hasTextualMetaset ? CONFIG_CHIP_SET_ICON_TRANSLATE_WITH_TEXT_PX : CONFIG_CHIP_SET_ICON_TRANSLATE_Y_PX
      const iconNodes = setIdsSorted.map((id, idx) => {
        const canonicalName = artifactSetName(id)
        const localizedName = opts.t ? opts.t(artifactSetI18nKey(id)) : canonicalName
        return (
          <Box
            key={`set-icon-${id}-${idx}`}
            component="span"
            title={localizedName}
            sx={{ display: 'inline-flex', alignItems: 'center', verticalAlign: `${CONFIG_CHIP_SET_ICON_OFFSET_EM}em` }}
          >
            <SetIcon
              name={canonicalName}
              sx={{
                mr: 0,
                verticalAlign: `${CONFIG_CHIP_SET_ICON_OFFSET_EM}em`,
                transform: `translateY(${iconTranslatePx}px)`,
              }}
            />
          </Box>
        )
      })
      if (metasetNodes.length > 0 || iconNodes.length > 0) {
        addNode(
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.35 }}>
            {metasetNodes}
            {iconNodes}
          </Box>,
        )
      }
    } else {
      const setNames = setIdsSorted.map(id => (opts.t ? opts.t(artifactSetI18nKey(id)) : artifactSetName(id)))
      const setsJoined = [...metaEntries.map(entry => entry.name), ...setNames].join(', ')
      if (setsJoined) {
        addText(setsJoined)
      }
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
