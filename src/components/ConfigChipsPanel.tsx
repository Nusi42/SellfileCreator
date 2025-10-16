import React, { memo } from 'react'
import { Box, Menu, MenuItem, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { UI_BG_HOVER_DANGER_TRANSITION, DANGER_TINT_BG, SCROLLING_TOOLTIP_HIDE_MS } from '../lib/constants'
import ConfigChip from './ConfigChip'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'

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
  onDeleteSelected: () => void
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
    onDeleteSelected,
  } = props

  const [menu, setMenu] = React.useState<null | { open: boolean; x: number; y: number }>(null)
  const menuPaperRef = React.useRef<HTMLDivElement | null>(null)
  const closeMenu = React.useCallback(() => { setMenu(null) }, [setMenu])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(menu?.open),
    onClose: closeMenu,
    menuRef: menuPaperRef,
  })
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
  // Always stretch the chips area so the preview panel height stays aligned and the context menu can open anywhere within the paper.
  const minHeightPx = React.useMemo(() => {
    return maxHeightPx > 0 ? maxHeightPx : 0
  }, [maxHeightPx])
  const [showFocusRing, setShowFocusRing] = React.useState(false)

  return (
    <>
      <Box
        ref={containerRef}
        sx={(theme) => ({
          mt: 2,
          display: 'flex',
          width: '100%',
          flexGrow: 1,
          flexBasis: 0,
          gap: 1,
          flexWrap: 'wrap',
          maxHeight: maxHeightPx,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarGutter: 'stable',
          pr: 1,
          minHeight: minHeightPx,
          alignContent: 'flex-start',
          alignItems: 'flex-start',
          position: 'relative',
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          backgroundColor: highlightDelete
            ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light)
            : 'transparent',
          borderRadius: 1,
          outline: 'none',
          boxShadow: showFocusRing ? `0 0 0 2px ${theme.palette.primary.main}` : 'none',
        })}
        onScroll={markScrolling}
        onContextMenu={(e) => {
          try {
            e.preventDefault()
            e.stopPropagation()
          } catch {}
          setMenu({ open: true, x: e.clientX, y: e.clientY })
        }}
        onClick={(e) => {
          // Left click on empty area (not on a chip) clears selection
          // Ignore when user is holding multiselect modifiers.
          if (e.button !== 0) return
          if (e.shiftKey || e.ctrlKey || (e as unknown as MouseEvent).metaKey) return
          if (e.currentTarget === e.target) onClearSelection()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Shift') {
            setShowFocusRing(false)
            return
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.target !== e.currentTarget) return
            if (selectedIndices.length === 0) return
            e.preventDefault()
            onDeleteSelected()
            return
          }
          if (e.key.toLowerCase() !== 'a') return
          if (!(e.ctrlKey || e.metaKey)) return
          if (e.target !== e.currentTarget) return
          e.preventDefault()
          if (configs.length > 0) onSelectAll()
        }}
        onFocus={(e) => {
          if (e.currentTarget !== e.target) return
          try {
            if (e.currentTarget.matches(':focus-visible')) setShowFocusRing(true)
          } catch {
            setShowFocusRing(true)
          }
        }}
        onBlur={() => setShowFocusRing(false)}
        onMouseDown={() => setShowFocusRing(false)}
        tabIndex={0}
        aria-label={t('configMany')}
        data-tour-id="chips.container"
      >
        {configs.length === 0 ? (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>No configs yet — right-click to Paste</Typography>
          </Box>
        ) : visibleCount === 0 ? (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>{t('chipsFilteredEmpty')}</Typography>
          </Box>
        ) : (
          configs.map((c, idx) => {
            if (visibleSet && !visibleSet.has(idx)) return null
            const visibility = c.visibility
            const isDraft = visibility === 'draft'
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
              onSelectAll={onSelectAll}
              onCopyAllConfigs={onCopyAllConfigs}
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
        onClose={closeMenu}
        anchorReference="anchorPosition"
        {...(menu?.open ? { anchorPosition: { top: menu.y, left: menu.x } } : {})}
        slotProps={{ paper: { ref: menuPaperRef, 'data-tour-id': 'chips.menu' } as unknown as MuiPaperProps }}
      >
        <MenuItem onClick={() => { onSelectAll(); closeMenu() }} disabled={configs.length === 0}>{t('chipsMenuSelectAll')}</MenuItem>
        <MenuItem onClick={() => { onCopyAllConfigs(); closeMenu() }} disabled={configs.length === 0}>{t('chipsMenuCopyAllConfigs')}</MenuItem>
        <MenuItem onClick={() => { onPasteAtEnd(); closeMenu() }}>{t('chipsMenuPasteAtEnd')}</MenuItem>
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
