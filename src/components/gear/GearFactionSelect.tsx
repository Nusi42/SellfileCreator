import { Box, ListSubheader, MenuItem, Select } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useI18n } from '../../lib/i18n'
import { Faction, factionI18nKey, type FactionId } from '../../lib/types'
import { FactionOptionLabel } from '../FactionIcon'

const FACTION_MENU_PROPS = { PaperProps: { sx: { maxHeight: 360 } } } as const

const FACTION_GROUPS: Array<{ labelKey: string; ids: FactionId[] }> = [
  { labelKey: 'factionGroupTelerianLeague', ids: [Faction.BannerLords, Faction.HighElves, Faction.SacredOrder, Faction.Barbarians] },
  { labelKey: 'factionGroupGaellenPact', ids: [Faction.OgrynTribes, Faction.Lizardmen, Faction.Skinwalkers, Faction.Orcs] },
  { labelKey: 'factionGroupTheCorrupted', ids: [Faction.Demonspawn, Faction.UndeadHordes, Faction.DarkElves, Faction.KnightRevenant] },
  { labelKey: 'factionGroupNyresanUnion', ids: [Faction.Dwarves, Faction.Shadowkin, Faction.SylvanWatchers] },
]

type FactionSelectProps = {
  value: FactionId | null
  onChange: (next: FactionId | null) => void
  disabled?: boolean
  allowAny?: boolean
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

export function GearFactionSelect({
  value,
  onChange,
  disabled = false,
  allowAny = true,
  size = 'small',
  menuProps,
  sx,
}: FactionSelectProps) {
  const { t } = useI18n()
  const resolvedSx: SxProps<Theme> = sx ?? {}
  const handleChange = (event: SelectChangeEvent<string>) => {
    const raw = event.target.value
    // Carry null through for the "Any faction" case so accessories without faction quickly reset.
    onChange(raw === '' ? null : (Number(raw) as FactionId))
  }
  const renderValue = () => {
    if (!value) return t('any')
    const label = t(factionI18nKey(value))
    return (
      <Box component="span" title={label} sx={{ display: 'inline-flex', alignItems: 'center', width: '100%' }}>
        <FactionOptionLabel faction={value} label={label} truncate textSx={{ fontSize: '0.875rem' }} />
      </Box>
    )
  }
  return (
    <Select
      size={size}
      disabled={disabled}
      value={value == null ? '' : String(value)}
      onChange={handleChange}
      renderValue={renderValue}
      MenuProps={menuProps ?? FACTION_MENU_PROPS}
      sx={resolvedSx}
    >
      {allowAny ? <MenuItem value="">{t('any')}</MenuItem> : null}
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
