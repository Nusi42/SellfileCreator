import { Box, Button, Chip, Typography } from '@mui/material'
import type { MouseEvent } from 'react'
import { ACCEPT_SFC_FILE_DIALOG, ELLIPSIS_TEXT_SX, LONG_LABEL_BUTTON_MAX_WIDTH_PX } from '../lib/constants'
import FilePickerButton from './FilePickerButton'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import { useI18n, formatRecipesCount } from '../lib/i18n'
import DirtyBadge from './DirtyBadge'
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'

export default function HeaderActions(props: {
  onAboutToOpenSfc?: (event: MouseEvent<HTMLButtonElement>) => void
  onSelectFile: (file: File, context?: { shiftKey?: boolean }) => void
  onSaveSfc: () => void
  onOpenNote: () => void
  notePresent: boolean
  count: number
  selectedCount: number
  visibleCount: number
  sfcDirty: boolean
  chipLabel?: string
}) {
  const {
    onAboutToOpenSfc,
    onSelectFile,
    onSaveSfc,
    onOpenNote,
    notePresent,
    count,
    selectedCount,
    visibleCount,
    sfcDirty,
  } = props
  const { t } = useI18n()
  const recipeChipLabel = formatRecipesCount(
    t,
    count,
    selectedCount > 0 ? selectedCount : null,
    visibleCount,
  )
  const chipLabel = props.chipLabel ?? recipeChipLabel

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
        <MarkdownTooltip markdown={t('loadRecipesTooltip')}>
          <FilePickerButton
            label={t('loadRecipes')}
            startIcon={<UploadFileIcon />}
            accept={ACCEPT_SFC_FILE_DIALOG}
            onBeforeOpen={(event) => { onAboutToOpenSfc?.(event) }}
            onSelect={onSelectFile}
            data-tour-id="sfc.load"
            labelMaxWidth={LONG_LABEL_BUTTON_MAX_WIDTH_PX}
            sx={{ flexShrink: 1, minWidth: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, ml: 2 }}
          />
        </MarkdownTooltip>
        <DirtyBadge active={sfcDirty} sx={{ flexShrink: 1, minWidth: 0, display: 'inline-flex' }}>
          <MarkdownTooltip markdown={t('saveAllRecipesTooltip')}>
            <Button
              startIcon={<SaveIcon />}
              onClick={onSaveSfc}
              disabled={false}
              data-tour-id="sfc.save"
              sx={{ maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden', flexShrink: 1, minWidth: 0 }}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX} data-ellipsis-target>
                {t('saveAllRecipes')}
              </Typography>
            </Button>
          </MarkdownTooltip>
        </DirtyBadge>
      </Box>
    </Box>
  )
}
