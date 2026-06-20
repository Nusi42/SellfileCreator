import { Box, Tooltip } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { HTMLAttributes, ReactNode, Ref } from 'react'

interface DirtyBadgeProps extends HTMLAttributes<HTMLDivElement> {
  active: boolean
  children: ReactNode
  sx?: SxProps<Theme>
  ref?: Ref<HTMLDivElement>
  /**
   * Optional tooltip shown on the dot — typically the localized "not saved since
   * <time>" message. When provided, the dot becomes hover-interactive so the
   * explanation is reachable; otherwise it stays decorative/pointer-events:none.
   */
  tooltip?: string
}

function DirtyBadge({ active, children, sx, ref, tooltip, ...rest }: DirtyBadgeProps) {
  return (
    <Box
      ref={ref}
      sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...sx }}
      {...rest}
    >
      {children}
      {active && (
        <Tooltip title={tooltip ?? ''} disableHoverListener={!tooltip} arrow>
          <Box
            component="span"
            // When the dot has its own tooltip, swallow hover events so an ancestor
            // tooltip (e.g. the export button's MarkdownTooltip wrapping this badge)
            // doesn't pop up simultaneously and stack on top of the dot's tooltip.
            onMouseEnter={tooltip ? (e) => e.stopPropagation() : undefined}
            onMouseMove={tooltip ? (e) => e.stopPropagation() : undefined}
            onMouseOver={tooltip ? (e) => e.stopPropagation() : undefined}
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
                // Hover-interactive only when a tooltip is present, so the explanation
                // is reachable; otherwise the dot stays purely decorative.
                pointerEvents: tooltip ? 'auto' : 'none',
              }
            }}
            // Decorative when unexplained; labeled by its tooltip when present.
            aria-hidden={tooltip ? undefined : true}
          />
        </Tooltip>
      )}
    </Box>
  )
}

export default DirtyBadge
