import { MenuItem, Select } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useI18n } from '../../lib/i18n'

type RaritySelectProps = {
  value: number | null
  onChange: (next: number | null) => void
  allowAny?: boolean
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

export function GearRaritySelect({
  value,
  onChange,
  allowAny = false,
  size = 'small',
  menuProps,
  sx,
}: RaritySelectProps) {
  const { t } = useI18n()
  const resolvedSx: SxProps<Theme> = sx ?? {}
  const menuPropsAttr = menuProps ? { MenuProps: menuProps } : {}
  const handleChange = (event: SelectChangeEvent<string>) => {
    const raw = event.target.value
    // Empty string marks the shared "Any" sentinel so callers can clear the selection.
    onChange(raw === '' ? null : (Math.max(1, Math.min(6, Number(raw)))))
  }
  // Reuse the existing translation keys so dialog + Keep Uniques stay localized identically.
  const rarityLabel = (rarity: number): string => (
    rarity === 1 ? t('rarityCommon')
      : rarity === 2 ? t('rarityUncommon')
        : rarity === 3 ? t('rarityRare')
          : rarity === 4 ? t('rarityEpic')
            : rarity === 5 ? t('rarityLegendary')
              : t('rarityMythical')
  )
  return (
    <Select
      size={size}
      value={value == null ? '' : String(value)}
      onChange={handleChange}
      sx={resolvedSx}
      {...menuPropsAttr}
    >
      {allowAny ? <MenuItem value="">{t('any')}</MenuItem> : null}
      {[1, 2, 3, 4, 5, 6].map((rarity) => (
        <MenuItem key={rarity} value={String(rarity)}>
          {rarityLabel(rarity)}
        </MenuItem>
      ))}
    </Select>
  )
}
