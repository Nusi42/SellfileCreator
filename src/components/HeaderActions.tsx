import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { ACCEPT_HSFR, ELLIPSIS_TEXT_SX, LONG_LABEL_BUTTON_MAX_WIDTH_PX } from '../lib/constants'
import FilePickerButton from './FilePickerButton'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import { useI18n } from '../lib/i18n'

export default function HeaderActions(props: {
  onAboutToOpenHsfr?: () => void
  onSelectHsfr: (file: File) => void
  onSaveHsfr: () => void
  onDeleteAll: () => void
  onHoverDeleteAll?: (hover: boolean) => void
  deleteDisabled: boolean
  onOpenNote: () => void
  notePresent: boolean
  count: number
}) {
  const { onAboutToOpenHsfr, onSelectHsfr, onSaveHsfr, onDeleteAll, onHoverDeleteAll, deleteDisabled, onOpenNote, notePresent, count } = props
  const { t } = useI18n()

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, flexWrap: 'nowrap' }}>
      <FilePickerButton
        label={t('loadConfigs')}
        startIcon={<UploadFileIcon />}
        accept={ACCEPT_HSFR}
        onBeforeOpen={() => { onAboutToOpenHsfr?.() }}
        onSelect={onSelectHsfr}
        data-tour-id="hsfr.load"
        labelMaxWidth={LONG_LABEL_BUTTON_MAX_WIDTH_PX}
      />
      <Box sx={{ flex: 1 }} />
      <Chip label={`${count} ${count === 1 ? t('configOne') : t('configMany')}`} size="small" />
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
      <Button
        startIcon={<SaveIcon />}
        onClick={onSaveHsfr}
        disabled={false}
        data-tour-id="hsfr.save"
        sx={{ maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
        title={t('saveAllConfigs')}
      >
        <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{t('saveAllConfigs')}</Typography>
      </Button>
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
