import React, { memo } from 'react'
import { Box, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import {
  UI_BG_HOVER_DANGER_TRANSITION,
  DANGER_TINT_BG,
  SCROLLING_TOOLTIP_HIDE_MS,
  BUILDER_CONFIG_CHIPS_EMPTY_MIN_HEIGHT_PX,
} from '../lib/constants'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import ConfigChip from './ConfigChip'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { ConfigContextMenu } from './ConfigContextMenu'

const AUTO_SCROLL_EDGE_PX = 80
const AUTO_SCROLL_MAX_SPEED_PX = 28
const DRAG_ACTIVATION_DISTANCE_PX = 4

type DropGuide = { top: number; left: number; width: number; height: number } | null

type DragState = {
  indices: number[]
  activeIndex: number
  dropIndex: number | null
  copyMode: boolean
}

type ChipLayoutEntry = {
  index: number
  rect: DOMRect
  offsetTop: number
  offsetLeft: number
  width: number
  height: number
}

type PointerDragSession = {
  pointerId: number
  activeIndex: number
  selection: number[] | null
  started: boolean
  originX: number
  originY: number
  lastClientX: number
  lastClientY: number
  copyIntent: boolean
}

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
  onPrepareDragSelection: (idx: number) => number[]
  onReorderConfigs: (movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void
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
    onPrepareDragSelection,
    onReorderConfigs,
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
  const hideTipsTimerRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null)
  React.useEffect(() => () => {
    if (hideTipsTimerRef.current) {
      clearTimeout(hideTipsTimerRef.current)
      hideTipsTimerRef.current = null
    }
  }, [])
  const markScrolling = React.useCallback(() => {
    try {
      document.body.classList.add('scrolling')
      if (hideTipsTimerRef.current) {
        clearTimeout(hideTipsTimerRef.current)
        hideTipsTimerRef.current = null
      }
      hideTipsTimerRef.current = window.setTimeout(() => {
        try { document.body.classList.remove('scrolling') } catch {}
      }, SCROLLING_TOOLTIP_HIDE_MS)
    } catch {}
  }, [])

  const duplicateOf = duplicateOfIndices
  const selectedSet = React.useMemo(() => new Set(selectedIndices), [selectedIndices])
  const visibleSet = visibleIndices ?? null
  const visibleCount = visibleSet
    ? configs.reduce((count, _cfg, idx) => count + (visibleSet.has(idx) ? 1 : 0), 0)
    : configs.length
  const renderedIndices = React.useMemo(() => {
    if (!visibleSet) return configs.map((_, idx) => idx)
    const order: number[] = []
    configs.forEach((_cfg, idx) => {
      if (visibleSet.has(idx)) order.push(idx)
    })
    return order
  }, [configs, visibleSet])
  const minHeightPx = React.useMemo(() => {
    if (maxHeightPx <= 0) return 0
    if (configs.length === 0) {
      return Math.min(maxHeightPx, BUILDER_CONFIG_CHIPS_EMPTY_MIN_HEIGHT_PX)
    }
    return maxHeightPx
  }, [configs.length, maxHeightPx])

  const [showFocusRing, setShowFocusRing] = React.useState(false)
  const dragAllowed = configs.length > 1 && renderedIndices.length > 0
  const [dragState, setDragState] = React.useState<DragState | null>(null)
  const dragStateRef = React.useRef<DragState | null>(null)
  React.useEffect(() => { dragStateRef.current = dragState }, [dragState])
  const [dropGuide, setDropGuide] = React.useState<DropGuide>(null)
  const chipRectsRef = React.useRef<ChipLayoutEntry[]>([])
  const layoutDirtyRef = React.useRef(false)
  const autoScrollVelocityRef = React.useRef(0)
  const autoScrollFrameRef = React.useRef<number | null>(null)
  const pointerSessionRef = React.useRef<PointerDragSession | null>(null)

  const measureChipLayouts = React.useCallback(() => {
    const container = containerRef.current
    if (!container) {
      chipRectsRef.current = []
      layoutDirtyRef.current = false
      return
    }
    const nodes = container.querySelectorAll<HTMLElement>('[data-config-chip-index]')
    const entries: ChipLayoutEntry[] = []
    nodes.forEach((node) => {
      const attr = node.getAttribute('data-config-chip-index')
      if (!attr) return
      const index = Number(attr)
      if (!Number.isFinite(index)) return
      entries.push({
        index,
        rect: node.getBoundingClientRect(),
        offsetTop: node.offsetTop,
        offsetLeft: node.offsetLeft,
        width: node.offsetWidth,
        height: node.offsetHeight,
      })
    })
    chipRectsRef.current = entries.sort((a, b) => a.index - b.index)
    layoutDirtyRef.current = false
  }, [containerRef])

  const resolveDropTargetFromPoint = React.useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return null
    const entries = chipRectsRef.current
    if (entries.length === 0) return null
    const horizontalInset = 4
    const horizontalWidth = Math.max(4, container.clientWidth - horizontalInset * 2)

    const verticalGuideForEntry = (entry: ChipLayoutEntry, placeAfter: boolean): DropGuide => {
      const baseLeft = placeAfter ? entry.offsetLeft + entry.width : entry.offsetLeft
      const left = Math.max(0, baseLeft - 2)
      const top = Math.max(0, entry.offsetTop + 4)
      const height = Math.max(16, entry.height - 8)
      return { top, left, width: 4, height }
    }

    const verticalGapGuideBetween = (leftEntry: ChipLayoutEntry, rightEntry: ChipLayoutEntry): DropGuide => {
      const leftEdge = leftEntry.offsetLeft + leftEntry.width
      const rightEdge = rightEntry.offsetLeft
      const midpoint = (leftEdge + rightEdge) / 2
      const top = Math.min(leftEntry.offsetTop, rightEntry.offsetTop) + 4
      const height = Math.max(leftEntry.height, rightEntry.height) - 8
      return {
        top: Math.max(0, top),
        left: Math.max(0, midpoint - 2),
        width: 4,
        height: Math.max(16, height),
      }
    }

    const horizontalGuideAt = (top: number): DropGuide => ({
      top: Math.max(0, top),
      left: horizontalInset,
      width: horizontalWidth,
      height: 4,
    })

    const rowEntries = entries.filter((entry) => clientY >= entry.rect.top && clientY <= entry.rect.bottom)
    if (rowEntries.length > 0) {
      const sorted = [...rowEntries].sort((a, b) => a.rect.left - b.rect.left)
      const dropSlots: Array<{ position: number; insertIndex: number; guide: DropGuide }> = []
      const firstEntry = sorted[0]!
      dropSlots.push({
        position: firstEntry.rect.left,
        insertIndex: firstEntry.index,
        guide: verticalGuideForEntry(firstEntry, false),
      })
      for (let idx = 0; idx < sorted.length - 1; idx += 1) {
        const leftEntry = sorted[idx]!
        const rightEntry = sorted[idx + 1]!
        dropSlots.push({
          position: (leftEntry.rect.right + rightEntry.rect.left) / 2,
          insertIndex: rightEntry.index,
          guide: verticalGapGuideBetween(leftEntry, rightEntry),
        })
      }
      const lastEntry = sorted[sorted.length - 1]!
      dropSlots.push({
        position: lastEntry.rect.right,
        insertIndex: lastEntry.index + 1,
        guide: verticalGuideForEntry(lastEntry, true),
      })
      for (let idx = 0; idx < dropSlots.length - 1; idx += 1) {
        const current = dropSlots[idx]!
        const next = dropSlots[idx + 1]!
        const boundary = (current.position + next.position) / 2
        if (clientX < boundary) {
          return { insertIndex: current.insertIndex, guide: current.guide }
        }
      }
      const fallback = dropSlots[dropSlots.length - 1]!
      return { insertIndex: fallback.insertIndex, guide: fallback.guide }
    }

    const first = entries[0]!
    if (clientY < first.rect.top) {
      const top = first.offsetTop - 2
      return { insertIndex: 0, guide: horizontalGuideAt(top) }
    }
    const last = entries[entries.length - 1]!
    if (clientY > last.rect.bottom) {
      const top = last.offsetTop + last.height - 2
      return { insertIndex: last.index + 1, guide: horizontalGuideAt(top) }
    }
    for (let i = 0; i < entries.length - 1; i += 1) {
      const current = entries[i]!
      const next = entries[i + 1]!
      if (clientY > current.rect.bottom && clientY < next.rect.top) {
        const currentBottomOffset = current.offsetTop + current.height
        const nextTopOffset = next.offsetTop
        const top = ((currentBottomOffset + nextTopOffset) / 2) - 2
        return { insertIndex: next.index, guide: horizontalGuideAt(top) }
      }
    }
    return null
  }, [containerRef])

  const updateDropTarget = React.useCallback((clientX: number, clientY: number) => {
    const current = dragStateRef.current
    if (!current) return
    if (layoutDirtyRef.current) {
      measureChipLayouts()
    }
    const resolved = resolveDropTargetFromPoint(clientX, clientY)
    const selection = current.indices
    const selectionMin = selection[0] ?? 0
    const selectionMax = (selection[selection.length - 1] ?? -1) + 1
    let nextDrop: number | null = null
    let nextGuide: DropGuide = null
    const withinSelectionRange = resolved
      ? resolved.insertIndex >= selectionMin && resolved.insertIndex <= selectionMax
      : false
    if (resolved && (current.copyMode || !withinSelectionRange)) {
      nextDrop = resolved.insertIndex
      nextGuide = resolved.guide
    }
    setDropGuide(nextGuide)
    setDragState(prev => (prev ? { ...prev, dropIndex: nextDrop } : prev))
  }, [measureChipLayouts, resolveDropTargetFromPoint])

  const stopAutoScroll = React.useCallback(() => {
    autoScrollVelocityRef.current = 0
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
  }, [])

  const stepAutoScroll = React.useCallback(() => {
    const container = containerRef.current
    if (!container) {
      stopAutoScroll()
      return
    }
    const velocity = autoScrollVelocityRef.current
    if (velocity === 0) {
      stopAutoScroll()
      return
    }
    container.scrollTop += velocity
    layoutDirtyRef.current = true
    const pointerSession = pointerSessionRef.current
    if (pointerSession?.started && dragStateRef.current) {
      updateDropTarget(pointerSession.lastClientX, pointerSession.lastClientY)
    }
    autoScrollFrameRef.current = requestAnimationFrame(stepAutoScroll)
  }, [containerRef, stopAutoScroll, updateDropTarget])

  const requestAutoScroll = React.useCallback((clientY: number) => {
    const container = containerRef.current
    if (!container) {
      stopAutoScroll()
      return
    }
    const rect = container.getBoundingClientRect()
    let velocity = 0
    if (clientY < rect.top + AUTO_SCROLL_EDGE_PX) {
      const distance = rect.top + AUTO_SCROLL_EDGE_PX - clientY
      const ratio = Math.min(1, distance / AUTO_SCROLL_EDGE_PX)
      velocity = -Math.max(1, Math.round(ratio * AUTO_SCROLL_MAX_SPEED_PX))
    } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
      const distance = clientY - (rect.bottom - AUTO_SCROLL_EDGE_PX)
      const ratio = Math.min(1, distance / AUTO_SCROLL_EDGE_PX)
      velocity = Math.max(1, Math.round(ratio * AUTO_SCROLL_MAX_SPEED_PX))
    }
    autoScrollVelocityRef.current = velocity
    if (velocity === 0) {
      stopAutoScroll()
      return
    }
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = requestAnimationFrame(stepAutoScroll)
    }
  }, [containerRef, stepAutoScroll, stopAutoScroll])

  const clearDragState = React.useCallback(() => {
    setDragState(null)
    setDropGuide(null)
    stopAutoScroll()
    dragStateRef.current = null
  }, [stopAutoScroll])

  const applyDrop = React.useCallback(() => {
    const current = dragStateRef.current
    if (!current) return
    const { indices, dropIndex, copyMode } = current
    if (dropIndex != null) {
      if (copyMode) {
        onReorderConfigs(indices, dropIndex, { mode: 'copy' })
      } else {
        const min = indices[0] ?? 0
        const max = (indices[indices.length - 1] ?? -1) + 1
        if (dropIndex < min || dropIndex > max) {
          onReorderConfigs(indices, dropIndex)
        }
      }
    }
    clearDragState()
  }, [clearDragState, onReorderConfigs])

  const beginDragOperation = React.useCallback((idx: number, selection: number[], copyMode: boolean): boolean => {
    if (selection.length === 0) return false
    const next: DragState = {
      indices: selection,
      activeIndex: idx,
      dropIndex: idx,
      copyMode,
    }
    dragStateRef.current = next
    setDragState(next)
    setDropGuide(null)
    measureChipLayouts()
    return true
  }, [measureChipLayouts])

  const handleChipPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>, idx: number) => {
    if (!dragAllowed) return
    if (event.button !== 0) return
    pointerSessionRef.current = {
      pointerId: event.pointerId,
      activeIndex: idx,
      selection: null,
      started: false,
      originX: event.clientX,
      originY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      copyIntent: event.ctrlKey || event.metaKey || false,
    }
  }, [dragAllowed])

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = pointerSessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      session.lastClientX = event.clientX
      session.lastClientY = event.clientY
      const copyIntent = Boolean(event.ctrlKey || event.metaKey)
      if (session.copyIntent !== copyIntent) {
        session.copyIntent = copyIntent
        if (dragStateRef.current) {
          dragStateRef.current = { ...dragStateRef.current, copyMode: copyIntent }
          setDragState(prev => (prev ? { ...prev, copyMode: copyIntent } : prev))
        }
      }
      if (!session.started) {
        const deltaX = event.clientX - session.originX
        const deltaY = event.clientY - session.originY
        const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY))
        if (distance < DRAG_ACTIVATION_DISTANCE_PX) {
          return
        }
        const selection = onPrepareDragSelection(session.activeIndex)
        if (selection.length === 0) {
          pointerSessionRef.current = null
          return
        }
        session.selection = selection
        session.started = beginDragOperation(session.activeIndex, selection, session.copyIntent)
        if (!session.started) {
          pointerSessionRef.current = null
          return
        }
      }
      if (!dragStateRef.current) return
      event.preventDefault()
      updateDropTarget(event.clientX, event.clientY)
      requestAutoScroll(event.clientY)
    }
    const finishDrag = (shouldCommit: boolean) => {
      if (shouldCommit && dragStateRef.current) {
        applyDrop()
      } else if (dragStateRef.current) {
        clearDragState()
      }
      pointerSessionRef.current = null
    }
    const handlePointerUp = (event: PointerEvent) => {
      const session = pointerSessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      event.preventDefault()
      finishDrag(true)
    }
    const handlePointerCancel = (event: PointerEvent) => {
      const session = pointerSessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      finishDrag(false)
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp, { passive: false })
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [applyDrop, beginDragOperation, clearDragState, onPrepareDragSelection, requestAutoScroll, updateDropTarget])

  React.useEffect(() => {
    const handleWindowBlur = () => {
      pointerSessionRef.current = null
      if (dragStateRef.current) {
        clearDragState()
      }
    }
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [clearDragState])

  const hasActiveDrag = Boolean(dragState)

  React.useEffect(() => {
    if (!hasActiveDrag) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      pointerSessionRef.current = null
      clearDragState()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [clearDragState, hasActiveDrag])

  React.useEffect(() => {
    const cls = 'chips-dragging'
    if (hasActiveDrag) {
      try { document.body.classList.add(cls) } catch {}
    } else {
      try { document.body.classList.remove(cls) } catch {}
    }
    return () => {
      try { document.body.classList.remove(cls) } catch {}
    }
  }, [hasActiveDrag])

  const dragGhostSet = React.useMemo(() => new Set(dragState?.indices ?? []), [dragState])

  return (
    <>
      <Box
        ref={containerRef}
        sx={(theme) => {
          const gutterPadding = theme.spacing(1)
          return {
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
            pr: gutterPadding,
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
            // Firefox needs explicit padding to mimic Chrome's stable scrollbar gutter without touching other browsers.
            ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: gutterPadding }),
          }
        }}
        onScroll={() => {
          markScrolling()
          if (dragStateRef.current) {
            layoutDirtyRef.current = true
          }
        }}
        onMouseMove={(e) => {
          if (hasActiveDrag || menu?.open) return
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
      >
        {dropGuide ? (
          <Box
            sx={(theme) => ({
              position: 'absolute',
              top: dropGuide.top,
              left: dropGuide.left,
              width: dropGuide.width,
              height: dropGuide.height,
              backgroundColor: theme.palette.primary.main,
              borderRadius: dropGuide.height <= 4 ? 2 : 1,
              pointerEvents: 'none',
              boxShadow: `0 0 8px ${alpha(theme.palette.primary.main, 0.6)}`,
              zIndex: 5,
            })}
          />
        ) : null}
        {configs.length === 0 ? (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>{t('chipsEmptyPasteHint')}</Typography>
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
            const ghostedWhileDragging = hasActiveDrag && dragGhostSet.has(idx)
            // Keep separators draggable so multi-select moves always have an anchor, even when the first selected config is a divider.
            const dragEnabled = dragAllowed
            const pointerHandlers: { onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void } | null = dragEnabled
              ? {
                  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => handleChipPointerDown(event, idx),
                }
              : null
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
                onHover={(enter) => onHoverIdx(enter ? idx : null)}
                onContextMenuHintSeen={handleChipContextMenuHint}
                onHighlightDelete={onHighlightDelete}
                hideTooltip={hasActiveDrag}
                dragEnabled={dragEnabled}
                {...(pointerHandlers ?? {})}
                ghostedWhileDragging={ghostedWhileDragging}
              />
            )
          })
        )}
      </Box>
      <ContextMenuHintOverlay text={t('contextMenuHint')} position={hintActive && !hasActiveDrag ? hintPos : null} />
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
    && prev.onPrepareDragSelection === next.onPrepareDragSelection
    && prev.onReorderConfigs === next.onReorderConfigs
}

export default memo(ConfigChipsPanel, areConfigChipsPanelPropsEqual)
