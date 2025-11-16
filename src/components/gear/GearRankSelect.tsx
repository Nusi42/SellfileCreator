import { MenuItem, Select } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import type { RankValue } from '../../lib/types'

type RankSelectProps = {
  value: RankValue | null | number
  onChange: (next: RankValue | null) => void
  allowAny?: boolean
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

export function GearRankSelect({
  value,
  onChange,
  allowAny = false,
  size = 'small',
  menuProps,
  sx,
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
  const handleChange = (event: SelectChangeEvent<string>) => {
    const raw = event.target.value
    // Empty string represents the "Any" sentinel when the caller opts in via allowAny.
    onChange(raw === '' ? null : (Math.max(1, Math.min(6, Number(raw))) as RankValue))
  }
  return (
    <Select
      size={size}
      value={value == null ? '' : String(value)}
      onChange={handleChange}
      sx={resolvedSx}
      {...menuPropsAttr}
    >
      {allowAny ? <MenuItem value="">{t('any')}</MenuItem> : null}
      {[1, 2, 3, 4, 5, 6].map((rank) => (
        <MenuItem key={rank} value={String(rank)}>
          {rankLabel(rank)}
        </MenuItem>
      ))}
    </Select>
  )
}
