import React from 'react'
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import MarkdownTooltip from '../MarkdownTooltip'
import { useI18n } from '../../lib/i18n'
import { GOLD_GROUP_HEADER_SX } from '../../lib/goldSkin'

// Shared chart header used by all GearAnalytics* components.
// Renders the collapse chevron (when onToggleCollapse is provided) + a titled label.
// Left-click on the label toggles one chart; right-click or Ctrl/Cmd-click toggles all.
type GearAnalyticsChartHeaderProps = {
  title: string
  // description: shown as a tooltip on the title when provided; also sets cursor: 'help'.
  description?: string | undefined
  collapsed?: boolean | undefined
  onToggleCollapse?: ((applyToAll: boolean) => void) | undefined
  // boxSx: extra styles for the outer flex container (e.g. mb or gap overrides).
  boxSx?: SxProps<Theme>
  // children: extra content rendered after the title (e.g. Treemap's quick-filter select).
  children?: React.ReactNode
}

export function GearAnalyticsChartHeader({
  title, description, collapsed, onToggleCollapse, boxSx, children,
}: GearAnalyticsChartHeaderProps) {
  const { t } = useI18n()
  const handleLabelClick = () => onToggleCollapse?.(false)
  const handleLabelContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    onToggleCollapse?.(true)
  }
  const titleTypography = (
    <Typography
      variant="caption"
      sx={{
        // The shared collapsible-group voice (gold micro-caps, no ◆) — one definition with
        // the builder/filter section headers so all expandable groups read identically.
        ...GOLD_GROUP_HEADER_SX,
        display: 'inline-block',
        // cursor: 'help' signals the description tooltip; 'pointer' signals click-to-collapse.
        cursor: onToggleCollapse ? (description ? 'help' : 'pointer') : (description ? 'help' : 'default'),
      }}
      onClick={onToggleCollapse ? handleLabelClick : undefined}
      onContextMenu={onToggleCollapse ? handleLabelContextMenu : undefined}
    >
      {title}
    </Typography>
  )
  return (
    <Box sx={[{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, minWidth: 0 }, ...(Array.isArray(boxSx) ? boxSx : boxSx ? [boxSx] : [])]}>
      {onToggleCollapse && (
        // Tooltip surfaces the right-click toggle-all hint so users discover the gesture.
        <MarkdownTooltip markdown={t('gearAnalyticsCollapseChartTooltip')}>
          <IconButton
            size="small"
            data-snapshot-hide
            onClick={(e) => onToggleCollapse(e.ctrlKey || e.metaKey)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCollapse(true) }}
            sx={{ p: 0.25, flexShrink: 0 }}
          >
            {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
          </IconButton>
        </MarkdownTooltip>
      )}
      {description
        ? (
          <Tooltip title={description} arrow placement="top-start">
            {titleTypography}
          </Tooltip>
        )
        : titleTypography
      }
      {children}
    </Box>
  )
}
