/**
 * DslHighlightedField — an editable text field whose content is rendered with the
 * app's `dynamic-overrides` syntax highlighting: the textarea's own text is
 * transparent (caret and selection stay visible) and a pixel-aligned highlighted
 * <pre> overlay underneath supplies the colors — the same technique as
 * NoteDialog's DslErrorOverlay, with the padding fixed on both layers so wrapping
 * is 1:1 (whiteSpace/wordBreak/font are shared via `inherit`).
 *
 * Always renders as an autosizing multiline textarea (wrapped lines keep the
 * overlay in sync without scroll syncing); single-expression callers suppress
 * Enter via `singleLine`.
 */
import type { JSX } from 'react'
import { Box, TextField } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { renderPrismChildren } from '../prismDslRender'

// One padding definition applied to BOTH the textarea and the overlay — the whole
// alignment trick depends on these two never drifting apart.
const FIELD_PADDING = '8px 12px'

// `| undefined` on the optionals: callers pass computed values that may be
// undefined (exactOptionalPropertyTypes).
export interface DslHighlightedFieldProps {
  value: string
  onChange: (next: string) => void
  label?: string | undefined
  placeholder?: string | undefined
  error?: boolean | undefined
  helperText?: string | undefined
  minRows?: number | undefined
  // Suppress Enter (single DSL expression); Enter then triggers onCommit instead.
  singleLine?: boolean | undefined
  onCommit?: (() => void) | undefined
  testId?: string | undefined
}

// Shared monospace metrics for both layers (font inherits from the root downward).
const fieldSx = (theme: Theme) => ({
  '& .MuiInputBase-root': {
    position: 'relative',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    lineHeight: 1.5,
    padding: 0,
    alignItems: 'flex-start',
  },
  '& .MuiInputBase-input': {
    padding: FIELD_PADDING,
    // The overlay supplies the visible glyphs; the textarea keeps caret + selection.
    color: 'transparent',
    caretColor: theme.vars?.palette.text.primary ?? theme.palette.text.primary,
    position: 'relative',
    zIndex: 1,
    // Placeholder must stay visible despite the transparent text color.
    '&::placeholder': {
      color: theme.vars?.palette.text.secondary ?? theme.palette.text.secondary,
      opacity: 1,
    },
  },
})

export function DslHighlightedField({
  value, onChange, label, placeholder, error, helperText, minRows, singleLine, onCommit, testId,
}: DslHighlightedFieldProps): JSX.Element {
  return (
    <TextField
      value={value}
      onChange={(event) => onChange(singleLine ? event.target.value.replace(/\n/g, ' ') : event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (singleLine || onCommit)) {
          event.preventDefault()
          onCommit?.()
        }
      }}
      size="small"
      fullWidth
      multiline
      minRows={minRows}
      label={label}
      placeholder={placeholder}
      error={error}
      helperText={helperText}
      sx={fieldSx}
      slotProps={{
        htmlInput: { 'data-testid': testId, spellCheck: false },
        input: {
          endAdornment: (
            // Highlight overlay: absolutely fills the input root, mirrors the
            // textarea's padding + wrapping, and lets all events pass through.
            <Box
              component="pre"
              aria-hidden
              sx={{
                position: 'absolute',
                inset: 0,
                m: 0,
                padding: FIELD_PADDING,
                pointerEvents: 'none',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                font: 'inherit',
                lineHeight: 'inherit',
              }}
            >
              {renderPrismChildren(value, 'dynamic-overrides')}
              {/* Trailing newline keeps the last-line height in sync with the textarea. */}
              {'\n'}
            </Box>
          ),
        },
      }}
    />
  )
}
