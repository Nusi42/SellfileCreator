import { MenuItem, Select, Typography } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import type { RankValue } from '../../lib/types'

const ANY_SENTINEL = '__rank_any'

type RankSelectBaseProps = {
  allowAny?: boolean
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

type RankSelectSingleProps = RankSelectBaseProps & {
  multiple?: false
  value: RankValue | null | number
  onChange: (next: RankValue | null) => void
}

type RankSelectMultiProps = RankSelectBaseProps & {
  multiple: true
  value: RankValue[]
  onChange: (next: RankValue[]) => void
}

type RankSelectProps = RankSelectSingleProps | RankSelectMultiProps

export function GearRankSelect({
  value,
  onChange,
  allowAny = false,
  size = 'small',
  menuProps,
  sx,
  multiple = false,
}: RankSelectProps) {
  const { t } = useI18n()
  const resolvedSx: SxProps<Theme> = sx ?? {}
  const menuPropsAttr = menuProps ? { MenuProps: menuProps } : {}
  const rankLabel = useMemo(() => {
    const starKey = (n: number): 'star1' | 'star2' | 'star3' | 'star4' | 'star5' | 'star6' => {
      switch (n) {
        case 1: return 'star1'
        case 2: return 'star2'
        case 3: return 'star3'
        case 4: return 'star4'
        case 5: return 'star5'
        case 6: return 'star6'
        default: return 'star1'
      }
    }
    // Translate lazily to avoid recomputing every render while still honoring locale changes.
    return (n: number) => t(starKey(n))
  }, [t])
  const isMulti = Boolean(multiple)
  const multiValues = useMemo<RankValue[]>(() => {
    if (!isMulti) return []
    return Array.isArray(value) ? (value as RankValue[]) : []
  }, [isMulti, value])
  const singleValue = !isMulti ? (value as RankValue | null | number) : null
  const selectValue: string | string[] = isMulti
    ? multiValues.map((rank) => String(rank))
    : (singleValue == null ? '' : String(singleValue))
  // Custom renderers keep multi-select defaults labeled "Any" so Keep Uniques cards never show empty pills.
  const renderMultiValue = useMemo(() => {
    if (!isMulti) return undefined
    return () => {
      if (multiValues.length === 0) {
        return <Typography variant="body2">{t('any')}</Typography>
      }
      const summary = multiValues.map((rank) => rankLabel(Number(rank))).join(', ')
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
  }, [isMulti, multiValues, rankLabel, t])
  const handleChange = (event: SelectChangeEvent<string | string[]>) => {
    const raw = event.target.value
    if (isMulti) {
      const list = Array.isArray(raw) ? raw : [raw]
      const multiHandler = onChange as (next: RankValue[]) => void
      if (list.includes(ANY_SENTINEL)) {
        multiHandler([] as RankValue[])
        return
      }
      const deduped = Array.from(new Set(list)).map((entry) => Math.max(1, Math.min(6, Number(entry))) as RankValue)
      deduped.sort((a, b) => a - b)
      multiHandler(deduped)
      return
    }
    const valueString = typeof raw === 'string' ? raw : raw[0]
    const singleHandler = onChange as (next: RankValue | null) => void
    singleHandler(valueString === '' ? null : (Math.max(1, Math.min(6, Number(valueString))) as RankValue))
  }
  const renderSelected = useMemo(() => {
    if (singleValue == null) return <Typography variant="body2">{t('any')}</Typography>
    return <Typography variant="body2">{rankLabel(Number(singleValue))}</Typography>
  }, [rankLabel, singleValue, t])
  const selectRenderValue = isMulti
    ? (renderMultiValue ?? (() => null))
    : (() => renderSelected)
  return (
    <Select
      size={size}
      value={selectValue}
      onChange={handleChange}
      sx={resolvedSx}
      multiple={isMulti}
      displayEmpty
      renderValue={selectRenderValue}
      {...menuPropsAttr}
    >
      {allowAny && !isMulti ? <MenuItem value="">{t('any')}</MenuItem> : null}
      {allowAny && isMulti ? (
        <MenuItem value={ANY_SENTINEL}>{t('any')}</MenuItem>
      ) : null}
      {[1, 2, 3, 4, 5, 6].map((rank) => (
        <MenuItem key={rank} value={String(rank)}>
          {rankLabel(rank)}
        </MenuItem>
      ))}
    </Select>
  )
}
