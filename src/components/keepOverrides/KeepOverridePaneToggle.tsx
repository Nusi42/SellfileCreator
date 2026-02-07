import { Box, IconButton } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import MarkdownTooltip from '../MarkdownTooltip'

type KeepOverridePaneToggleProps = {
  gridColumnMode: 1 | 2
  onToggle: () => void
  disabled?: boolean
}

// KeepOverridePaneToggle shows a compact arrow button between the rule list and grid.
export function KeepOverridePaneToggle({
  gridColumnMode,
  onToggle,
  disabled = false,
}: KeepOverridePaneToggleProps) {
  const { t } = useI18n()
  // Two-column mode collapses toward one column on click.
  const isTwoColumn = gridColumnMode === 2
  // Pick a label that reads well for screen readers and tooltips.
  const label = useMemo(
    () => (isTwoColumn ? t('keepOverrideColumnToggleToOne') : t('keepOverrideColumnToggleToTwo')),
    [isTwoColumn, t],
  )
  // Chevron points toward the next column count to keep the intent obvious.
  const Icon = isTwoColumn ? ChevronRightIcon : ChevronLeftIcon

  const button = (
    <IconButton
      size="small"
      onClick={onToggle}
      aria-label={label}
      disabled={disabled}
      sx={{
        // Match the builder help icon: blue accent, transparent background.
        width: 24,
        height: 24,
        p: 0,
        borderRadius: 999,
        color: 'primary.main',
        backgroundColor: 'transparent',
        '&:hover': {
          backgroundColor: 'action.hover',
        },
      }}
    >
      <Icon fontSize="small" />
    </IconButton>
  )

  return (
    <Box
      sx={{
        // Keep the toggle compact so it fits beside header controls.
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <MarkdownTooltip
        markdown={label}
        disableHoverListener={disabled}
        disableFocusListener={disabled}
        disableTouchListener={disabled}
      >
        {button}
      </MarkdownTooltip>
    </Box>
  )
}
