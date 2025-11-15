import { MenuItem, Select } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, statVariantI18nKey, type StatVariant } from '../../lib/types'

type MainStatSelectProps = {
  value: StatVariant
  onChange: (next: StatVariant) => void
  options: readonly StatVariant[]
  anyValue?: StatVariant
  anyLabel?: string
  colorOverrides?: Record<number, { fg?: string }>
  showBorderColors?: boolean
  size?: SelectProps<number>['size']
  menuProps?: SelectProps<number>['MenuProps']
  sx?: SxProps<Theme>
}

export function GearMainStatSelect({
  value,
  onChange,
  options,
  anyValue = -1 as StatVariant,
  anyLabel,
  colorOverrides,
  showBorderColors = false,
  size = 'small',
  menuProps,
  sx,
}: MainStatSelectProps) {
  const { t } = useI18n()
  const anyText = anyLabel ?? t('any')
  const selectValue = Number(value)
  const mergeSx = (base?: SxProps<Theme>, extra?: SxProps<Theme>): SxProps<Theme> => {
    if (!extra) return (base ?? {}) as SxProps<Theme>
    if (!base) return extra
    if (Array.isArray(base)) return [...base, extra] as SxProps<Theme>
    return [base, extra] as SxProps<Theme>
  }
  // Pull the current color ahead of render so the Select button mirrors the stat chips.
  const selectedColor = useMemo(() => {
    if (!showBorderColors) return undefined
    if (selectValue === Number(anyValue)) return undefined
    return colorOverrides?.[selectValue]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[selectValue]
  }, [colorOverrides, selectValue, showBorderColors, anyValue])
  const handleChange = (event: SelectChangeEvent<number>) => {
    const raw = Number(event.target.value)
    onChange(Number.isFinite(raw) ? (raw as StatVariant) : anyValue)
  }
  const resolvedSx: SxProps<Theme> = showBorderColors
    ? mergeSx(sx, { '& .MuiSelect-select': { color: selectedColor } })
    : (sx ?? {})
  const menuPropsAttr = menuProps ? { MenuProps: menuProps } : {}
  return (
    <Select
      size={size}
      value={selectValue}
      onChange={handleChange}
      {...menuPropsAttr}
      sx={resolvedSx}
    >
      <MenuItem value={Number(anyValue)}>{anyText}</MenuItem>
      {options.map((variant) => (
        <MenuItem
          key={variant}
          value={variant}
          sx={{ color: showBorderColors ? (colorOverrides?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]) : undefined }}
        >
          {t(statVariantI18nKey(variant))}
        </MenuItem>
      ))}
    </Select>
  )
}
