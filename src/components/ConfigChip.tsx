import { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react'
import type React from 'react'
import { Box, IconButton, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
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
  statVariantI18nKey,
  factionI18nKey,
  getLocalizedGearSetName,
} from '../lib/types'
import { NBSP, CHIP_ROLL_BADGE_FONT_SIZE_PX, CHIP_ROLL_BADGE_SIZE_PX, HOVER_BG_ALPHA, SELECTED_HOVER_BG_ALPHA, CONFIG_CHIP_BORDER_RADIUS_PX, CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX, CONFIG_CHIP_VERTICAL_PADDING_PX, SUBSTAT_TARGET_MAX_ROLLS } from '../lib/constants'
import { normalizeLooseRollTargetEntry, resolveAutoRarityCode } from '../lib/hsfBuilder'
import { isLockedAggregateScopeActive, isMilestoneThresholdsActive } from '../lib/configNormalization'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useI18n } from '../lib/i18n'
import { parseConfigNameDirectives } from '../lib/configNameDirectives'
import { FactionIcon } from './FactionIcon'
import { useDisplayPreferences } from '../state/preferencesState'
import { SetIcon } from './SetIcon'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById } from '../lib/metasetIcons'
import type { MetasetIconId } from '../lib/metasetIcons'
import type { SellfileExportMode } from '../lib/hsfBuilder'
import { ConfigContextMenu } from './ConfigContextMenu'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import MarkdownTooltip from './MarkdownTooltip'

// Separate baseline nudges keep bitmap faction icons and font slot icons visually centered.
const CONFIG_CHIP_FACTION_ICON_OFFSET_EM = -0.45
const CONFIG_CHIP_SLOT_ICON_OFFSET_EM = -0.20
const CONFIG_CHIP_ARTIFACT_SET_ICON_OFFSET_EM = -0.35
const CONFIG_CHIP_METASET_ICON_BOX_PX = 16

const SEPARATOR_SOLID_BORDER_WIDTH_PX = 2
const SEPARATOR_HASHED_BASE_BORDER_WIDTH_PX = 1.5
const SEPARATOR_HASHED_BORDER_WIDTH_STEP_PX = 0.3
const SEPARATOR_HASHED_MIN_BORDER_WIDTH_PX = 0.8
const SEPARATOR_HASHED_LINE_ALPHA_BASE = 0.75
const SEPARATOR_HASHED_LINE_ALPHA_STEP = 0.15
const SEPARATOR_HASHED_LINE_ALPHA_MIN = 0.3

const clampAggregateRollDisplayValue = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const rounded = Math.round(value)
  return Math.max(0, Math.min(5, rounded))
}

const isDevBuild: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

type SeparatorDividerDecoration = {
  displayName: string
  hasLabel: boolean
  borderStyle: 'solid' | 'dashed' | 'dotted'
  borderWidthPx: number
  lineColor: string
  textColor: string
  minLineWidthPx: number
}

