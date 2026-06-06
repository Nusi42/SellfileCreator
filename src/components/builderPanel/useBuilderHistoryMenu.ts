/**
 * useBuilderHistoryMenu
 *
 * Encapsulates tooltip formatting, context-menu toggles, and education hints for the
 * builder history controls. Keeping this logic isolated makes BuilderPanel leaner while
 * preserving the dense inline documentation requirements.
 */
import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type React from 'react'
import type { HistoryPreview } from '../../hooks/useSfcHistory'
import { formatHistoryTooltipText } from '../../history/historyTooltip'
import { useContextMenuPaperGuard } from '../../hooks/useContextMenuPaperGuard'
import type { ContextMenuPaperGuardToken } from '../ContextMenuPaper'
import { useContextMenuButtonHint } from '../../hooks/useContextMenuButtonHint'
import { CONTEXT_HINT_IDS } from '../../hooks/contextMenuHintIds'
import type { I18nContextValue } from '../../lib/i18n'

type TranslateFn = I18nContextValue['t']

export interface BuilderHistoryMenuOptions {
  undoPreview: HistoryPreview
  redoPreview: HistoryPreview
  t: TranslateFn
  lang: string
  onRequestClearHistory: () => void
  onJumpToHistoryIndex: (index: number) => void
}

export interface BuilderHistoryMenuResult {
  undoTooltipText: string
  redoTooltipText: string
  historyMenuOpen: boolean
  historyMenuAnchor: { top: number; left: number } | null
  historyMenuPaperRef: MutableRefObject<HTMLDivElement | null>
  historyMenuGuard: ContextMenuPaperGuardToken
  closeHistoryMenu: () => void
  handleHistoryContextMenu: (event: React.MouseEvent) => void
  /** Spread onto the undo/redo controls container to track cursor for the hint. */
  historyHintTriggerProps: {
    onMouseEnter: (event: React.MouseEvent) => void
    onMouseMove: (event: React.MouseEvent) => void
    onMouseLeave: () => void
  }
  handleHistoryMenuContextMenu: (event: React.MouseEvent) => void
  handleRequestClearHistory: () => void
  handleHistoryEntrySelect: (index: number) => void
  /** Render near the controls — shows the "right-click for actions" affordance overlay. */
  historyHintOverlay: React.ReactElement | null
}

export function useBuilderHistoryMenu({
  undoPreview,
  redoPreview,
  t,
  lang,
  onRequestClearHistory,
  onJumpToHistoryIndex,
}: BuilderHistoryMenuOptions): BuilderHistoryMenuResult {
  // Native shortcuts differ by platform; detect once to format tooltips consistently.
  const isMacPlatform = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    const platform = navigator.platform || navigator.userAgent || ''
    return /Mac|iPhone|iPad|iPod/i.test(platform)
  }, [])
  const undoShortcutLabel = isMacPlatform ? '⌘+Z' : 'Ctrl+Z'
  const redoShortcutLabel = isMacPlatform ? '⌘+Shift+Z' : 'Ctrl+Y'
  // Tooltips reuse shared formatter so the preview descriptors stay in sync with BuilderPanel.
  const undoTooltipText = useMemo(
    () => formatHistoryTooltipText({
      descriptor: undoPreview?.descriptor ?? null,
      fallbackText: t('builderUndoTooltip', { shortcut: undoShortcutLabel }),
      shortcutHintText: t('builderHistoryShortcutHint', { shortcut: undoShortcutLabel }),
      t,
      lang,
    }),
    [undoPreview, t, lang, undoShortcutLabel],
  )
  const redoTooltipText = useMemo(
    () => formatHistoryTooltipText({
      descriptor: redoPreview?.descriptor ?? null,
      fallbackText: t('builderRedoTooltip', { shortcut: redoShortcutLabel }),
      shortcutHintText: t('builderHistoryShortcutHint', { shortcut: redoShortcutLabel }),
      t,
      lang,
    }),
    [redoPreview, t, lang, redoShortcutLabel],
  )

  // Context-menu anchor lives in local state so right-click overlays stay decoupled from BuilderPanel.
  const [historyMenuState, setHistoryMenuState] = useState<{ open: boolean; x: number; y: number } | null>(null)
  const historyMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const historyMenuOpen = Boolean(historyMenuState?.open)
  const historyMenuAnchor = historyMenuOpen && historyMenuState
    ? { top: historyMenuState.y, left: historyMenuState.x }
    : null
  const closeHistoryMenu = useCallback(() => { setHistoryMenuState(null) }, [])

  // Shared hook keeps the menu closed when users click outside via either mouse button.
  const { contextMenuGuard: historyMenuGuard } = useContextMenuPaperGuard({
    open: historyMenuOpen,
    onClose: closeHistoryMenu,
    menuRef: historyMenuPaperRef,
  })

  // Hints teach the context-menu affordance; once dismissed they never return.
  // Disabled while the menu is open so the overlay does not compete with the menu itself.
  const { triggerProps: historyHintTriggerProps, overlay: historyHintOverlay, onOpen: onHistoryHintOpen } = useContextMenuButtonHint(CONTEXT_HINT_IDS.builderHistoryMenu, {
    enabled: !historyMenuOpen,
    text: t('contextMenuHint'),
  })

  // Pointer-tracking handlers drive both hint positioning and menu activation.
  const handleHistoryContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onHistoryHintOpen()
    setHistoryMenuState({ open: true, x: event.clientX, y: event.clientY })
  }, [onHistoryHintOpen])

  // Prevent nested context-menus from fighting for the secondary-click gesture.
  const handleHistoryMenuContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  // Clearing history or jumping to entries both dismiss the hint immediately so the UX stays tidy.
  const handleRequestClearHistory = useCallback(() => {
    onHistoryHintOpen()
    onRequestClearHistory()
  }, [onHistoryHintOpen, onRequestClearHistory])
  const handleHistoryEntrySelect = useCallback((index: number) => {
    onHistoryHintOpen()
    closeHistoryMenu()
    onJumpToHistoryIndex(index)
  }, [closeHistoryMenu, onHistoryHintOpen, onJumpToHistoryIndex])

  return {
    undoTooltipText,
    redoTooltipText,
    historyMenuOpen,
    historyMenuAnchor,
    historyMenuPaperRef,
    historyMenuGuard,
    closeHistoryMenu,
    handleHistoryContextMenu,
    historyHintTriggerProps,
    handleHistoryMenuContextMenu,
    handleRequestClearHistory,
    handleHistoryEntrySelect,
    historyHintOverlay,
  }
}
