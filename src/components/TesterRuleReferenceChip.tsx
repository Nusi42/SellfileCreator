import { useCallback, useRef, useState } from 'react'
import { Box, Chip } from '@mui/material'
import type { ChipProps } from '@mui/material'
import { alpha, useTheme, type SxProps, type Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { RULE_SOURCE_FINAL_SELL, RULE_SOURCE_SAFEGUARDS } from '../lib/merge'
import { useI18n } from '../lib/i18n'
import type { TesterPreviewMatch } from '../types/testerPreview'
import { MATCHING_RECIPE_CHIP_MIN_WIDTH_PX } from '../lib/constants'
// MarkdownTooltip keeps the “jump to recipe” hint aligned with the rest of the tooltip rollout.
import MarkdownTooltip from './MarkdownTooltip'
import EllipsisTooltip, { hasEllipsisOverflow } from './EllipsisTooltip'
import { parseRecipeNameDirectives } from '../lib/recipeNameDirectives'
import { getTesterMatchBorderColor } from './testerMatchStyles'

type TesterRuleReferenceChipProps = {
  match: TesterPreviewMatch | null
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
    // Keep parity with tester overflow chips so the first match stays tap-friendly.
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

const buildChipSurfaceTint = (theme: Theme, tone: string): { surface: string; hover: string } => {
  // Tinted matches lean on translucent fills so the label stays legible in both themes.
  const surfaceAlpha = theme.palette.mode === 'dark' ? 0.35 : 0.12
  const hoverAlpha = theme.palette.mode === 'dark' ? 0.45 : 0.18
  return {
    surface: alpha(tone, surfaceAlpha),
    hover: alpha(tone, hoverAlpha),
  }
}

export function TesterRuleReferenceChip({
  match,
  onJump,
  size = 'small',
  sx,
  showFinalSellLabel = true,
  icon,
  showRecipeIndex = true,
  showLineNumber = false,
}: TesterRuleReferenceChipProps) {
  const { t } = useI18n()
  const theme = useTheme()
  if (!match) return null
  // Rule source flags drive tint + label behavior.
  const isFinalSellSource = match.ruleSource === RULE_SOURCE_FINAL_SELL
  const isSafeguardSource = match.ruleSource === RULE_SOURCE_SAFEGUARDS
  if (isFinalSellSource) {
    if (!showFinalSellLabel) return null
    const finalSellTint = buildChipSurfaceTint(theme, theme.palette.error.main)
    return (
      <TesterRuleReferenceChipBody
        label={t('testerFinalSellChip')}
        variant="outlined"
        clickable={false}
        ruleIndex={null}
        recipeIdx={null}
        size={size}
        jumpTooltip={t('testerJumpToRecipe')}
        sx={simpleMatchChipSx(sx)}
        borderColor={getTesterMatchBorderColor(theme, false)}
        backgroundColor={finalSellTint.surface}
        hoverBackgroundColor={finalSellTint.hover}
        dataMatchSource="final-sell"
        {...(icon ? { icon } : {})}
      />
    )
  }
  const ruleIndex = typeof match.ruleIndex === 'number' ? match.ruleIndex : null
  const recipeIdx = typeof match.recipeIdx === 'number' ? match.recipeIdx : null
  const recipeDecoration = parseRecipeNameDirectives(match.recipeName ?? undefined, theme.palette.primary.main)
  const trimmedDecoratedName = recipeDecoration.displayName.trim()
  const fallbackRuleLabel = match.ruleLabel ? match.ruleLabel.trim() : ''
  const formattedRecipeName = trimmedDecoratedName.length > 0
    ? trimmedDecoratedName
    : (fallbackRuleLabel.length > 0
      ? fallbackRuleLabel
      : (recipeIdx != null ? `#${recipeIdx + 1}` : ''))
  const textColor = recipeDecoration.hasExplicitColor && trimmedDecoratedName.length > 0
    ? recipeDecoration.resolvedColor
    : null
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
  // Safeguard matches share a green tint so they read as "protected".
  const keepOverrideTint = isSafeguardSource
    ? buildChipSurfaceTint(theme, theme.palette.success.main)
    : null
  // Data attribute lets tests and analytics distinguish safeguard matches.
  const dataMatchSource = isSafeguardSource ? 'safeguard' : undefined
  return (
    <TesterRuleReferenceChipBody
      label={resolvedLabel}
      variant="outlined"
      clickable={clickable}
      ruleIndex={ruleIndex}
      recipeIdx={typeof match.recipeIdx === 'number' ? match.recipeIdx : null}
      size={size}
      jumpTooltip={t('testerJumpToRecipe')}
      textColor={textColor}
      {...(sx ? { sx } : {})}
      {...(icon ? { icon } : {})}
      borderColor={getTesterMatchBorderColor(theme, Boolean(match.keep))}
      {...(keepOverrideTint ? { backgroundColor: keepOverrideTint.surface } : {})}
      {...(keepOverrideTint ? { hoverBackgroundColor: keepOverrideTint.hover } : {})}
      {...(dataMatchSource ? { dataMatchSource } : {})}
      {...(onJump ? { onJump } : {})}
    />
  )
}

type TesterRuleReferenceChipBodyProps = {
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

function TesterRuleReferenceChipBody({
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
}: TesterRuleReferenceChipBodyProps) {
  const chipWrapperRef = useRef<HTMLSpanElement | null>(null)
  const [nativeEllipsisTitle, setNativeEllipsisTitle] = useState<string | undefined>(undefined)
  const handleChipMouseEnter = useCallback(() => {
    if (!clickable) return
    const root = chipWrapperRef.current
    // Only mirror the truncated label when it is actually ellipsized; otherwise we keep the tooltip copy focused on jumping.
    if (hasEllipsisOverflow(root, '.MuiChip-label')) {
      setNativeEllipsisTitle(label)
    } else {
      setNativeEllipsisTitle(undefined)
    }
  }, [clickable, label])
  const handleChipMouseLeave = useCallback(() => {
    if (!clickable) return
    setNativeEllipsisTitle(undefined)
  }, [clickable])
  const resolvedBackgroundColor = backgroundColor ?? 'background.paper'
  const resolvedHoverColor = clickable
    ? hoverBackgroundColor ?? 'action.hover'
    : undefined
  const baseSx: SxProps<Theme> = {
    cursor: clickable ? 'pointer' : 'default',
    bgcolor: resolvedBackgroundColor,
    color: textColor ?? 'text.primary',
    borderRadius: '8px',
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
    // Force the tooltip wrapper to behave like the old block-level chip so tester cards never overflow.
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
  const chipWrapper = (
    <Box
      component="span"
      ref={chipWrapperRef}
      onMouseEnter={handleChipMouseEnter}
      onMouseLeave={handleChipMouseLeave}
      sx={{ display: 'block', maxWidth: '100%', minWidth: 0 }}
    >
      <Box
        component="span"
        {...(nativeEllipsisTitle ? { title: nativeEllipsisTitle } : {})}
        sx={{ display: 'block', maxWidth: '100%', minWidth: 0 }}
      >
        {baseChip}
      </Box>
    </Box>
  )
  return (
    // Keep the jump-to-recipe hint in sync with other Markdown tooltips so multi-line copy stays readable.
    <MarkdownTooltip markdown={jumpTooltip}>
      {chipWrapper}
    </MarkdownTooltip>
  )
}
