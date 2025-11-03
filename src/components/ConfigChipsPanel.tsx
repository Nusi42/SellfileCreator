import React, { memo } from 'react'
import { Box, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import {
  UI_BG_HOVER_DANGER_TRANSITION,
  DANGER_TINT_BG,
  SCROLLING_TOOLTIP_HIDE_MS,
  BUILDER_CONFIG_CHIPS_EMPTY_MIN_HEIGHT_PX,
} from '../lib/constants'
import ConfigChip from './ConfigChip'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { ConfigContextMenu } from './ConfigContextMenu'

function ConfigChipsPanel(props: {
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  configs: BuilderConfig[]
  maxHeightPx: number
  selectedIndices: number[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  onHoverIdx: (idx: number | null) => void
  onSelect: (e: React.MouseEvent, idx: number) => void
  onDelete: (idx: number) => void
  onDuplicate: (idx: number) => void
  onPasteAfter: (idx: number) => void
  onMoveUp: (idx: number) => void
  onMoveDown: (idx: number) => void
  onMoveTop: (idx: number) => void
  onMoveBottom: (idx: number) => void
  onCopyAllConfigs: () => void
  onPasteAtEnd: () => void
  onSelectAll: () => void
  selectAllLabelKey: string
  onCopyConfig: (idx: number) => void
  onCopyConfigDev?: (idx: number) => void
  onClearSelection: () => void
  duplicateOfIndices: Array<number | null>
  visibleIndices?: ReadonlySet<number> | null
  onDeleteSelected: () => void
  onDeleteAll: () => void
  deleteAllDisabled: boolean
  highlightDelete: boolean
  onHighlightDelete: (active: boolean) => void
}) {
  const { t } = useI18n()
  const {
    containerRef,
    configs,
    maxHeightPx,
    selectedIndices,
    metasets,
    substatColors,
    onHoverIdx,
    onSelect,
    onDelete,
    onDuplicate,
    onPasteAfter,
    onMoveUp,
    onMoveDown,
    onMoveTop,
    onMoveBottom,
    onCopyAllConfigs,
    onPasteAtEnd,
    onSelectAll,
    selectAllLabelKey,
    onCopyConfig,
    onCopyConfigDev,
    onClearSelection,
    duplicateOfIndices,
    visibleIndices,
    onDeleteSelected,
    onDeleteAll,
    deleteAllDisabled,
    highlightDelete,
    onHighlightDelete,
  } = props

  const [menu, setMenu] = React.useState<null | { open: boolean; x: number; y: number }>(null)
  const menuPaperRef = React.useRef<HTMLDivElement | null>(null)
  const closeMenu = React.useCallback(() => {
    setMenu(null)
    onHighlightDelete(false)
  }, [onHighlightDelete])
  const handleMenuContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(menu?.open),
    onClose: closeMenu,
    menuRef: menuPaperRef,
  })
  const {
    shouldShow: shouldShowContainerHint,
    markSeen: markContainerHintSeen,
  } = useContextMenuHint('configChipsArea')
  const {
    shouldShow: shouldShowChipHint,
    markSeen: markChipHintSeen,
  } = useContextMenuHint('configChipsMenu')
  const [hintPos, setHintPos] = React.useState<{ x: number; y: number } | null>(null)
  const [activeHint, setActiveHint] = React.useState<'container' | 'chip' | null>(null)
  const hintActive = hintPos !== null
    && !menu?.open
    && (
      (activeHint === 'container' && shouldShowContainerHint)
      || (activeHint === 'chip' && shouldShowChipHint)
    )
  const resetHint = React.useCallback(() => {
    setHintPos(null)
    setActiveHint(null)
  }, [])
  const handleChipContextMenuHint = React.useCallback(() => {
    markChipHintSeen()
    resetHint()
  }, [markChipHintSeen, resetHint])
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
    if (maxHeightPx <= 0) return 0
    if (configs.length === 0) {
      return Math.min(maxHeightPx, BUILDER_CONFIG_CHIPS_EMPTY_MIN_HEIGHT_PX)
    }
    return maxHeightPx
  }, [configs.length, maxHeightPx])
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
          gap: 0.75,
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
        onMouseMove={(e) => {
          if (menu?.open) return
          const target = e.target as HTMLElement | null
          const inChip = Boolean(target?.closest('[data-config-chip="true"]'))
          if (inChip) {
            if (shouldShowChipHint) {
              setActiveHint('chip')
              setHintPos({ x: e.clientX, y: e.clientY })
            } else if (activeHint) {
              resetHint()
            }
            return
          }
          if (shouldShowContainerHint) {
            setActiveHint('container')
            setHintPos({ x: e.clientX, y: e.clientY })
          } else if (activeHint) {
            resetHint()
          }
        }}
        onMouseLeave={() => {
          resetHint()
        }}
        onContextMenu={(e) => {
          try {
            e.preventDefault()
            e.stopPropagation()
          } catch {}
          markContainerHintSeen()
          resetHint()
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
          if (visibleCount > 0) onSelectAll()
        }}
        onFocus={(e) => {
          if (e.currentTarget !== e.target) return
          try {
            if (e.currentTarget.matches(':focus-visible')) setShowFocusRing(true)
          } catch {
            setShowFocusRing(true)
          }
          if (shouldShowContainerHint) {
            const rect = e.currentTarget.getBoundingClientRect()
            setHintPos({ x: rect.left + rect.width / 2, y: rect.top })
            setActiveHint('container')
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
            const mode = c.exportMode
            const isSeparator = mode === 'separator'
            const duplicateIdx = duplicateOf[idx]
            return (
              <ConfigChip
                key={idx}
                index={idx}
                cfg={c}
                metasets={metasets}
                substatColors={substatColors}
                selected={selectedSet.has(idx)}
                isDuplicate={!isSeparator && duplicateIdx !== null}
                {...(!isSeparator && duplicateIdx !== null ? { duplicateOfIndex: duplicateIdx as number } : {})}
                onSelect={(e) => onSelect(e, idx)}
                onDelete={() => onDelete(idx)}
                onDuplicate={() => onDuplicate(idx)}
                onPasteAfter={() => onPasteAfter(idx)}
                onPasteAtEnd={onPasteAtEnd}
                onCopy={() => onCopyConfig(idx)}
                {...(onCopyConfigDev ? { onCopyDev: () => onCopyConfigDev(idx) } : {})}
                onSelectAll={onSelectAll}
                selectAllLabelKey={selectAllLabelKey}
                onCopyAllConfigs={onCopyAllConfigs}
                onDeleteAllConfigs={onDeleteAll}
                deleteAllDisabled={deleteAllDisabled}
                onMoveUp={() => onMoveUp(idx)}
                onMoveDown={() => onMoveDown(idx)}
                onMoveTop={() => onMoveTop(idx)}
                onMoveBottom={() => onMoveBottom(idx)}
                isLast={idx === configs.length - 1}
                // Propagate chip hover immediately so the table mirror
                // stays in sync without waiting for React's event batching.
                onHover={(enter) => onHoverIdx(enter ? idx : null)}
                onContextMenuHintSeen={handleChipContextMenuHint}
                onHighlightDelete={onHighlightDelete}
              />
            )
          })
        )}
      </Box>
      <ContextMenuHintOverlay text={t('contextMenuHint')} position={hintActive ? hintPos : null} />
      <ConfigContextMenu
        open={Boolean(menu?.open)}
        anchorPosition={menu?.open ? { top: menu.y, left: menu.x } : null}
        onClose={closeMenu}
        paperRef={menuPaperRef}
        paperDataTourId="chips.menu"
        onPaperContextMenu={handleMenuContextMenu}
        actions={{
          pasteAtEnd: onPasteAtEnd,
          selectAll: { handler: onSelectAll, disabled: visibleCount === 0, labelKey: selectAllLabelKey },
          copyAll: { handler: onCopyAllConfigs, disabled: configs.length === 0 },
          deleteAll: {
            handler: onDeleteAll,
            disabled: deleteAllDisabled,
            onHighlightChange: onHighlightDelete,
          },
        }}
      />
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
    && prev.onHoverIdx === next.onHoverIdx
    && prev.onSelect === next.onSelect
    && prev.onDelete === next.onDelete
    && prev.onDuplicate === next.onDuplicate
    && prev.onPasteAfter === next.onPasteAfter
    && prev.onMoveUp === next.onMoveUp
    && prev.onMoveDown === next.onMoveDown
    && prev.onMoveTop === next.onMoveTop
    && prev.onMoveBottom === next.onMoveBottom
    && prev.onCopyAllConfigs === next.onCopyAllConfigs
    && prev.onPasteAtEnd === next.onPasteAtEnd
    && prev.onSelectAll === next.onSelectAll
    && prev.selectAllLabelKey === next.selectAllLabelKey
    && prev.onCopyConfig === next.onCopyConfig
    && prev.onCopyConfigDev === next.onCopyConfigDev
    && prev.onClearSelection === next.onClearSelection
    && prev.duplicateOfIndices === next.duplicateOfIndices
    && prev.visibleIndices === next.visibleIndices
    && prev.onDeleteSelected === next.onDeleteSelected
    && prev.onDeleteAll === next.onDeleteAll
    && prev.highlightDelete === next.highlightDelete
    && prev.onHighlightDelete === next.onHighlightDelete
}

export default memo(ConfigChipsPanel, areConfigChipsPanelPropsEqual)
