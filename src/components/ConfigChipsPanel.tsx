import React, { memo } from 'react'
import { Box, Menu, MenuItem, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { UI_BG_HOVER_DANGER_TRANSITION, DANGER_TINT_BG, SCROLLING_TOOLTIP_HIDE_MS } from '../lib/constants'
import ConfigChip from './ConfigChip'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'

function ConfigChipsPanel(props: {
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  configs: BuilderConfig[]
  maxHeightPx: number
  selectedIndices: number[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
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
  duplicateOfIndices: Array<number | null>
  visibleIndices?: Set<number> | null
}) {
  const { t } = useI18n()
  const {
    containerRef,
    configs,
    maxHeightPx,
    selectedIndices,
    metasets,
    substatColors,
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
    duplicateOfIndices,
    visibleIndices,
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

  const duplicateOf = duplicateOfIndices
  const selectedSet = React.useMemo(() => new Set(selectedIndices), [selectedIndices])
  const visibleSet = visibleIndices ?? null
  const visibleCount = visibleSet
    ? configs.reduce((count, _cfg, idx) => count + (visibleSet.has(idx) ? 1 : 0), 0)
    : configs.length

  return (
    <>
      <Box
        ref={containerRef}
        sx={(theme) => ({
          mt: 2,
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          maxHeight: maxHeightPx,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarGutter: 'stable',
          pr: 1,
          minHeight: 40,
          alignContent: configs.length === 0 ? 'center' : 'flex-start',
          position: 'relative',
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          backgroundColor: highlightDelete
            ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light)
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
        ) : visibleCount === 0 ? (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="caption">{t('chipsFilteredEmpty')}</Typography>
          </Box>
        ) : (
          configs.map((c, idx) => {
            if (visibleSet && !visibleSet.has(idx)) return null
            const mode = (c as { sellfileMode?: 'enabled'|'hidden'|'draft'; enabled?: boolean }).sellfileMode ?? (c.enabled === false ? 'hidden' : 'enabled')
            const isDraft = mode === 'draft'
            const duplicateIdx = duplicateOf[idx]
            return (
            <ConfigChip
              key={idx}
              index={idx}
              cfg={c}
              metasets={metasets}
              substatColors={substatColors}
              selected={selectedSet.has(idx)}
              isDuplicate={!isDraft && duplicateIdx !== null}
              {...(!isDraft && duplicateIdx !== null ? { duplicateOfIndex: duplicateIdx as number } : {})}
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
          )
          })
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

function areConfigChipsPanelPropsEqual(prev: Readonly<React.ComponentProps<typeof ConfigChipsPanel>>, next: Readonly<React.ComponentProps<typeof ConfigChipsPanel>>): boolean {
  return prev.containerRef === next.containerRef
    && prev.configs === next.configs
    && prev.maxHeightPx === next.maxHeightPx
    && prev.selectedIndices === next.selectedIndices
    && prev.metasets === next.metasets
    && prev.substatColors === next.substatColors
    && prev.hoveredIdx === next.hoveredIdx
    && prev.onHoverIdx === next.onHoverIdx
    && prev.onSelect === next.onSelect
    && prev.onDelete === next.onDelete
    && prev.onDuplicate === next.onDuplicate
    && prev.onPasteAfter === next.onPasteAfter
    && prev.onMoveUp === next.onMoveUp
    && prev.onMoveDown === next.onMoveDown
    && prev.onMoveTop === next.onMoveTop
    && prev.onMoveBottom === next.onMoveBottom
    && prev.highlightDelete === next.highlightDelete
    && prev.onCopyAllConfigs === next.onCopyAllConfigs
    && prev.onPasteAtEnd === next.onPasteAtEnd
    && prev.onSelectAll === next.onSelectAll
    && prev.onCopyConfig === next.onCopyConfig
    && prev.onCopyConfigDev === next.onCopyConfigDev
    && prev.onClearSelection === next.onClearSelection
    && prev.duplicateOfIndices === next.duplicateOfIndices
    && prev.visibleIndices === next.visibleIndices
}

export default memo(ConfigChipsPanel, areConfigChipsPanelPropsEqual)
