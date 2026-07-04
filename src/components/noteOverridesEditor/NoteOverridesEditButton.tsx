/**
 * NoteOverridesEditButton — the pencil affordance stamped on override question cards
 * in the edit-mode preview. Rendered as a real `<button>` (IconButton) so the preview's
 * delegated reveal listeners can exclude it with a `closest('button')` guard — React
 * stopPropagation cannot stop those native handlers.
 */
import type { JSX } from 'react'
import { IconButton, Tooltip } from '@mui/material'
import EditNoteIcon from '@mui/icons-material/EditNote'
import { useI18n } from '../../lib/i18n'

export interface NoteOverridesEditButtonProps {
  onClick: () => void
}

export function NoteOverridesEditButton({ onClick }: NoteOverridesEditButtonProps): JSX.Element {
  const { t } = useI18n()
  return (
    <Tooltip title={t('noteOverridesEditorEditBlock')}>
      <IconButton
        size="small"
        onClick={onClick}
        aria-label={t('noteOverridesEditorEditBlock')}
        data-testid="overrides-editor-open"
        // Float over the card's top-right corner without disturbing its layout.
        sx={{ position: 'absolute', top: 2, right: 2, p: 0.25, opacity: 0.55, '&:hover': { opacity: 1 } }}
      >
        <EditNoteIcon sx={{ fontSize: '1rem' }} />
      </IconButton>
    </Tooltip>
  )
}
