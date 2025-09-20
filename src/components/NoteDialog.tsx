import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tooltip, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import MDEditor from '@uiw/react-md-editor'
import type { ICommand } from '@uiw/react-md-editor'
import { getCommands } from '@uiw/react-md-editor'
import rehypeSanitize from 'rehype-sanitize'
import { defaultSchema } from 'hast-util-sanitize'
import type { Schema } from 'hast-util-sanitize'
import type { Pluggable } from 'unified'

// Limited color palette for Note highlighting rendered from Markdown via
//   <span data-color="{name}">…</span>
// Kept intentionally small and named. Sanitizer below permits only the data-color attribute on span.
const NOTE_COLOR_HEX: Record<'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'gray', string> = {
  red: '#ef5350',
  orange: '#ffa726',
  yellow: '#ffeb3b',
  green: '#66bb6a',
  teal: '#26a69a',
  blue: '#42a5f5',
  purple: '#ab47bc',
  gray: '#90a4ae',
}
const NOTE_COLOR_SX_SELECTORS: Record<string, { color: string }> = Object.fromEntries(
  (Object.entries(NOTE_COLOR_HEX) as Array<[keyof typeof NOTE_COLOR_HEX, string]>).map(([name, hex]) => [
    `& [data-color="${name}"]`,
    { color: hex },
  ]),
)

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
  const { t } = useI18n()
  const editWrapRef = useRef<HTMLDivElement | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Keep a local draft while editing and only commit to global state when
  // the dialog closes or the user explicitly clears. This avoids re-rendering
  // the whole app on each keystroke because the Note is not shown elsewhere.
  const [draft, setDraft] = useState<string>(note ?? '')
  // Tracks transition into edit mode while dialog opens; used to gate one-time
  // initialization of the local draft and focus without resyncing on every note change.
  const wasOpenEditRef = useRef<boolean>(false)
  // Memoized sanitize schema and plugins for performance during typing.
  type Primitive = string | number | boolean | RegExp | null | undefined
  type SanitizeProp = string | [string, ...Primitive[]]
  const sanitizeSchema: Schema = useMemo(() => {
    const baseAttrs = (defaultSchema.attributes ?? {}) as Record<string, SanitizeProp[]>
    const spanAttrs: SanitizeProp[] = Array.isArray(baseAttrs.span) ? baseAttrs.span : []
    return {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        span: [...spanAttrs, 'data-color', 'dataColor'],
      },
      tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), 'span'])),
    }
  }, [])
  const rehypePluginsSafe = useMemo(() => (
    [[rehypeSanitize, sanitizeSchema] as unknown as Pluggable]
  ), [sanitizeSchema])

  // Color toolbar command and full commands list; injected before HR.
  const colorCommand: ICommand = useMemo(() => ({
    name: 'color',
    keyCommand: 'group',
    groupName: 'color',
    buttonProps: { 'aria-label': 'Insert color span' },
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="Color">
        <circle cx="6" cy="6" r="5" fill="#42a5f5" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
    children: (handle) => (
      <div style={{ display: 'flex', gap: 6, padding: '6px 8px', maxWidth: 220, flexWrap: 'wrap' }}>
        {(Object.keys(NOTE_COLOR_HEX) as Array<keyof typeof NOTE_COLOR_HEX>).map((c) => (
          <Tooltip key={c} title={String(c)} placement="bottom" disableInteractive>
            <button
              type="button"
              aria-label={`color ${String(c)}`}
              onClick={() => {
              const state = handle.getState?.()
              const selected = state && state.selectedText ? state.selectedText : 'text'
              const selStart = state && state.selection ? state.selection.start : 0
              const open = `<span data-color="${String(c)}">`
              const close = '</span>'
              const api = handle.textApi
              if (api) {
                api.replaceSelection(open + selected + close)
                // After wrapping, place selection inside the span (around original text)
                api.setSelectionRange({ start: selStart + open.length, end: selStart + open.length + selected.length })
              }
              handle.close()
              }}
              style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, backgroundColor: NOTE_COLOR_HEX[c] }} />
            </button>
          </Tooltip>
        ))}
      </div>
    ),
  }), [])
  const toolbarCommands = useMemo(() => {
    const base = getCommands()
    const idxHr = base.findIndex((c) => c.keyCommand === 'hr')
    const insertAt = idxHr >= 0 ? idxHr : base.length
    const arr = base.slice()
    arr.splice(insertAt, 0, colorCommand)
    return arr
  }, [colorCommand])

  useEffect(() => {
    const nowOpenEdit = Boolean(open && mode === 'edit')
    const was = wasOpenEditRef.current
    wasOpenEditRef.current = nowOpenEdit
    if (!was && nowOpenEdit) {
      // Initialize local draft exactly when entering edit mode (opening or switching to edit)
      // Include `note` in deps to satisfy lint, but only apply on transition.
      setDraft(note ?? '')
      const t = window.setTimeout(() => {
        try {
          const ta = editWrapRef.current?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
          ta?.focus()
        } catch {}
      }, 0)
      return () => window.clearTimeout(t)
    }
    return
  }, [open, mode, note])

  // Commit helper to push the local draft to the parent, used on close/flush.
  const commitAndClose = React.useCallback(() => {
    try {
      if (mode === 'edit') {
        onChange(draft)
      }
    } catch {}
    onClose()
  }, [mode, draft, onChange, onClose])

  // Flush the latest draft on unload/visibility change while editing so users
  // don't lose edits if the tab closes with the dialog open.
  useEffect(() => {
    if (!(open && mode === 'edit')) return
    const flush = () => {
      try { onChange(draft) } catch {}
    }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [open, mode, draft, onChange])

  return (
    <Dialog
      open={open}
      onClose={commitAndClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { maxHeight: '84vh' } }}
    >
      <DialogTitle>{t('noteTitle')}</DialogTitle>
      <DialogContent dividers>
        {mode === 'view' ? (
          <Box
            data-allow-select={1 as const}
            data-allow-context={1 as const}
            data-color-mode={('dark' as const)}
            sx={{
              '& .wmde-markdown': { bgcolor: 'transparent', fontSize: 16, lineHeight: 1.7 },
              // Allow simple, safe color accents inside Markdown via
              //   <span data-color="red">…</span>
              // Sanitizer permits only the data-color attribute on span.
              ...NOTE_COLOR_SX_SELECTORS,
            }}
          >
            <MDEditor.Markdown
              source={note ?? ''}
              rehypePlugins={rehypePluginsSafe as unknown as NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['rehypePlugins']>}
            />
          </Box>
        ) : (
          <Box
            ref={editWrapRef}
            data-allow-select={1 as const}
            data-allow-context={1 as const}
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
              '& .w-md-editor .w-md-editor-toolbar li button': {
                height: '30px',
                lineHeight: '22px',
                padding: '6px 8px',
                margin: '0 2px',
                borderRadius: '4px',
              },
              '& .w-md-editor .w-md-editor-toolbar li button svg': { width: 18, height: 18 },
              '& .w-md-editor .w-md-editor-toolbar-divider': { height: '18px', margin: '-3px 6px 0 6px !important' },
              // Same color accents in edit preview
              ...NOTE_COLOR_SX_SELECTORS,
            }}
            onMouseDownCapture={(e) => {
              // Trim leading/trailing whitespace from the current selection when
              // a toolbar command is about to run, so Markdown operations (Bold, Italic, etc.)
              // apply to the content rather than surrounding spaces.
              try {
                const root = editWrapRef.current
                const ta = root?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
                if (!ta) return
                const target = e.target as HTMLElement | null
                const inToolbar = Boolean(target && target.closest('.w-md-editor-toolbar'))
                if (!inToolbar) return
                const selStart = ta.selectionStart ?? 0
                const selEnd = ta.selectionEnd ?? selStart
                if (selEnd <= selStart) return
                const text = ta.value
                let s = selStart
                let t = selEnd
                const isWs = (ch: string) => /\s/.test(ch)
                while (s < t && isWs(text.charAt(s))) s++
                while (t > s && isWs(text.charAt(t - 1))) t--
                if (s !== selStart || t !== selEnd) {
                  try { ta.setSelectionRange(s, t) } catch {}
                }
              } catch {}
            }}
            onMouseDown={(e) => {
              try {
                const root = editWrapRef.current
                const ta = root?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
                if (!ta) return
                const target = e.target as HTMLElement | null
                // Ignore toolbar interactions so commands preserve the current selection.
                const inToolbar = Boolean(target && target.closest('.w-md-editor-toolbar'))
                if (inToolbar) return
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
              const rehypePlugins: Pluggable[] = rehypePluginsSafe as unknown as Pluggable[]
              return (
                <MDEditor
                  value={draft}
                  onChange={(v) => setDraft(v ?? '')}
                  previewOptions={{ rehypePlugins }}
                  commands={toolbarCommands}
                  components={{
                    // Replace native title tooltips on toolbar buttons with MUI Tooltips
                    // so they match app styling and Popper behavior.
                    toolbar: (command, disabled, executeCommand) => {
                      try {
                        if (command?.keyCommand === 'divider') return undefined
                        const btnProps = (command?.buttonProps || {}) as React.ButtonHTMLAttributes<HTMLButtonElement>
                        const label = (btnProps.title || btnProps['aria-label'] || command?.name || '') as string
                        return (
                          <Tooltip title={label} placement="bottom" disableInteractive>
                            <button
                              type="button"
                              aria-label={label || undefined}
                              disabled={Boolean(disabled)}
                              onClick={(evn) => {
                                // Execute the toolbar command with its group context.
                                evn.stopPropagation()
                                const cmd = command as ICommand
                                executeCommand?.(cmd, cmd.groupName)
                              }}
                            >
                              {command?.icon}
                            </button>
                          </Tooltip>
                        )
                      } catch {
                        return undefined
                      }
                    },
                  }}
                  height={560}
                />
              )
            })()}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {mode === 'edit' && (
          <Button color="warning" onClick={() => setConfirmOpen(true)}>{t('reset')}</Button>
        )}
        <Button onClick={commitAndClose}>{t('close')}</Button>
      </DialogActions>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{t('titleClearNote')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgClearNote')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('cancel')}</Button>
          <Button color="warning" onClick={() => { setConfirmOpen(false); setDraft(''); onChange('') }}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
