import { MenuItem, Select, Typography } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useI18n } from '../../lib/i18n'
import type { RankValue } from '../../lib/types'

const ANY_SENTINEL = '__rarity_any'

type RaritySelectBaseProps = {
  allowAny?: boolean
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

type RaritySelectSingleProps = RaritySelectBaseProps & {
  multiple?: false
  value: number | null
  onChange: (next: number | null) => void
}

type RaritySelectMultiProps = RaritySelectBaseProps & {
  multiple: true
  value: RankValue[]
  onChange: (next: RankValue[]) => void
}

type RaritySelectProps = RaritySelectSingleProps | RaritySelectMultiProps

export function GearRaritySelect({
  value,
  onChange,
  allowAny = false,
  size = 'small',
  menuProps,
  sx,
  multiple = false,
}: RaritySelectProps) {
  const { t } = useI18n()
  const resolvedSx: SxProps<Theme> = sx ?? {}
  const menuPropsAttr = menuProps ? { MenuProps: menuProps } : {}
  const isMulti = Boolean(multiple)
  const multiValues = isMulti ? ((value as RankValue[]) ?? []) : null
  const singleValue = !isMulti ? (value as number | null) : null
  const selectValue: string | string[] = (() => {
    if (isMulti) return (multiValues ?? []).map((entry) => String(Math.max(1, Math.min(6, entry))))
    return singleValue == null ? '' : String(singleValue)
  })()
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
    const singleHandler = onChange as (next: number | null) => void
    singleHandler(valueString === '' ? null : (Math.max(1, Math.min(6, Number(valueString)))))
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
  const renderSelected = (() => {
    if (singleValue == null) return <Typography variant="body2">{t('any')}</Typography>
    return <Typography variant="body2">{rarityLabel(Number(singleValue))}</Typography>
  })()
  return (
    <Select
      size={size}
      value={selectValue}
      onChange={handleChange}
      multiple={isMulti}
      displayEmpty
      {...(!isMulti ? { renderValue: () => renderSelected } : {})}
      sx={resolvedSx}
      {...menuPropsAttr}
    >
      {allowAny && !isMulti ? <MenuItem value="">{t('any')}</MenuItem> : null}
      {allowAny && isMulti ? (
        <MenuItem value={ANY_SENTINEL}>{t('any')}</MenuItem>
      ) : null}
      {[1, 2, 3, 4, 5, 6].map((rarity) => (
        <MenuItem key={rarity} value={String(rarity)}>
          {rarityLabel(rarity)}
        </MenuItem>
      ))}
    </Select>
  )
}
