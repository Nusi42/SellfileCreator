import { Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import { FINAL_SELL_BUTTON_WIDTH_PX } from '../lib/constants'
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
  // Final sell remainder controls
  finalSell: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }
  onToggleFinalSell: (enabled: boolean) => void
  onOpenFinalSellDialog: () => void
}) {
  const { mergedCount, colorIconSrc, onOpenColors, onSelectHsf, onClearBase, baseRuleCount, onExport, exportDisabled, finalSell, onToggleFinalSell, onOpenFinalSellDialog } = props
  const fsEnabled = (finalSell.artifacts || finalSell.accessories) && (finalSell.levels?.length ?? 0) > 0
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">Sellfile Preview</Typography>
        <Chip label={`${mergedCount} total rule(s)`} size="small" />
        <Tooltip title="Manage Colors">
          <Button
            size="small"
            variant="outlined"
            color="info"
            onClick={onOpenColors}
            aria-label="Manage colors"
            sx={{ minWidth: 28, height: 28, lineHeight: 1, p: 0.25 }}
          >
            <img src={colorIconSrc} width={18} height={18} alt="Manage Colors" style={{ display: 'block' }} />
          </Button>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Optional: Load an existing Sellfile to preview the merge.
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
        <Tooltip title="Add Sell rules for unmatched items">
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mr: 2 }}>
            <Button
              size="small"
              variant={fsEnabled ? 'contained' : 'outlined'}
              color={fsEnabled ? 'warning' : 'warning'}
              onClick={() => onToggleFinalSell(!fsEnabled)}
              sx={{ whiteSpace: 'nowrap', px: 1.25, width: FINAL_SELL_BUTTON_WIDTH_PX }}
            >{fsEnabled ? 'Final Sell is On!' : 'No Final Sell'}</Button>
            <Tooltip title="Configure">
              <Button
                size="small"
                variant="outlined"
                color="info"
                onClick={onOpenFinalSellDialog}
                aria-label="Configure final sell"
                sx={{ minWidth: 28, height: 28, lineHeight: 1, p: 0.25 }}
              >
                <SettingsIcon fontSize="small" />
              </Button>
            </Tooltip>
          </Stack>
        </Tooltip>
        <Button startIcon={<SaveIcon />} sx={{ whiteSpace: 'nowrap', px: 1.25 }} onClick={onExport} disabled={exportDisabled}>
          {baseRuleCount ? 'Export merged RSL Helper Sellfile' : 'Export RSL Helper Sellfile'}
        </Button>
      </Stack>
    </>
  )
}
