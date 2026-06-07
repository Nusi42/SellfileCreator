import { memo, useMemo, useState } from 'react'
import type React from 'react'
import type { JSX } from 'react'
import { Box, Chip, IconButton, Typography } from '@mui/material'
import { alpha, useTheme, useColorScheme } from '@mui/material/styles'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderRecipe } from '../lib/hsfBuilder'
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
import { NBSP, RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, RECIPE_CHIP_VERTICAL_PADDING_PX, SUBSTAT_TARGET_MAX_ROLLS } from '../lib/constants'
import { CircledDigitBadge } from './CircledDigitBadge'
import { normalizeLooseRollTargetEntry, resolveAutoRarityCode } from '../lib/hsfBuilder'
import { isLockedAggregateScopeActive, isMilestoneThresholdsActive } from '../lib/recipeNormalization'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { useI18n } from '../lib/i18n'
import { FactionIcon } from './FactionIcon'
import { useDisplayPreferences } from '../state/preferencesState'
import { SetIcon } from './SetIcon'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById } from '../lib/metasetIcons'
import type { MetasetIconId } from '../lib/metasetIcons'
import type { SellfileExportMode } from '../lib/hsfBuilder'
import { splitArtifactSetSelections } from '../lib/gearSets/selection'
import { lightAdaptedSubstatFg } from '../lib/themeCustomTokens'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import MarkdownTooltip from './MarkdownTooltip'
import { resolveDisabledOpacity } from './disabledOpacity'

// Separate baseline nudges keep bitmap faction icons and font slot icons visually centered.
const RECIPE_CHIP_FACTION_ICON_OFFSET_EM = -0.45
const RECIPE_CHIP_SLOT_ICON_OFFSET_EM = -0.20
const RECIPE_CHIP_ARTIFACT_SET_ICON_OFFSET_EM = -0.35
const RECIPE_CHIP_METASET_ICON_BOX_PX = 16

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

type SeparatorDividerDecoration = {
  displayName: string
  hasLabel: boolean
  borderStyle: 'solid' | 'dashed' | 'dotted'
  borderWidthPx: number
  lineColor: string
  textColor: string
  minLineWidthPx: number
}

