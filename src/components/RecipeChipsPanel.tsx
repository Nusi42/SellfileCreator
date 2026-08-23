import React, { memo } from 'react'
import { Box, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import {
  UI_BG_HOVER_DANGER_TRANSITION,
  SCROLLING_TOOLTIP_HIDE_MS,
} from '../lib/constants'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import RecipeChip from './RecipeChip'
import type { BuilderRecipe, SellfileExportMode } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useContextMenuButtonHint } from '../hooks/useContextMenuButtonHint'
import { CONTEXT_HINT_IDS } from '../hooks/contextMenuHintIds'
import { RecipeContextMenu } from './RecipeContextMenu'
import { useGearSetCatalogVersion } from '../hooks/useGearSetCatalogVersion'
import { useChipListDnd } from '../hooks/useChipListDnd'
import { useChipListKeyboard } from '../hooks/useChipListKeyboard'
import { useShowTagsInChipsPreference } from '../state/builderPreferences'
import { TINT } from '../lib/colorTints'

// Recipe chips and individual chip right-clicks share the same hint ID so right-clicking
// anywhere in the list dismisses the hint — not just on empty space or just on a chip.

/**
 * Derive a stable, unique key for each recipe in a list.
 * Combines several immutable recipe fields into a fingerprint;
 * appends an occurrence counter when two recipes share the same fingerprint
 * (e.g. after duplication).
 */
function buildRecipeKeys(recipes: BuilderRecipe[]): string[] {
  const counts = new Map<string, number>()
  return recipes.map((r) => {
    const fp = `${r.appearance?.name ?? ''}_${r.exportMode}_${r.keep}_${r.rankCode}_${r.rarityCode}`
    const n = (counts.get(fp) ?? 0) + 1
    counts.set(fp, n)
    return `${fp}__${n}`
  })
}

