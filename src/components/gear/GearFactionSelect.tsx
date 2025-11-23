import { Box, ListSubheader, MenuItem, Select } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import { Faction, factionI18nKey, type FactionId } from '../../lib/types'
import { FactionOptionLabel } from '../FactionIcon'
import EllipsisTooltip from '../EllipsisTooltip'

const FACTION_MENU_PROPS = { PaperProps: { sx: { maxHeight: 360 } } } as const
const ANY_SENTINEL = '__faction_any'

const FACTION_GROUPS: Array<{ labelKey: string; ids: FactionId[] }> = [
  { labelKey: 'factionGroupTelerianLeague', ids: [Faction.BannerLords, Faction.HighElves, Faction.SacredOrder, Faction.Barbarians] },
  { labelKey: 'factionGroupGaellenPact', ids: [Faction.OgrynTribes, Faction.Lizardmen, Faction.Skinwalkers, Faction.Orcs] },
  { labelKey: 'factionGroupTheCorrupted', ids: [Faction.Demonspawn, Faction.UndeadHordes, Faction.DarkElves, Faction.KnightRevenant] },
  { labelKey: 'factionGroupNyresanUnion', ids: [Faction.Dwarves, Faction.Shadowkin, Faction.SylvanWatchers] },
]

type FactionSelectBaseProps = {
  disabled?: boolean
  allowAny?: boolean
  size?: SelectProps<string | string[]>['size']
  menuProps?: SelectProps<string | string[]>['MenuProps']
  sx?: SxProps<Theme>
}

type FactionSelectSingleProps = FactionSelectBaseProps & {
  multiple?: false
  value: FactionId | null
  onChange: (next: FactionId | null) => void
}

type FactionSelectMultiProps = FactionSelectBaseProps & {
  multiple: true
  value: FactionId[]
  onChange: (next: FactionId[]) => void
}

type FactionSelectProps = FactionSelectSingleProps | FactionSelectMultiProps

export function GearFactionSelect({
  value,
  onChange,
  disabled = false,
  allowAny = true,
  size = 'small',
  menuProps,
  sx,
  multiple = false,
}: FactionSelectProps) {
  const { t } = useI18n()
  const resolvedSx: SxProps<Theme> = sx ?? {}
  const isMulti = Boolean(multiple)
  const multiValues = useMemo<FactionId[]>(() => {
    if (!isMulti) return []
    return Array.isArray(value) ? (value as FactionId[]) : []
  }, [isMulti, value])
  const singleValue = !isMulti ? (value as FactionId | null) : null
  const handleChange = (event: SelectChangeEvent<string | string[]>) => {
    const raw = event.target.value
    if (isMulti) {
      const list = Array.isArray(raw) ? raw : [raw]
      const multiHandler = onChange as (next: FactionId[]) => void
      if (list.includes(ANY_SENTINEL)) {
        multiHandler([])
        return
      }
      const deduped = Array.from(new Set(list))
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => entry as FactionId)
      multiHandler(deduped)
      return
    }
    const valueString = Array.isArray(raw) ? raw[0] : raw
    const singleHandler = onChange as (next: FactionId | null) => void
    singleHandler(valueString === '' ? null : (Number(valueString) as FactionId))
  }
  const renderSelected = () => {
    if (!singleValue) return t('any')
    const label = t(factionI18nKey(singleValue))
    return (
      <EllipsisTooltip title={label}>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
          <FactionOptionLabel faction={singleValue} label={label} truncate textSx={{ fontSize: '0.875rem' }} />
        </Box>
      </EllipsisTooltip>
    )
  }
  const selectValue = isMulti
    ? multiValues.map((entry) => String(entry))
    : (singleValue == null ? '' : String(singleValue))
  return (
    <Select
      size={size}
      disabled={disabled}
      value={selectValue}
      onChange={handleChange}
      multiple={isMulti}
      displayEmpty
      {...(!isMulti ? { renderValue: () => renderSelected() } : {})}
      MenuProps={menuProps ?? FACTION_MENU_PROPS}
      sx={resolvedSx}
    >
      {allowAny ? (
        isMulti
          ? <MenuItem value={ANY_SENTINEL}>{t('any')}</MenuItem>
          : <MenuItem value="">{t('any')}</MenuItem>
      ) : null}
      {FACTION_GROUPS.map((group) => (
        <Box key={group.labelKey} component="div">
          {/* Render each faction group header before its member rows so localization stays readable. */}
          <ListSubheader sx={{ fontSize: '0.75rem' }}>{t(group.labelKey)}</ListSubheader>
          {group.ids.map((code) => (
            <MenuItem key={code} value={String(code)}>
              <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} size={23} />
            </MenuItem>
          ))}
        </Box>
      ))}
    </Select>
  )
}
