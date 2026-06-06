/**
 * BuilderPanel action menus + hint overlays
 *
 * Encapsulates the context-menu anchor tracking plus hint overlays so the
 * BuilderPanel render tree stays lean.
 */
import { useCallback, useRef, useState } from 'react'
import type React from 'react'
import type { ReactElement } from 'react'
import { useContextMenuCloseOnOutsideRightClick } from '../../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuButtonHint } from '../../hooks/useContextMenuButtonHint'
import { CONTEXT_HINT_IDS } from '../../hooks/contextMenuHintIds'
import { useI18n } from '../../lib/i18n'

export interface ContextMenuHintState {
  overlay: ReactElement | null
  triggerProps: {
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => void
    onMouseMove: (event: React.MouseEvent<HTMLElement>) => void
    onMouseLeave: () => void
  }
  /** Call when the context menu opens — marks hint seen and clears position. */
  onOpen: () => void
  /**
   * Directly set position from keyboard focus (optional; only wired for reset).
   * Calling with null clears the position.
   */
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
  const { t } = useI18n()

  // Insert menu — hint disabled when menu is open, builder can't add, or multi-edit is active.
  const [insertMenuAnchor, setInsertMenuAnchor] = useState<HTMLElement | null>(null)
  const insertMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeInsertMenu = useCallback(() => { setInsertMenuAnchor(null) }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(insertMenuAnchor),
    onClose: closeInsertMenu,
    menuRef: insertMenuPaperRef,
  })
  const { overlay: insertHintOverlay, triggerProps: insertHintTriggerProps, onOpen: onInsertHintOpen } = useContextMenuButtonHint(CONTEXT_HINT_IDS.builderInsertMenu, {
    enabled: builderCanAdd && !multiEditActive,
    text: t('contextMenuHint'),
  })
  const handleInsertContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    if (!builderCanAdd) return
    onInsertHintOpen()
    setInsertMenuAnchor(event.currentTarget as HTMLElement)
  }, [builderCanAdd, onInsertHintOpen])

  // Apply menu — hint disabled when menu is open, multi-edit is active, or save is disabled.
  const [applyMenuAnchor, setApplyMenuAnchor] = useState<HTMLElement | null>(null)
  const applyMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeApplyMenu = useCallback(() => { setApplyMenuAnchor(null) }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(applyMenuAnchor),
    onClose: closeApplyMenu,
    menuRef: applyMenuPaperRef,
  })
  const { overlay: applyHintOverlay, triggerProps: applyHintTriggerProps, onOpen: onApplyHintOpen } = useContextMenuButtonHint(CONTEXT_HINT_IDS.builderApplyMenu, {
    enabled: !multiEditActive && !saveDisabled,
    text: t('contextMenuHint'),
  })
  const handleApplyContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    if (multiEditActive) return
    onApplyHintOpen()
    setApplyMenuAnchor(event.currentTarget as HTMLElement)
  }, [multiEditActive, onApplyHintOpen])

  // Reset menu — hint disabled when menu is open, multi-edit is active, or builder is default.
  const [resetMenuAnchor, setResetMenuAnchor] = useState<HTMLElement | null>(null)
  const resetMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeResetMenu = useCallback(() => { setResetMenuAnchor(null) }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(resetMenuAnchor),
    onClose: closeResetMenu,
    menuRef: resetMenuPaperRef,
  })
  const { overlay: resetHintOverlay, triggerProps: resetHintTriggerProps, onOpen: onResetHintOpen, setPosition: setResetHintPos } = useContextMenuButtonHint(CONTEXT_HINT_IDS.builderReset, {
    enabled: !multiEditActive && !isDefaultBuilder,
    text: t('contextMenuHint'),
  })
  const handleResetContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    if (multiEditActive) return
    onResetHintOpen()
    setResetMenuAnchor(event.currentTarget as HTMLElement)
  }, [multiEditActive, onResetHintOpen])

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
        overlay: insertHintOverlay,
        triggerProps: insertHintTriggerProps,
        onOpen: onInsertHintOpen,
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
        overlay: applyHintOverlay,
        triggerProps: applyHintTriggerProps,
        onOpen: onApplyHintOpen,
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
        overlay: resetHintOverlay,
        triggerProps: resetHintTriggerProps,
        onOpen: onResetHintOpen,
        setPosition: setResetHintPos,
      },
    },
  }
}
