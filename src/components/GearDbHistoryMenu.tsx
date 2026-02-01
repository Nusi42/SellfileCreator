/**
 * GearDbHistoryMenu
 *
 * Session-only history menu for endpoint updates. Mirrors the undo history
 * context menu styling while showing Gear DB diff previews on hover.
 */
import React from 'react'
import { Box, ListSubheader, Menu, MenuItem, Stack, Typography } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import { formatLocalDateTime } from '../lib/dateDisplay'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { GearDbDiffToast } from './GearDbDiffToast'
import {
  GEAR_DB_DIFF_TOAST_MAX_ITEMS,
  HISTORY_MENU_MAX_HEIGHT_PX,
  HISTORY_TOOLTIP_MAX_WIDTH_PX,
  LIST_SUBHEADER_SX,
} from '../lib/constants'
import MarkdownTooltip from './MarkdownTooltip'
import { formatGearDbDiffHistoryLines } from '../lib/gearDbDiffToast'
import type { GearDbDiffHistoryEntry, GearDbDiffToastPayload } from '../lib/gearDbDiffToast'
import type { SubstatColorMap } from '../lib/renderColoredStatText'

export type GearDbHistoryMenuProps = {
  open: boolean
  anchorEl: HTMLElement | null
  entries: GearDbDiffHistoryEntry[]
  onClose: () => void
  onRequestClearHistory: () => void
  substatColors: SubstatColorMap
  useStatButtonColors: boolean
}

// Format the local timestamp so history entries are easy to scan.
const formatHistoryTimestamp = (value: number): string | null => (
  formatLocalDateTime(value, { dateStyle: 'medium', timeStyle: 'medium' })
)

/**
 * Render the endpoint update history menu anchored to the preview header icon.
 */
export function GearDbHistoryMenu({
  open,
  anchorEl,
  entries,
  onClose,
  onRequestClearHistory,
  substatColors,
  useStatButtonColors,
}: GearDbHistoryMenuProps) {
  const { t } = useI18n()
  // Keep entries reversed so the latest update sits at the top.
  const reversed = React.useMemo(() => entries.slice().reverse(), [entries])
  // Disable the clear action when there is nothing to remove.
  const hasEntries = entries.length > 0
  // Build localized header lines so history re-renders on language changes.
  const buildHeaderLines = React.useCallback((lineSpecs: GearDbDiffHistoryEntry['lineSpecs']): string[] => (
    formatGearDbDiffHistoryLines(lineSpecs, t)
  ), [t])
  // Strip timestamp specs so summary rows stay clean (timestamp renders separately).
  const buildSummaryLines = React.useCallback((lineSpecs: GearDbDiffHistoryEntry['lineSpecs']): string[] => (
    formatGearDbDiffHistoryLines(lineSpecs.filter((spec) => spec.kind !== 'timestamp'), t)
  ), [t])
  // Local paper ref keeps MUI typing strict while enabling outside-click handling.
  const paperRef = React.useRef<HTMLDivElement | null>(null)
  // Track the paper element so outside right-clicks can close the menu.
  const { contextMenuGuard } = useContextMenuPaperGuard({ open, onClose, menuRef: paperRef })

  return (
    <Menu
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: buildContextMenuPaperSlotProps({
          component: ContextMenuPaper,
          contextMenuGuard,
          onRequestClose: onClose,
          closeLabel: t('close'),
          ref: paperRef,
          sx: (theme: Theme) => ({
            minWidth: theme.spacing(32),
            maxWidth: theme.spacing(54),
            maxHeight: HISTORY_MENU_MAX_HEIGHT_PX,
            px: 0,
            py: 0,
            boxShadow: theme.shadows[8],
          }),
        }),
      }}
      MenuListProps={{
        dense: true,
        disablePadding: true,
        sx: {
          py: 0,
          maxHeight: HISTORY_MENU_MAX_HEIGHT_PX,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <ListSubheader disableSticky sx={[LIST_SUBHEADER_SX, { px: 2 }]}>
        {t('builderHistoryMenuHeader')}
      </ListSubheader>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {reversed.length === 0 ? (
          <MenuItem disabled sx={{ opacity: 0.8, py: 1.25 }}>
            <Typography variant="body2">{t('builderHistoryMenuEmpty')}</Typography>
          </MenuItem>
        ) : null}
        {reversed.map((entry, index) => {
          // Build localized lines so tooltip + list stay aligned.
          const headerLines = buildHeaderLines(entry.lineSpecs)
          // Build summary-only lines so the timestamp can be its own row.
          const summaryLines = buildSummaryLines(entry.lineSpecs)
          // Fall back to a numbered snapshot label if no header lines exist.
          const fallbackLabel = t('builderHistoryUnnamedSnapshot', { index: entries.length - index })
          const primaryLine = summaryLines[0] ?? fallbackLabel
          const secondaryLine = summaryLines[1] ?? ''
          const hasSecondaryLine = secondaryLine.trim().length > 0
          // Always show the received timestamp as the final row.
          const timestampLine = formatHistoryTimestamp(entry.createdAt)
          const hasTimestampLine = Boolean(timestampLine && timestampLine.trim().length > 0)
          // Cap the tooltip list so large diffs stay readable.
          const cappedEntries = entry.entries.slice(0, GEAR_DB_DIFF_TOAST_MAX_ITEMS)
          const overflowCount = Math.max(0, entry.entries.length - cappedEntries.length)
          const tooltipPayload: GearDbDiffToastPayload = {
            headerLines,
            entries: cappedEntries,
            overflowCount,
          }
          return (
            <MarkdownTooltip
              key={entry.id}
              render={(
                <Box
                  sx={{
                    // Let the tooltip expand to fit all preview cards + footer.
                    overflow: 'visible',
                  }}
                >
                  <GearDbDiffToast
                    payload={tooltipPayload}
                    substatColors={substatColors}
                    useStatButtonColors={useStatButtonColors}
                  />
                </Box>
              )}
              slotProps={{ tooltip: { sx: { maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX } } }}
            >
              <MenuItem
                sx={(theme) => ({
                  alignItems: 'flex-start',
                  gap: 0.5,
                  px: 2,
                  py: 1.1,
                  opacity: 0.95,
                  backgroundColor: index === 0 ? theme.palette.action.hover : undefined,
                })}
              >
                <Stack spacing={0.35} sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {primaryLine}
                  </Typography>
                  {hasSecondaryLine ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {secondaryLine}
                    </Typography>
                  ) : null}
                  {hasTimestampLine ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {timestampLine}
                    </Typography>
                  ) : null}
                </Stack>
              </MenuItem>
            </MarkdownTooltip>
          )
        })}
      </Box>
      <MenuItem
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          onRequestClearHistory()
        }}
        sx={{ color: hasEntries ? 'error.main' : 'text.secondary', fontWeight: 600 }}
        disabled={!hasEntries}
      >
        {t('builderHistoryClear')}
      </MenuItem>
    </Menu>
  )
}
