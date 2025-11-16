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

type SlotSelectBaseProps = {
  allowAny?: boolean
  anyLabel?: string
  size?: SelectProps<string>['size']
  menuProps?: SelectProps<string>['MenuProps']
  sx?: SxProps<Theme>
}

type SlotSelectSingleProps = SlotSelectBaseProps & {
  multiple?: false
  value: ArtifactTypeId | null
  onChange: (next: ArtifactTypeId | null) => void
}

type SlotSelectMultiProps = SlotSelectBaseProps & {
  multiple: true
  value: ArtifactTypeId[]
  onChange: (next: ArtifactTypeId[]) => void
}

type SlotSelectProps = SlotSelectSingleProps | SlotSelectMultiProps

export function GearSlotSelect({
  value,
  onChange,
  allowAny = false,
  anyLabel,
  size = 'small',
  menuProps,
  sx,
  multiple = false,
}: SlotSelectProps) {
  const { t } = useI18n()
  const anyText = anyLabel ?? t('any')
  const resolvedSx: SxProps<Theme> = sx ?? {}
  const isMulti = Boolean(multiple)
  const multiSelected = useMemo<ArtifactTypeId[]>(() => {
    if (!isMulti) return []
    return Array.isArray(value) ? (value as ArtifactTypeId[]) : []
  }, [isMulti, value])
  const singleValue = !isMulti ? ((value as ArtifactTypeId | null) ?? null) : null
  const selectValue: string | string[] = isMulti
    ? multiSelected.map((slotId) => String(Number(slotId)))
    : (singleValue == null ? '' : String(singleValue))
  const renderSelected = useMemo(() => {
    if (isMulti) {
      if (multiSelected.length === 0) {
        return <Typography variant="body2">{anyText}</Typography>
      }
      const limit = 3
      const labels = multiSelected.map((slotId) => t(artifactTypeI18nKey(Number(slotId))))
      const displayed = labels.slice(0, limit)
      const overflow = labels.length - displayed.length
      const summary = overflow > 0 ? `${displayed.join(', ')} (+${overflow})` : displayed.join(', ')
      return <Typography variant="body2">{summary}</Typography>
    }
    if (singleValue == null) return <Typography variant="body2">{anyText}</Typography>
    const slotDef = artifactTypeIconList.find((entry) => Number(entry.id) === Number(singleValue))
    const SlotIconComponent = slotDef?.Icon
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        {SlotIconComponent ? <SlotIconComponent fontSize="small" /> : null}
        <span>{t(artifactTypeI18nKey(Number(singleValue)))}</span>
      </Box>
    )
  }, [anyText, isMulti, multiSelected, singleValue, t])
  const handleChange = (event: SelectChangeEvent<string | string[]>) => {
    const raw = event.target.value
    if (isMulti) {
      const list = Array.isArray(raw) ? raw : [raw]
      const multiHandler = onChange as (next: ArtifactTypeId[]) => void
      const dedupedIds: ArtifactTypeId[] = []
      const seen = new Set<string>()
      list.forEach((entry) => {
        const key = String(entry)
        if (seen.has(key)) return
        seen.add(key)
        const numeric = Number(entry)
        if (!Number.isFinite(numeric)) return
        dedupedIds.push(Math.floor(numeric) as ArtifactTypeId)
      })
      multiHandler(dedupedIds)
      return
    }
    const valueString = typeof raw === 'string' ? raw : raw[0]
    const singleHandler = onChange as (next: ArtifactTypeId | null) => void
    singleHandler(valueString === '' ? null : (Number(valueString) as ArtifactTypeId))
  }
  return (
    <Select
      size={size}
      value={selectValue}
      onChange={handleChange}
      renderValue={() => renderSelected}
      multiple={isMulti}
      MenuProps={menuProps ?? SLOT_MENU_PROPS}
      displayEmpty
      sx={resolvedSx}
    >
      {!isMulti && allowAny ? (
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
