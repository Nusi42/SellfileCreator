import React from 'react'
import { Box, ListSubheader, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import type { PopoverPosition } from '@mui/material/Popover'
import type { Theme } from '@mui/material/styles'
import type { HistoryTimelineEntry } from '../hooks/useHsfcHistory'
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt'
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded'
import ContextMenuPaper from './ContextMenuPaper'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import { HISTORY_MENU_MAX_HEIGHT_PX, HISTORY_TOOLTIP_MAX_WIDTH_PX, LIST_SUBHEADER_SX } from '../lib/constants'
import { formatHistoryTooltipText } from '../history/historyTooltip'
import type { SubstatColorMap } from '../lib/renderColoredStatText'

type AnchorPosition = { top: number; left: number } | null

/**
 * HistoryContextMenu
 *
 * Right-click menu for the undo/redo controls. Renders a read-only snapshot of
 * the current history stack (latest first) and exposes an action to clear the
 * captured history with confirmation handled upstream.
 */
export function HistoryContextMenu({
  open,
  anchorPosition,
  onClose,
  paperRef,
  onPaperContextMenu,
  entries,
  t,
  onSelectEntry,
  onRequestClearHistory,
  substatColors,
}: {
  open: boolean
  anchorPosition: AnchorPosition
  onClose: () => void
  paperRef: React.MutableRefObject<HTMLDivElement | null>
  onPaperContextMenu: (event: React.MouseEvent) => void
  entries: HistoryTimelineEntry[]
  t: (key: string, params?: Record<string, string | number>) => string
  onSelectEntry: (index: number) => void
  onRequestClearHistory: () => void
  substatColors: SubstatColorMap
}) {
  const hasMultipleEntries = entries.length > 1
  const reversed = React.useMemo(() => {
    return entries.slice().reverse()
  }, [entries])
  const resolvedAnchorPosition: PopoverPosition | undefined = anchorPosition ?? undefined

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      {...(resolvedAnchorPosition ? { anchorPosition: resolvedAnchorPosition } : {})}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          component: ContextMenuPaper,
          onRequestClose: onClose,
          closeLabel: t('close'),
          ref: paperRef,
          onContextMenu: onPaperContextMenu,
          sx: (theme: Theme) => ({
            minWidth: theme.spacing(30),
            maxWidth: theme.spacing(52),
            maxHeight: HISTORY_MENU_MAX_HEIGHT_PX,
            px: 0,
            py: 0,
            boxShadow: theme.shadows[8],
          }),
        } as unknown as MuiPaperProps,
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
        {reversed.length === 0 && (
          <MenuItem disabled sx={{ opacity: 0.8, py: 1.25 }}>
            <Typography variant="body2">{t('builderHistoryMenuEmpty')}</Typography>
          </MenuItem>
        )}
        {reversed.map((entry) => {
          const descriptor = entry.descriptor
          const title = descriptor?.title?.trim().length
            ? descriptor.title.trim()
            : (entry.isInitial
              ? t('builderHistoryInitialSnapshot')
              : t('builderHistoryUnnamedSnapshot', { index: entry.index + 1 }))
          const tooltipText = formatHistoryTooltipText({
            descriptor,
            fallbackText: title,
          })
          return (
            <Tooltip
              key={entry.index}
              title={<BuilderTooltipContent text={tooltipText} colorizeStats substatColors={substatColors} />}
              slotProps={{ tooltip: { sx: { maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX } } }}
              disableInteractive
            >
              <MenuItem
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onSelectEntry(entry.index)
                }}
                selected={entry.isCurrent}
                sx={(theme) => ({
                  alignItems: 'flex-start',
                  gap: 0.5,
                  px: 2,
                  py: 1.1,
                  opacity: entry.isCurrent ? 1 : 0.9,
                  backgroundColor: entry.isCurrent ? theme.palette.action.hover : undefined,
                })}
                aria-current={entry.isCurrent ? 'true' : undefined}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}>
                  <Box sx={(theme) => ({
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.25,
                    minWidth: theme.spacing(3),
                    flexShrink: 0,
                  })}
                  >
                    {entry.isCurrent && (
                      <ArrowRightAltIcon fontSize="small" sx={(theme) => ({ color: theme.palette.primary.main })} />
                    )}
                    {entry.isSaved && (
                      <BookmarkAddedIcon fontSize="small" sx={(theme) => ({ color: theme.palette.success.main })} />
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: entry.isCurrent ? 600 : 500,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {title}
                  </Typography>
                </Box>
              </MenuItem>
            </Tooltip>
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
        sx={{ color: hasMultipleEntries ? 'error.main' : 'text.secondary', fontWeight: 600 }}
        disabled={!hasMultipleEntries}
      >
        {t('builderHistoryClear')}
      </MenuItem>
    </Menu>
  )
}
