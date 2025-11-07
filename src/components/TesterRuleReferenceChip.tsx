import { Chip, Tooltip, Typography } from '@mui/material'
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
}

export function TesterRuleReferenceChip({
  match,
  onJump,
  size = 'small',
  sx,
  showFinalSellLabel = true,
}: TesterRuleReferenceChipProps) {
  const { t } = useI18n()
  if (!match) return null
  if (match.ruleSource === RULE_SOURCE_FINAL_SELL) {
    return showFinalSellLabel ? (
      <Typography variant="body2" color="text.secondary">
        {t('testerFinalSell')}
      </Typography>
    ) : null
  }
  const ruleIndex = typeof match.ruleIndex === 'number' ? match.ruleIndex : null
  const label = match.ruleLabel
    ? match.ruleLabel
    : (ruleIndex != null ? t('testerRuleChip', { index: ruleIndex + 1 }) : '')
  if (!label) return null
  const clickable = typeof onJump === 'function' && ruleIndex != null
  const chip = (
    <Chip
      size={size}
      label={label}
      {...(clickable ? { component: 'button', onClick: () => onJump?.(ruleIndex, match.cfgIdx ?? null) } : {})}
      sx={{
        cursor: clickable ? 'pointer' : 'default',
        bgcolor: 'primary.main',
        color: 'common.black',
        fontWeight: 600,
        '&:hover': clickable ? { bgcolor: 'primary.light' } : undefined,
        '& .MuiChip-label': { px: 0.75 },
        ...sx,
      }}
    />
  )
  if (!clickable) return chip
  return (
    <Tooltip title={t('testerJumpToConfig')}>
      <span>{chip}</span>
    </Tooltip>
  )
}
