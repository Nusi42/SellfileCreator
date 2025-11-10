import { Box, Chip, Tooltip } from '@mui/material'
import type { ChipProps } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { RULE_SOURCE_FINAL_SELL } from '../lib/merge'
import { useI18n } from '../lib/i18n'
import type { TesterPreviewMatch } from '../types/testerPreview'

type TesterRuleReferenceChipProps = {
  match: TesterPreviewMatch | null
  onJump?: (ruleIndex: number, cfgIdx: number | null) => void
  size?: ChipProps['size']
  sx?: SxProps<Theme>
  showFinalSellLabel?: boolean
  icon?: ChipProps['icon']
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
    const finalSellBaseSx: SxProps<Theme> = {
      width: 'auto',
      maxWidth: '100%',
      flexShrink: 0,
      '& .MuiChip-label': {
        display: 'inline-flex',
        px: 0.75,
        whiteSpace: 'nowrap',
      },
    }
    const mergedFinalSellSx: SxProps<Theme> = sx
      ? (Array.isArray(sx) ? [...sx, finalSellBaseSx] : [sx, finalSellBaseSx])
      : finalSellBaseSx
    return (
      <Chip
        size={size}
        label={t('testerFinalSellChip')}
        color="warning"
        title={t('testerFinalSellChip')}
        sx={mergedFinalSellSx}
      />
    )
  }
  const ruleIndex = typeof match.ruleIndex === 'number' ? match.ruleIndex : null
  const ruleLabel = match.ruleLabel
    ? match.ruleLabel
    : (ruleIndex != null ? `#${ruleIndex + 1}` : '')
  const configLabel = match.cfgName
    ? match.cfgName
    : (match.cfgIdx != null ? t('testerConfigChip', { index: match.cfgIdx + 1 }) : '')
  const labelParts = [ruleLabel, configLabel].filter((part) => part && part.length > 0)
  const label = labelParts.join(' • ')
  if (!label) return null
  const clickable = typeof onJump === 'function' && ruleIndex != null
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
  const interactiveProps = clickable
    ? { component: 'button' as const, onClick: () => onJump?.(ruleIndex, match.cfgIdx ?? null) }
    : {}
  const iconProps = icon ? { icon } : {}
  const chip = (
    <Chip
      size={size}
      {...iconProps}
      label={label}
      title={label}
      {...interactiveProps}
      sx={combinedSx}
    />
  )
  if (!clickable) return chip
  return (
    <Tooltip title={t('testerJumpToConfig')}>
      <Box component="span" sx={{ display: 'block', maxWidth: '100%', minWidth: 0 }}>
        {chip}
      </Box>
    </Tooltip>
  )
}