// Separator dividers treat leading directives as styling hints instead of text (e.g. "#" for dashed lines, "[FFAA00]" for color).
function deriveSeparatorDividerDecoration(rawName: string | undefined, baseColor: string): SeparatorDividerDecoration {
  const trimmed = (rawName ?? '').trim()
  const hashMatch = trimmed.match(/^(#+)/)
  const hashPrefix = hashMatch?.[1] ?? ''
  const hashCount = hashPrefix.length

  const rest = trimmed.slice(hashPrefix.length).trimStart()
  const { displayName, resolvedColor } = parseConfigNameDirectives(rest, baseColor)
  const hasLabel = displayName.length > 0

  if (hashCount === 0) {
    return {
      displayName,
      hasLabel,
      borderStyle: 'solid',
      borderWidthPx: SEPARATOR_SOLID_BORDER_WIDTH_PX,
      lineColor: resolvedColor,
      textColor: resolvedColor,
      minLineWidthPx: hasLabel ? 16 : 32,
    }
  }

  const intensityStep = Math.max(0, hashCount - 1)
  const borderWidth = Math.max(SEPARATOR_HASHED_MIN_BORDER_WIDTH_PX, SEPARATOR_HASHED_BASE_BORDER_WIDTH_PX - intensityStep * SEPARATOR_HASHED_BORDER_WIDTH_STEP_PX)
  const lineAlpha = Math.max(SEPARATOR_HASHED_LINE_ALPHA_MIN, SEPARATOR_HASHED_LINE_ALPHA_BASE - intensityStep * SEPARATOR_HASHED_LINE_ALPHA_STEP)
  let lineColor = resolvedColor
  try {
    lineColor = alpha(resolvedColor, lineAlpha)
  } catch {
    lineColor = resolvedColor
  }
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
  gearSetCatalogVersion?: number
  visualVariant?: 'interactive' | 'static'
  dragEnabled?: boolean
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void
  hideTooltip?: boolean
  ghostedWhileDragging?: boolean
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveTop: () => void
  onMoveBottom: () => void
  onPasteAfter: () => void
  onPasteAtEnd: () => void
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onCopy: () => void
  onCopyDev?: () => void
  onSelectAll?: () => void
  selectAllLabelKey?: string
  onCopyAllConfigs?: () => void
  onDeleteAllConfigs?: () => void
  deleteAllDisabled?: boolean
  onHighlightDelete?: (active: boolean) => void
  isLast: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  isDuplicate?: boolean
  duplicateOfIndex?: number
  onContextMenuHintSeen?: () => void
}

function ConfigChip({
  index,
  cfg,
  gearSetCatalogVersion = 0,
  dragEnabled = false,
  onPointerDown,
  hideTooltip = false,
  ghostedWhileDragging = false,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onMoveTop,
  onMoveBottom,
  onPasteAfter,
  onPasteAtEnd,
  selected,
  visualVariant,
  onSelect,
  onCopy,
  onCopyDev,
  onSelectAll,
  selectAllLabelKey,
  onCopyAllConfigs,
  onDeleteAllConfigs,
  deleteAllDisabled,
  onHighlightDelete,
  isLast,
  onHover,
  metasets,
  substatColors,
  isDuplicate,
  duplicateOfIndex,
  onContextMenuHintSeen,
}: ConfigChipProps) {
  const { t, lang } = useI18n()
  const { showFactionIcons, statButtonBorders, showSetIcons, showSlotIcons } = useDisplayPreferences()
  const theme = useTheme()
  const primaryColor = theme.palette.primary.main
  const nameDecoration = useMemo(
    () => parseConfigNameDirectives(cfg.name, primaryColor),
    [cfg.name, primaryColor],
  )
  // Dev builds expose extra clipboard utilities via the chip context menu.
  const isDev: boolean = isDevBuild
  const exportMode: SellfileExportMode = cfg.exportMode
  const isSeparator = exportMode === 'separator'
  const isHidden = exportMode === 'disabled'
  const separatorDecoration = useMemo(
    () => deriveSeparatorDividerDecoration(cfg.name, primaryColor),
    [cfg.name, primaryColor],
  )
  // Build compact summary without redundant labels; act is rendered separately
  const actText = cfg.keep ? t('keepValueKeep') : t('keepValueSell')
  const tooltipSuppressed = hideTooltip
  const tooltipListenerProps = tooltipSuppressed
    ? {
        disableHoverListener: true,
        disableFocusListener: true,
        disableTouchListener: true,
      }
    : undefined
  const tooltipForceClosedProps = tooltipSuppressed ? { open: false as const } : undefined
  const restSummary = useMemo(
    () => summaryParts(cfg, metasets, {
      substatColors,
      useStatButtonColors: statButtonBorders,
      showFactionIcons,
      showSetIcons,
      showSlotIcons,
      t,
      lang,
      cfgIndex: index,
      tooltipsDisabled: tooltipSuppressed,
      catalogVersion: gearSetCatalogVersion,
    }),
    [cfg, metasets, substatColors, statButtonBorders, showFactionIcons, showSetIcons, showSlotIcons, t, lang, index, tooltipSuppressed, gearSetCatalogVersion],
  )
  const keepColor = cfg.keep ? 'success.main' : 'error.main'
  const isDisabled = isHidden
  const showDuplicateFrame = !isSeparator && isDuplicate
  const [menu, setMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  const menuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeMenu = useCallback(() => {
    setMenu(null)
    onHighlightDelete?.(false)
  }, [onHighlightDelete])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(menu?.open),
    onClose: closeMenu,
    menuRef: menuPaperRef,
  })
  const handleMenuContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])
  const backgroundMode = visualVariant ?? 'interactive'
  const deleteAllDisabledFlag = Boolean(deleteAllDisabled)
  const [overControls, setOverControls] = useState(false)
  const [chipHover, setChipHover] = useState(false)
  /* eslint-disable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */
  // Suppress tooltips immediately when dragging begins so they do not reopen after drop.
  useEffect(() => {
    if (hideTooltip) {
      setChipHover(false)
      setOverControls(false)
    }
  }, [hideTooltip])
  /* eslint-enable react-you-might-not-need-an-effect/no-adjust-state-on-prop-change */
  const tooltipTitle = useMemo(() => {
    if (showDuplicateFrame && typeof duplicateOfIndex === 'number') {
      return t('chipTooltipDuplicateOf', { n: duplicateOfIndex + 1 })
    }
    return null
  }, [duplicateOfIndex, showDuplicateFrame, t])
  const showTooltip = Boolean(tooltipTitle) && !hideTooltip

  const chipNode = (
    <Box
      id={`cfg-chip-${index}`}
      data-tour-id={selected ? 'chip.selected' : undefined}
      data-config-chip-index={index}
      data-config-chip="true"
      // Builder hover is coordinated outside React; App.tsx toggles this attribute
      // so the chip can reuse the same highlight styles as pointer-driven focus.
      data-linked-hover="false"
      aria-grabbed={dragEnabled ? (selected ? 'true' : 'false') : undefined}
      onPointerDown={dragEnabled ? onPointerDown : undefined}
      sx={(theme) => {
        const hoverBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? HOVER_BG_ALPHA.dark : HOVER_BG_ALPHA.light)
        const selectedHoverBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? SELECTED_HOVER_BG_ALPHA.dark : SELECTED_HOVER_BG_ALPHA.light)
        const isStatic = backgroundMode === 'static'
        const staticBg = isStatic
          ? (theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.white, 0.08)
            : alpha(theme.palette.common.black, 0.05))
          : null
        const baseBackground = isStatic
          ? staticBg
          : (selected ? theme.palette.action.selected : 'transparent')
        const baseBorderColor = selected
          ? theme.palette.primary.main
          : (showDuplicateFrame ? theme.palette.error.main : theme.palette.divider)
        const flexSizing = isSeparator
          ? '0 0 100%'
          : (isStatic ? '0 1 auto' : '1 1 auto')
        // Interactive chips flex-grow so a single chip spans the row while static embeds keep their natural width.
        const borderRadius = `${CONFIG_CHIP_BORDER_RADIUS_PX}px`
        const pointerCursor = isStatic ? 'default' : (dragEnabled ? 'grab' : 'pointer')
        return {
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: isSeparator ? (separatorDecoration.hasLabel ? 1.5 : 0) : 0.5,
          maxWidth: '100%',
          overflow: isStatic ? 'visible' : 'hidden',
          border: '1px solid',
          borderColor: baseBorderColor,
          backgroundColor: baseBackground,
          borderRadius,
          pl: isSeparator ? 1.1 : 1,
          pr: isSeparator ? 1.1 : 0.4,
          py: `${CONFIG_CHIP_VERTICAL_PADDING_PX}px`,
          cursor: pointerCursor,
          flex: flexSizing,
          flexWrap: isStatic ? 'wrap' : 'nowrap',
          ...(isSeparator ? { justifyContent: 'center' } : {}),
          '&[data-linked-hover="true"]': {
            backgroundColor: isStatic
              ? staticBg
              : (selected ? selectedHoverBg : hoverBg),
            borderColor: theme.palette.primary.main,
          },
          ...(ghostedWhileDragging ? {
            opacity: 0.25,
            transform: 'scale(0.985)',
            pointerEvents: 'none',
          } : {}),
        }
      }}
      onClick={(e) => onSelect(e)}
      onMouseEnter={() => {
        onHover(true)
        setChipHover(true)
      }}
      onMouseLeave={() => { onHover(false); setChipHover(false) }}
      onContextMenu={(e) => {
        try { e.preventDefault(); e.stopPropagation() } catch {}
        if (!isSeparator && !selected) {
          // Align context-click with normal selection so menu actions target the right chip.
          onSelect(e)
        }
        onContextMenuHintSeen?.()
        onHover(false)
        setChipHover(false)
        setMenu({ open: true, x: e.clientX, y: e.clientY })
      }}
    >
      {isSeparator ? (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          gap: separatorDecoration.hasLabel ? 1.5 : 0,
          minHeight: 20,
        }}
        >
          {separatorDecoration.hasLabel ? (
            <>
              <Box sx={{
                flexGrow: 1,
                minWidth: separatorDecoration.minLineWidthPx,
                borderBottom: `${separatorDecoration.borderWidthPx}px ${separatorDecoration.borderStyle} ${separatorDecoration.lineColor}`,
              }}
              />
              <Typography
                variant="caption"
                sx={{
                  flex: '0 1 auto',
                  maxWidth: '100%',
                  px: 1,
                  textAlign: 'center',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  fontWeight: 600,
                  minWidth: 0,
                  color: separatorDecoration.textColor,
                }}
              >
                {separatorDecoration.displayName}
              </Typography>
              <Box sx={{
                flexGrow: 1,
                minWidth: separatorDecoration.minLineWidthPx,
                borderBottom: `${separatorDecoration.borderWidthPx}px ${separatorDecoration.borderStyle} ${separatorDecoration.lineColor}`,
              }}
              />
            </>
          ) : (
            <Box sx={{
              flexGrow: 1,
              minWidth: separatorDecoration.minLineWidthPx,
              borderBottom: `${separatorDecoration.borderWidthPx}px ${separatorDecoration.borderStyle} ${separatorDecoration.lineColor}`,
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
            // Allow the summary to wrap so long names stay readable within the chip.
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
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
                  flexWrap: 'wrap',
                  minWidth: 0,
                  verticalAlign: 'baseline',
                }}
              >
                <Box component="span" sx={{ px: 0.25, lineHeight: 'inherit' }}>—</Box>
                <Box
                  component="span"
                  sx={{
                    display: 'inline',
                    minWidth: 0,
                    lineHeight: 'inherit',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    color: nameDecoration.hasExplicitColor ? nameDecoration.resolvedColor : undefined,
                  }}
                >
                  {nameDecoration.displayName}
                </Box>
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
      {!isSeparator ? (
        <>
          <MarkdownTooltip
            markdown={t('chipBtnMoveUp')}
            slotProps={{ popper: { disablePortal: true } }}
            {...(tooltipListenerProps ?? {})}
            {...(tooltipForceClosedProps ?? {})}
          >
            <span data-chip-control="true" onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
              <IconButton
                size="small"
                sx={{
                  width: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  height: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minWidth: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minHeight: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  p: 0.25,
                }}
                onClick={(e) => { e.stopPropagation(); onMoveUp() }}
                disabled={index === 0}
              ><ArrowUpwardIcon fontSize="inherit" /></IconButton>
            </span>
          </MarkdownTooltip>
          <MarkdownTooltip
            markdown={t('chipBtnMoveDown')}
            slotProps={{ popper: { disablePortal: true } }}
            {...(tooltipListenerProps ?? {})}
            {...(tooltipForceClosedProps ?? {})}
          >
            <span data-chip-control="true" onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
              <IconButton
                size="small"
                sx={{
                  width: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  height: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minWidth: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minHeight: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  p: 0.25,
                }}
                onClick={(e) => { e.stopPropagation(); onMoveDown() }}
                disabled={isLast}
              ><ArrowDownwardIcon fontSize="inherit" /></IconButton>
            </span>
          </MarkdownTooltip>
          <MarkdownTooltip
            markdown={t('chipBtnDuplicate')}
            slotProps={{ popper: { disablePortal: true } }}
            {...(tooltipListenerProps ?? {})}
            {...(tooltipForceClosedProps ?? {})}
          >
            <span data-chip-control="true" onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
              <IconButton
                size="small"
                sx={{
                  width: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  height: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minWidth: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minHeight: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  p: 0.25,
                }}
                onClick={(e) => { e.stopPropagation(); onDuplicate() }}
              ><ContentCopyIcon fontSize="inherit" /></IconButton>
            </span>
          </MarkdownTooltip>
          <MarkdownTooltip
            markdown={t('chipBtnDelete')}
            slotProps={{ popper: { disablePortal: true } }}
            {...(tooltipListenerProps ?? {})}
            {...(tooltipForceClosedProps ?? {})}
          >
            <span data-chip-control="true" onMouseEnter={() => setOverControls(true)} onMouseLeave={() => setOverControls(false)}>
              <IconButton
                size="small"
                sx={{
                  width: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  height: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minWidth: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minHeight: CONFIG_CHIP_CONTROL_BUTTON_SIZE_PX,
                  p: 0.25,
                }}
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                color="error"
              ><DeleteIcon fontSize="inherit" /></IconButton>
            </span>
          </MarkdownTooltip>
        </>
      ) : null}
      <ConfigContextMenu
        open={Boolean(menu?.open)}
        anchorPosition={menu?.open ? { top: menu.y, left: menu.x } : null}
        onClose={closeMenu}
        paperRef={menuPaperRef}
        paperDataTourId="chip.menu"
        onPaperContextMenu={handleMenuContextMenu}
        actions={{
          duplicate: onDuplicate,
          moveTop: { handler: onMoveTop, disabled: index === 0 },
          moveUp: { handler: onMoveUp, disabled: index === 0 },
          moveDown: { handler: onMoveDown, disabled: isLast },
          moveBottom: { handler: onMoveBottom, disabled: isLast },
          copyConfig: onCopy,
          pasteAfter: onPasteAfter,
          pasteAtEnd: onPasteAtEnd,
          ...(isDev && onCopyDev ? { copyConfigDev: onCopyDev } : {}),
          deleteConfig: onDelete,
          ...(onSelectAll ? {
            selectAll: {
              handler: onSelectAll,
              disabled: false,
              labelKey: selectAllLabelKey ?? 'chipsMenuSelectAll',
            },
          } : {}),
          ...(onCopyAllConfigs ? { copyAll: { handler: onCopyAllConfigs, disabled: false } } : {}),
          ...(onDeleteAllConfigs ? {
            deleteAll: {
              handler: onDeleteAllConfigs,
              disabled: deleteAllDisabledFlag,
              ...(onHighlightDelete ? { onHighlightChange: onHighlightDelete } : {}),
            },
          } : {}),
        }}
      />
    </Box>
  )

  if (showTooltip) {
    return (
      <MarkdownTooltip
        markdown={tooltipTitle || ''}
        slotProps={{ popper: { disablePortal: true } }}
        {...(tooltipListenerProps ?? {})}
        open={tooltipSuppressed ? false : (chipHover && !overControls)}
      >
        {chipNode}
      </MarkdownTooltip>
    )
  }

  return chipNode
}

