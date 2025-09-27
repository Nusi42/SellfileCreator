import React from 'react'
import { Box, Menu, MenuItem, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { UI_BG_HOVER_DANGER_TRANSITION, SCROLLING_TOOLTIP_HIDE_MS } from '../lib/constants'
import ConfigChip from './ConfigChip'
import type { BuilderConfig } from '../lib/hsfBuilder'
import { configRuleSignature } from '../lib/configSignature'
import type { Metaset } from '../lib/metasets'

export default function ConfigChipsPanel(props: {
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  configs: BuilderConfig[]
  selectedIndices: number[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonBorders: boolean
  hoveredIdx: number | null
  onHoverIdx: (idx: number | null) => void
  onSelect: (e: React.MouseEvent, idx: number) => void
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
  onSelectAll: () => void
  onCopyConfig: (idx: number) => void
  onCopyConfigDev?: (idx: number) => void
  onClearSelection: () => void
}) {
  const { t } = useI18n()
  const {
    containerRef,
    configs,
    selectedIndices,
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
    onSelectAll,
    onCopyConfig,
    onCopyConfigDev,
    onClearSelection,
  } = props

  const [menu, setMenu] = React.useState<null | { open: boolean; x: number; y: number }>(null)
  // While the chips container scrolls, hide tooltips to avoid transient
  // viewport scrollbar flicker. This mirrors the global App behavior but
  // also covers scrollbar-drag interactions that don't emit wheel/touch events.
  const hideTipsTimerRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null)
  React.useEffect(() => () => { if (hideTipsTimerRef.current) { clearTimeout(hideTipsTimerRef.current); hideTipsTimerRef.current = null } }, [])
  const markScrolling = () => {
    try {
      document.body.classList.add('scrolling')
      if (hideTipsTimerRef.current) { clearTimeout(hideTipsTimerRef.current); hideTipsTimerRef.current = null }
      hideTipsTimerRef.current = window.setTimeout(() => {
        try { document.body.classList.remove('scrolling') } catch {}
      }, SCROLLING_TOOLTIP_HIDE_MS)
    } catch {}
  }

  // Duplicate detection (ignoring name): compute the first-seen index for each
  // unique config shape so later identical ones can render with a red border
  // and a tooltip pointing to the original.
  const duplicateOf: Array<number | null> = React.useMemo(() => {
    const seen = new Map<string, number>()
    return configs.map((c, idx) => {
      const key = configRuleSignature(c)
      const prev = seen.get(key)
      if (prev === undefined) {
        seen.set(key, idx)
        return null
      }
      return prev
    })
  }, [configs])

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
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          backgroundColor: highlightDelete
            ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)')
            : 'transparent',
        })}
        onScroll={markScrolling}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ open: true, x: e.clientX, y: e.clientY })
        }}
        onClick={(e) => {
          // Left click on empty area (not on a chip) clears selection
          // Ignore when user is holding multiselect modifiers.
          if (e.button !== 0) return
          if (e.shiftKey || e.ctrlKey || (e as unknown as MouseEvent).metaKey) return
          if (e.currentTarget === e.target) onClearSelection()
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
              selected={selectedIndices.includes(idx)}
              isDuplicate={duplicateOf[idx] !== null}
              {...(duplicateOf[idx] !== null ? { duplicateOfIndex: duplicateOf[idx] as number } : {})}
              onSelect={(e) => onSelect(e, idx)}
              onDelete={() => onDelete(idx)}
              onDuplicate={() => onDuplicate(idx)}
              onPasteAfter={() => onPasteAfter(idx)}
              onCopy={() => onCopyConfig(idx)}
              {...(onCopyConfigDev ? { onCopyDev: () => onCopyConfigDev(idx) } : {})}
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
        <MenuItem onClick={() => { onSelectAll(); setMenu(null) }} disabled={configs.length === 0}>{t('chipsMenuSelectAll')}</MenuItem>
        <MenuItem onClick={() => { onCopyAllConfigs(); setMenu(null) }} disabled={configs.length === 0}>{t('chipsMenuCopyAllConfigs')}</MenuItem>
        <MenuItem onClick={() => { onPasteAtEnd(); setMenu(null) }}>{t('chipsMenuPasteAtEnd')}</MenuItem>
      </Menu>
    </>
  )
}
