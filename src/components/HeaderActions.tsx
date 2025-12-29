import { Box, Button, Chip, Typography } from '@mui/material'
import { ACCEPT_HSFC_FILE_DIALOG, ELLIPSIS_TEXT_SX, LONG_LABEL_BUTTON_MAX_WIDTH_PX } from '../lib/constants'
import FilePickerButton from './FilePickerButton'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import { useI18n, formatConfigsCount } from '../lib/i18n'
import DirtyBadge from './DirtyBadge'
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'

export default function HeaderActions(props: {
  onAboutToOpenHsfc?: () => void
  onSelectFile: (file: File) => void
  onSaveHsfc: () => void
  onOpenNote: () => void
  notePresent: boolean
  count: number
  selectedCount: number
  visibleCount: number
  hsfcDirty: boolean
}) {
  const {
    onAboutToOpenHsfc,
    onSelectFile,
    onSaveHsfc,
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
  const chipLabel = configChipLabel

  return (
    <Box
      sx={{
        mt: 2,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        alignItems: 'center',
        columnGap: 1.5,
        minHeight: 32,
      }}
    >
      <Box sx={{ minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>
        <EllipsisTooltip title={notePresent ? t('noteOpen') : t('addNote')}>
          <Button
            variant="outlined"
            size="small"
            onClick={onOpenNote}
            sx={{
              maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX,
              overflow: 'hidden',
              minWidth: 0,
              whiteSpace: 'nowrap',
            }}
            data-tour-id="note.toggle"
          >
            <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX} data-ellipsis-target>
              {notePresent ? t('noteOpen') : t('addNote')}
            </Typography>
          </Button>
        </EllipsisTooltip>
      </Box>
      <Box
        sx={{
          justifySelf: 'center',
          pointerEvents: 'none',
        }}
      >
        <Chip
          label={chipLabel}
          size="small"
          sx={{
            width: '100%',
            maxWidth: 'min(100%, 640px)',
            '& .MuiChip-label': {
              display: 'block',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          }}
        />
      </Box>
      <Box
        sx={{
          minWidth: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          alignItems: 'center',
        }}
      >
        <MarkdownTooltip markdown={t('loadConfigsTooltip')}>
          <FilePickerButton
            label={t('loadConfigs')}
            startIcon={<UploadFileIcon />}
            accept={ACCEPT_HSFC_FILE_DIALOG}
            onBeforeOpen={() => { onAboutToOpenHsfc?.() }}
            onSelect={onSelectFile}
            data-tour-id="hsfc.load"
            labelMaxWidth={LONG_LABEL_BUTTON_MAX_WIDTH_PX}
            sx={{ flexShrink: 1, minWidth: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, ml: 2 }}
          />
        </MarkdownTooltip>
        <DirtyBadge active={hsfcDirty} sx={{ flexShrink: 1, minWidth: 0, display: 'inline-flex' }}>
          <MarkdownTooltip markdown={t('saveAllConfigsTooltip')}>
            <Button
              startIcon={<SaveIcon />}
              onClick={onSaveHsfc}
              disabled={false}
              data-tour-id="hsfc.save"
              sx={{ maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden', flexShrink: 1, minWidth: 0 }}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX} data-ellipsis-target>
                {t('saveAllConfigs')}
              </Typography>
            </Button>
          </MarkdownTooltip>
        </DirtyBadge>
      </Box>
    </Box>
  )
}