// Separator dividers treat leading "#" prefixes as style hints (dash/dot width), and fgColor as the line color.
function deriveSeparatorDividerDecoration(rawName: string | undefined, fgColor: string | undefined, baseColor: string): SeparatorDividerDecoration {
  const trimmed = (rawName ?? '').trim()
  const hashMatch = trimmed.match(/^(#+)/)
  const hashPrefix = hashMatch?.[1] ?? ''
  const hashCount = hashPrefix.length

  const displayName = trimmed.slice(hashPrefix.length).trimStart()
  // Use fgColor from appearance when set; fall back to the theme base color.
  const resolvedColor = fgColor || baseColor
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
  let lineColor: string
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

interface RecipeChipProps {
  index: number
  recipe: BuilderRecipe
  exportModeOverride?: SellfileExportMode
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
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  isLast: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  isDuplicate?: boolean
  duplicateOfIndex?: number
  showTagsChips?: boolean
  /** Panel-owned context menu: chip fires this on right-click; the panel opens its shared menu. */
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>, idx: number) => void
}

function RecipeChip({
  index,
  recipe,
  exportModeOverride,
  gearSetCatalogVersion = 0,
  dragEnabled = false,
  onPointerDown,
  hideTooltip = false,
  ghostedWhileDragging = false,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  selected,
  visualVariant,
  onSelect,
  isLast,
  onHover,
  metasets,
  substatColors,
  isDuplicate,
  duplicateOfIndex,
  showTagsChips,
  onContextMenu: onContextMenuProp,
}: RecipeChipProps) {
  const { t, lang } = useI18n()
  const { showFactionIcons, statButtonBorders, showSetIcons, showSlotIcons } = useDisplayPreferences()
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const primaryColor = (theme.vars?.palette.primary.main ?? theme.palette.primary.main)
  // Keep disabled chip dimming aligned with other disabled UI elements.
  const disabledOpacity = resolveDisabledOpacity(theme)
  // Derive display name and color directly from the first-class appearance field.
  const nameDecoration = useMemo(() => ({
    displayName: recipe.appearance?.name ?? '',
    resolvedColor: recipe.appearance?.fgColor ?? primaryColor,
    hasExplicitColor: Boolean(recipe.appearance?.fgColor),
  }), [recipe.appearance, primaryColor])
  // Allow callers to override the export mode for recipe overrides previews.
  const exportMode: SellfileExportMode = exportModeOverride ?? recipe.exportMode
  const isSeparator = exportMode === 'separator'
  const isHidden = exportMode === 'disabled'
  const separatorDecoration = useMemo(
    () => deriveSeparatorDividerDecoration(recipe.appearance?.name, recipe.appearance?.fgColor, primaryColor),
    [recipe.appearance, primaryColor],
  )
  // Build compact summary without redundant labels; act is rendered separately
  const actText = recipe.keep ? t('keepValueKeep') : t('keepValueSell')
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
    () => summaryParts(recipe, metasets, {
      substatColors,
      useStatButtonColors: statButtonBorders,
      showFactionIcons,
      showSetIcons,
      showSlotIcons,
      t,
      lang,
      recipeIndex: index,
      tooltipsDisabled: tooltipSuppressed,
      catalogVersion: gearSetCatalogVersion,
      isLight: colorScheme === 'light',
    }),
    [recipe, metasets, substatColors, statButtonBorders, showFactionIcons, showSetIcons, showSlotIcons, t, lang, index, tooltipSuppressed, gearSetCatalogVersion, colorScheme],
  )
  const keepColor = recipe.keep ? 'success.main' : 'error.main'
  const isDisabled = isHidden
  // Dim the summary text when recipes export with Use = false.
  const summaryOpacity = isDisabled ? disabledOpacity : 1
  const showDuplicateFrame = !isSeparator && isDuplicate
  const backgroundMode = visualVariant ?? 'interactive'
  const [overControls, setOverControls] = useState(false)
  const [chipHover, setChipHover] = useState(false)
  // Suppress tooltips immediately when dragging begins so they do not reopen after drop.
  if (hideTooltip && (chipHover || overControls)) {
    setChipHover(false)
    setOverControls(false)
  }
  const tooltipTitle = useMemo(() => {
    if (showDuplicateFrame && typeof duplicateOfIndex === 'number') {
      return t('chipTooltipDuplicateOf', { n: duplicateOfIndex + 1 })
    }
    return null
  }, [duplicateOfIndex, showDuplicateFrame, t])
  const showTooltip = Boolean(tooltipTitle) && !hideTooltip

  const chipNode = (
    <Box
      id={`recipe-chip-${index}`}
      data-tour-id={selected ? 'chip.selected' : undefined}
      data-recipe-chip-index={index}
      data-recipe-chip="true"
      // Builder hover is coordinated outside React; App.tsx toggles this attribute
      // so the chip can reuse the same highlight styles as pointer-driven focus.
      data-linked-hover="false"
      aria-grabbed={dragEnabled ? (selected ? 'true' : 'false') : undefined}
      onPointerDown={dragEnabled ? onPointerDown : undefined}
      sx={(theme) => {
        const hoverBg = theme.custom.hoverBg
        const selectedHoverBg = theme.custom.selectedHoverBg
        const isStatic = backgroundMode === 'static'
        const staticBg = isStatic
          ? 'rgba(var(--mui-palette-text-primaryChannel) / 0.08)'
          : null
        const baseBackground = isStatic
          ? staticBg
          : (selected ? (theme.vars?.palette.action.selected ?? theme.palette.action.selected) : 'transparent')
        const baseBorderColor = selected
          ? (theme.vars?.palette.primary.main ?? theme.palette.primary.main)
          : (showDuplicateFrame ? (theme.vars?.palette.error.main ?? theme.palette.error.main) : (theme.vars?.palette.divider ?? theme.palette.divider))
        // Full-width column layout: avoid percentage-based flex so chips don't stretch vertically.
        const flexSizing = isSeparator
          ? '0 0 auto'
          : (isStatic ? '0 1 auto' : '0 0 auto')
        // Interactive chips should fill the row; static chips keep their natural width.
        const rowWidth = isSeparator || !isStatic ? '100%' : 'auto'
        const borderRadius = `${theme.shape.borderRadius}px`
        const pointerCursor = isStatic ? 'default' : (dragEnabled ? 'grab' : 'pointer')
        return {
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: isSeparator ? (separatorDecoration.hasLabel ? 1.5 : 0) : 0.5,
          // Cap width so chips never push outside the scroller.
          maxWidth: '100%',
          // Fill the row in the builder column layout.
          width: rowWidth,
          overflow: isStatic ? 'visible' : 'hidden',
          border: '1px solid',
          borderColor: baseBorderColor,
          backgroundColor: baseBackground,
          borderRadius,
          pl: isSeparator ? 1.1 : 1,
          pr: isSeparator ? 1.1 : 0.4,
          py: `${RECIPE_CHIP_VERTICAL_PADDING_PX}px`,
          cursor: pointerCursor,
          flex: flexSizing,
          flexWrap: isStatic ? 'wrap' : 'nowrap',
          ...(isSeparator ? { justifyContent: 'center' } : {}),
          '&[data-linked-hover="true"]': {
            backgroundColor: isStatic
              ? staticBg
              : (selected ? selectedHoverBg : hoverBg),
            borderColor: (theme.vars?.palette.primary.main ?? theme.palette.primary.main),
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
          // Auto-select so the panel's context menu actions target the right chip.
          onSelect(e)
        }
        onHover(false)
        setChipHover(false)
        // Delegate menu opening to the panel — it owns the shared RecipeContextMenu.
        onContextMenuProp?.(e, index)
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
          <Box
            component="span"
            sx={{
              display: 'inline',
              // Apply the dimmed opacity to the full summary line.
              opacity: summaryOpacity,
            }}
          >
            {`${index + 1}. `}
            <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
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
      {/* Inline tag chips — mirrors SafeguardChipsPanel tag display, shown when preference is on. */}
      {!isSeparator && showTagsChips && recipe.tags && recipe.tags.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0, alignItems: 'flex-end', mr: 0.25 }}>
          {recipe.tags.slice(0, 3).map((tag) => (
            <Chip key={tag} size="small" label={tag} sx={{ height: 16, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />
          ))}
          {recipe.tags.length > 3 ? (
            <Chip size="small" label={`+${recipe.tags.length - 3}`} sx={{ height: 16, fontSize: '0.65rem', opacity: 0.7, '& .MuiChip-label': { px: 0.75 } }} />
          ) : null}
        </Box>
      ) : null}
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
                  width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
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
                  width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
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
                  width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
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
                  width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
                  p: 0.25,
                }}
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                color="error"
              ><DeleteIcon fontSize="inherit" /></IconButton>
            </span>
          </MarkdownTooltip>
        </>
      ) : null}
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

function areRecipeChipPropsEqual(prev: Readonly<RecipeChipProps>, next: Readonly<RecipeChipProps>): boolean {
  return prev.recipe === next.recipe
    && prev.exportModeOverride === next.exportModeOverride
    && prev.index === next.index
    && prev.gearSetCatalogVersion === next.gearSetCatalogVersion
    && prev.dragEnabled === next.dragEnabled
    && prev.hideTooltip === next.hideTooltip
    && prev.ghostedWhileDragging === next.ghostedWhileDragging
    && prev.selected === next.selected
    && prev.isLast === next.isLast
    && prev.visualVariant === next.visualVariant
    && prev.isDuplicate === next.isDuplicate
    && prev.duplicateOfIndex === next.duplicateOfIndex
    && prev.substatColors === next.substatColors
    && prev.metasets === next.metasets
    && prev.showTagsChips === next.showTagsChips
    && prev.onContextMenu === next.onContextMenu
}

export default memo(RecipeChip, areRecipeChipPropsEqual)

const withNbsp = (value: string | undefined | null): string => {
  if (!value) return ''
  return value.replace(/ /g, NBSP)
}

export function summaryParts(
  recipe: BuilderRecipe,
  metasets: Metaset[],
  opts: {
    substatColors: Record<number, { fg: string; bg: string }>
    useStatButtonColors: boolean
    showFactionIcons: boolean
    showSetIcons: boolean
    showSlotIcons: boolean
    t?: (key: string, params?: Record<string, string | number>) => string
    lang: string
    recipeIndex?: number
    tooltipsDisabled?: boolean
    catalogVersion?: number
    isLight?: boolean
  }
): JSX.Element | null {
  const parts: Array<JSX.Element> = []
  void opts.catalogVersion
  const milestoneThresholdsActive = isMilestoneThresholdsActive(recipe)
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

    const rank = chipRankLabel(recipe.rankCode)
    const effectiveRarityCode = (recipe.rarityMode === 'auto') ? resolveAutoRarityCode(recipe) : recipe.rarityCode
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
    const isLate = ((recipe.earlyKeepMode ?? 'early') === 'late')
    // Multi-branch when Late+Auto and base is below Legendary: show +
    const multiRarity = (recipe.rarityMode === 'auto') && isLate && (effectiveRarityCode !== 16)
    if (multiRarity) rarity = `${rarity}${NBSP}+`
    const combined = [rank, rarity].filter(Boolean).join(NBSP)
    if (combined) addText(combined)
  }

  // Keep mode indicator: show a compact emoji for timing to make it explicit.
  // 🌅 for Early, 🌙 for Late. Hide the section entirely when Milestone Thresholds
  // cannot go Late so the summary stays focused on active behavior.
  if (milestoneThresholdsActive) {
    const mode = (recipe.earlyKeepMode ?? 'early')
    addText(mode === 'late' ? '🌙' : '🌅')
  }

  // Faction
  if (recipe.factionCode && recipe.factionCode !== 0) {
    const tr = opts.t
    const rawLabel = tr ? tr(factionI18nKey(recipe.factionCode)) : factionCodeToName(recipe.factionCode)
    const label = withNbsp(rawLabel)
    if (opts.showFactionIcons) {
      addNode(
        <MarkdownTooltip markdown={label}>
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              verticalAlign: `${RECIPE_CHIP_FACTION_ICON_OFFSET_EM}em`,
            }}
          >
            <FactionIcon faction={recipe.factionCode} size={18} sx={{ mr: 0.25 }} />
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
    const types = (recipe as unknown as { artifactTypes?: number[] }).artifactTypes
    if (types && types.length > 0) {
      const sorted = [...types].sort(compareArtifactTypes)
      if (opts.showSlotIcons) {
        const nodes = sorted.map((typeId) => {
          const Icon = artifactTypeIconFor(typeId)
          if (Icon) {
            return (
              // Inline icon baseline tends to sit a bit high next to caption text;
              // nudge it down slightly for visual centering in the chip.
              <Box
                key={`slot-${typeId}`}
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  mr: 0.5,
                  verticalAlign: `${RECIPE_CHIP_SLOT_ICON_OFFSET_EM}em`,
                }}
              >
                <Icon fontSize="inherit" />
              </Box>
            )
          }
          // Fallback to text if icon not found (should not happen)
          const tr = opts.t
          const label = withNbsp(tr ? tr(artifactTypeI18nKey(typeId)) : artifactTypeName(typeId))
          return <Box key={`slot-${typeId}`} component="span" sx={{ mr: 0.5 }}>{label}</Box>
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
    const v = ((recipe as unknown as { mainStatsV?: number[] }).mainStatsV ?? []).slice()
    // Preferred stat ordering used across the app (same as substat chips/table)
    v.sort(compareVariants)
    if (v.length > 0) {
      const nodes = v.map((vk) => {
        const name = withNbsp(opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
        const fg = lightAdaptedSubstatFg((opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined, opts.isLight ?? false)
        return (
          <Box key={`m-${vk}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>{name}</Box>
        )
      })
      const interleaved: JSX.Element[] = []
      nodes.forEach((n, i) => { interleaved.push(n); if (i < nodes.length - 1) interleaved.push(<Box key={`m-sep-${v[i]}`} component="span">, </Box>) })
      addNode(<>{interleaved}</>)
    }
  }

  // Substats (colored if enabled)
  {
    const sv = ((recipe as unknown as { substatsV?: number[] }).substatsV ?? []).slice()
    // Sort substats by the same preferred order
    sv.sort(compareVariants)
    const fv = (recipe as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV ?? []
    const bounds = (recipe as unknown as { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> }).substatRollBoundsV as Record<number, { min?: number; max?: number; any?: boolean }> | undefined
    if (sv.length > 0) {
      const fixedSet = new Set<number>(fv as number[])
      let nodes: JSX.Element[]
      try {
        nodes = sv.map((vk) => {
          const name = withNbsp(opts.t ? opts.t(statVariantI18nKey(vk)) : labelOfVariant(vk))
          const fg = lightAdaptedSubstatFg((opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined, opts.isLight ?? false)
        // Render per-substat roll bounds using a compact, readable indicator circle
        // like the Builder’s roll badge, but without fill: a red (cap/not) or green (min/any)
        // outlined circle with the symbol inside.
        const b = bounds ? bounds[vk] : undefined
        const isNot = Boolean((b as { not?: boolean } | undefined)?.not)
        const min = (!isNot && b && typeof b.min === 'number') ? Math.max(0, Math.min(5, Math.floor(b.min))) : undefined
        const max = (!isNot && b && typeof b.max === 'number') ? Math.max(0, Math.min(4, Math.floor(b.max))) : undefined
        const showCap = max !== undefined
        const showMin = !showCap && (min !== undefined)
        const showNot = isNot && !showCap && !showMin
        const rawTargetEntry = (recipe as BuilderRecipe).substatRollTargetsV?.[vk]
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

        // Indicator: show only one state. Prefer cap; ¬ (not) shown in red like cap.
        // Border color signals intent (red = cap/not, green = min); text stays white.
          // Caption context is ~12 px; 0.95 × 12 ≈ 11.4 px digit, 1.32 × 11.4 ≈ 15 px circle.
          // Digit color matches border color so it stays readable in both light and dark themes
          // (white text on a transparent badge is invisible against a light chip background).
          const indicatorColor = (showCap || showNot) ? 'error.main' : 'success.main'
          const indicator = (showCap || showMin || showNot) ? (
          <CircledDigitBadge
            value={showNot ? '¬' : showCap ? max! : min!}
            sx={{
              fontSize: '0.95em',
              width: '1.32em',
              height: '1.32em',
              minWidth: '1.32em',
              borderColor: indicatorColor,
              color: indicatorColor,
            }}
          />
        ) : null

        const tooltipSections: string[] = []
        if (showCap) tooltipSections.push(opts.t ? opts.t('chipMaxRolls', { n: String(max ?? '') }) : `Max rolls: ${String(max ?? '')}`)
        else if (showMin) tooltipSections.push(opts.t ? opts.t('chipMinRolls', { n: String(min ?? '') }) : `Min rolls: ${String(min ?? '')}`)
        else if (showNot) tooltipSections.push(opts.t ? opts.t('chipNotSubstat') : 'Must be absent')
        if (targetSummary) {
          tooltipSections.push(targetSummary)
        }

        // Dotted underline mirrors the Builder menu: signals “this stat has a
        // custom target override” without needing another badge.
          const content = (
          <Box
            key={`s-${vk}`}
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
                key={`s-${vk}`}
                render={<BuilderTooltipContent text={tooltipSections.join('\n')} />}
                arrow
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
      nodes.forEach((n, i) => { interleaved.push(n); if (i < nodes.length - 1) interleaved.push(<Box key={`s-sep-${sv[i]}`} component="span">, </Box>) })
      addNode(<><Box component="span">{`${(opts.t ? opts.t('chipSubs') : 'Subs')}:${NBSP}`}</Box>{interleaved}</>)
    } else {
      const tr = opts.t
      addText(`${tr ? tr('chipSubs') : 'Subs'}:${NBSP}${tr ? tr('any') : 'Any'}`)
    }
  }

  // Required Substats count — omit when flex is off and minCount equals substat count
  // (all substats required by default; the count is redundant in that case)
  {
    const minCount = recipe.minCount ?? 0
    const substatCount = ((recipe as unknown as { substatsV?: number[] }).substatsV?.length ?? 0)
    const isRedundant = !recipe.autoSubstatFlex && minCount === substatCount
    if (minCount > 0 && !isRedundant) {
      const base = opts.t ? opts.t('chipReq') : 'Req'
      const label = recipe.autoSubstatFlex ? `${base}★` : base
      addText(`${label}:${NBSP}${minCount}`)
    }
  }

  // Min Required Rolls (aggregate across selected; show only when > 0)
  const lockedMin = clampAggregateRollDisplayValue(recipe.lockedMinRequiredRolls ?? 0)
  const manualAggregateMin = clampAggregateRollDisplayValue(recipe.minRequiredRolls ?? 0)
  const hasManualAggregateMin = manualAggregateMin > 0
  const hasLockedMin = lockedMin > 0

  if (hasManualAggregateMin && hasLockedMin) {
    const lockedSegment = `${lockedMin}🔒`
    const totalSegment = manualAggregateMin > lockedMin ? `/${manualAggregateMin}` : ''
    addText(`Σr${NBSP}≥${NBSP}${lockedSegment}${totalSegment}`)
  } else if (hasManualAggregateMin) {
    // Legacy locked scope still appends a lock so older recipes remain understandable.
    const lockedScope = isLockedAggregateScopeActive(recipe)
    addText(`Σr${NBSP}≥${NBSP}${manualAggregateMin}${lockedScope ? `${NBSP}🔒` : ''}`)
  } else if (hasLockedMin) {
    addText(`Σr${NBSP}≥${NBSP}${lockedMin}🔒`)
  }

  // Sets (icons when enabled) — render metasets as text and artifacts with icons respecting the preference toggle
  {
    // Split include/exclude entries so we can render exclusions distinctly.
    const setSelection = splitArtifactSetSelections(recipe.artifactSets)
    // Keep included sets sorted for stable chip output.
    const setIdsSorted = setSelection.included.slice().sort((a, b) => Number(a) - Number(b))
    // Keep excluded sets sorted so the strike-through list is stable.
    const excludedSetIds = setSelection.excluded.slice().sort((a, b) => Number(a) - Number(b))
    const metaEntries = (recipe.artifactMetaSets ?? []).map((metaId, idx) => {
      const meta = metasets.find(m => m.name === metaId)
      const iconId = (meta?.iconId ?? DEFAULT_METASET_ICON_ID) as MetasetIconId
      return { key: `${metaId}-${idx}`, name: meta?.name || metaId, iconId }
    })

    if (opts.showSetIcons) {
      const metasetTextEntries = metaEntries.filter(entry => entry.iconId === DEFAULT_METASET_ICON_ID)
      const metasetIconEntries = metaEntries.filter(entry => entry.iconId !== DEFAULT_METASET_ICON_ID)
      const metasetTextParts = metasetTextEntries.map(entry => String(entry.name))
      const nodes: JSX.Element[] = []
      let isFirst = true
      const pushNode = (
        key: string,
        children: React.ReactNode,
        sx: Record<string, unknown>,
        title?: string,
      ) => {
        // Add spacing only after the first entry so the chip stays compact.
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
        // Metasets without icons render as plain text for readability.
        pushNode(
          'metaset-text',
          metasetTextParts.join(', '),
          { display: 'inline', overflowWrap: 'anywhere' },
        )
      }

      metasetIconEntries.forEach((entry, idx) => {
        const option = metasetIconOptionById(entry.iconId)
        // Icon-only metasets reuse the glyph to conserve space.
        pushNode(
          `meta-set-${entry.key}-icon-${idx}`,
          option.glyph,
          {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: RECIPE_CHIP_METASET_ICON_BOX_PX,
            height: RECIPE_CHIP_METASET_ICON_BOX_PX,
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
        // Included sets stay as icons to align with the preference toggle.
        pushNode(
          `set-icon-${id}-${idx}`,
              <SetIcon
                setId={id}
                label={localizedName}
                sx={{
                  mr: 0,
                  verticalAlign: `${RECIPE_CHIP_ARTIFACT_SET_ICON_OFFSET_EM}em`,
                }}
              />,
              {
                display: 'inline-flex',
                alignItems: 'center',
                verticalAlign: `${RECIPE_CHIP_ARTIFACT_SET_ICON_OFFSET_EM}em`,
              },
              localizedName,
            )
          })

      excludedSetIds.forEach((id, idx) => {
        const canonicalName = artifactSetName(id)
        const localizedName = withNbsp(opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : canonicalName)
        // Excluded sets use strike-through text so they are still readable.
        pushNode(
          `set-excluded-${id}-${idx}`,
          <Box component="span" sx={{ textDecoration: 'line-through' }}>
            {localizedName}
          </Box>,
          { display: 'inline-flex', alignItems: 'center' },
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
      const metaNames = metaEntries.map(entry => String(entry.name))
      const includedNames = setIdsSorted.map(id => withNbsp(opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : artifactSetName(id)))
      const excludedNames = excludedSetIds.map(id => withNbsp(opts.t ? getLocalizedGearSetName(id, opts.t, opts.lang) : artifactSetName(id)))
      const nodes: JSX.Element[] = []
      const pushTextNode = (key: string, child: React.ReactNode, strike?: boolean) => {
        if (nodes.length > 0) nodes.push(<Box key={`${key}-sep`} component="span">, </Box>)
        nodes.push(
          <Box
            key={key}
            component="span"
            {...(strike ? { sx: { textDecoration: 'line-through' } } : {})}
          >
            {child}
          </Box>,
        )
      }
      metaNames.forEach((name, idx) => {
        // Metasets always render as regular text in non-icon mode.
        pushTextNode(`meta-${idx}`, name)
      })
      includedNames.forEach((name, idx) => {
        // Included sets render normally.
        pushTextNode(`set-${idx}`, name)
      })
      excludedNames.forEach((name, idx) => {
        // Excluded sets render with strike-through for quick scanning.
        pushTextNode(`set-excluded-${idx}`, name, true)
      })
      if (nodes.length > 0) {
        addNode(<Box component="span">{nodes}</Box>)
      }
    }
  }

  if (parts.length === 0) return null
  // Interleave with separators
  const withSeps: JSX.Element[] = []
  // Key derived from the current array length (before pushing the separator)
  // is unique per separator and avoids using the forEach index parameter.
  // Using p.key was wrong — React nulls element.key at runtime.
  parts.forEach((p, i) => { withSeps.push(p); if (i < parts.length - 1) { const pos = withSeps.length; withSeps.push(<Box key={`sep-${pos}`} component="span"> | </Box>) } })
  return <>{withSeps}</>
}
/**
 * RecipeChip
 *
 * Compact, clickable summary for a single BuilderRecipe with context menu
 * actions (duplicate, move, copy, delete). Renders the human-readable summary.
 */
