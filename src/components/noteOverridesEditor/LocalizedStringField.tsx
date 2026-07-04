/**
 * LocalizedStringField — edits one DraftLocalizedText: the English base plus one row
 * per `[[cc]]` locale variant, with add/remove translation controls. The base is the
 * identity source for question/option ids, so it is visually primary; variants are
 * indented secondary rows keyed by their locale code.
 *
 * All row actions live INSIDE the fields as end adornments (add-translation and the
 * optional whole-field remove on the base; remove-variant on each variant), so every
 * row spans the full width and the column stays visually aligned.
 */
import { useCallback, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Box, IconButton, InputAdornment, Menu, MenuItem, TextField, Tooltip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import TranslateIcon from '@mui/icons-material/Translate'
import { useI18n } from '../../lib/i18n'
import { PRODUCTION_LANGUAGES } from '../../lib/i18n/types'
import type { DraftLocalizedText } from '../../lib/overridesDraftTypes'

export interface LocalizedStringFieldProps {
  label: string
  value: DraftLocalizedText
  onChange: (next: DraftLocalizedText) => void
  // Multiline for prompts/details; single-line for ids and short labels.
  multiline?: boolean
  // When set, the base field shows a remove (✕) adornment that deletes the whole
  // value (used by optional fields: detail, slider unit/toggle labels, …).
  onRemove?: () => void
  // data-testid stem for e2e targeting (base gets `-base`, variants `-<code>`).
  testId?: string
}

// Locale codes offered by the "add translation" menu: the app's short language codes
// (the DSL convention is bare prefixes — one `[[de]]` covers de-DE), deduplicated.
const OFFERED_LOCALE_CODES = Array.from(new Set(
  PRODUCTION_LANGUAGES.map((lang) => lang.split('-')[0]!).filter((code) => code !== 'en'),
))

// Keep adornment icons pinned to the first text line of multiline fields.
const topAlignedAdornmentSx = (multiline: boolean) => (
  multiline ? { alignSelf: 'flex-start', mt: 1 } : undefined
)

export function LocalizedStringField({ label, value, onChange, multiline = false, onRemove, testId }: LocalizedStringFieldProps): JSX.Element {
  const { t } = useI18n()
  // Anchor for the add-translation locale menu.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  // Codes not yet present are offered; existing unknown codes are preserved as rows.
  const availableCodes = useMemo(
    () => OFFERED_LOCALE_CODES.filter((code) => !value.locales.some((locale) => locale.code === code)),
    [value.locales],
  )
  const setBase = useCallback((base: string) => onChange({ ...value, base }), [onChange, value])
  const setLocaleText = useCallback((code: string, text: string) => onChange({
    ...value,
    locales: value.locales.map((locale) => (locale.code === code ? { ...locale, text } : locale)),
  }), [onChange, value])
  const addLocale = useCallback((code: string) => {
    setMenuAnchor(null)
    onChange({ ...value, locales: [...value.locales, { code, text: '' }] })
  }, [onChange, value])
  const removeLocale = useCallback((code: string) => onChange({
    ...value,
    locales: value.locales.filter((locale) => locale.code !== code),
  }), [onChange, value])
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {/* Base (English) row; actions ride inside as end adornments. */}
      <TextField
        label={label}
        value={value.base}
        onChange={(event) => setBase(event.target.value)}
        size="small"
        fullWidth
        multiline={multiline}
        minRows={multiline ? 2 : undefined}
        slotProps={{
          htmlInput: { 'data-testid': testId ? `${testId}-base` : undefined },
          input: {
            endAdornment: (
              <InputAdornment position="end" sx={topAlignedAdornmentSx(multiline)}>
                <Tooltip title={t('noteOverridesEditorAddTranslation')}>
                  {/* Span keeps the tooltip alive when disabled (no codes left). */}
                  <span>
                    <IconButton
                      size="small"
                      edge="end"
                      onClick={(event) => setMenuAnchor(event.currentTarget)}
                      disabled={availableCodes.length === 0}
                      aria-label={t('noteOverridesEditorAddTranslation')}
                    >
                      <TranslateIcon sx={{ fontSize: '0.95rem' }} />
                    </IconButton>
                  </span>
                </Tooltip>
                {onRemove && (
                  <IconButton size="small" edge="end" onClick={onRemove} aria-label={`${label} ×`}>
                    <CloseIcon sx={{ fontSize: '0.95rem' }} />
                  </IconButton>
                )}
              </InputAdornment>
            ),
          },
        }}
      />
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {availableCodes.map((code) => (
          <MenuItem key={code} onClick={() => addLocale(code)}>{`[[${code}]]`}</MenuItem>
        ))}
      </Menu>
      {/* One indented row per locale variant; unknown codes from the source are kept. */}
      {value.locales.map((locale) => (
        <TextField
          key={locale.code}
          label={`[[${locale.code}]]`}
          value={locale.text}
          onChange={(event) => setLocaleText(locale.code, event.target.value)}
          size="small"
          fullWidth
          multiline={multiline}
          sx={{ pl: 0, ml: 3, width: 'auto' }}
          slotProps={{
            htmlInput: { 'data-testid': testId ? `${testId}-${locale.code}` : undefined },
            input: {
              endAdornment: (
                <InputAdornment position="end" sx={topAlignedAdornmentSx(multiline)}>
                  <Tooltip title={t('noteOverridesEditorRemoveTranslation')}>
                    <IconButton size="small" edge="end" onClick={() => removeLocale(locale.code)} aria-label={t('noteOverridesEditorRemoveTranslation')}>
                      <CloseIcon sx={{ fontSize: '0.95rem' }} />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
      ))}
    </Box>
  )
}
