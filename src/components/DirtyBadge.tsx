import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'

interface DirtyBadgeProps extends HTMLAttributes<HTMLDivElement> {
  active: boolean
  children: ReactNode
  sx?: SxProps<Theme>
}

const DirtyBadge = forwardRef<HTMLDivElement, DirtyBadgeProps>(function DirtyBadge({ active, children, sx, ...rest }, ref) {
  return (
    <Box
      ref={ref}
      sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...sx }}
      {...rest}
    >
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
})

export default DirtyBadge
