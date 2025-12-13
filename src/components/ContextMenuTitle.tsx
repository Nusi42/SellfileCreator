import { Box, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'

type ContextMenuTitleProps = {
  title: string
  description?: string | null
  sx?: SxProps<Theme>
}

/**
 * ContextMenuTitle
 *
 * Single shared title block for popovers/menus that use ContextMenuPaper.
 * Why: keep spacing + typography consistent across the various “popout” UIs.
 */
export default function ContextMenuTitle({ title, description, sx }: ContextMenuTitleProps) {
  return (
    <Box sx={[{ display: 'flex', flexDirection: 'column', gap: 0.5 }, ...(Array.isArray(sx) ? sx : (sx ? [sx] : []))]}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      ) : null}
    </Box>
  )
}
