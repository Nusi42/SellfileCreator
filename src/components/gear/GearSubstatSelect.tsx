import { Box, MenuItem, Select, Typography } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import { alpha } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo, type ReactNode } from 'react'
import { useI18n } from '../../lib/i18n'
import { BUILDER_STATUS_CHIP_HEIGHT_PX, MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX, STATUS_CHIP_BORDER_RADIUS_PX } from '../../lib/constants'
import {
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  STAT_VARIANTS_PRIORITY,
  statVariantI18nKey,
  type StatVariant,
} from '../../lib/types'

// Sentinel option to clear multi-selects back to "Any".
const ANY_SENTINEL = '__substat_any'

type SubstatSelectBaseProps = {
  // Explicit options allow callers to narrow the list (defaults to STAT_VARIANTS_PRIORITY).
  options?: readonly StatVariant[]
  // Placeholder label when no substat is selected.
  anyLabel?: string
  colorOverrides?: Record<number, { fg?: string }>
  showBorderColors?: boolean
  // When true, show the normalized-sort style selection column.
  normalizedMenu?: boolean
  // Optional override for the normalized menu control column (e.g., weight controls).
  renderNormalizedMenuControl?: (args: {
    variant: StatVariant
    label: string
    selected: boolean
  }) => ReactNode | null
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

type SubstatSelectSingleProps = SubstatSelectBaseProps & {
  multiple?: false
  value: StatVariant
  onChange: (next: StatVariant) => void
}

type SubstatSelectMultiProps = SubstatSelectBaseProps & {
  multiple: true
  value: StatVariant[]
  onChange: (next: StatVariant[]) => void
}

type SubstatSelectProps = SubstatSelectSingleProps | SubstatSelectMultiProps

export function GearSubstatSelect({
  value,
  onChange,
  options,
  anyLabel,
  colorOverrides,
  showBorderColors = false,
  normalizedMenu = false,
  renderNormalizedMenuControl,
  size = 'small',
  menuProps,
  sx,
  multiple = false,
}: SubstatSelectProps) {
  const { t } = useI18n()
  // Localize the placeholder label to match other selectors.
  const anyText = anyLabel ?? t('any')
  // Multi-select toggles a distinct value path + render hook.
  const isMulti = Boolean(multiple)
  // Prefer the explicit options while defaulting to the shared substat priority list.
  // This keeps ordering predictable even when callers pass duplicates.
  const normalizedOptions = useMemo(() => {
    const base = options && options.length > 0 ? options : STAT_VARIANTS_PRIORITY
    const seen = new Set<number>()
    const ordered: StatVariant[] = []
    for (const variant of base) {
      const numeric = Number(variant)
      // Ignore malformed variants early.
      if (!Number.isFinite(numeric)) continue
      // Skip duplicates so the menu doesn't repeat entries.
      if (seen.has(numeric)) continue
      seen.add(numeric)
      ordered.push(numeric as StatVariant)
    }
    return ordered
  }, [options])
  // Track an ordering map so multi selections stay in the same order as the options list.
  // The map is reused for sorting and validation.
  const optionOrder = useMemo(() => new Map(
    normalizedOptions.map((variant, index) => [Number(variant), index]),
  ), [normalizedOptions])
  // Normalize the value for multi-select paths.
  const multiValues = useMemo<StatVariant[]>(() => {
    if (!isMulti) return []
    return Array.isArray(value) ? (value as StatVariant[]) : []
  }, [isMulti, value])
  // Treat the sentinel option as selected when nothing is picked.
  const anySelected = isMulti && multiValues.length === 0
  // Default the single-select to the first known variant.
  const singleValue = !isMulti ? (value as StatVariant) : (STAT_VARIANTS_PRIORITY[0] as StatVariant)
  // Convert the value to the Select-friendly string payload.
  const selectValue: string | string[] = isMulti
    ? multiValues.map((variant) => String(variant))
    : String(singleValue)
  // Merge styles so callers can extend overrides without losing defaults.
  const mergeSx = (base?: SxProps<Theme>, extra?: SxProps<Theme>): SxProps<Theme> => {
    if (!extra) return (base ?? {}) as SxProps<Theme>
    if (!base) return extra
    if (Array.isArray(base)) return [...base, extra] as SxProps<Theme>
    return [base, extra] as SxProps<Theme>
  }
  // Pull the current color ahead of render so the Select button mirrors stat chips.
  // Multi-select keeps the default color to avoid noisy mixes.
  const selectedColor = useMemo(() => {
    if (!showBorderColors || isMulti) return undefined
    const numeric = Number(singleValue)
    return colorOverrides?.[numeric]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[numeric]
  }, [colorOverrides, isMulti, showBorderColors, singleValue])
  const handleChange = (event: SelectChangeEvent<string | string[]>) => {
    const raw = event.target.value
    if (isMulti) {
      // Multi-select returns an array or a single string depending on menu UX.
      const multiHandler = onChange as (next: StatVariant[]) => void
      const list = Array.isArray(raw) ? raw : [raw]
      // Selecting the sentinel resets to "Any".
      if (list.includes(ANY_SENTINEL)) {
        multiHandler([])
        return
      }
      const deduped: StatVariant[] = []
      const seen = new Set<number>()
      for (const entry of list) {
        const numeric = Number(entry)
        // Drop invalid ids so the caller only sees real StatVariants.
        if (!Number.isFinite(numeric)) continue
        // Enforce uniqueness and ordering.
        if (seen.has(numeric)) continue
        // Ignore values not in the option list.
        if (!optionOrder.has(numeric)) continue
        seen.add(numeric)
        deduped.push(numeric as StatVariant)
      }
      // Preserve the menu ordering for the displayed list.
      deduped.sort((left, right) => {
        const leftOrder = optionOrder.get(Number(left)) ?? Number.MAX_SAFE_INTEGER
        const rightOrder = optionOrder.get(Number(right)) ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return Number(left) - Number(right)
      })
      multiHandler(deduped)
      return
    }
    // Single-select expects one numeric StatVariant.
    const numeric = Number(Array.isArray(raw) ? raw[0] : raw)
    const singleHandler = onChange as (next: StatVariant) => void
    singleHandler(Number.isFinite(numeric) ? (numeric as StatVariant) : (STAT_VARIANTS_PRIORITY[0] as StatVariant))
  }
  // Apply border colors only when the caller asks for them.
  const resolvedSx: SxProps<Theme> = showBorderColors
    ? mergeSx(sx, { '& .MuiSelect-select': { color: selectedColor } })
    : (sx ?? {})
  // Only pass MenuProps when provided so MUI doesn't diff empty objects.
  const menuPropsAttr = menuProps ? { MenuProps: menuProps } : {}
  // Render the single selected label using the stat catalog.
  const renderSelected = useMemo(() => (
    <Typography variant="body2">{t(statVariantI18nKey(singleValue))}</Typography>
  ), [singleValue, t])
  // Multi-select summary should keep the placeholder visible when nothing is picked.
  // Long lists collapse to a comma-separated summary with ellipsis.
  const renderMultiValue = useMemo(() => {
    if (!isMulti) return undefined
    return () => {
      if (multiValues.length === 0) {
        return <Typography variant="body2">{anyText}</Typography>
      }
      const summary = multiValues.map((variant) => t(statVariantI18nKey(variant))).join(', ')
      return (
        <Typography
          variant="body2"
          data-ellipsis-target
          sx={{ display: 'block', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {summary}
        </Typography>
      )
    }
  }, [anyText, isMulti, multiValues, t])
  // Choose the renderer based on single vs multi mode.
  const selectRenderValue = isMulti
    ? (renderMultiValue ?? (() => null))
    : (() => renderSelected)
  // Enable the normalized menu only for multi-selects.
  const useNormalizedMenu = Boolean(normalizedMenu && isMulti)
  const renderSelectionBadge = (selected: boolean) => (
    <Box
      component="span"
      aria-hidden
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: BUILDER_STATUS_CHIP_HEIGHT_PX,
        minWidth: 34,
        px: 0.75,
        borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
        fontSize: theme.typography.pxToRem(14),
        fontWeight: 800,
        letterSpacing: 0.1,
        userSelect: 'none',
        ...(selected
          ? {
              border: `1px solid ${alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.7 : 0.55)}`,
              backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
              color: theme.palette.success.main,
            }
          : {
              border: `1px solid ${alpha(theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.22 : 0.14)}`,
              backgroundColor: 'transparent',
            }),
      })}
    >
      {selected ? '✓' : null}
    </Box>
  )
  const renderNormalizedRow = (
    label: string,
    control: ReactNode,
    color?: string,
  ) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...(color ? { color } : null),
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          width: MENU_CONTROL_MIN_WIDTH_PX,
          minWidth: MENU_CONTROL_MIN_WIDTH_PX,
          height: MENU_CONTROL_HEIGHT_PX,
          minHeight: MENU_CONTROL_HEIGHT_PX,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {control}
      </Box>
    </Box>
  )
  return (
    <Select
      size={size}
      value={selectValue}
      onChange={handleChange}
      {...menuPropsAttr}
      multiple={isMulti}
      displayEmpty
      renderValue={selectRenderValue}
      sx={resolvedSx}
    >
      {isMulti ? (
        <MenuItem value={ANY_SENTINEL} selected={anySelected}>
          {useNormalizedMenu
            ? renderNormalizedRow(anyText, renderSelectionBadge(anySelected))
            : anyText}
        </MenuItem>
      ) : null}
      {normalizedOptions.map((variant) => {
        const label = t(statVariantI18nKey(variant))
        const selected = isMulti && multiValues.some((value) => Number(value) === Number(variant))
        const color = showBorderColors ? (colorOverrides?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]) : undefined
        const customControl = renderNormalizedMenuControl?.({ variant, label, selected }) ?? null
        const normalizedControl = customControl ?? renderSelectionBadge(selected)
        return (
          <MenuItem
            key={variant}
            value={String(variant)}
            selected={selected}
            sx={useNormalizedMenu ? (theme) => ({
              gap: 1,
              alignItems: 'center',
              ...(selected
                ? { backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) }
                : {}),
              '&:hover': {
                backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.12),
              },
            }) : { color }}
          >
            {useNormalizedMenu
              ? renderNormalizedRow(label, normalizedControl, color)
              : label}
          </MenuItem>
        )
      })}
    </Select>
  )
}
