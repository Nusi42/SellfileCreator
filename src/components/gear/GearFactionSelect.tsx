import { Box, ListSubheader, MenuItem, Select } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo, type ReactNode } from 'react'
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
  // Keep faction group membership aligned with the builder and filter menus.
  { labelKey: 'factionGroupNyresanUnion', ids: [Faction.Dwarves, Faction.Shadowkin, Faction.SylvanWatchers, Faction.Argonites] },
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
  const resolvedSx = sx
  const isMulti = Boolean(multiple)
  const multiValues = useMemo<FactionId[]>(() => {
    if (!isMulti) return []
    return Array.isArray(value) ? (value as FactionId[]) : []
  }, [isMulti, value])
  const singleValue = !isMulti ? (value as FactionId | null) : null
  const handleChange = (event: SelectChangeEvent<unknown>, _child: ReactNode) => {
    const raw = event.target.value as string | string[]
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
  const labelContainerSx = useMemo<SxProps<Theme>>(() => ({
    display: 'inline-flex',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
    '& > *': {
      minWidth: 0,
    },
  }), [])
  const renderSelected = () => {
    if (!singleValue) return t('any')
    const label = t(factionI18nKey(singleValue))
    return (
      <EllipsisTooltip title={label}>
        <Box component="span" sx={labelContainerSx}>
          <FactionOptionLabel faction={singleValue} label={label} truncate textSx={{ fontSize: '0.875rem' }} />
        </Box>
      </EllipsisTooltip>
    )
  }
  // Multi-select only renders text (no icons) so height stays fixed; long lists collapse behind an ellipsis.
  const renderMultiSelected = (selected: unknown) => {
    const entries = Array.isArray(selected) ? selected : []
    if (entries.length === 0) return t('any')
    const numericEntries = entries
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry))
      .map((entry) => entry as FactionId)
    const labelString = numericEntries.map((entry) => t(factionI18nKey(entry))).join(', ')
    return (
      <EllipsisTooltip title={labelString}>
        <Box component="span" sx={labelContainerSx}>
          <Box
            component="span"
            data-ellipsis-target
            sx={{
              display: 'inline-block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            {labelString}
          </Box>
        </Box>
      </EllipsisTooltip>
    )
  }
  // Compose the caller styles with the shared guards so selects stay consistent across surfaces.
  const normalizedSx = resolvedSx == null ? [] : Array.isArray(resolvedSx) ? resolvedSx : [resolvedSx]
  const baseSelectContentSx: SxProps<Theme> = useMemo(() => ({
    '& .MuiSelect-select': {
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 'unset',
      width: '100%',
      gap: 0.5,
      paddingTop: 0,
      paddingBottom: 0,
    },
  }), [])
  const selectSx: SxProps<Theme> | undefined = [baseSelectContentSx, ...normalizedSx]
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
      {...(isMulti ? { renderValue: (selected) => renderMultiSelected(selected) } : { renderValue: () => renderSelected() })}
      MenuProps={menuProps ?? FACTION_MENU_PROPS}
      {...(selectSx ? { sx: selectSx } : {})}
    >
      {allowAny ? (
        isMulti
          ? <MenuItem value={ANY_SENTINEL}>{t('any')}</MenuItem>
          : <MenuItem value="">{t('any')}</MenuItem>
      ) : null}
      {FACTION_GROUPS.flatMap((group) => [
        <ListSubheader key={`${group.labelKey}-header`} sx={{ fontSize: '0.75rem' }}>
          {t(group.labelKey)}
        </ListSubheader>,
        ...group.ids.map((code) => (
          <MenuItem key={`${group.labelKey}-${code}`} value={String(code)}>
            <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} size={23} />
          </MenuItem>
        )),
      ])}
    </Select>
  )
}
