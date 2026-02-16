import { useMemo, type ReactNode } from 'react'
import { Box, Chip } from '@mui/material'
import { alpha, useTheme, type SxProps, type Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import type { KeepOverrideScopeKey } from '../../lib/keepOverrideScope'
import { createBuilderStatusChipSx } from '../builderStatusChipStyles'
import EllipsisTooltip from '../EllipsisTooltip'

// Keep override scope chips should visually match builder-status pills.
// We still need a distinct hover tint to signal clickability.
const KEEP_OVERRIDE_SCOPE_HOVER_ALPHA = { light: 0.12, dark: 0.24 } as const
// Keep chip labels truncated so the native ellipsis tooltip can expose full text on overflow.
const KEEP_OVERRIDE_SCOPE_CHIP_ELLIPSIS_SX = {
  display: 'inline-flex',
  maxWidth: '100%',
  '& .MuiChip-root': {
    maxWidth: '100%',
  },
  '& .MuiChip-label': {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
} as const

type KeepOverrideScopeChipProps = {
  scope: KeepOverrideScopeKey
  label: string
  active: boolean
  disabled?: boolean
  // Allow the parent card to decide how scope toggles are applied.
  onToggle?: (scope: KeepOverrideScopeKey) => void
}

export function KeepOverrideScopeChip({
  scope,
  label,
  active,
  disabled = false,
  onToggle,
}: KeepOverrideScopeChipProps) {
  // Pull theme colors once so the memoized styles stay consistent.
  const theme = useTheme()
  // Memoize the style resolver to avoid recalculating per render.
  const chipSx = useMemo<((isActive: boolean) => SxProps<Theme>)>(() => {
    // Build the base + inactive variants once so each render just selects between them.
    const builderChipSx = createBuilderStatusChipSx(theme)
    // Keep the base active styling as the default visual anchor.
    const baseChipSx = builderChipSx(true, { dimDisabled: true }) as SystemStyleObject<Theme>
    // Inactive chips keep the same shape but toned down.
    const inactiveChipSx = builderChipSx(false, { dimDisabled: true }) as SystemStyleObject<Theme>
    // Use a gentle hover tint so inactive chips still feel clickable.
    const hoverBg = alpha(
      theme.palette.text.primary,
      theme.palette.mode === 'dark' ? KEEP_OVERRIDE_SCOPE_HOVER_ALPHA.dark : KEEP_OVERRIDE_SCOPE_HOVER_ALPHA.light,
    )
    // Return a resolver that swaps the inactive overlay when needed.
    return (isActive: boolean): SxProps<Theme> => (
      isActive
        ? baseChipSx
        : [
            baseChipSx,
            inactiveChipSx,
            {
              // Mirror builder chip hover feedback for consistent affordance.
              '&.MuiChip-clickable:hover': { backgroundColor: hoverBg },
              '&.MuiChip-clickable:active': { backgroundColor: hoverBg },
            } as SystemStyleObject<Theme>,
          ]
    )
  }, [theme])
  return (
    <EllipsisTooltip title={label} selector=".MuiChip-label">
      <Box component="span" sx={KEEP_OVERRIDE_SCOPE_CHIP_ELLIPSIS_SX}>
        <Chip
          size="small"
          variant="filled"
          clickable
          // Allow rule cards to handle pointer intent checks.
          data-rule-card-interactive="true"
          disabled={disabled}
          onClick={(event) => {
            // Prevent the click from selecting the rule card unless the caller wants it.
            event.stopPropagation()
            // Delegate the toggle so the parent can enforce constraints.
            onToggle?.(scope)
          }}
          aria-pressed={active}
          label={label}
          // Resolve the active vs inactive styling at render time.
          sx={chipSx(active)}
        />
      </Box>
    </EllipsisTooltip>
  )
}

type KeepOverrideScopeFieldProps = {
  chip?: ReactNode | null
  children: ReactNode
}

export function KeepOverrideScopeField({ chip, children }: KeepOverrideScopeFieldProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Main field content renders first for consistent alignment. */}
      {children}
      {/* Optional chip sits below with inline sizing to avoid stretching. */}
      {chip ? (
        <Box component="span" sx={{ display: 'inline-flex' }}>
          {chip}
        </Box>
      ) : null}
    </Box>
  )
}
