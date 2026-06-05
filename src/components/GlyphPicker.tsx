/**
 * GlyphPicker.tsx
 *
 * Shared dropdown for choosing a glyph from the icon catalog (METASET_ICON_OPTIONS).
 * Named generically because it is not metaset-specific: metasets, normalized-sort
 * presets, and filter/sort presets all reuse it. Extracted to satisfy the One
 * Definition Rule — the picker grid previously lived inline in three places.
 */
import { Box, MenuItem, Select } from '@mui/material'
import {
  DEFAULT_METASET_ICON_ID,
  METASET_ICON_OPTIONS,
  metasetIconOptionById,
  type MetasetIconId,
} from '../lib/metasetIcons'

/**
 * Human-readable aria label for an icon option, derived from its id.
 * 'icon.swords' → "swords", 'glyph.num3' → "number 3", 'none'/'empty' verbatim.
 */
export const glyphOptionAriaLabel = (id: MetasetIconId): string => {
  if (id === 'none') return 'none'
  if (id === 'empty') return 'empty'
  // Number glyphs may be multi-digit (e.g. glyph.num42) — take everything after the prefix.
  if (id.startsWith('glyph.num')) return `number ${id.slice('glyph.num'.length)}`
  const [, raw] = id.split('.')
  return raw?.replace(/[-_]/g, ' ') || id
}

export type GlyphPickerProps = {
  // Current selection; absent/none renders the catalog's "no icon" sentinel.
  value: MetasetIconId
  // Fired with the chosen icon id; the event is swallowed so nested menus don't close.
  onChange: (id: MetasetIconId) => void
  // Accessible name for the combobox itself.
  ariaLabel: string
  // Keep the menu inside the current portal — required when nested in a context menu.
  disablePortal?: boolean
  // Hide the dropdown chevron so short glyphs stay visually centered.
  hideChevron?: boolean
  // Control face size; defaults match the metaset picker's compact footprint.
  widthPx?: number
  heightPx?: number
}

/** Compact emoji/glyph dropdown rendering the shared catalog as a 6-column grid. */
export function GlyphPicker({
  value,
  onChange,
  ariaLabel,
  disablePortal,
  hideChevron,
  widthPx = 72,
  heightPx,
}: GlyphPickerProps) {
  return (
    <Select
      size="small"
      value={value}
      aria-label={ariaLabel}
      // Optionally drop the chevron so the glyph stays centered in narrow faces.
      {...(hideChevron ? { IconComponent: () => null } : {})}
      onChange={(event) => {
        // Stop propagation so using the picker inside a context menu doesn't dismiss it.
        try { event.stopPropagation() } catch {}
        const next = (event.target.value || DEFAULT_METASET_ICON_ID) as MetasetIconId
        onChange(next)
      }}
      renderValue={(raw) => {
        // Resolve the glyph for the current value, falling back to the "none" sentinel.
        const opt = metasetIconOptionById((raw || DEFAULT_METASET_ICON_ID) as MetasetIconId)
        return (
          <Box
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1, width: '100%' }}
            aria-hidden
          >
            {opt.glyph}
          </Box>
        )
      }}
      MenuProps={{
        // Nested-menu callers need the popup to stay within their portal.
        ...(disablePortal ? { disablePortal: true } : {}),
        slotProps: {
          paper: {
            sx: {
              maxHeight: 320,
              minWidth: 88,
              width: 'auto',
              // Render the catalog as a dense 6-column grid for fast scanning.
              '& .MuiList-root': {
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 0.5,
                py: 0.5,
              },
            },
          },
        },
      }}
      sx={{
        minWidth: widthPx,
        width: widthPx,
        // Apply an explicit height only when a caller pins one (e.g. to align with 28px rows).
        ...(heightPx ? { height: heightPx, '& .MuiInputBase-root': { height: heightPx, minHeight: heightPx } } : {}),
        '& .MuiSelect-select': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          lineHeight: 1,
          px: 1.5,
        },
      }}
    >
      {METASET_ICON_OPTIONS.map((option) => (
        <MenuItem
          key={option.id}
          value={option.id}
          aria-label={glyphOptionAriaLabel(option.id)}
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, px: 0.5, width: 'auto' }}
        >
          <Box component="span" sx={{ fontSize: 20, width: 32, textAlign: 'center' }} aria-hidden>
            {option.glyph}
          </Box>
        </MenuItem>
      ))}
    </Select>
  )
}
