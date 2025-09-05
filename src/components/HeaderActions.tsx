import { Box, Button, Chip, Stack } from '@mui/material'
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
      <Button component="label" startIcon={<UploadFileIcon />} onClick={() => { onAboutToOpenHsfr?.() }}>
        Load Configs (.hsfr)
        <input
          hidden
          type="file"
          accept=".hsfr,application/json"
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (file) onSelectHsfr(file)
            try { (e.target as HTMLInputElement).value = '' } catch {}
          }}
        />
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button startIcon={<SaveIcon />} onClick={onSaveHsfr} disabled={false}>
        Save Configs (.hsfr)
      </Button>
      <Button color="error" onClick={onDeleteAll} disabled={deleteDisabled}>
        Delete Configs
      </Button>
      <Button variant="outlined" size="small" onClick={onOpenNote} sx={{ whiteSpace: 'nowrap' }}>
        {notePresent ? 'Edit Note' : 'Add Note'}
      </Button>
      <Chip label={`${count} config(s)`} size="small" />
    </Stack>
  )
}
