import { MenuItem, Select, Typography } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, compareVariants, statVariantI18nKey, type StatVariant } from '../../lib/types'

const ANY_SENTINEL = '__main_any'

type MainStatSelectBaseProps = {
  options: readonly StatVariant[]
  anyValue?: StatVariant
  anyLabel?: string
  colorOverrides?: Record<number, { fg?: string }>
  showBorderColors?: boolean
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

type MainStatSelectSingleProps = MainStatSelectBaseProps & {
  multiple?: false
  value: StatVariant
  onChange: (next: StatVariant) => void
}

type MainStatSelectMultiProps = MainStatSelectBaseProps & {
  multiple: true
  value: StatVariant[]
  onChange: (next: StatVariant[]) => void
}

type MainStatSelectProps = MainStatSelectSingleProps | MainStatSelectMultiProps

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
  multiple = false,
}: MainStatSelectProps) {
  const { t } = useI18n()
  const anyText = anyLabel ?? t('any')
  const isMulti = Boolean(multiple)
  const normalizedOptions = useMemo(() => {
    const filtered = options.filter((variant) => Number(variant) !== Number(anyValue))
    return filtered.slice().sort(compareVariants)
  }, [anyValue, options])
  const multiValues = useMemo<StatVariant[]>(() => {
    if (!isMulti) return []
    return Array.isArray(value) ? (value as StatVariant[]) : []
  }, [isMulti, value])
  const singleValue = !isMulti ? (value as StatVariant) : (anyValue as StatVariant)
  const selectValue: string | string[] = isMulti
    ? multiValues.map((variant) => String(variant))
    : String(singleValue)
  const mergeSx = (base?: SxProps<Theme>, extra?: SxProps<Theme>): SxProps<Theme> => {
    if (!extra) return (base ?? {}) as SxProps<Theme>
    if (!base) return extra
    if (Array.isArray(base)) return [...base, extra] as SxProps<Theme>
    return [base, extra] as SxProps<Theme>
  }
  // Pull the current color ahead of render so the Select button mirrors the stat chips.
  const selectedColor = useMemo(() => {
    if (!showBorderColors || isMulti) return undefined
    if (Number(singleValue) === Number(anyValue)) return undefined
    const numeric = Number(singleValue)
    return colorOverrides?.[numeric]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[numeric]
  }, [anyValue, colorOverrides, isMulti, showBorderColors, singleValue])
  const handleChange = (event: SelectChangeEvent<string | string[]>) => {
    const raw = event.target.value
    if (isMulti) {
      const multiHandler = onChange as (next: StatVariant[]) => void
      const list = Array.isArray(raw) ? raw : [raw]
      if (list.includes(ANY_SENTINEL)) {
        multiHandler([])
        return
      }
      const deduped = Array.from(new Set(list))
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => entry as StatVariant)
      deduped.sort(compareVariants)
      multiHandler(deduped)
      return
    }
    const numeric = Number(Array.isArray(raw) ? raw[0] : raw)
    const singleHandler = onChange as (next: StatVariant) => void
    singleHandler(Number.isFinite(numeric) ? (numeric as StatVariant) : anyValue)
  }
  const resolvedSx: SxProps<Theme> = showBorderColors
    ? mergeSx(sx, { '& .MuiSelect-select': { color: selectedColor } })
    : (sx ?? {})
  const menuPropsAttr = menuProps ? { MenuProps: menuProps } : {}
  const renderSelected = useMemo(() => {
    if (Number(singleValue) === Number(anyValue)) return <Typography variant="body2">{anyText}</Typography>
    return <Typography variant="body2">{t(statVariantI18nKey(singleValue))}</Typography>
  }, [anyText, anyValue, singleValue, t])
  // Multi-select main stats also surface the "Any" placeholder so new Keep Unique cards aren't blank.
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
          sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {summary}
        </Typography>
      )
    }
  }, [anyText, isMulti, multiValues, t])
  const selectRenderValue = isMulti
    ? (renderMultiValue ?? (() => null))
    : (() => renderSelected)
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
        <MenuItem value={ANY_SENTINEL}>{anyText}</MenuItem>
      ) : (
        <MenuItem value={String(anyValue)}>{anyText}</MenuItem>
      )}
      {normalizedOptions.map((variant) => (
        <MenuItem
          key={variant}
          value={String(variant)}
          sx={{ color: showBorderColors ? (colorOverrides?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]) : undefined }}
        >
          {t(statVariantI18nKey(variant))}
        </MenuItem>
      ))}
    </Select>
  )
}
