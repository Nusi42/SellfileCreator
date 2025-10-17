import { Box, Button, Paper, Typography } from '@mui/material'
import type { MutableRefObject, ReactNode } from 'react'

import { PANEL_WIDTH_PX, SIDE_BY_SIDE_BREAKPOINT_PX } from '../../lib/constants'

/**
 * BuilderColumn renders the builder-side layout: the rule form header, metaset controls, config chips,
 * and supporting dialogs. App.tsx supplies the interactive pieces as React nodes so this component
 * focuses on layout and styling only.
 */
export type BuilderColumnProps = {
  paperRef: MutableRefObject<HTMLDivElement | null>
  sideBySideMinPaperHeightPx: string | undefined
  title: string
  caption: string
  substatValuesLabel: string
  onOpenSubstatValues: () => void
  builderPanel: ReactNode
  headerActions: ReactNode
  metasetConflictDialog: ReactNode
  configChipsPanel: ReactNode
  pasteDialog: ReactNode
  copyDialog: ReactNode
}

export function BuilderColumn({
  paperRef,
  sideBySideMinPaperHeightPx,
  title,
  caption,
  substatValuesLabel,
  onOpenSubstatValues,
  builderPanel,
  headerActions,
  metasetConflictDialog,
  configChipsPanel,
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
        width: '100%',
        maxWidth: PANEL_WIDTH_PX,
        mx: 'auto',
        [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
          mx: 0,
          width: PANEL_WIDTH_PX,
          ...(sideBySideMinPaperHeightPx ? { minHeight: sideBySideMinPaperHeightPx } : {}),
        },
      }}
      data-tour-id="builder.panel"
    >
      <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }} data-tour-id="builder.core">
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: 1, mb: 1.25 }}>
          <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {caption}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={onOpenSubstatValues}
            sx={{ whiteSpace: 'nowrap', minWidth: 160, justifySelf: 'end' }}
          >
            {substatValuesLabel}
          </Button>
        </Box>
        <Box sx={{ position: 'relative', flexShrink: 0 }}>{builderPanel}</Box>
        <Box sx={{ flexShrink: 0 }}>{headerActions}</Box>
      </Box>
      {metasetConflictDialog}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {configChipsPanel}
      </Box>
      {pasteDialog}
      {copyDialog}
    </Paper>
  )
}
