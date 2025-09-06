/**
 * SetsOrderControls
 *
 * Shared UI for searching sets and toggling the Sets view mode
 * (Game / A–Z / Icons). Used by both the Builder and Metasets dialog
 * to keep behavior and look identical. This component is purely presentational
 * and does not persist to localStorage; callers may persist via props.
 */
import { Box, ToggleButton, ToggleButtonGroup, TextField as MuiTextField, Tooltip, InputAdornment, IconButton } from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import GridViewIcon from '@mui/icons-material/GridView'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha'
import { SETS_ORDER_TOGGLE_WIDTH_PX } from '../lib/constants'

export type SetsOrder = 'game' | 'az' | 'icons'

export default function SetsOrderControls({
  setsSearch,
  onSetsSearchChange,
  setsOrder,
  onSetsOrderChange,
}: {
  setsSearch: string
  onSetsSearchChange: (v: string) => void
  setsOrder: SetsOrder
  onSetsOrderChange: (v: SetsOrder) => void
}) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', minWidth: 0, width: '100%' }}>
      <MuiTextField
        size="small"
        label="Search sets"
        value={setsSearch}
        onChange={(e) => onSetsSearchChange(e.target.value)}
        InputProps={{
          endAdornment: setsSearch ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label="Clear search"
                onClick={() => onSetsSearchChange('')}
                edge="end"
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        }}
        sx={{ flex: 1, minWidth: 0 }}
      />
      <ToggleButtonGroup
        size="small"
        value={setsOrder}
        exclusive
        onChange={(_, v) => v && onSetsOrderChange(v)}
        sx={{
          '& .MuiToggleButton-root': {
            width: SETS_ORDER_TOGGLE_WIDTH_PX,
            minWidth: SETS_ORDER_TOGGLE_WIDTH_PX,
            whiteSpace: 'nowrap',
          },
        }}
      >
        <Tooltip title="Icon grid view">
          <ToggleButton value="icons" aria-label="Icon grid view">
            <GridViewIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title="In-game order">
          <ToggleButton value="game" aria-label="In-game order">
            <FormatListNumberedIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Alphabetical">
          <ToggleButton value="az" aria-label="Alphabetical">
            <SortByAlphaIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Box>
  )
}
