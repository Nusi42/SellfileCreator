/**
 * SetsOrderControls
 *
 * Shared UI for searching sets and toggling the Sets view mode
 * (Game / A–Z / Icons). Used by both the Builder and Metasets dialog
 * to keep behavior and look identical. This component is purely presentational
 * and does not persist to localStorage; callers may persist via props.
 */
import { Box, ToggleButton, ToggleButtonGroup, TextField as MuiTextField, InputAdornment, IconButton } from '@mui/material'
import { keyframes } from '@emotion/react'
import ClearIcon from '@mui/icons-material/Clear'
import GridViewIcon from '@mui/icons-material/GridView'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha'
import { SETS_ORDER_TOGGLE_SIZE_PX, FONT_SIZE_SECONDARY_PX } from '../lib/constants'
import { useI18n } from '../lib/i18n'
// MarkdownTooltip keeps the view-mode hints synced with the rest of the tooltip refactor.
import MarkdownTooltip from './MarkdownTooltip'
import { TINT } from '../lib/colorTints'

export type SetsOrder = 'game' | 'az' | 'icons'

export default function SetsOrderControls({
  setsSearch,
  onSetsSearchChange,
  setsOrder,
  onSetsOrderChange,
  zeroResults = false,
}: {
  setsSearch: string
  onSetsSearchChange: (v: string) => void
  setsOrder: SetsOrder
  onSetsOrderChange: (v: SetsOrder) => void
  zeroResults?: boolean
}) {
  // i18n: UI strings for search/ordering controls live in the catalogs.
  // Centralizing them avoids scattering literals and keeps Help/Tutorial
  // consistent across Builder and Metasets.
  const { t } = useI18n()
  // Gentle pulse to draw attention when search matches zero sets.
  const pulseRed = keyframes`
    0%, 100% { background-color: transparent; }
    60% { background-color: ${TINT.error28}; }
  `
  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', minWidth: 0, width: '100%' }}>
      <MuiTextField
        size="small"
        label={t('setsSearch')}
        value={setsSearch}
        onChange={(e) => onSetsSearchChange(e.target.value)}
        sx={{
          m: 0,
          alignSelf: 'center',
          flex: 1,
          minWidth: 0,
          // Ensure the outlined input content is perfectly centered and removes stray bottom gap
          '& .MuiOutlinedInput-root': { height: 32, alignItems: 'center' },
        }}
        // Prevent the parent MUI Select/Menu listbox from intercepting typing
        // and navigation keys while the search field is focused. Without this,
        // keystrokes like letters, Home/End, and arrows are handled by the
        // listbox (moving selection) instead of this input. Allow Tab to move
        // focus and Escape to close the menu naturally.
        onKeyDown={(e) => {
          const k = e.key
          if (k === 'Escape' || k === 'Tab') return
          e.stopPropagation()
        }}
        slotProps={{
          inputLabel: {
            // Keep the label visually centered within the 28px control height.
            // 28px control, ~12px label → (28-12)/2 ≈ 8px; use 8px for crispness.
            sx: {
              fontSize: FONT_SIZE_SECONDARY_PX,
            // 32px control, ~12px label → (32-12)/2 ≈ 10px; use 10px.
              transform: 'translate(14px, 10px) scale(1)',
              '&.MuiInputLabel-shrink': {
                // Keep the floating label slightly lower than default so it
                // doesn't crowd the top edge when the header grows.
                transform: 'translate(14px, -2px) scale(0.8)',
              },
            },
          },
          input: {
            sx: {
              // Tighten the field height and input padding to keep the header
              // compact without changing the ListSubheader size.
              height: 32,
              display: 'flex',
              alignItems: 'center',
              '& .MuiOutlinedInput-input': { py: 0, px: 1, fontSize: FONT_SIZE_SECONDARY_PX, lineHeight: '32px' },
            },
            endAdornment: setsSearch ? (
            <InputAdornment
              position="end"
              sx={{
                ...(zeroResults ? {
                  // Also animate at the adornment level to ensure visibility.
                  '& .MuiIconButton-root': {
                    backgroundColor: TINT.error18,
                    animation: `${pulseRed} 2000ms ease-in-out infinite`,
                  },
                } : {}),
              }}
              >
                <IconButton
                  size="small"
                  aria-label={t('setsClearSearch')}
                  onClick={() => onSetsSearchChange('')}
                  edge="end"
                sx={{
                  ...(zeroResults ? {
                    // IconButton is already circular; animate its background color.
                    backgroundColor: TINT.error18,
                    animation: `${pulseRed} 2000ms ease-in-out infinite`,
                  } : {}),
                }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
          },
        }}
      />
      <ToggleButtonGroup
        size="small"
        value={setsOrder}
        exclusive
        onChange={(_, v) => v && onSetsOrderChange(v)}
        sx={{
          '& .MuiToggleButton-root': {
            width: SETS_ORDER_TOGGLE_SIZE_PX,
            minWidth: SETS_ORDER_TOGGLE_SIZE_PX,
            height: SETS_ORDER_TOGGLE_SIZE_PX,
            minHeight: SETS_ORDER_TOGGLE_SIZE_PX,
            padding: 0,
            whiteSpace: 'nowrap',
          },
        }}
      >
        {/* Toggle tooltips route through MarkdownTooltip so their copy stays consistent across dialogs. */}
        <MarkdownTooltip markdown={t('setsTooltipIcons')}>
          <ToggleButton value="icons" aria-label={t('setsTooltipIcons')}>
            <GridViewIcon fontSize="small" />
          </ToggleButton>
        </MarkdownTooltip>
        <MarkdownTooltip markdown={t('setsTooltipGame')}>
          <ToggleButton value="game" aria-label={t('setsTooltipGame')}>
            <FormatListNumberedIcon fontSize="small" />
          </ToggleButton>
        </MarkdownTooltip>
        <MarkdownTooltip markdown={t('setsTooltipAz')}>
          <ToggleButton value="az" aria-label={t('setsTooltipAz')}>
            <SortByAlphaIcon fontSize="small" />
          </ToggleButton>
        </MarkdownTooltip>
      </ToggleButtonGroup>
    </Box>
  )
}
