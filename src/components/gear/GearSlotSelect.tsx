import { Box, MenuItem, Select, Typography } from '@mui/material'
import type { SelectChangeEvent, SelectProps } from '@mui/material/Select'
import type { SxProps, Theme } from '@mui/material/styles'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'
import type { ArtifactTypeId } from '../../lib/types'
import { artifactTypeI18nKey } from '../../lib/types'
import { artifactTypeIconList } from '../artifactTypeIcons'

const SLOT_MENU_PROPS = {
  PaperProps: { sx: { width: 360 } },
  MenuListProps: { sx: { width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 1 } },
} as const

type SlotSelectProps = {
  value: ArtifactTypeId | null
  onChange: (next: ArtifactTypeId | null) => void
  allowAny?: boolean
  anyLabel?: string
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

export function GearSlotSelect({
  value,
  onChange,
  allowAny = false,
  anyLabel,
  size = 'small',
  menuProps,
  sx,
}: SlotSelectProps) {
  const { t } = useI18n()
  const anyText = anyLabel ?? t('any')
  const resolvedSx: SxProps<Theme> = sx ?? {}
  // Keep the Select value as a string so MenuItem values align with DOM data attributes.
  const selectValue = value == null ? '' : String(value)
  const renderSelected = useMemo(() => {
    if (value == null) {
      // Null slot renders the shared "Any" label so both Gear dialog and Keep Uniques can share the affordance.
      return <Typography variant="body2">{anyText}</Typography>
    }
    const slotDef = artifactTypeIconList.find((entry) => Number(entry.id) === Number(value))
    const SlotIconComponent = slotDef?.Icon
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        {SlotIconComponent ? <SlotIconComponent fontSize="small" /> : null}
        <span>{t(artifactTypeI18nKey(Number(value)))}</span>
      </Box>
    )
  }, [anyText, t, value])
  const handleChange = (event: SelectChangeEvent<string>) => {
    const raw = event.target.value
    // Empty string acts as the "Any slot" sentinel so the caller can translate it to their preferred store value.
    onChange(raw === '' ? null : (Number(raw) as ArtifactTypeId))
  }
  return (
    <Select
      size={size}
      value={selectValue}
      onChange={handleChange}
      renderValue={() => renderSelected}
      MenuProps={menuProps ?? SLOT_MENU_PROPS}
      sx={resolvedSx}
    >
      {allowAny ? (
        <MenuItem value="">
          {anyText}
        </MenuItem>
      ) : null}
      {artifactTypeIconList.map(({ id, Icon }) => (
        <MenuItem
          key={String(id)}
          value={String(Number(id))}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            py: 1,
            '&.Mui-selected': { bgcolor: 'action.selected' },
          }}
        >
          <Icon fontSize="medium" />
          <Typography variant="caption">{t(artifactTypeI18nKey(id))}</Typography>
        </MenuItem>
      ))}
    </Select>
  )
}
