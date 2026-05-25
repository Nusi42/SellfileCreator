import { Box, Chip } from '@mui/material'
import type { ChipProps } from '@mui/material'
import { useTheme, type SxProps, type Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { RULE_SOURCE_FINAL_SELL, RULE_SOURCE_SAFEGUARDS } from '../lib/merge'
import { useI18n } from '../lib/i18n'
import type { GearInspectorPreviewMatch } from '../types/gearInspectorPreview'
import { MATCHING_RECIPE_CHIP_MIN_WIDTH_PX } from '../lib/constants'
// MarkdownTooltip keeps the jump hint aligned with the rest of the tooltip rollout.
import MarkdownTooltip from './MarkdownTooltip'
import EllipsisTooltip from './EllipsisTooltip'
import { getGearInspectorMatchBorderColor, getGearInspectorMatchSurfaceColors } from './gearInspectorMatchStyles'

type GearInspectorRuleReferenceChipProps = {
  match: GearInspectorPreviewMatch | null
  onJump?: (ruleIndex: number, recipeIdx: number | null) => void
  size?: ChipProps['size']
  sx?: SxProps<Theme>
  showFinalSellLabel?: boolean
  icon?: ChipProps['icon']
  showRecipeIndex?: boolean
  showLineNumber?: boolean
}

const simpleMatchChipSx = (sx?: SxProps<Theme>): SxProps<Theme> => {
  const base: SystemStyleObject<Theme> = {
    width: 'auto',
    maxWidth: '100%',
    flexShrink: 0,
    // Keep parity with Gear Inspector overflow chips so the first match stays tap-friendly.
    minWidth: MATCHING_RECIPE_CHIP_MIN_WIDTH_PX,
    '& .MuiChip-label': {
      display: 'inline-flex',
      px: 0.75,
      whiteSpace: 'nowrap',
    },
  }
  if (!sx) return base
  const asArray: SxProps<Theme>[] = Array.isArray(sx) ? sx : [sx]
  return [...asArray, base] as SxProps<Theme>
}


export function GearInspectorRuleReferenceChip({
  match,
  onJump,
  size = 'small',
  sx,
  showFinalSellLabel = true,
  icon,
  showRecipeIndex = true,
  showLineNumber = false,
}: GearInspectorRuleReferenceChipProps) {
  const { t } = useI18n()
  const theme = useTheme()
  if (!match) return null
  // Rule source flags drive tint + label behavior.
  const isFinalSellSource = match.ruleSource === RULE_SOURCE_FINAL_SELL
  const isSafeguardSource = match.ruleSource === RULE_SOURCE_SAFEGUARDS
  const jumpTooltip = isSafeguardSource ? t('gearInspectorJumpToSafeguard') : t('gearInspectorJumpToRecipe')
  if (isFinalSellSource) {
    if (!showFinalSellLabel) return null
    // Final Sell source uses the sell (error) channel tokens — stronger tint for quick scanning.
    return (
      <GearInspectorRuleReferenceChipBody
        label={t('gearInspectorFinalSellChip')}
        variant="outlined"
        clickable={false}
        ruleIndex={null}
        recipeIdx={null}
        size={size}
        jumpTooltip={jumpTooltip}
        sx={simpleMatchChipSx(sx)}
        borderColor={getGearInspectorMatchBorderColor(theme, false)}
        backgroundColor={theme.custom.sourceChipSellSurface}
        hoverBackgroundColor={theme.custom.sourceChipSellHover}
        dataMatchSource="final-sell"
        {...(icon ? { icon } : {})}
      />
    )
  }
  const ruleIndex = typeof match.ruleIndex === 'number' ? match.ruleIndex : null
  const recipeIdx = typeof match.recipeIdx === 'number' ? match.recipeIdx : null
  const trimmedDecoratedName = (match.recipeName ?? '').trim()
  const fallbackRuleLabel = match.ruleLabel ? match.ruleLabel.trim() : ''
  const formattedRecipeName = trimmedDecoratedName.length > 0
    ? trimmedDecoratedName
    : (fallbackRuleLabel.length > 0
      ? fallbackRuleLabel
      : (recipeIdx != null ? `#${recipeIdx + 1}` : ''))
  // Use recipeFgColor when a recipe name is shown; fall back to the safeguard rule's own
  // fgColor when no recipe color exists (covers both recipe-less safeguard matches and
  // safeguard-over-recipe matches where the recipe itself has no explicit color).
  const textColor = (match.recipeFgColor && trimmedDecoratedName.length > 0)
    ? match.recipeFgColor
    : (isSafeguardSource ? (match.ruleLabelFgColor ?? null) : null)
  // Number segment is intentionally lightweight: recipe index + line number sans labels,
  // joined with a mid-dot so the trailing recipe name stays readable on narrow cards.
  const recipeNumberSegment = (showRecipeIndex && recipeIdx != null)
    ? `#${recipeIdx + 1}`
    : ''
  const ruleLineSegment = (showLineNumber && ruleIndex != null)
    ? `#${ruleIndex + 1}`
    : ''
  const numberSegment = [recipeNumberSegment, ruleLineSegment].filter((part) => part && part.length > 0).join(' • ')
  const label = numberSegment
    ? `${numberSegment} | ${formattedRecipeName}`
    : formattedRecipeName
  // Some rule sources (e.g., imported base HSF sell rows) have no recipe/source label.
  // Fall back to the matched rule line so primary matches never render as empty.
  const resolvedLabel = label.length > 0
    ? label
    : (ruleIndex != null ? `#${ruleIndex + 1}` : '')
  const clickable = typeof onJump === 'function' && ruleIndex != null
  if (!resolvedLabel) return null
  // Safeguard source chips use the stronger source-chip keep tint; regular match chips use match surface tint.
  const chipSurfaceTint = isSafeguardSource
    ? { surface: theme.custom.sourceChipKeepSurface, hover: theme.custom.sourceChipKeepHover }
    : getGearInspectorMatchSurfaceColors(theme, Boolean(match.keep))
  // Data attribute lets tests and analytics distinguish safeguard matches.
  const dataMatchSource = isSafeguardSource ? 'safeguard' : undefined
  return (
    <GearInspectorRuleReferenceChipBody
      label={resolvedLabel}
      variant="outlined"
      clickable={clickable}
      ruleIndex={ruleIndex}
      recipeIdx={typeof match.recipeIdx === 'number' ? match.recipeIdx : null}
      size={size}
      jumpTooltip={jumpTooltip}
      textColor={textColor}
      {...(sx ? { sx } : {})}
      {...(icon ? { icon } : {})}
      borderColor={getGearInspectorMatchBorderColor(theme, Boolean(match.keep))}
      backgroundColor={chipSurfaceTint.surface}
      hoverBackgroundColor={chipSurfaceTint.hover}
      {...(dataMatchSource ? { dataMatchSource } : {})}
      {...(onJump ? { onJump } : {})}
    />
  )
}

type GearInspectorRuleReferenceChipBodyProps = {
  label: string
  variant?: ChipProps['variant']
  clickable: boolean
  ruleIndex: number | null
  recipeIdx: number | null
  onJump?: (ruleIndex: number, recipeIdx: number | null) => void
  size?: ChipProps['size']
  sx?: SxProps<Theme>
  icon?: ChipProps['icon']
  jumpTooltip: string
  textColor?: string | null
  borderColor?: string
  backgroundColor?: string
  hoverBackgroundColor?: string
  dataMatchSource?: string
}

function GearInspectorRuleReferenceChipBody({
  label,
  variant = 'outlined',
  clickable,
  ruleIndex,
  recipeIdx,
  onJump,
  size = 'small',
  sx,
  icon,
  jumpTooltip,
  textColor,
  borderColor,
  backgroundColor,
  hoverBackgroundColor,
  dataMatchSource,
}: GearInspectorRuleReferenceChipBodyProps) {
  const theme = useTheme()
  const resolvedBackgroundColor = backgroundColor ?? 'background.paper'
  const resolvedHoverColor = clickable
    ? hoverBackgroundColor ?? 'action.hover'
    : undefined
  const baseSx: SxProps<Theme> = {
    cursor: clickable ? 'pointer' : 'default',
    bgcolor: resolvedBackgroundColor,
    color: textColor ?? 'text.primary',
    borderRadius: `${theme.shape.borderRadius}px`,
    minWidth: MATCHING_RECIPE_CHIP_MIN_WIDTH_PX,
    maxWidth: '100%',
    flexShrink: 1,
    overflow: 'hidden',
    '&:hover': resolvedHoverColor ? { bgcolor: resolvedHoverColor } : undefined,
    // Keep/sell state drives the outline so users can read the result at a glance.
    borderColor: borderColor ?? 'primary.main',
    borderWidth: '1px',
    borderStyle: 'solid',
    '& .MuiChip-label': {
      px: 0.75,
      display: 'block',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      ...(textColor ? { color: textColor } : {}),
    },
  }
  const combinedSx: SxProps<Theme> = sx
    ? [baseSx, ...(Array.isArray(sx) ? sx : [sx])]
    : baseSx
  const canJump = clickable && typeof onJump === 'function' && typeof ruleIndex === 'number'
  const interactiveProps = canJump
    ? { component: 'button' as const, onClick: () => onJump(ruleIndex, recipeIdx) }
    : {}
  const iconProps = icon ? { icon } : {}
  const dataMatchSourceProps = dataMatchSource ? { 'data-match-source': dataMatchSource } : {}
  const baseChip = (
    <Chip
      size={size}
      variant={variant}
      {...iconProps}
      {...dataMatchSourceProps}
      label={label}
      {...interactiveProps}
      sx={combinedSx}
    />
  )
  const chipWithEllipsis = (
    // Force the tooltip wrapper to behave like the old block-level chip so Gear Inspector cards never overflow.
    <EllipsisTooltip title={label} selector=".MuiChip-label" wrap="block">
      {baseChip}
    </EllipsisTooltip>
  )
  if (!clickable) {
    return (
      <Box component="span" sx={{ display: 'block', maxWidth: '100%', minWidth: 0 }}>
        {chipWithEllipsis}
      </Box>
    )
  }
  return (
    // Keep jump hints in sync with other Markdown tooltips so multi-line copy stays readable.
    <MarkdownTooltip markdown={jumpTooltip}>
      <Box component="span" sx={{ display: 'block', maxWidth: '100%', minWidth: 0 }}>
        {chipWithEllipsis}
      </Box>
    </MarkdownTooltip>
  )
}
