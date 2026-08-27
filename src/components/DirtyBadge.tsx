import { Box, Tooltip, useColorScheme, useTheme } from '@mui/material'
import { keyframes } from '@emotion/react'
import type { SxProps, Theme } from '@mui/material/styles'
import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { stalenessColor, stalenessMinutes, stalenessTier } from '../lib/stalenessRamp'
import { resolveSchemePalette, schemeModeFromColorScheme } from '../lib/themeCustomTokens'

// Slow breathing pulse, reserved for the critical tier. Deliberately the ONLY
// animated tier: if every tier moved, motion would become wallpaper and the one
// state that must break through would have no escalation left to spend.
const criticalPulseKf = keyframes`
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.25); }
`

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
  /**
   * Epoch ms when this document went unsaved, or null while it is saved. Drives
   * the staleness ramp: the dot warms from neutral toward the theme's error
   * colour as the unsaved span grows. Omit to keep the flat neutral dot.
   */
  dirtySince?: number | null | undefined
  /**
   * Current time (ms), supplied by the owner's staleness tick. Required for the
   * ramp to advance: it is passed in rather than read here so every badge ages off
   * ONE clock and the dot stays a pure function of its props (no clock read during
   * render, trivially testable, no timer per badge). Omitting it pins the dot to
   * the neutral tier — the flat pre-ramp badge.
   */
  now?: number | undefined
}

function DirtyBadge({ active, children, sx, ref, tooltip, dirtySince, now, ...rest }: DirtyBadgeProps) {
  // Age in minutes drives both the colour (continuous) and the tier (discrete).
  // No clock is read here: without a `now` from the owner's tick there is no age,
  // so the dot simply stays neutral rather than making render impure.
  const minutes = now != null ? stalenessMinutes(dirtySince, now) : null
  const tier = stalenessTier(minutes)
  // Ramp anchors must be REAL colour values. Under MUI's CSS-variables mode the
  // `sx` callback's `theme.vars.palette.*.main` is the string
  // "var(--mui-palette-warning-main)", which no colour parser can interpolate — the
  // ramp would silently fall back to neutral and the dot would never change colour.
  // resolveSchemePalette hands back the active scheme's actual hex values (the same
  // SSOT the contrast hooks use), so the interpolation has something to work with.
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const schemePalette = resolveSchemePalette(theme, schemeModeFromColorScheme(colorScheme))
  const dotColor = stalenessColor(minutes, {
    neutral: schemePalette.text.secondary,
    warning: schemePalette.warning.main,
    error: schemePalette.error.main,
  })
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
              const palette = theme.vars?.palette ?? theme.palette
              // The border may stay a CSS var — it is used verbatim, never parsed.
              const borderColor = palette.background.paper
              return {
                position: 'absolute',
                top: -3,
                right: -3,
                width: 10,
                height: 10,
                borderRadius: '50%',
                // Colour encodes HOW LONG the document has been unsaved; at the fresh
                // tier this resolves to the same neutral the badge has always worn.
                backgroundColor: dotColor,
                border: `2px solid ${borderColor}`,
                boxShadow: theme.shadows[2],
                // Hover-interactive only when a tooltip is present, so the explanation
                // is reachable; otherwise the dot stays purely decorative.
                pointerEvents: tooltip ? 'auto' : 'none',
                // Only the critical tier animates (see keyframe note above), and it
                // yields entirely to a reduced-motion preference — colour alone still
                // carries the state for users who suppress animation.
                ...(tier === 'critical' && {
                  animation: `${criticalPulseKf} 2.4s ease-in-out infinite`,
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }),
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
