import React from 'react'
import { Box, Typography } from '@mui/material'
import { GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX } from '../lib/constants'

export type GearInspectorSummaryLabelProps = {
  label: React.ReactNode
  icon?: React.ReactNode | undefined
  color?: string | undefined
  wrap?: boolean | undefined
}

/**
 * GearInspectorSummaryLabel
 *
 * Consistent inline label + optional icon treatment shared between the Gear
 * Inspector dialog and preview rows so item summaries stay visually aligned.
 */
export function GearInspectorSummaryLabel({ label, icon, color, wrap = false }: GearInspectorSummaryLabelProps) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        fontSize: '0.9375rem',
        lineHeight: '1.25rem',
        color: color ?? 'inherit',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        flexShrink: 1,
      }}
    >
      {icon ? (
        <Box
          sx={{
            width: `${GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX}px`,
            height: `${GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX}px`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: `${GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX}px`,
            '& svg, & img': {
              width: '100%',
              height: '100%',
            },
          }}
          aria-hidden
        >
          {icon}
        </Box>
      ) : null}
      <Typography
        variant="body2"
        component="span"
        noWrap={!wrap}
        sx={{
          fontSize: 'inherit',
          lineHeight: 'inherit',
          color: 'inherit',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        {label}
      </Typography>
    </Box>
  )
}

export default GearInspectorSummaryLabel
