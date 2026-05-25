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
  GEAR_DB_HISTORY_TOOLTIP_MAX_HEIGHT_PX,
  HISTORY_MENU_MAX_HEIGHT_PX,
  HISTORY_TOOLTIP_MAX_WIDTH_PX,
  LIST_SUBHEADER_SX,
} from '../lib/constants'
import MarkdownTooltip from './MarkdownTooltip'
import { decodeGearDbDiffToastEntries, formatGearDbDiffHistoryLines } from '../lib/gearDbDiffToast'
import type { GearDbDiffHistoryEntry, GearDbDiffToastPayload } from '../lib/gearDbDiffToast'
import type { SubstatColorMap } from '../lib/renderColoredStatText'
import { buildGearDbDiffSummaryLineNodes } from './GearDbDiffSummaryLine'

export type GearDbHistoryMenuProps = {
  open: boolean
  anchorEl: HTMLElement | null
  entries: GearDbDiffHistoryEntry[]
  onClose: () => void
  onRequestClearHistory: () => void
  substatColors: SubstatColorMap
  useStatButtonColors: boolean
}

function ClippedPreviewBody({
  maxHeightPx,
  children,
}: {
  maxHeightPx: number
  children: React.ReactNode
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [showOverflowCue, setShowOverflowCue] = React.useState(false)
  // Ref-based setter so the ResizeObserver callback avoids the set-state-in-effect lint rule.
  const setShowOverflowCueRef = React.useRef(setShowOverflowCue)
  React.useEffect(() => { setShowOverflowCueRef.current = setShowOverflowCue }, [setShowOverflowCue])
  // Mount-only ResizeObserver; re-measurement is driven by DOM size changes.
  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined
    const measure = () => {
      const nextOverflow = node.scrollHeight > node.clientHeight + 1
      setShowOverflowCueRef.current((prev) => (prev === nextOverflow ? prev : nextOverflow))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <Box
      ref={containerRef}
      sx={(theme) => ({
        position: 'relative',
        maxHeight: maxHeightPx,
        overflow: 'hidden',
        ...(showOverflowCue
          ? {
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: theme.spacing(4),
              background: `linear-gradient(to bottom, ${(theme.vars?.palette.background.paper ?? theme.palette.background.paper)}00 0%, ${(theme.vars?.palette.background.paper ?? theme.palette.background.paper)} 100%)`,
              pointerEvents: 'none',
            },
          }
          : {}),
      })}
    >
      {children}
      {showOverflowCue ? (
        <Typography
          variant="caption"
          component="span"
          sx={{
            position: 'absolute',
            right: 8,
            bottom: 4,
            lineHeight: 1,
            fontSize: '0.95rem',
            opacity: 0.8,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          ...
        </Typography>
      ) : null}
    </Box>
  )
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
  // Keep the currently expanded history entry in a persistent popout.
  const [previewPopout, setPreviewPopout] = React.useState<{
    entryId: number
    anchorPosition: { top: number; left: number }
    payload: GearDbDiffToastPayload
  } | null>(null)
  // Track the hovered entry so only one tooltip decodes payload data at a time.
  const [hoveredEntryId, setHoveredEntryId] = React.useState<number | null>(null)
  // Keep entries reversed so the latest update sits at the top.
  const reversed = React.useMemo(() => entries.slice().reverse(), [entries])
  // Disable the clear action when there is nothing to remove.
  const hasEntries = entries.length > 0
  // Include the current stack size directly in the clear row label.
  const clearHistoryLabel = `${t('builderHistoryClear')} (${entries.length})`
  // Build localized header lines so history re-renders on language changes.
  const buildHeaderLines = React.useCallback((lineSpecs: GearDbDiffHistoryEntry['lineSpecs']): string[] => (
    formatGearDbDiffHistoryLines(lineSpecs, t)
  ), [t])
  // Strip timestamp specs so summary rows stay clean, and swap diff lines for icons.
  const buildSummaryLineNodes = React.useCallback((lineSpecs: GearDbDiffHistoryEntry['lineSpecs']) => (
    buildGearDbDiffSummaryLineNodes(lineSpecs.filter((spec) => spec.kind !== 'timestamp'), t)
  ), [t])
  // Local paper ref keeps MUI typing strict while enabling outside-click handling.
  const paperRef = React.useRef<HTMLDivElement | null>(null)
  // Track the paper element so outside right-clicks can close the menu.
  const { contextMenuGuard } = useContextMenuPaperGuard({ open, onClose, menuRef: paperRef })
  // Keep a dedicated paper ref + guard for the persistent detail popout.
  const previewPaperRef = React.useRef<HTMLDivElement | null>(null)
  // Stable closer keeps click-away and close-button paths aligned.
  const closePreviewPopout = React.useCallback(() => {
    setPreviewPopout(null)
  }, [])
  // Track outside right-clicks for the detail popout as well.
  const { contextMenuGuard: previewPopoutGuard } = useContextMenuPaperGuard({
    open: Boolean(previewPopout),
    onClose: closePreviewPopout,
    menuRef: previewPaperRef,
  })
  // Left-click converts the transient tooltip preview into a persistent popout.
  const handleOpenPreviewPopout = React.useCallback((
    event: React.MouseEvent<HTMLLIElement>,
    entryId: number,
    payload: GearDbDiffToastPayload,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    // Position near the clicked row so the detail panel feels attached.
    const rowRect = event.currentTarget.getBoundingClientRect()
    setPreviewPopout({
      entryId,
      anchorPosition: {
        top: Math.round(rowRect.top + window.scrollY),
        left: Math.round(rowRect.right + window.scrollX + 8),
      },
      payload,
    })
  }, [])
  // Resolve the active popout entry defensively so cleared histories auto-hide.
  const activePreviewPopout = React.useMemo(() => {
    if (!previewPopout) return null
    return entries.some((entry) => entry.id === previewPopout.entryId) ? previewPopout : null
  }, [entries, previewPopout])
  // Suppress hover poppers while the persistent popout is open.
  const disableHoverTooltips = activePreviewPopout !== null

  return (
    <>
      <Menu
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { ...buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard,
            onRequestClose: onClose,
            closeLabel: t('close'),
            sx: (theme: Theme) => ({
              minWidth: theme.spacing(32),
              maxWidth: theme.spacing(54),
              maxHeight: HISTORY_MENU_MAX_HEIGHT_PX,
              px: 0,
              py: 0,
              boxShadow: theme.shadows[8],
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
          {reversed.length === 0 ? (
            <MenuItem disabled sx={{ opacity: 0.8, py: 1.25 }}>
              <Typography variant="body2">{t('builderHistoryMenuEmpty')}</Typography>
            </MenuItem>
          ) : null}
          {reversed.map((entry, index) => {
          // Build localized lines so tooltip + list stay aligned.
          const headerLines = buildHeaderLines(entry.lineSpecs)
          // Build summary-only lines so the timestamp can be its own row.
          const summaryLines = buildSummaryLineNodes(entry.lineSpecs)
          // Fall back to a numbered snapshot label if no header lines exist.
          const fallbackLabel = t('builderHistoryUnnamedSnapshot', { index: entries.length - index })
          const primaryLine = summaryLines[0] ?? fallbackLabel
          const secondaryLine = summaryLines[1] ?? null
          const hasSecondaryLine = summaryLines.length > 1
          // Always show the received timestamp as the final row.
          const timestampLine = formatHistoryTimestamp(entry.createdAt)
          const hasTimestampLine = Boolean(timestampLine && timestampLine.trim().length > 0)
          // Decode previews only for the active hover row to limit peak allocations.
          const tooltipOpen = !disableHoverTooltips && hoveredEntryId === entry.id
          // Popout rows should decode too so click-open works without stale references.
          const shouldBuildTooltipPayload = tooltipOpen || activePreviewPopout?.entryId === entry.id
          const cappedEntries = shouldBuildTooltipPayload
            ? decodeGearDbDiffToastEntries(entry.compactEntries)
            : []
          const overflowCount = Math.max(0, entry.overflowCount)
          const tooltipPayload: GearDbDiffToastPayload | null = shouldBuildTooltipPayload
            ? {
              headerLines,
              lineSpecs: entry.lineSpecs,
              entries: cappedEntries,
              overflowCount,
            }
            : null
            return (
              <MarkdownTooltip
                key={entry.id}
                // When the detail popout is open, keep transient hover poppers hidden.
                open={tooltipOpen}
                onClose={() => {
                  // Clear hover state so this row can be garbage-collected quickly.
                  setHoveredEntryId((current) => (current === entry.id ? null : current))
                }}
              render={tooltipPayload ? (
                <ClippedPreviewBody maxHeightPx={GEAR_DB_HISTORY_TOOLTIP_MAX_HEIGHT_PX}>
                  <GearDbDiffToast
                    payload={tooltipPayload}
                    substatColors={substatColors}
                    useStatButtonColors={useStatButtonColors}
                  />
                </ClippedPreviewBody>
              ) : ''}
              slotProps={{
                tooltip: {
                  sx: {
                    maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX,
                    // Let the content wrapper own scrolling so nested scrollbars cannot appear.
                    overflow: 'visible',
                  },
                },
              }}
            >
              <MenuItem
                onClick={(event) => {
                  // Decode on click so persistent previews only allocate when requested.
                  const payload: GearDbDiffToastPayload = {
                    headerLines,
                    lineSpecs: entry.lineSpecs,
                    entries: decodeGearDbDiffToastEntries(entry.compactEntries),
                    overflowCount,
                  }
                  handleOpenPreviewPopout(event, entry.id, payload)
                }}
                onMouseEnter={() => {
                  // Hover gates tooltip decoding to one row at a time.
                  setHoveredEntryId(entry.id)
                }}
                onMouseLeave={() => {
                  setHoveredEntryId((current) => (current === entry.id ? null : current))
                }}
                sx={(theme) => ({
                  alignItems: 'flex-start',
                  gap: 0.5,
                  px: 2,
                  py: 1.1,
                  opacity: 0.95,
                  cursor: 'pointer',
                  backgroundColor: index === 0 ? (theme.vars?.palette.action.hover ?? theme.palette.action.hover) : undefined,
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
            closePreviewPopout()
            onClose()
            onRequestClearHistory()
          }}
          sx={{ color: hasEntries ? 'error.main' : 'text.secondary', fontWeight: 600 }}
          disabled={!hasEntries}
        >
          {clearHistoryLabel}
        </MenuItem>
      </Menu>
      <Menu
        open={Boolean(activePreviewPopout)}
        onClose={closePreviewPopout}
        anchorReference="anchorPosition"
        {...(activePreviewPopout ? { anchorPosition: activePreviewPopout.anchorPosition } : {})}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { ...buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: previewPopoutGuard,
            onRequestClose: closePreviewPopout,
            closeLabel: t('close'),
            sx: (theme: Theme) => ({
              minWidth: theme.spacing(36),
              maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX,
              px: 0,
              py: 0,
              boxShadow: theme.shadows[10],
            }),
          }), ref: previewPaperRef },
          list: {
            disablePadding: true,
            sx: {
              // Disable MenuList scrolling so the inner preview panel is the only vertical scroller.
              overflow: 'visible',
              maxHeight: 'none',
            },
          },
        }}
      >
        <Box
          sx={{
            p: 1,
            // Popout is interactive/persistent, so preserve scrolling for full inspection.
            maxHeight: GEAR_DB_HISTORY_TOOLTIP_MAX_HEIGHT_PX,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {activePreviewPopout ? (
            <GearDbDiffToast
              payload={activePreviewPopout.payload}
              substatColors={substatColors}
              useStatButtonColors={useStatButtonColors}
            />
          ) : null}
        </Box>
      </Menu>
    </>
  )
}
