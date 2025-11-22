/**
 * BuilderPanel action menus + hint overlays
 *
 * Encapsulates the context-menu anchor tracking plus hint overlays so the
 * BuilderPanel render tree stays lean.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { useContextMenuCloseOnOutsideRightClick } from '../../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuHint } from '../../hooks/useContextMenuHint'

export interface ContextMenuHintState {
  shouldShow: boolean
  active: boolean
  pos: { x: number; y: number } | null
  onMouseEnter: (event: React.MouseEvent<HTMLElement>) => void
  onMouseMove: (event: React.MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
  setPosition?: (pos: { x: number; y: number } | null) => void
}

export interface ContextMenuState {
  anchor: HTMLElement | null
  paperRef: React.MutableRefObject<HTMLDivElement | null>
  close: () => void
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void
}

export interface BuilderPanelMenuControls {
  menu: ContextMenuState
  hint: ContextMenuHintState
}

export interface BuilderPanelActionMenus {
  insert: BuilderPanelMenuControls
  apply: BuilderPanelMenuControls
  reset: BuilderPanelMenuControls
}

interface UseBuilderPanelActionMenusOptions {
  builderCanAdd: boolean
  multiEditActive: boolean
  saveDisabled: boolean
  isDefaultBuilder: boolean
}

export const useBuilderPanelActionMenus = ({
  builderCanAdd,
  multiEditActive,
  saveDisabled,
  isDefaultBuilder,
}: UseBuilderPanelActionMenusOptions): BuilderPanelActionMenus => {
  // Insert menu / hint state stays localized here rather than inside BuilderPanel.
  const [insertMenuAnchor, setInsertMenuAnchor] = useState<HTMLElement | null>(null)
  const insertMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeInsertMenu = useCallback(() => { setInsertMenuAnchor(null) }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(insertMenuAnchor),
    onClose: closeInsertMenu,
    menuRef: insertMenuPaperRef,
  })
  const {
    shouldShow: showInsertHint,
    markSeen: markInsertHintSeen,
  } = useContextMenuHint('builderInsertMenu')
  const [insertHintPos, setInsertHintPos] = useState<{ x: number; y: number } | null>(null)
  const insertHintActive = showInsertHint && insertHintPos !== null && !insertMenuAnchor && builderCanAdd && !multiEditActive
  useEffect(() => {
    if (!showInsertHint) setInsertHintPos(null)
  }, [showInsertHint])
  const handleInsertHintMouseEnter = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!showInsertHint) return
    if (!builderCanAdd) return
    if (multiEditActive) return
    if (insertMenuAnchor) return
    setInsertHintPos({ x: event.clientX, y: event.clientY })
  }, [builderCanAdd, insertMenuAnchor, multiEditActive, showInsertHint])
  const handleInsertHintMouseMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!showInsertHint) return
    if (!builderCanAdd) return
    if (multiEditActive) return
    if (insertMenuAnchor) return
    setInsertHintPos({ x: event.clientX, y: event.clientY })
  }, [builderCanAdd, insertMenuAnchor, multiEditActive, showInsertHint])
  const handleInsertHintMouseLeave = useCallback(() => {
    setInsertHintPos(null)
  }, [])
  const handleInsertContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    if (!builderCanAdd) return
    markInsertHintSeen()
    setInsertHintPos(null)
    setInsertMenuAnchor(event.currentTarget as HTMLElement)
  }, [builderCanAdd, markInsertHintSeen])

  // Apply menu mirrors Insert but skips builder-can-add gating and respects saveDisabled.
  const [applyMenuAnchor, setApplyMenuAnchor] = useState<HTMLElement | null>(null)
  const applyMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeApplyMenu = useCallback(() => { setApplyMenuAnchor(null) }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(applyMenuAnchor),
    onClose: closeApplyMenu,
    menuRef: applyMenuPaperRef,
  })
  const {
    shouldShow: showApplyHint,
    markSeen: markApplyHintSeen,
  } = useContextMenuHint('builderApplyMenu')
  const [applyHintPos, setApplyHintPos] = useState<{ x: number; y: number } | null>(null)
  const applyHintActive = showApplyHint && applyHintPos !== null && !applyMenuAnchor && !multiEditActive
  useEffect(() => {
    if (!showApplyHint) setApplyHintPos(null)
  }, [showApplyHint])
  const handleApplyHintMouseEnter = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!showApplyHint) return
    if (multiEditActive) return
    if (applyMenuAnchor) return
    if (saveDisabled) return
    setApplyHintPos({ x: event.clientX, y: event.clientY })
  }, [applyMenuAnchor, multiEditActive, saveDisabled, showApplyHint])
  const handleApplyHintMouseMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!showApplyHint) return
    if (multiEditActive) return
    if (applyMenuAnchor) return
    if (saveDisabled) return
    setApplyHintPos({ x: event.clientX, y: event.clientY })
  }, [applyMenuAnchor, multiEditActive, saveDisabled, showApplyHint])
  const handleApplyHintMouseLeave = useCallback(() => {
    setApplyHintPos(null)
  }, [])
  const handleApplyContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    if (multiEditActive) return
    markApplyHintSeen()
    setApplyHintPos(null)
    setApplyMenuAnchor(event.currentTarget as HTMLElement)
  }, [markApplyHintSeen, multiEditActive])

  // Reset menu also needs to respect default builder lockouts, so we keep that logic in one spot.
  const [resetMenuAnchor, setResetMenuAnchor] = useState<HTMLElement | null>(null)
  const resetMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeResetMenu = useCallback(() => { setResetMenuAnchor(null) }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(resetMenuAnchor),
    onClose: closeResetMenu,
    menuRef: resetMenuPaperRef,
  })
  const {
    shouldShow: showResetHint,
    markSeen: markResetHintSeen,
  } = useContextMenuHint('builderReset')
  const [resetHintPos, setResetHintPos] = useState<{ x: number; y: number } | null>(null)
  const resetHintActive = showResetHint && resetHintPos !== null && !resetMenuAnchor && !multiEditActive && !isDefaultBuilder
  useEffect(() => {
    if (!showResetHint) setResetHintPos(null)
  }, [showResetHint])
  const handleResetHintMouseEnter = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!showResetHint) return
    if (isDefaultBuilder) return
    if (multiEditActive) return
    if (resetMenuAnchor) return
    setResetHintPos({ x: event.clientX, y: event.clientY })
  }, [isDefaultBuilder, multiEditActive, resetMenuAnchor, showResetHint])
  const handleResetHintMouseMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!showResetHint) return
    if (isDefaultBuilder) return
    if (multiEditActive) return
    if (resetMenuAnchor) return
    setResetHintPos({ x: event.clientX, y: event.clientY })
  }, [isDefaultBuilder, multiEditActive, resetMenuAnchor, showResetHint])
  const handleResetHintMouseLeave = useCallback(() => {
    setResetHintPos(null)
  }, [])
  const handleResetContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    if (multiEditActive) return
    markResetHintSeen()
    setResetHintPos(null)
    setResetMenuAnchor(event.currentTarget as HTMLElement)
  }, [markResetHintSeen, multiEditActive])

  // Expose a structured API so BuilderPanel can destructure only what it needs.
  return {
    insert: {
      menu: {
        anchor: insertMenuAnchor,
        paperRef: insertMenuPaperRef,
        close: closeInsertMenu,
        onContextMenu: handleInsertContextMenu,
      },
      hint: {
        shouldShow: showInsertHint,
        active: insertHintActive,
        pos: insertHintPos,
        onMouseEnter: handleInsertHintMouseEnter,
        onMouseMove: handleInsertHintMouseMove,
        onMouseLeave: handleInsertHintMouseLeave,
      },
    },
    apply: {
      menu: {
        anchor: applyMenuAnchor,
        paperRef: applyMenuPaperRef,
        close: closeApplyMenu,
        onContextMenu: handleApplyContextMenu,
      },
      hint: {
        shouldShow: showApplyHint,
        active: applyHintActive,
        pos: applyHintPos,
        onMouseEnter: handleApplyHintMouseEnter,
        onMouseMove: handleApplyHintMouseMove,
        onMouseLeave: handleApplyHintMouseLeave,
      },
    },
    reset: {
      menu: {
        anchor: resetMenuAnchor,
        paperRef: resetMenuPaperRef,
        close: closeResetMenu,
        onContextMenu: handleResetContextMenu,
      },
      hint: {
        shouldShow: showResetHint,
        active: resetHintActive,
        pos: resetHintPos,
        onMouseEnter: handleResetHintMouseEnter,
        onMouseMove: handleResetHintMouseMove,
        onMouseLeave: handleResetHintMouseLeave,
        setPosition: setResetHintPos,
      },
    },
  }
}