function RecipeChipsPanel(props: {
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  recipes: BuilderRecipe[]
  exportModeOverrides?: SellfileExportMode[]
  maxHeightPx: number
  // Zoom-corrected available height from useBuilderPreviewLayout.
  // null = not in side-by-side mode (legacy minHeight=maxHeight behaviour).
  // non-null (including 0) = side-by-side mode; paper has a fixed maxHeight so minHeight
  // is set to 0 and flex fills the available space.
  chipsAvailableHeight?: number | null
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
  onCopyAllRecipes: () => void
  onPasteAtEnd: () => void
  onSelectAll: () => void
  selectAllLabelKey: string
  onCopyRecipe: (idx: number) => void
  onCopyRecipeDev?: (idx: number) => void
  onClearSelection: () => void
  duplicateOfIndices: Array<number | null>
  visibleIndices?: ReadonlySet<number> | null
  onDeleteSelected: () => void
  onDeleteAll: () => void
  deleteAllDisabled: boolean
  highlightDelete: boolean
  onHighlightDelete: (active: boolean) => void
  onInsertAsSafeguard?: (idx: number) => void
  insertAsSafeguardLabel?: string
  onApplyAsSafeguard?: (idx: number) => void
  applyAsSafeguardLabel?: string
  onPrepareDragSelection: (idx: number) => number[]
  onReorderRecipes: (movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void
  /** Keyboard arrow/page/home/end navigation — called with the target visible item index. */
  onNavigateTo: (idx: number) => void
}) {
  const { t } = useI18n()
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  const [showTagsInChips, setShowTagsInChips] = useShowTagsInChipsPreference()
  const {
    containerRef,
    recipes,
    exportModeOverrides,
    maxHeightPx,
    chipsAvailableHeight,
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
    onCopyAllRecipes,
    onPasteAtEnd,
    onSelectAll,
    selectAllLabelKey,
    onCopyRecipe,
    onCopyRecipeDev,
    onClearSelection,
    duplicateOfIndices,
    visibleIndices,
    onDeleteSelected,
    onDeleteAll,
    deleteAllDisabled,
    highlightDelete,
    onHighlightDelete,
    onInsertAsSafeguard,
    insertAsSafeguardLabel,
    onApplyAsSafeguard,
    applyAsSafeguardLabel,
    onPrepareDragSelection,
    onReorderRecipes,
    onNavigateTo,
  } = props

  // Unified chip + background context menu state — chipIdx < 0 means background right-click.
  const [chipMenu, setChipMenu] = React.useState<null | { chipIdx: number; x: number; y: number }>(null)
  const menuPaperRef = React.useRef<HTMLDivElement | null>(null)
  const closeMenu = React.useCallback(() => {
    setChipMenu(null)
    onHighlightDelete(false)
  }, [onHighlightDelete])
  const handleMenuContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])
  // Guard the menu so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard } = useContextMenuPaperGuard({
    open: Boolean(chipMenu),
    onClose: closeMenu,
    menuRef: menuPaperRef,
  })
  // Hint disabled while a menu is open (drag suppression is checked per-event below).
  const chipsHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.builderRecipeChips, {
    enabled: !chipMenu,
    text: t('contextMenuHint'),
  })
  const { onOpen: onChipsHintOpen } = chipsHint
  // Chip right-click: delegate to panel-level menu with the chip's index.
  const handleChipContextMenu = React.useCallback((e: React.MouseEvent, idx: number) => {
    onChipsHintOpen()
    setChipMenu({ chipIdx: idx, x: e.clientX, y: e.clientY })
  }, [onChipsHintOpen])
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
  // Stable, content-derived keys so the chip list avoids index-based React keys.
  const recipeStableKeys = React.useMemo(() => buildRecipeKeys(recipes), [recipes])
  const selectedSet = React.useMemo(() => new Set(selectedIndices), [selectedIndices])
  const visibleSet = visibleIndices ?? null
  const visibleCount = visibleSet
    ? recipes.reduce((count, _recipe, idx) => count + (visibleSet.has(idx) ? 1 : 0), 0)
    : recipes.length
  const renderedIndices = React.useMemo(() => {
    if (!visibleSet) return recipes.map((_, idx) => idx)
    const order: number[] = []
    recipes.forEach((_recipe, idx) => {
      if (visibleSet.has(idx)) order.push(idx)
    })
    return order
  }, [recipes, visibleSet])
  // In side-by-side mode (chipsAvailableHeight is non-null), the Paper is locked to a fixed
  // maxHeight that acts as the top-down constraint. Setting minHeight to 0 lets the chips
  // container fill available flex space naturally — the Paper's overflow:hidden is the safety net.
  // In stacked / non-measured mode (null), keep minHeight=maxHeight to stabilise the paper
  // height across mode switches with different chip counts.
  const minHeightPx = React.useMemo(() => {
    if (maxHeightPx <= 0) return 0
    if (chipsAvailableHeight != null) return 0
    return maxHeightPx
  }, [maxHeightPx, chipsAvailableHeight])

  // Cursor is the last selected index, used as the navigation anchor.
  const cursorIdx = selectedIndices.length > 0 ? (selectedIndices[selectedIndices.length - 1] ?? null) : null

  // Shared SSOT hook: keyboard shortcuts (Delete, Ctrl+A), navigation (arrows/page/home/end),
  // focus ring, empty-click-to-deselect.
  const {
    showFocusRing,
    handleKeyDown: chipListHandleKeyDown,
    handleFocus: chipListHandleFocus,
    handleBlur: chipListHandleBlur,
    handleMouseDown: chipListHandleMouseDown,
    handleClick: chipListHandleClick,
  } = useChipListKeyboard({
    visibleCount,
    selectedCount: selectedIndices.length,
    onDeleteSelected,
    onSelectAll,
    onClearSelection,
    visibleOrderedIndices: renderedIndices,
    cursorIdx,
    onNavigate: onNavigateTo,
    chipIndexAttr: 'data-recipe-chip-index',
    containerRef,
  })
  const dragAllowed = recipes.length > 1 && renderedIndices.length > 0

  const {
    dropGuide,
    handleItemPointerDown,
    hasActiveDrag,
    dragGhostIndices: dragGhostSet,
  } = useChipListDnd({
    containerRef,
    itemIndexAttr: 'data-recipe-chip-index',
    onReorder: onReorderRecipes,
    onPrepareSelection: onPrepareDragSelection,
    copyModeEnabled: true,
    enabled: dragAllowed,
  })

  // Build the context-menu actions object outside JSX to avoid an IIFE in JSX.
  const chipMenuActions = (() => {
    if (!chipMenu) return {}
    const idx = chipMenu.chipIdx
    // idx < 0 means background right-click — show list-level actions only.
    const isChipMenu = idx >= 0
    const isFirst = idx <= 0
    const isLast = idx >= recipes.length - 1
    return {
      ...(isChipMenu ? {
        duplicate:  () => onDuplicate(idx),
        moveTop:    { handler: () => onMoveTop(idx),    disabled: isFirst },
        moveUp:     { handler: () => onMoveUp(idx),     disabled: isFirst },
        moveDown:   { handler: () => onMoveDown(idx),   disabled: isLast },
        moveBottom: { handler: () => onMoveBottom(idx), disabled: isLast },
        copyRecipe: () => onCopyRecipe(idx),
        ...(onCopyRecipeDev ? { copyRecipeDev: () => onCopyRecipeDev(idx) } : {}),
        pasteAfter: () => onPasteAfter(idx),
        ...(onInsertAsSafeguard ? { insertAsSafeguard: { handler: () => onInsertAsSafeguard(idx), label: insertAsSafeguardLabel ?? '' } } : {}),
        ...(onApplyAsSafeguard  ? { applyAsSafeguard:  { handler: () => onApplyAsSafeguard(idx),  label: applyAsSafeguardLabel  ?? '' } } : {}),
        deleteRecipe: () => onDelete(idx),
      } : {}),
      pasteAtEnd:     onPasteAtEnd,
      selectAll:      { handler: onSelectAll, disabled: visibleCount === 0, labelKey: selectAllLabelKey },
      clearSelection: { handler: onClearSelection, disabled: selectedIndices.length === 0, labelKey: 'chipsMenuClearSelection' },
      copyAll:        { handler: onCopyAllRecipes, disabled: recipes.length === 0 },
      toggleShowTagsInChips: { checked: showTagsInChips, handler: () => setShowTagsInChips(!showTagsInChips) },
      deleteAll: { handler: onDeleteAll, disabled: deleteAllDisabled, onHighlightChange: onHighlightDelete },
    }
  })()

  return (
    <>
      <Box
        ref={containerRef}
        tabIndex={0}
        sx={(theme) => {
          const gutterPadding = theme.spacing(1)
          return {
            // No top margin: the list is the first child of its own paper, so the paper's own
            // padding is the whole inset. (This was the gap below the form back when the form and
            // the chips shared a single paper.)
            mt: 0,
            display: 'flex',
            // Stack full-width chips vertically; no wrap logic needed.
            flexDirection: 'column',
            width: '100%',
            flexGrow: 1,
            flexBasis: 0,
            // Preserve the original chip spacing.
            gap: 0.75,
            maxHeight: maxHeightPx,
            // Only vertical scrolling is needed for the single-column list.
            overflowY: 'auto',
            overflowX: 'hidden',
            pr: gutterPadding,
            minHeight: minHeightPx,
            // Stretch children so chips fill the row.
            alignItems: 'stretch',
            position: 'relative',
            transition: UI_BG_HOVER_DANGER_TRANSITION,
            backgroundColor: highlightDelete
              ? theme.custom.dangerTintBg
              : 'transparent',
            borderRadius: 1,
            outline: 'none',
            boxShadow: showFocusRing ? `0 0 0 2px ${(theme.vars?.palette.primary.main ?? theme.palette.primary.main)}` : 'none',
            // Firefox needs explicit padding to mimic Chrome's stable scrollbar gutter without touching other browsers.
            ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: gutterPadding }),
          }
        }}
        onScroll={() => {
          markScrolling()
        }}
        onMouseMove={(e) => {
          if (hasActiveDrag) return
          chipsHint.triggerProps.onMouseMove(e)
        }}
        onMouseLeave={chipsHint.triggerProps.onMouseLeave}
        onContextMenu={(e) => {
          try {
            e.preventDefault()
            e.stopPropagation()
          } catch {}
          onChipsHintOpen()
          // chipIdx -1 signals background click (no chip selected).
          setChipMenu({ chipIdx: -1, x: e.clientX, y: e.clientY })
        }}
        onClick={chipListHandleClick}
        onKeyDown={chipListHandleKeyDown}
        onFocus={(e) => {
          // Delegate focus-ring tracking to the shared hook, then handle hint separately.
          chipListHandleFocus(e)
          if (e.currentTarget === e.target) {
            const rect = e.currentTarget.getBoundingClientRect()
            chipsHint.setPosition({ x: rect.left + rect.width / 2, y: rect.top })
          }
        }}
        onBlur={() => {
          chipListHandleBlur()
          chipsHint.triggerProps.onMouseLeave()
        }}
        onMouseDown={chipListHandleMouseDown}
      >
      {dropGuide ? (
          <Box
            sx={(theme) => ({
              position: 'absolute',
              top: dropGuide.top,
              left: dropGuide.left,
              width: dropGuide.width,
              height: dropGuide.height,
              backgroundColor: (theme.vars?.palette.primary.main ?? theme.palette.primary.main),
              borderRadius: dropGuide.height <= 4 ? 2 : 1,
              pointerEvents: 'none',
              boxShadow: `0 0 8px ${TINT.primaryGlow}`,
              zIndex: 5,
            })}
          />
        ) : null}
        {recipes.length === 0 ? (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>{t('chipsEmptyPasteHint')}</Typography>
          </Box>
        ) : visibleCount === 0 ? (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>{t('chipsFilteredEmpty')}</Typography>
          </Box>
        ) : (
          recipes.map((c, idx) => {
            if (visibleSet && !visibleSet.has(idx)) return null
            // Respect recipe overrides when provided by the parent.
            const overrideMode = exportModeOverrides?.[idx]
            const mode = overrideMode ?? c.exportMode
            const isSeparator = mode === 'separator'
            const duplicateIdx = duplicateOf[idx]
            const ghostedWhileDragging = hasActiveDrag && dragGhostSet.has(idx)
            // Keep separators draggable so multi-select moves always have an anchor, even when the first selected recipe is a divider.
            const dragEnabled = dragAllowed
            const pointerHandlers: { onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void } | null = dragEnabled
              ? {
                  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => handleItemPointerDown(event, idx),
                }
              : null
            return (
              <RecipeChip
                key={recipeStableKeys[idx]}
                index={idx}
                recipe={c}
                {...(overrideMode ? { exportModeOverride: overrideMode } : {})}
                gearSetCatalogVersion={gearSetCatalogVersion}
                metasets={metasets}
                substatColors={substatColors}
                selected={selectedSet.has(idx)}
                isDuplicate={!isSeparator && duplicateIdx !== null}
                {...(!isSeparator && duplicateIdx !== null ? { duplicateOfIndex: duplicateIdx as number } : {})}
                onSelect={(e) => onSelect(e, idx)}
                onDelete={() => onDelete(idx)}
                onDuplicate={() => onDuplicate(idx)}
                onMoveUp={() => onMoveUp(idx)}
                onMoveDown={() => onMoveDown(idx)}
                isLast={idx === recipes.length - 1}
                onHover={(enter) => onHoverIdx(enter ? idx : null)}
                onContextMenu={handleChipContextMenu}
                hideTooltip={hasActiveDrag}
                dragEnabled={dragEnabled}
                {...(pointerHandlers ?? {})}
                ghostedWhileDragging={ghostedWhileDragging}
                showTagsChips={showTagsInChips}
              />
            )
          })
        )}
      </Box>
      {chipsHint.overlay}
      <RecipeContextMenu
        open={Boolean(chipMenu)}
        anchorPosition={chipMenu ? { top: chipMenu.y, left: chipMenu.x } : null}
        onClose={closeMenu}
        paperRef={menuPaperRef}
        paperDataTourId="chips.menu"
        onPaperContextMenu={handleMenuContextMenu}
        contextMenuGuard={contextMenuGuard}
        actions={chipMenuActions}
      />
    </>
  )
}

