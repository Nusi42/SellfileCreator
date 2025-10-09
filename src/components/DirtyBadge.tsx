import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ReactNode } from 'react'

export default function DirtyBadge(props: { active: boolean; children: ReactNode; sx?: SxProps<Theme> }) {
  const { active, children, sx } = props
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...sx }}>
      {children}
      {active && (
        <Box
          component="span"
          sx={(theme) => ({
            position: 'absolute',
            top: -3,
            right: -3,
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: theme.palette.error.main,
            border: `2px solid ${theme.palette.background.paper}`,
            boxShadow: theme.shadows[2],
            pointerEvents: 'none',
          })}
          aria-hidden
        />
      )}
    </Box>
  )
}
