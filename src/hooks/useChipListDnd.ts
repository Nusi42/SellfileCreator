import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const AUTO_SCROLL_EDGE_PX = 80
const AUTO_SCROLL_MAX_SPEED_PX = 28
const DRAG_ACTIVATION_DISTANCE_PX = 4

export type DropGuide = { top: number; left: number; width: number; height: number } | null

export type DragState = {
  indices: number[]
  activeIndex: number
  dropIndex: number | null
  copyMode: boolean
  /** Outline level the drop would land at; null for flat lists (no resolveDropDepth). */
  dropDepth: number | null
}

type ChipLayoutEntry = {
  index: number
  rect: DOMRect
  offsetTop: number
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

export type UseChipListDndOptions = {
  containerRef: React.MutableRefObject<HTMLElement | null>
  itemIndexAttr: string
  onReorder: (movingIndices: number[], toIndex: number, options?: { mode?: 'move' | 'copy'; depth?: number }) => void
  onPrepareSelection?: (idx: number) => number[]
  copyModeEnabled?: boolean
  enabled: boolean
  /**
   * Optional outline support. When supplied, the pointer's HORIZONTAL position also picks a
   * nesting level for the drop — the standard outliner interaction — and that level is
   * reported on the drop guide (so the bar renders indented) and forwarded to `onReorder`.
   *
   * Callers that model a flat list omit this and are entirely unaffected: no depth is ever
   * computed, and `onReorder` receives exactly the options it does today.
   */
  resolveDropDepth?: (insertIndex: number, pointerOffsetX: number) => number
  /**
   * Pixels of indentation per outline level, used to inset the drop guide so it lines up with
   * where the dragged block will actually land. Only read when `resolveDropDepth` is supplied.
   */
  depthIndentPx?: number
}

export type UseChipListDndResult = {
  dragState: DragState | null
  dropGuide: DropGuide
  handleItemPointerDown: (event: React.PointerEvent<HTMLElement>, idx: number) => void
  hasActiveDrag: boolean
  dragGhostIndices: ReadonlySet<number>
}

export function useChipListDnd(options: UseChipListDndOptions): UseChipListDndResult {
  const optionsRef = useRef(options)
  // Sync via effect to avoid writing a ref during render.
  useEffect(() => { optionsRef.current = options })

  const { containerRef } = options

  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  useEffect(() => { dragStateRef.current = dragState }, [dragState])
  const [dropGuide, setDropGuide] = useState<DropGuide>(null)
  const chipRectsRef = useRef<ChipLayoutEntry[]>([])
  const layoutDirtyRef = useRef(false)
  const autoScrollVelocityRef = useRef(0)
  const autoScrollFrameRef = useRef<number | null>(null)
  const pointerSessionRef = useRef<PointerDragSession | null>(null)

  // Internal scroll listener: marks layout dirty when dragging + container scrolls
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = () => { if (dragStateRef.current) layoutDirtyRef.current = true }
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [containerRef])

  const measureChipLayouts = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      chipRectsRef.current = []
      layoutDirtyRef.current = false
      return
    }
    const attr = optionsRef.current.itemIndexAttr
    const nodes = container.querySelectorAll<HTMLElement>(`[${attr}]`)
    const entries: ChipLayoutEntry[] = []
    nodes.forEach((node) => {
      const val = node.getAttribute(attr)
      if (!val) return
      const index = Number(val)
      if (!Number.isFinite(index)) return
      entries.push({
        index,
        rect: node.getBoundingClientRect(),
        offsetTop: node.offsetTop,
        height: node.offsetHeight,
      })
    })
    chipRectsRef.current = entries.sort((a, b) => a.index - b.index)
    layoutDirtyRef.current = false
  }, [containerRef])

  const resolveDropTargetFromPoint = useCallback((_clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return null
    const entries = chipRectsRef.current
    if (entries.length === 0) return null
    const horizontalInset = 4
    const horizontalWidth = Math.max(4, container.clientWidth - horizontalInset * 2)

    const horizontalGuideAt = (top: number): DropGuide => ({
      top: Math.max(0, top),
      left: horizontalInset,
      width: horizontalWidth,
      height: 4,
    })

    const sorted = [...entries].sort((a, b) => a.rect.top - b.rect.top)
    const first = sorted[0]!
    if (clientY < first.rect.top) {
      const top = first.offsetTop - 2
      return { insertIndex: first.index, guide: horizontalGuideAt(top) }
    }
    for (const entry of sorted) {
      const midpoint = entry.rect.top + (entry.rect.height / 2)
      if (clientY < midpoint) {
        const top = entry.offsetTop - 2
        return { insertIndex: entry.index, guide: horizontalGuideAt(top) }
      }
    }
    const last = sorted[sorted.length - 1]!
    const top = last.offsetTop + last.height - 2
    return { insertIndex: last.index + 1, guide: horizontalGuideAt(top) }
  }, [containerRef])

  const updateDropTarget = useCallback((clientX: number, clientY: number) => {
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
    let nextDepth: number | null = null
    const withinSelectionRange = resolved
      ? resolved.insertIndex >= selectionMin && resolved.insertIndex <= selectionMax
      : false
    if (resolved && (current.copyMode || !withinSelectionRange)) {
      nextDrop = resolved.insertIndex
      nextGuide = resolved.guide
      // Outline lists let the pointer's horizontal position pick the nesting level, and the
      // guide is inset to match so the drop reads unambiguously before the user commits.
      const { resolveDropDepth, depthIndentPx } = optionsRef.current
      if (resolveDropDepth) {
        const container = containerRef.current
        const offsetX = container ? clientX - container.getBoundingClientRect().left : 0
        nextDepth = resolveDropDepth(resolved.insertIndex, offsetX)
        const inset = (depthIndentPx ?? 0) * nextDepth
        const base = resolved.guide
        if (inset > 0 && base) {
          nextGuide = { ...base, left: base.left + inset, width: Math.max(4, base.width - inset) }
        }
      }
    }
    setDropGuide(nextGuide)
    setDragState(prev => (prev ? { ...prev, dropIndex: nextDrop, dropDepth: nextDepth } : prev))
  }, [containerRef, measureChipLayouts, resolveDropTargetFromPoint])

  const stopAutoScroll = useCallback(() => {
    autoScrollVelocityRef.current = 0
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
  }, [])

  // Ref indirection breaks the self-reference cycle so the lint rule sees a stable binding.
  const stepAutoScrollRef = useRef<() => void>(() => {})

  const stepAutoScroll = useCallback(() => {
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
    autoScrollFrameRef.current = requestAnimationFrame(stepAutoScrollRef.current)
  }, [containerRef, stopAutoScroll, updateDropTarget])

  // Keep the ref in sync so recursive rAF calls always reach the latest closure.
  useEffect(() => { stepAutoScrollRef.current = stepAutoScroll }, [stepAutoScroll])

  const requestAutoScroll = useCallback((clientY: number) => {
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

  const clearDragState = useCallback(() => {
    setDragState(null)
    setDropGuide(null)
    stopAutoScroll()
    dragStateRef.current = null
  }, [stopAutoScroll])

  const applyDrop = useCallback(() => {
    const current = dragStateRef.current
    if (!current) return
    const { indices, dropIndex, copyMode, dropDepth } = current
    // Depth rides along only when the caller opted into outline drops; a flat list receives
    // exactly the options it always did.
    const depthOption = dropDepth === null ? {} : { depth: dropDepth }
    if (dropIndex != null) {
      if (copyMode) {
        optionsRef.current.onReorder(indices, dropIndex, { mode: 'copy', ...depthOption })
      } else {
        const min = indices[0] ?? 0
        const max = (indices[indices.length - 1] ?? -1) + 1
        // An outline drop at the same position can still be meaningful — it may only change
        // the level — so a depth-aware list also commits in-range drops when the depth differs.
        const positionChanged = dropIndex < min || dropIndex > max
        if (positionChanged || dropDepth !== null) {
          optionsRef.current.onReorder(indices, dropIndex, depthOption)
        }
      }
    }
    clearDragState()
  }, [clearDragState])

  const beginDragOperation = useCallback((idx: number, selection: number[], copyMode: boolean): boolean => {
    if (selection.length === 0) return false
    const next: DragState = {
      indices: selection,
      activeIndex: idx,
      dropIndex: idx,
      copyMode,
      // Resolved on the first pointer move; null until then, and always null for flat lists.
      dropDepth: null,
    }
    dragStateRef.current = next
    setDragState(next)
    setDropGuide(null)
    measureChipLayouts()
    return true
  }, [measureChipLayouts])

  const handleChipPointerDown = useCallback((event: React.PointerEvent<HTMLElement>, idx: number) => {
    if (!optionsRef.current.enabled) return
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
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = pointerSessionRef.current
      if (!session || event.pointerId !== session.pointerId) return
      session.lastClientX = event.clientX
      session.lastClientY = event.clientY
      const copyIntent = Boolean(event.ctrlKey || event.metaKey)
      if (session.copyIntent !== copyIntent && (optionsRef.current.copyModeEnabled ?? false)) {
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
        const prepareSelection = optionsRef.current.onPrepareSelection ?? ((i: number) => [i])
        const selection = prepareSelection(session.activeIndex)
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
  }, [applyDrop, beginDragOperation, clearDragState, requestAutoScroll, updateDropTarget])

  useEffect(() => {
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

  useEffect(() => {
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

  useEffect(() => {
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

  const dragGhostIndices = useMemo(() => new Set(dragState?.indices ?? []), [dragState])

  return {
    dragState,
    dropGuide,
    handleItemPointerDown: handleChipPointerDown,
    hasActiveDrag,
    dragGhostIndices,
  }
}
