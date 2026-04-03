import { Box, Paper, Typography } from '@mui/material'
import type { MutableRefObject, ReactNode } from 'react'

import { PANEL_WIDTH_PX, SIDE_BY_SIDE_BREAKPOINT_PX } from '../../lib/constants'

/**
 * BuilderColumn renders the builder-side layout: the rule form header, metaset controls, recipe chips,
 * and supporting dialogs. App.tsx supplies the interactive pieces as React nodes so this component
 * focuses on layout and styling only.
 */
export type BuilderColumnProps = {
  paperRef: MutableRefObject<HTMLDivElement | null>
  sideBySideMinPaperHeightPx: string | undefined
  forceSideBySide?: boolean
  /** Explicit left-panel width in px when the splitter has been dragged; overrides PANEL_WIDTH_PX. */
  widthPx?: number | undefined
  title: ReactNode
  caption?: string
  substatTargets?: ReactNode
  builderPanel: ReactNode
  headerActions: ReactNode
  metasetConflictDialog: ReactNode
  recipeChipsPanel: ReactNode
  pasteDialog: ReactNode
  copyDialog: ReactNode
}

export function BuilderColumn({
  paperRef,
  sideBySideMinPaperHeightPx,
  forceSideBySide = false,
  widthPx,
  title,
  caption,
  substatTargets,
  builderPanel,
  headerActions,
  metasetConflictDialog,
  recipeChipsPanel,
  pasteDialog,
  copyDialog,
}: BuilderColumnProps) {
  return (
    <Paper
      ref={paperRef}
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        // During drag the splitter writes --splitter-left-width directly to the DOM, so the
        // panel width updates without any React re-render. widthPx (the committed value) serves
        // as the fallback for the initial render and the single re-render after mouseup.
        width: forceSideBySide ? `var(--splitter-left-width, ${widthPx ?? PANEL_WIDTH_PX}px)` : '100%',
        maxWidth: widthPx != null ? 'none' : PANEL_WIDTH_PX,
        mx: forceSideBySide ? 0 : 'auto',
        // In forced side-by-side (zoom) mode, lock the paper to exactly the available viewport
        // height. minHeight + maxHeight together make it a fixed-height container so internal
        // flex children (form + chips) fill the paper without the paper itself ever growing
        // beyond the viewport and causing a document scrollbar.
        ...(forceSideBySide && sideBySideMinPaperHeightPx
          ? { minHeight: sideBySideMinPaperHeightPx, maxHeight: sideBySideMinPaperHeightPx, overflowY: 'hidden' }
          : {}),
        // Native side-by-side (no zoom) gets the same fixed-height treatment so that
        // chipsMaxHeight updates on mode switch cannot nudge the paper height up or down.
        [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
          mx: 0,
          // CSS variable carries live drag updates; prop value is the committed fallback.
          width: `var(--splitter-left-width, ${widthPx ?? PANEL_WIDTH_PX}px)`,
          ...(sideBySideMinPaperHeightPx
            ? { minHeight: sideBySideMinPaperHeightPx, maxHeight: sideBySideMinPaperHeightPx, overflowY: 'hidden' }
            : {}),
        },
      }}
      data-tour-id="builder.panel"
    >
      <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }} data-tour-id="builder.core">
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: 1, mb: 2 }}>
          {typeof title === 'string' ? (
            <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
              {title}
            </Typography>
          ) : title}
          {caption ? (
            <Typography variant="caption" color="text.secondary">
              {caption}
            </Typography>
          ) : (
            <Box />
          )}
          {substatTargets ?? <Box />}
        </Box>
        {/* The builder panels scope overflowX:auto to the form grid and keep the name
            TextField above that scroll zone, so floating labels are never clipped here. */}
        <Box sx={{ position: 'relative', flexShrink: 0 }}>{builderPanel}</Box>
        <Box sx={{ flexShrink: 0 }}>{headerActions}</Box>
      </Box>
      {metasetConflictDialog}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {recipeChipsPanel}
      </Box>
      {pasteDialog}
      {copyDialog}
    </Paper>
  )
}
