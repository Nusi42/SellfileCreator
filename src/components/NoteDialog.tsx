import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import MDEditor from '@uiw/react-md-editor'
import rehypeSanitize from 'rehype-sanitize'
import type { Pluggable } from 'unified'

export default function NoteDialog({
  open,
  mode,
  note,
  onChange,
  onClose,
}: {
  open: boolean
  mode: 'view' | 'edit'
  note: string
  onChange: (value: string) => void
  onClose: () => void
}) {
  const editWrapRef = useRef<HTMLDivElement | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open || mode !== 'edit') return
    const t = window.setTimeout(() => {
      try {
        const ta = editWrapRef.current?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
        ta?.focus()
      } catch {}
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, mode])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { maxHeight: '84vh' } }}
    >
      <DialogTitle>Note</DialogTitle>
      <DialogContent dividers>
        {mode === 'view' ? (
          <Box
            data-color-mode={('dark' as const)}
            sx={{ '& .wmde-markdown': { bgcolor: 'transparent', fontSize: 16, lineHeight: 1.7 } }}
          >
            {(() => {
              const rehypePluginsSafe = [rehypeSanitize as unknown as Pluggable]
              return (
                <MDEditor.Markdown
                  source={note ?? ''}
                  rehypePlugins={rehypePluginsSafe as unknown as NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['rehypePlugins']>}
                />
              )
            })()}
          </Box>
        ) : (
          <Box
            ref={editWrapRef}
            data-color-mode={('dark' as const)}
            sx={{
              // Ensure all layers of the editor reflect the same font size.
              // The library CSS sets 14px with !important on these nodes, so we must override with !important.
              '& .w-md-editor': { fontSize: '20px' },
              '& .w-md-editor .w-md-editor-text': { fontSize: '20px !important', lineHeight: '1.7 !important' },
              '& .w-md-editor .w-md-editor-text-pre': { fontSize: '20px !important', lineHeight: '1.7 !important' },
              '& .w-md-editor .w-md-editor-text-pre code': { fontSize: '20px !important', lineHeight: '1.7 !important' },
              '& .w-md-editor .w-md-editor-text-input': { fontSize: '20px', lineHeight: 1.7 },
              // Preview within the split pane
              '& .wmde-markdown': { fontSize: '20px', lineHeight: 1.7 },
              // Enlarge toolbar buttons and icons
              '& .w-md-editor .w-md-editor-toolbar': { padding: '6px' },
              '& .w-md-editor .w-md-editor-toolbar li': { fontSize: '16px' },
              '& .w-md-editor .w-md-editor-toolbar li > button': {
                height: '30px',
                lineHeight: '22px',
                padding: '6px 8px',
                margin: '0 2px',
                borderRadius: '4px',
              },
              '& .w-md-editor .w-md-editor-toolbar li > button svg': { width: 18, height: 18 },
              '& .w-md-editor .w-md-editor-toolbar-divider': { height: '18px', margin: '-3px 6px 0 6px !important' },
            }}
            onMouseDown={(e) => {
              try {
                const ta = editWrapRef.current?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
                if (!ta) return
                window.setTimeout(() => {
                  if (document.activeElement !== ta) ta.focus()
                  if (!(e.target instanceof HTMLTextAreaElement)) {
                    const len = ta.value.length
                    try { ta.setSelectionRange(len, len) } catch {}
                  }
                }, 0)
              } catch {}
            }}
          >
            {(() => {
              const rehypePlugins: Pluggable[] = [rehypeSanitize as unknown as Pluggable]
              return (
                <MDEditor
                  value={note ?? ''}
                  onChange={(v) => onChange(v ?? '')}
                  previewOptions={{ rehypePlugins }}
                  height={560}
                />
              )
            })()}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {mode === 'edit' && (
          <Button color="warning" onClick={() => setConfirmOpen(true)}>
            Clear
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Clear note?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This will remove the current note from HSFR. This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button color="warning" onClick={() => { setConfirmOpen(false); onChange('') }}>Clear</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
