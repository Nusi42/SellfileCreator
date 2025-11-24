import { useCallback, useRef, useState } from 'react'
import { Box, Chip } from '@mui/material'
import type { ChipProps } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { RULE_SOURCE_FINAL_SELL, RULE_SOURCE_KEEP_UNIQUES } from '../lib/merge'
import { useI18n } from '../lib/i18n'
import type { TesterPreviewMatch } from '../types/testerPreview'
// MarkdownTooltip keeps the “jump to config” hint aligned with the rest of the tooltip rollout.
import MarkdownTooltip from './MarkdownTooltip'
import EllipsisTooltip, { hasEllipsisOverflow } from './EllipsisTooltip'

type TesterRuleReferenceChipProps = {
  match: TesterPreviewMatch | null
  onJump?: (ruleIndex: number, cfgIdx: number | null) => void
  size?: ChipProps['size']
  sx?: SxProps<Theme>
  showFinalSellLabel?: boolean
  icon?: ChipProps['icon']
}

const simpleMatchChipSx = (sx?: SxProps<Theme>): SxProps<Theme> => {
  const base: SystemStyleObject<Theme> = {
    width: 'auto',
    maxWidth: '100%',
    flexShrink: 0,
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

export function TesterRuleReferenceChip({
  match,
  onJump,
  size = 'small',
  sx,
  showFinalSellLabel = true,
  icon,
}: TesterRuleReferenceChipProps) {
  const { t } = useI18n()
  if (!match) return null
  if (match.ruleSource === RULE_SOURCE_FINAL_SELL) {
    if (!showFinalSellLabel) return null
    return (
      <Chip
        size={size}
        label={t('testerFinalSellChip')}
        color="warning"
        sx={simpleMatchChipSx(sx)}
      />
    )
  }
  if (match.ruleSource === RULE_SOURCE_KEEP_UNIQUES) {
    return (
      <Chip
        size={size}
        label={t('testerKeepUniqueChip')}
        color="success"
        sx={simpleMatchChipSx(sx)}
      />
    )
  }
  const ruleIndex = typeof match.ruleIndex === 'number' ? match.ruleIndex : null
  const formattedRule = match.ruleLabel
    ? match.ruleLabel
    : (ruleIndex != null ? `#${ruleIndex + 1}` : '')
  const cfgIdx = typeof match.cfgIdx === 'number' ? match.cfgIdx : null
  const formattedConfigNumber = cfgIdx != null ? `#${cfgIdx + 1}` : ''
  const formattedConfigName = match.cfgName && match.cfgName.trim().length > 0
    ? match.cfgName.trim()
    : (cfgIdx != null ? t('testerConfigChip', { index: cfgIdx + 1 }) : '')
  const numberSegment = (() => {
    if (formattedConfigNumber && formattedRule) return `${formattedConfigNumber} • ${formattedRule}`
    return formattedConfigNumber || formattedRule
  })()
  const labelParts = [numberSegment, formattedConfigName].filter((part) => part && part.length > 0)
  const label = labelParts.length > 1 ? `${labelParts[0]} | ${labelParts[1]}` : (labelParts[0] ?? '')
  const clickable = typeof onJump === 'function' && ruleIndex != null
  if (!label) return null
  return (
    <TesterRuleReferenceChipBody
      label={label}
      clickable={clickable}
      ruleIndex={ruleIndex}
      cfgIdx={typeof match.cfgIdx === 'number' ? match.cfgIdx : null}
      size={size}
      jumpTooltip={t('testerJumpToConfig')}
      {...(sx ? { sx } : {})}
      {...(icon ? { icon } : {})}
      {...(onJump ? { onJump } : {})}
    />
  )
}

type TesterRuleReferenceChipBodyProps = {
  label: string
  clickable: boolean
  ruleIndex: number | null
  cfgIdx: number | null
  onJump?: (ruleIndex: number, cfgIdx: number | null) => void
  size?: ChipProps['size']
  sx?: SxProps<Theme>
  icon?: ChipProps['icon']
  jumpTooltip: string
}

function TesterRuleReferenceChipBody({
  label,
  clickable,
  ruleIndex,
  cfgIdx,
  onJump,
  size = 'small',
  sx,
  icon,
  jumpTooltip,
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
  const baseSx: SxProps<Theme> = {
    cursor: clickable ? 'pointer' : 'default',
    bgcolor: 'primary.main',
    color: 'common.black',
    borderRadius: '8px',
    maxWidth: '100%',
    flexShrink: 1,
    overflow: 'hidden',
    '&:hover': clickable ? { bgcolor: 'primary.light' } : undefined,
    '& .MuiChip-label': {
      px: 0.75,
      display: 'block',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  }
  const combinedSx: SxProps<Theme> = sx
    ? [baseSx, ...(Array.isArray(sx) ? sx : [sx])]
    : baseSx
  const canJump = clickable && typeof onJump === 'function' && typeof ruleIndex === 'number'
  const interactiveProps = canJump
    ? { component: 'button' as const, onClick: () => onJump(ruleIndex, cfgIdx) }
    : {}
  const iconProps = icon ? { icon } : {}
  const baseChip = (
    <Chip
      size={size}
      {...iconProps}
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
      title={nativeEllipsisTitle}
      sx={{ display: 'block', maxWidth: '100%', minWidth: 0 }}
    >
      {baseChip}
    </Box>
  )
  return (
    // Keep the jump-to-config hint in sync with other Markdown tooltips so multi-line copy stays readable.
    <MarkdownTooltip markdown={jumpTooltip}>
      {chipWrapper}
    </MarkdownTooltip>
  )
}