function areConfigChipPropsEqual(prev: Readonly<ConfigChipProps>, next: Readonly<ConfigChipProps>): boolean {
  return prev.cfg === next.cfg
    && prev.index === next.index
    && prev.gearSetCatalogVersion === next.gearSetCatalogVersion
    && prev.dragEnabled === next.dragEnabled
    && prev.onPointerDown === next.onPointerDown
    && prev.hideTooltip === next.hideTooltip
    && prev.ghostedWhileDragging === next.ghostedWhileDragging
    && prev.selected === next.selected
    && prev.isLast === next.isLast
    && prev.visualVariant === next.visualVariant
    && prev.isDuplicate === next.isDuplicate
    && prev.duplicateOfIndex === next.duplicateOfIndex
    && prev.substatColors === next.substatColors
    && prev.metasets === next.metasets
    && prev.selectAllLabelKey === next.selectAllLabelKey
    && prev.onDeleteAllConfigs === next.onDeleteAllConfigs
    && prev.onHighlightDelete === next.onHighlightDelete
    && prev.onPasteAtEnd === next.onPasteAtEnd
}

export default memo(ConfigChip, areConfigChipPropsEqual)

const withNbsp = (value: string | undefined | null): string => {
  if (!value) return ''
  return value.replace(/ /g, NBSP)
}

