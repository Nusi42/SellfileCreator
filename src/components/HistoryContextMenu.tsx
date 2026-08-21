import React from 'react'
import { Box, ListSubheader, Menu, MenuItem, Typography } from '@mui/material'
import type { PopoverPosition } from '@mui/material/Popover'
import type { Theme } from '@mui/material/styles'
import type { HistoryTimelineEntry } from '../hooks/useSfcHistory'
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt'
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded'
import ContextMenuPaper, { buildContextMenuPaperSlotProps, type ContextMenuPaperGuardToken } from './ContextMenuPaper'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import { HISTORY_MENU_MAX_HEIGHT_PX, HISTORY_TOOLTIP_MAX_WIDTH_PX, LIST_SUBHEADER_SX } from '../lib/constants'
import { formatHistoryTooltipText } from '../history/historyTooltip'
import { resolveHistoryEntryDescriptor } from '../history/historyDescriptorResolver'
import type { SubstatColorMap } from '../lib/renderColoredStatText'
import MarkdownTooltip from './MarkdownTooltip'

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
  lang,
  onSelectEntry,
  onRequestClearHistory,
  substatColors,
  contextMenuGuard,
}: {
  open: boolean
  anchorPosition: AnchorPosition
  onClose: () => void
  paperRef: React.MutableRefObject<HTMLDivElement | null>
  onPaperContextMenu: (event: React.MouseEvent) => void
  entries: HistoryTimelineEntry[]
  t: (key: string, params?: Record<string, string | number>) => string
  lang: string
  onSelectEntry: (index: number) => void
  onRequestClearHistory: () => void
  substatColors: SubstatColorMap
  contextMenuGuard: ContextMenuPaperGuardToken
}) {
  const hasMultipleEntries = entries.length > 1
  // Include the current stack size directly in the clear row label.
  const clearHistoryLabel = `${t('builderHistoryClear')} (${entries.length})`
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
        paper: { ...buildContextMenuPaperSlotProps({
          component: ContextMenuPaper,
          contextMenuGuard,
          onRequestClose: onClose,
          closeLabel: t('close'),
          onContextMenu: onPaperContextMenu,
          sx: (theme: Theme) => ({
            minWidth: theme.spacing(30),
            maxWidth: theme.spacing(52),
            maxHeight: HISTORY_MENU_MAX_HEIGHT_PX,
            px: 0,
            py: 0,
            // No pinned elevation shadow — the theme's floating-layer shadow (gold skin) applies.
          }),
        }), ref: paperRef },
        list: {
          dense: true,
          disablePadding: true,
          sx: {
            py: 0,
            maxHeight: HISTORY_MENU_MAX_HEIGHT_PX,
            display: 'flex',
            flexDirection: 'column',
          },
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
          const resolved = resolveHistoryEntryDescriptor(entry.descriptor, { t, lang })
          const title = resolved?.title?.trim().length
            ? resolved.title.trim()
            : (entry.isInitial
              ? t('builderHistoryInitialSnapshot')
              : t('builderHistoryUnnamedSnapshot', { index: entry.index + 1 }))
          const tooltipText = formatHistoryTooltipText({
            descriptor: entry.descriptor,
            fallbackText: title,
            t,
            lang,
          })
          return (
            <MarkdownTooltip
              key={entry.index}
              render={<BuilderTooltipContent text={tooltipText} colorizeStats substatColors={substatColors} />}
              slotProps={{ tooltip: { sx: { maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX } } }}
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
                  backgroundColor: entry.isCurrent ? (theme.vars?.palette.action.hover ?? theme.palette.action.hover) : undefined,
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
                      <ArrowRightAltIcon fontSize="small" sx={(theme) => ({ color: (theme.vars?.palette.primary.main ?? theme.palette.primary.main) })} />
                    )}
                    {entry.isSaved && (
                      <BookmarkAddedIcon fontSize="small" sx={(theme) => ({ color: (theme.vars?.palette.success.main ?? theme.palette.success.main) })} />
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
        sx={{ color: hasMultipleEntries ? 'error.main' : 'text.secondary', fontWeight: 600 }}
        disabled={!hasMultipleEntries}
      >
        {clearHistoryLabel}
      </MenuItem>
    </Menu>
  )
}
