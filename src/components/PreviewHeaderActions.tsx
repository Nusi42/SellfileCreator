import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { ACCEPT_HSF } from '../lib/constants'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import FilePickerButton from './FilePickerButton'

export default function PreviewHeaderActions(props: {
  mergedCount: number
  colorIconSrc: string
  onOpenColors: () => void
  onSelectHsf: (file: File) => void | Promise<void>
  onClearBase: () => void
  baseRuleCount?: number
  onExport: () => void
  exportDisabled: boolean
}) {
  const { mergedCount, colorIconSrc, onOpenColors, onSelectHsf, onClearBase, baseRuleCount, onExport, exportDisabled } = props
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">Preview</Typography>
        <Chip label={`${mergedCount} total rule(s)`} size="small" />
        <Tooltip title="Manage Colors">
          <IconButton size="small" onClick={onOpenColors} aria-label="Manage colors">
            <img src={colorIconSrc} width={18} height={18} alt="Manage Colors" style={{ display: 'block' }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Optional: Load your existing RSL Helper sell file to preview how your new rules merge with it. You can skip this and still build and export rules from scratch.
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'nowrap' }}>
        <FilePickerButton
          label="Load RSL Helper Sellfile"
          startIcon={<UploadFileIcon />}
          accept={ACCEPT_HSF}
          onSelect={onSelectHsf}
        />
        <Button color="warning" onClick={onClearBase} disabled={!baseRuleCount}>Clear</Button>
        {typeof baseRuleCount === 'number' && baseRuleCount > 0 && (
          <Typography noWrap variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {`Loaded ${baseRuleCount} base ${baseRuleCount === 1 ? 'rule' : 'rules'}`}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<SaveIcon />} sx={{ whiteSpace: 'nowrap', px: 1.25 }} onClick={onExport} disabled={exportDisabled}>
          {baseRuleCount ? 'Export merged RSL Helper Sellfile' : 'Export RSL Helper Sellfile'}
        </Button>
      </Stack>
    </>
  )
}