function summaryParts(
  cfg: BuilderConfig,
  metasets: Metaset[],
  opts: {
    substatColors: Record<number, { fg: string; bg: string }>
    useStatButtonColors: boolean
    showFactionIcons: boolean
    showSetIcons: boolean
    showSlotIcons: boolean
    t?: (key: string, params?: Record<string, string | number>) => string
    lang: string
    cfgIndex?: number
    tooltipsDisabled?: boolean
    catalogVersion?: number
  }
): JSX.Element | null {
  const parts: Array<JSX.Element> = []
  void opts.catalogVersion
  const milestoneThresholdsActive = isMilestoneThresholdsActive(cfg)
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
  // 🌅 for Early, 🌙 for Late. Hide the section entirely when Milestone Thresholds
  // cannot go Late so the summary stays focused on active behavior.
  if (milestoneThresholdsActive) {
    const mode = (cfg.earlyKeepMode ?? 'early')
    addText(mode === 'late' ? '🌙' : '🌅')
  }

  // Faction
  if (cfg.factionCode && cfg.factionCode !== 0) {
    const tr = opts.t
    const rawLabel = tr ? tr(factionI18nKey(cfg.factionCode)) : factionCodeToName(cfg.factionCode)
    const label = withNbsp(rawLabel)
    if (opts.showFactionIcons) {
      addNode(
        <MarkdownTooltip markdown={label}>
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              verticalAlign: `${CONFIG_CHIP_FACTION_ICON_OFFSET_EM}em`,
            }}
          >
            <FactionIcon faction={cfg.factionCode} size={18} sx={{ mr: 0.25 }} />
          </Box>
        </MarkdownTooltip>
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
      if (opts.showSlotIcons) {
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
          const label = withNbsp(tr ? tr(artifactTypeI18nKey(typeId)) : artifactTypeName(typeId))
          return <Box key={`slot-${typeId}-${i}`} component="span" sx={{ mr: 0.5 }}>{label}</Box>
        })
        addNode(<>{nodes}</>)
      } else {
        const tr = opts.t
        const labels = sorted.map((typeId) => withNbsp(tr ? tr(artifactTypeI18nKey(typeId)) : artifactTypeName(typeId)))
        addText(labels.join(', '))
      }
    }
  }

  // Main stats (colored if enabled) — follows Slots
  {
    const v = ((cfg as unknown as { mainStatsV?: number[] }).mainStatsV ?? []).slice()
    // Preferred stat ordering used across the app (same as substat chips/table)
    v.sort(compareVariants)
    if (v.length > 0) {
      const nodes = v.map((vk, i) => {
        const name = withNbsp(opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
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
      let nodes: JSX.Element[]
      try {
        nodes = sv.map((vk, i) => {
          const name = withNbsp(opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
          const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
        // Render per-substat roll bounds using a compact, readable indicator circle
        // like the Builder’s roll badge, but without fill: a red (cap) or green (min/any)
        // outlined circle with the number inside. This avoids the cryptic ">= 4r" text.
        const b = bounds ? bounds[vk] : undefined
        const min = (b && typeof b.min === 'number') ? Math.max(0, Math.min(5, Math.floor(b.min))) : undefined
        const max = (b && typeof b.max === 'number') ? Math.max(0, Math.min(5, Math.floor(b.max))) : undefined
        const showCap = max !== undefined
        const showMin = !showCap && (min !== undefined)
        const rawTargetEntry = (cfg as BuilderConfig).substatRollTargetsV?.[vk]
        let targetsEntry = null
        try {
          targetsEntry = normalizeLooseRollTargetEntry(rawTargetEntry)
        } catch {
          targetsEntry = null
        }
        const targetSummary = (() => {
          if (!targetsEntry) return null
          try {
            const values: string[] = []
            const formatValue = (val: unknown) => (typeof val === 'number' && Number.isFinite(val) ? String(Math.round(val)) : '—')
            values.push(formatValue(targetsEntry.base))
            const increments = targetsEntry.increments ?? []
            for (let idx = 0; idx < SUBSTAT_TARGET_MAX_ROLLS; idx += 1) {
              values.push(formatValue(increments[idx]))
            }
            return values.every((val) => val === '—') ? null : values.join(' / ')
          } catch {
            return null
          }
        })()
        const hasTargets = Boolean(targetSummary)

        // Indicator: show only one state. UI enforces mutual exclusivity; if both present (legacy), prefer cap.
          const indicator = (showCap || showMin) ? (
          <Box
            key={`ri-${vk}-${i}`}
            component="span"
            sx={{
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

        const tooltipSections: string[] = []
        if (showCap) tooltipSections.push(opts.t ? opts.t('chipMaxRolls', { n: String(max ?? '') }) : `Max rolls: ${String(max ?? '')}`)
        else if (showMin) tooltipSections.push(opts.t ? opts.t('chipMinRolls', { n: String(min ?? '') }) : `Min rolls: ${String(min ?? '')}`)
        if (targetSummary) {
          tooltipSections.push(targetSummary)
        }

        // Dotted underline mirrors the Builder menu: signals “this stat has a
        // custom target override” without needing another badge.
          const content = (
          <Box
            key={`s-${vk}-${i}`}
            component="span"
            sx={{
              color: opts.useStatButtonColors ? fg : undefined,
              textDecoration: hasTargets ? 'underline' : undefined,
              textDecorationStyle: hasTargets ? 'dotted' : undefined,
              textDecorationThickness: hasTargets ? '1px' : undefined,
              textUnderlineOffset: hasTargets ? 2 : undefined,
            }}
          >
            {name}
            {fixedSet.has(vk as number) ? '🔒' : ''}
            {indicator ? (
              <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                {NBSP}
                {indicator}
              </Box>
            ) : null}
          </Box>
        )

          if (tooltipSections.length > 0 && !opts.tooltipsDisabled) {
            return (
              <MarkdownTooltip
                key={`s-${vk}-${i}`}
                render={<BuilderTooltipContent text={tooltipSections.join('\n')} />}
                arrow
                enterDelay={200}
              >
                {content}
              </MarkdownTooltip>
            )
          }

          return content
        })
      } catch {
        nodes = [
          <Box key="substat-render-error" component="span" sx={{ color: 'error.main' }}>
            Render error
          </Box>,
        ]
      }
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

  // Min Required Rolls (aggregate across selected; show only when > 0)
  const lockedMin = clampAggregateRollDisplayValue(cfg.lockedMinRequiredRolls ?? 0)
  const manualAggregateMin = clampAggregateRollDisplayValue(cfg.minRequiredRolls ?? 0)
  const hasManualAggregateMin = manualAggregateMin > 0
  const hasLockedMin = lockedMin > 0

  if (hasManualAggregateMin && hasLockedMin) {
    const lockedSegment = `${lockedMin}🔒`
    const totalSegment = manualAggregateMin > lockedMin ? `/${manualAggregateMin}` : ''
    addText(`Σr${NBSP}≥${NBSP}${lockedSegment}${totalSegment}`)
  } else if (hasManualAggregateMin) {
    // Legacy locked scope still appends a lock so older configs remain understandable.
    const lockedScope = isLockedAggregateScopeActive(cfg)
    addText(`Σr${NBSP}≥${NBSP}${manualAggregateMin}${lockedScope ? `${NBSP}🔒` : ''}`)
  } else if (hasLockedMin) {
    addText(`Σr${NBSP}≥${NBSP}${lockedMin}🔒`)
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
      const metasetTextTitle = metasetTextParts.join(', ')
      const nodes: JSX.Element[] = []
      let isFirst = true
      const pushNode = (
        key: string,
        children: React.ReactNode,
        sx: Record<string, unknown>,
        title?: string,
      ) => {
        const sharedSx = {
          ...(!isFirst ? { ml: 0.35 } : {}),
          ...sx,
        }
        nodes.push(
          title
            ? (
              <MarkdownTooltip key={key} markdown={title}>
                <Box component="span" sx={sharedSx}>
                  {children}
                </Box>
              </MarkdownTooltip>
            )
            : (
              <Box key={key} component="span" sx={sharedSx}>
                {children}
              </Box>
            ),
        )
        isFirst = false
      }

      if (metasetTextParts.length > 0) {
        pushNode(
          'metaset-text',
          metasetTextParts.join(', '),
          { display: 'inline', overflowWrap: 'anywhere' },
          metasetTextTitle,
        )
      }

      metasetIconEntries.forEach((entry, idx) => {
        const option = metasetIconOptionById(entry.iconId)
        pushNode(
          `meta-set-${entry.key}-icon-${idx}`,
          option.glyph,
          {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: CONFIG_CHIP_METASET_ICON_BOX_PX,
            height: CONFIG_CHIP_METASET_ICON_BOX_PX,
            lineHeight: 1,
            textAlign: 'center',
            fontSize: 'inherit',
          },
          String(entry.name),
        )
      })

      setIdsSorted.forEach((id, idx) => {
        const canonicalName = artifactSetName(id)
        const localizedName = withNbsp(opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : canonicalName)
        pushNode(
          `set-icon-${id}-${idx}`,
              <SetIcon
                setId={id}
                label={localizedName}
                sx={{
                  mr: 0,
                  verticalAlign: `${CONFIG_CHIP_ARTIFACT_SET_ICON_OFFSET_EM}em`,
                }}
              />,
              {
                display: 'inline-flex',
                alignItems: 'center',
                verticalAlign: `${CONFIG_CHIP_ARTIFACT_SET_ICON_OFFSET_EM}em`,
              },
              localizedName,
            )
          })

      if (nodes.length > 0) {
        addNode(
          <Box component="span" sx={{ display: 'inline', whiteSpace: 'normal' }}>
            {nodes}
          </Box>,
        )
      }
    } else {
      const setNames = setIdsSorted.map(id => withNbsp(opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : artifactSetName(id)))
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
