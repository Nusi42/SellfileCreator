import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { ACCEPT_HSFC, ELLIPSIS_TEXT_SX, LONG_LABEL_BUTTON_MAX_WIDTH_PX } from '../lib/constants'
import FilePickerButton from './FilePickerButton'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import { useI18n, formatConfigsCount } from '../lib/i18n'
import DirtyBadge from './DirtyBadge'

export default function HeaderActions(props: {
  onAboutToOpenHsfc?: () => void
  onSelectHsfc: (file: File) => void
  onSaveHsfc: () => void
  onDeleteAll: () => void
  onHoverDeleteAll?: (hover: boolean) => void
  deleteDisabled: boolean
  onOpenNote: () => void
  notePresent: boolean
  count: number
  selectedCount: number
  visibleCount: number
  hsfcDirty: boolean
}) {
  const {
    onAboutToOpenHsfc,
    onSelectHsfc,
    onSaveHsfc,
    onDeleteAll,
    onHoverDeleteAll,
    deleteDisabled,
    onOpenNote,
    notePresent,
    count,
    selectedCount,
    visibleCount,
    hsfcDirty,
  } = props
  const { t } = useI18n()
  const configChipLabel = formatConfigsCount(
    t,
    count,
    selectedCount > 0 ? selectedCount : null,
    visibleCount,
  )

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, flexWrap: 'nowrap' }}>
      <FilePickerButton
        label={t('loadConfigs')}
        startIcon={<UploadFileIcon />}
        accept={ACCEPT_HSFC}
        onBeforeOpen={() => { onAboutToOpenHsfc?.() }}
        onSelect={onSelectHsfc}
        data-tour-id="hsfc.load"
        labelMaxWidth={LONG_LABEL_BUTTON_MAX_WIDTH_PX}
      />
      <Box sx={{ flex: 1 }} />
      <Chip label={configChipLabel} size="small" />
      <Button
        variant="outlined"
        size="small"
        onClick={onOpenNote}
        sx={{ maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
        data-tour-id="note.toggle"
        title={notePresent ? t('editNote') : t('addNote')}
      >
        <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{notePresent ? t('editNote') : t('addNote')}</Typography>
      </Button>
      <DirtyBadge active={hsfcDirty} sx={{ flexShrink: 0 }}>
        <Button
          startIcon={<SaveIcon />}
          onClick={onSaveHsfc}
          disabled={false}
          data-tour-id="hsfc.save"
          sx={{ maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
          title={t('saveAllConfigs')}
        >
          <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{t('saveAllConfigs')}</Typography>
        </Button>
      </DirtyBadge>
      <Button
        color="error"
        onClick={onDeleteAll}
        disabled={deleteDisabled}
        onMouseEnter={() => { if (!deleteDisabled) onHoverDeleteAll?.(true) }}
        onMouseLeave={() => { if (!deleteDisabled) onHoverDeleteAll?.(false) }}
        data-tour-id="configs.delete-all"
        sx={{ maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
        title={t('deleteConfigs')}
      >
        <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{t('deleteConfigs')}</Typography>
      </Button>
    </Stack>
  )
}