function areRecipeChipsPanelPropsEqual(prev: Readonly<React.ComponentProps<typeof RecipeChipsPanel>>, next: Readonly<React.ComponentProps<typeof RecipeChipsPanel>>): boolean {
  return prev.containerRef === next.containerRef
    && prev.recipes === next.recipes
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
    && prev.onCopyAllRecipes === next.onCopyAllRecipes
    && prev.onPasteAtEnd === next.onPasteAtEnd
    && prev.onSelectAll === next.onSelectAll
    && prev.selectAllLabelKey === next.selectAllLabelKey
    && prev.onCopyRecipe === next.onCopyRecipe
    && prev.onCopyRecipeDev === next.onCopyRecipeDev
    && prev.onClearSelection === next.onClearSelection
    && prev.duplicateOfIndices === next.duplicateOfIndices
    && prev.visibleIndices === next.visibleIndices
    && prev.onDeleteSelected === next.onDeleteSelected
    && prev.onDeleteAll === next.onDeleteAll
    && prev.highlightDelete === next.highlightDelete
    && prev.onHighlightDelete === next.onHighlightDelete
    && prev.onInsertAsSafeguard === next.onInsertAsSafeguard
    && prev.insertAsSafeguardLabel === next.insertAsSafeguardLabel
    && prev.onApplyAsSafeguard === next.onApplyAsSafeguard
    && prev.applyAsSafeguardLabel === next.applyAsSafeguardLabel
    && prev.onPrepareDragSelection === next.onPrepareDragSelection
    && prev.onReorderRecipes === next.onReorderRecipes
    && prev.onNavigateTo === next.onNavigateTo
}

export default memo(RecipeChipsPanel, areRecipeChipsPanelPropsEqual)
