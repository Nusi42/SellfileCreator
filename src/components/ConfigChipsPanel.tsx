import React from 'react'
import { Box, Menu, MenuItem, Typography } from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { UI_BG_TRANSITION } from '../lib/constants'
import ConfigChip from './ConfigChip'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'

export default function ConfigChipsPanel(props: {
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  configs: BuilderConfig[]
  selectedIndex: number | null
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonBorders: boolean
  hoveredIdx: number | null
  onHoverIdx: (idx: number | null) => void
  onSelect: (idx: number) => void
  onDelete: (idx: number) => void
  onDuplicate: (idx: number) => void
  onPasteAfter: (idx: number) => void
  onMoveUp: (idx: number) => void
  onMoveDown: (idx: number) => void
  onMoveTop: (idx: number) => void
  onMoveBottom: (idx: number) => void
  highlightDelete: boolean
  onCopyAllConfigs: () => void
  onPasteAtEnd: () => void
}) {
  const {
    containerRef,
    configs,
    selectedIndex,
    metasets,
    substatColors,
    useStatButtonBorders,
    hoveredIdx,
    onHoverIdx,
    onSelect,
    onDelete,
    onDuplicate,
    onPasteAfter,
    onMoveUp,
    onMoveDown,
    onMoveTop,
    onMoveBottom,
    highlightDelete,
    onCopyAllConfigs,
    onPasteAtEnd,
  } = props

  const [menu, setMenu] = React.useState<null | { open: boolean; x: number; y: number }>(null)

  return (
    <>
      <Box
        ref={containerRef}
        sx={(theme) => ({
          mt: 2,
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          maxHeight: 220,
          overflowY: 'auto',
          overflowX: 'hidden',
          pr: 1,
          minHeight: 40,
          alignContent: configs.length === 0 ? 'center' : 'flex-start',
          position: 'relative',
          transition: UI_BG_TRANSITION,
          backgroundColor: highlightDelete
            ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)')
            : 'transparent',
        })}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ open: true, x: e.clientX, y: e.clientY })
        }}
        data-tour-id="chips.container"
      >
        {configs.length === 0 ? (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="caption">No configs yet — right-click to Paste</Typography>
          </Box>
        ) : (
          configs.map((c, idx) => (
            <ConfigChip
              key={idx}
              index={idx}
              cfg={c}
              metasets={metasets}
              substatColors={substatColors}
              useStatButtonColors={useStatButtonBorders}
              selected={selectedIndex === idx}
              onSelect={() => onSelect(idx)}
              onDelete={() => onDelete(idx)}
              onDuplicate={() => onDuplicate(idx)}
              onPasteAfter={() => onPasteAfter(idx)}
              onMoveUp={() => onMoveUp(idx)}
              onMoveDown={() => onMoveDown(idx)}
              onMoveTop={() => onMoveTop(idx)}
              onMoveBottom={() => onMoveBottom(idx)}
              isLast={idx === configs.length - 1}
              linkedHover={hoveredIdx !== null && hoveredIdx === idx}
              onHover={(enter) => onHoverIdx(enter ? idx : null)}
            />
          ))
        )}
      </Box>
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        {...(menu?.open ? { anchorPosition: { top: menu.y, left: menu.x } } : {})}
        slotProps={{ paper: { 'data-tour-id': 'chips.menu' } as unknown as MuiPaperProps }}
      >
        <MenuItem onClick={() => { onCopyAllConfigs(); setMenu(null) }} disabled={configs.length === 0}>Copy all Configs</MenuItem>
        <MenuItem onClick={() => { onPasteAtEnd(); setMenu(null) }}>Paste at End</MenuItem>
      </Menu>
    </>
  )
}
