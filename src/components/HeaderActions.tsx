import { Box, Button, Chip, Stack } from '@mui/material'
import { ACCEPT_HSFR } from '../lib/constants'
import FilePickerButton from './FilePickerButton'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'

export default function HeaderActions(props: {
  onAboutToOpenHsfr?: () => void
  onSelectHsfr: (file: File) => void
  onSaveHsfr: () => void
  onDeleteAll: () => void
  deleteDisabled: boolean
  onOpenNote: () => void
  notePresent: boolean
  count: number
}) {
  const { onAboutToOpenHsfr, onSelectHsfr, onSaveHsfr, onDeleteAll, deleteDisabled, onOpenNote, notePresent, count } = props

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, flexWrap: 'nowrap' }}>
      <FilePickerButton
        label="Load Configs (.hsfr)"
        startIcon={<UploadFileIcon />}
        accept={ACCEPT_HSFR}
        onBeforeOpen={() => { onAboutToOpenHsfr?.() }}
        onSelect={onSelectHsfr}
        data-tour-id="hsfr.load"
      />
      <Box sx={{ flex: 1 }} />
      <Button startIcon={<SaveIcon />} onClick={onSaveHsfr} disabled={false} data-tour-id="hsfr.save">
        Save Configs (.hsfr)
      </Button>
      <Button color="error" onClick={onDeleteAll} disabled={deleteDisabled} data-tour-id="configs.delete-all">
        Delete Configs
      </Button>
      <Button variant="outlined" size="small" onClick={onOpenNote} sx={{ whiteSpace: 'nowrap' }} data-tour-id="note.toggle">
        {notePresent ? 'Edit Note' : 'Add Note'}
      </Button>
      <Chip label={`${count} config(s)`} size="small" />
    </Stack>
  )
}
