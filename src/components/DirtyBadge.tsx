import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { HTMLAttributes, ReactNode, Ref } from 'react'

interface DirtyBadgeProps extends HTMLAttributes<HTMLDivElement> {
  active: boolean
  children: ReactNode
  sx?: SxProps<Theme>
  ref?: Ref<HTMLDivElement>
}

function DirtyBadge({ active, children, sx, ref, ...rest }: DirtyBadgeProps) {
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
          sx={(theme) => {
            const neutralDot = (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary)
            const borderColor = (theme.vars?.palette.background.paper ?? theme.palette.background.paper)
            return {
              position: 'absolute',
              top: -3,
              right: -3,
              width: 10,
              height: 10,
              borderRadius: '50%',
              // Neutral indicator keeps the badge visible without implying an error state.
              backgroundColor: neutralDot,
              border: `2px solid ${borderColor}`,
              boxShadow: theme.shadows[2],
              pointerEvents: 'none',
            }
          }}
          aria-hidden
        />
      )}
    </Box>
  )
}

export default DirtyBadge
