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

const SLOT_SELECT_DISPLAY_SX: SxProps<Theme> = (theme) => ({
  '& .MuiSelect-select': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    minHeight: theme.spacing(3),
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
  },
  '& .MuiSelect-select .slot-value': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    minWidth: 0,
    width: '100%',
  },
  '& .MuiSelect-select .slot-label': {
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '& .MuiSelect-select .MuiSvgIcon-root': {
    fontSize: theme.typography.pxToRem(18),
  },
})

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
  const resolvedSx: SxProps<Theme> = Array.isArray(sx)
    ? [SLOT_SELECT_DISPLAY_SX, ...sx]
    : sx
      ? [SLOT_SELECT_DISPLAY_SX, sx]
      : SLOT_SELECT_DISPLAY_SX
  const isMulti = Boolean(multiple)
  const multiSelected = useMemo<ArtifactTypeId[]>(() => {
    if (!isMulti) return []
    return Array.isArray(value) ? (value as ArtifactTypeId[]) : []
  }, [isMulti, value])
  const singleValue = !isMulti ? ((value as ArtifactTypeId | null) ?? null) : null
  const selectValue: string | string[] = isMulti
    ? multiSelected.map((slotId) => String(Number(slotId)))
    : (singleValue == null ? '' : String(singleValue))
  const renderSingleValue = useMemo(() => {
    if (singleValue == null) {
      return (
        <Box className="slot-value">
          <Typography variant="body2" className="slot-label">
            {anyText}
          </Typography>
        </Box>
      )
    }
    const slotDef = artifactTypeIconList.find((entry) => Number(entry.id) === Number(singleValue))
    const SlotIconComponent = slotDef?.Icon
    return (
      <Box className="slot-value">
        {SlotIconComponent ? <SlotIconComponent fontSize="small" /> : null}
        <Typography variant="body2" className="slot-label">
          {t(artifactTypeI18nKey(Number(singleValue)))}
        </Typography>
      </Box>
    )
  }, [anyText, singleValue, t])
  const renderMultiValue = useMemo(() => {
    if (!isMulti) return undefined
    return () => {
      if (multiSelected.length === 0) {
        return (
          <Box className="slot-value">
            <Typography variant="body2" className="slot-label">
              {anyText}
            </Typography>
          </Box>
        )
      }
      const tooltipLabel = multiSelected.map((slotId) => t(artifactTypeI18nKey(Number(slotId)))).join(', ')
      return (
        <Box className="slot-value" title={tooltipLabel} sx={{ maxWidth: '100%' }}>
          <Typography
            variant="body2"
            className="slot-label"
            component="span"
            sx={{ display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}
          >
            {tooltipLabel}
          </Typography>
        </Box>
      )
    }
  }, [anyText, isMulti, multiSelected, t])
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
  const selectRenderValue = isMulti
    ? (renderMultiValue ?? (() => null))
    : (() => renderSingleValue)
  return (
    <Select
      size={size}
      value={selectValue}
      onChange={handleChange}
      renderValue={selectRenderValue}
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
