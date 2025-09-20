/**
 * SetsOrderControls
 *
 * Shared UI for searching sets and toggling the Sets view mode
 * (Game / A–Z / Icons). Used by both the Builder and Metasets dialog
 * to keep behavior and look identical. This component is purely presentational
 * and does not persist to localStorage; callers may persist via props.
 */
import { Box, ToggleButton, ToggleButtonGroup, TextField as MuiTextField, Tooltip, InputAdornment, IconButton } from '@mui/material'
import { keyframes } from '@emotion/react'
import { alpha } from '@mui/material/styles'
import ClearIcon from '@mui/icons-material/Clear'
import GridViewIcon from '@mui/icons-material/GridView'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha'
import { SETS_ORDER_TOGGLE_SIZE_PX } from '../lib/constants'
import { useI18n } from '../lib/i18n'

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
    0%, 100% { background-color: rgba(0,0,0,0); }
    60% { background-color: rgba(244, 67, 54, 0.28); }
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
        InputLabelProps={{
          // Keep the label visually centered within the 28px control height.
          // 28px control, ~11px label → (28-11)/2 ≈ 8.5px; use 8px for crispness.
          sx: {
            fontSize: 11,
            // 32px control, ~11px label → (32-11)/2 ≈ 10.5px; use 10px.
            transform: 'translate(14px, 10px) scale(1)',
            '&.MuiInputLabel-shrink': {
              // Keep the floating label slightly lower than default so it
              // doesn’t crowd the top edge when the header grows.
              transform: 'translate(14px, -2px) scale(0.8)',
            },
          },
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
        InputProps={{
          sx: {
            // Tighten the field height and input padding to keep the header
            // compact without changing the ListSubheader size.
            height: 32,
            display: 'flex',
            alignItems: 'center',
            '& .MuiOutlinedInput-input': { py: 0, px: 1, fontSize: 12, lineHeight: '32px' },
          },
          endAdornment: setsSearch ? (
            <InputAdornment
              position="end"
              sx={(theme) => ({
                ...(zeroResults ? {
                  // Also animate at the adornment level to ensure visibility.
                  '& .MuiIconButton-root': {
                    backgroundColor: alpha(theme.palette.error.main, 0.18),
                    animation: `${pulseRed} 2000ms ease-in-out infinite`,
                  },
                } : {}),
              })}
              >
                <IconButton
                  size="small"
                  aria-label={t('setsClearSearch')}
                  onClick={() => onSetsSearchChange('')}
                  edge="end"
                sx={(theme) => ({
                  ...(zeroResults ? {
                    // IconButton is already circular; animate its background color.
                    backgroundColor: alpha(theme.palette.error.main, 0.18),
                    animation: `${pulseRed} 2000ms ease-in-out infinite`,
                  } : {}),
                })}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
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
        <Tooltip title={t('setsTooltipIcons')}>
          <ToggleButton value="icons" aria-label={t('setsTooltipIcons')}>
            <GridViewIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title={t('setsTooltipGame')}>
          <ToggleButton value="game" aria-label={t('setsTooltipGame')}>
            <FormatListNumberedIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title={t('setsTooltipAz')}>
          <ToggleButton value="az" aria-label={t('setsTooltipAz')}>
            <SortByAlphaIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Box>
  )
}
