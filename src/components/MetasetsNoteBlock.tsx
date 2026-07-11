/**
 * MetasetsNoteBlock
 *
 * Renders the `<!-- metasets -->` note marker as a live table of the file's
 * metasets — glyph + name in the left column, the member sets (icon + localized
 * name) in the right column. Replaces the static bullet list the note editor's
 * insert button used to paste: the marker always reflects the CURRENT metasets
 * (renames, membership edits, additions) instead of freezing a snapshot.
 * Metasets hidden from selection menus (show: false) render dimmed — they still
 * work in rules, so omitting them would misrepresent the file.
 */
import { use, Fragment } from 'react'
import { Box, Typography } from '@mui/material'
import { SetIcon } from './SetIcon'
import { useI18n } from '../lib/i18n'
import { getLocalizedGearSetName, compareArtifactSets } from '../lib/types'
import { resolveMetasetDisplayGlyph } from '../lib/metasets'
import { NoteRenderContext } from './NoteDialog'

export type MetasetsNoteBlockProps = Record<string, unknown>

export default function MetasetsNoteBlock(_props: MetasetsNoteBlockProps) {
  // Consume context before any conditional returns to satisfy the Rules of Hooks.
  const ctx = use(NoteRenderContext)
  const { t, lang } = useI18n()
  const metasets = ctx?.metasets ?? []
  // No metasets in the file → the marker renders nothing (no empty frame).
  if (metasets.length === 0) return null
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        columnGap: 1.5,
        rowGap: 0.5,
        alignItems: 'baseline',
        my: 1,
        px: 1.25,
        py: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        // Long set lists wrap inside the row; the grid itself never scrolls horizontally.
        minWidth: 0,
      }}
    >
      {metasets.map((meta) => {
        const glyph = resolveMetasetDisplayGlyph(meta)
        const name = meta.name && meta.name.trim() ? meta.name.trim() : t('menuMetasetsSection')
        const sets = (meta.sets ?? []).slice().sort((a, b) => compareArtifactSets(Number(a), Number(b)))
        const hidden = meta.show === false
        return (
          // Name is the metaset primary key (unique across the file).
          <Fragment key={meta.name}>
            <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap', ...(hidden ? { opacity: 0.55 } : {}) }}>
              {glyph ? `${glyph} ` : ''}{name}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25, alignItems: 'center', minWidth: 0, ...(hidden ? { opacity: 0.55 } : {}) }}>
              {sets.length > 0 ? sets.map((id) => (
                <Box key={Number(id)} component="span" sx={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <SetIcon setId={id} size={14} sx={{ mr: 0.4 }} />
                  <Typography variant="caption">{getLocalizedGearSetName(id, t, lang)}</Typography>
                </Box>
              )) : (
                <Typography variant="caption" color="text.secondary">{t('noteMetasetNoSets')}</Typography>
              )}
            </Box>
          </Fragment>
        )
      })}
    </Box>
  )
}
