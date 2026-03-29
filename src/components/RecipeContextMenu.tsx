import React from 'react'
import { Divider, Menu, MenuItem } from '@mui/material'
import { useI18n } from '../lib/i18n'
import ContextMenuPaper, { buildContextMenuPaperSlotProps, type ContextMenuPaperGuardToken } from './ContextMenuPaper'

type MenuClickHandler = () => void

// ── shared per-chip action builder ───────────────────────────────────────────

/**
 * Parameters for the common per-chip portion of a context menu.
 * Both RecipeChip and SafeguardChipsPanel pass these; unique-to-one-panel actions
 * (insertAsSafeguard, copyRecipeDev, deleteAll, …) are spread in by each caller.
 */
export type ChipContextMenuActionParams = {
  onDuplicate?: MenuClickHandler
  onMoveTop?: MenuClickHandler
  onMoveUp?: MenuClickHandler
  onMoveDown?: MenuClickHandler
  onMoveBottom?: MenuClickHandler
  onCopy?: MenuClickHandler
  onPasteAfter?: MenuClickHandler
  onDelete?: MenuClickHandler
  /** True when the chip is the first item (disables move-up/move-top). */
  isFirst: boolean
  /** True when the chip is the last item (disables move-down/move-bottom). */
  isLast: boolean
}

/**
 * Builds the duplicate / move / copy / paste-after / delete subset of RecipeContextMenuActions
 * that is identical for both recipe chips and safeguard chips.
 * Callers spread this into their full actions object and add panel-specific entries.
 */
export function buildChipContextMenuActions(
  params: ChipContextMenuActionParams,
): Pick<RecipeContextMenuActions, 'duplicate' | 'moveTop' | 'moveUp' | 'moveDown' | 'moveBottom' | 'copyRecipe' | 'pasteAfter' | 'deleteRecipe'> {
  return {
    ...(params.onDuplicate ? { duplicate: params.onDuplicate } : {}),
    ...(params.onMoveTop ? { moveTop: { handler: params.onMoveTop, disabled: params.isFirst } } : {}),
    ...(params.onMoveUp ? { moveUp: { handler: params.onMoveUp, disabled: params.isFirst } } : {}),
    ...(params.onMoveDown ? { moveDown: { handler: params.onMoveDown, disabled: params.isLast } } : {}),
    ...(params.onMoveBottom ? { moveBottom: { handler: params.onMoveBottom, disabled: params.isLast } } : {}),
    ...(params.onCopy ? { copyRecipe: params.onCopy } : {}),
    ...(params.onPasteAfter ? { pasteAfter: params.onPasteAfter } : {}),
    ...(params.onDelete ? { deleteRecipe: params.onDelete } : {}),
  }
}

type MoveAction = {
  handler: MenuClickHandler
  disabled?: boolean
}

type HighlightableAction = {
  handler: MenuClickHandler
  disabled: boolean
  labelKey?: string
  onHighlightChange?: (active: boolean) => void
}

type SelectAllAction = {
  handler: MenuClickHandler
  disabled: boolean
  labelKey: string
}

export interface RecipeContextMenuActions {
  insertAsSafeguard?: { handler: MenuClickHandler; label: string }
  applyAsSafeguard?: { handler: MenuClickHandler; label: string }
  duplicate?: MenuClickHandler
  moveTop?: MoveAction
  moveUp?: MoveAction
  moveDown?: MoveAction
  moveBottom?: MoveAction
  copyRecipe?: MenuClickHandler
  pasteAfter?: MenuClickHandler
  pasteAtEnd?: MenuClickHandler
  copyRecipeDev?: MenuClickHandler
  deleteRecipe?: MenuClickHandler
  selectAll?: SelectAllAction
  copyAll?: { handler: MenuClickHandler; disabled: boolean; labelKey?: string }
  deleteAll?: HighlightableAction
}

interface RecipeContextMenuProps {
  open: boolean
  anchorPosition: { top: number; left: number } | null
  onClose: () => void
  paperRef: React.MutableRefObject<HTMLDivElement | null>
  paperDataTourId: string
  onPaperContextMenu: (event: React.MouseEvent) => void
  actions: RecipeContextMenuActions
  contextMenuGuard: ContextMenuPaperGuardToken
}

function wrapClick(onClose: () => void, handler?: MenuClickHandler) {
  return (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClose()
    if (handler) handler()
  }
}

export function RecipeContextMenu({
  open,
  anchorPosition,
  onClose,
  paperRef,
  paperDataTourId,
  onPaperContextMenu,
  actions,
  contextMenuGuard,
}: RecipeContextMenuProps) {
  const { t } = useI18n()

  const primaryItems: React.ReactNode[] = []
  const secondaryItems: React.ReactNode[] = []

  if (actions.duplicate) {
    primaryItems.push(
      <MenuItem key="duplicate" onClick={wrapClick(onClose, actions.duplicate)}>
        {t('chipMenuDuplicate')}
      </MenuItem>,
    )
  }
  if (actions.moveTop) {
    primaryItems.push(
      <MenuItem
        key="moveTop"
        onClick={wrapClick(onClose, actions.moveTop.handler)}
        disabled={Boolean(actions.moveTop.disabled)}
      >
        {t('chipMenuMoveTop')}
      </MenuItem>,
    )
  }
  if (actions.moveUp) {
    primaryItems.push(
      <MenuItem
        key="moveUp"
        onClick={wrapClick(onClose, actions.moveUp.handler)}
        disabled={Boolean(actions.moveUp.disabled)}
      >
        {t('chipMenuMoveUp')}
      </MenuItem>,
    )
  }
  if (actions.moveDown) {
    primaryItems.push(
      <MenuItem
        key="moveDown"
        onClick={wrapClick(onClose, actions.moveDown.handler)}
        disabled={Boolean(actions.moveDown.disabled)}
      >
        {t('chipMenuMoveDown')}
      </MenuItem>,
    )
  }
  if (actions.moveBottom) {
    primaryItems.push(
      <MenuItem
        key="moveBottom"
        onClick={wrapClick(onClose, actions.moveBottom.handler)}
        disabled={Boolean(actions.moveBottom.disabled)}
      >
        {t('chipMenuMoveBottom')}
      </MenuItem>,
    )
  }
  if (actions.insertAsSafeguard) {
    primaryItems.push(
      <MenuItem key="insertAsSafeguard" onClick={wrapClick(onClose, actions.insertAsSafeguard.handler)}>
        {actions.insertAsSafeguard.label}
      </MenuItem>,
    )
  }
  if (actions.applyAsSafeguard) {
    primaryItems.push(
      <MenuItem key="applyAsSafeguard" onClick={wrapClick(onClose, actions.applyAsSafeguard.handler)}>
        {actions.applyAsSafeguard.label}
      </MenuItem>,
    )
  }
  if (actions.copyRecipe) {
    primaryItems.push(
      <MenuItem key="copyRecipe" onClick={wrapClick(onClose, actions.copyRecipe)}>
        {t('chipMenuCopy')}
      </MenuItem>,
    )
  }
  if (actions.pasteAfter) {
    primaryItems.push(
      <MenuItem key="pasteAfter" onClick={wrapClick(onClose, actions.pasteAfter)}>
        {t('chipMenuPasteAfter')}
      </MenuItem>,
    )
  }

  if (actions.copyRecipeDev) {
    primaryItems.push(
      <MenuItem
        key="copyDev"
        onClick={async (event: React.MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          try {
            await actions.copyRecipeDev?.()
          } catch {
            // Ignore clipboard failures; dev helper mirrors previous behavior.
          }
        }}
      >
        Copy recipe + rules (dev)
      </MenuItem>,
    )
  }
  if (actions.deleteRecipe) {
    primaryItems.push(
      <MenuItem key="deleteRecipe" onClick={wrapClick(onClose, actions.deleteRecipe)} sx={{ color: 'error.main' }}>
        {t('chipMenuDelete')}
      </MenuItem>,
    )
  }
  if (actions.selectAll) {
    secondaryItems.push(
      <MenuItem
        key="selectAll"
        onClick={wrapClick(onClose, actions.selectAll.handler)}
        disabled={actions.selectAll.disabled}
      >
        {t(actions.selectAll.labelKey)}
      </MenuItem>,
    )
  }
  if (actions.copyAll) {
    secondaryItems.push(
      <MenuItem
        key="copyAll"
        onClick={wrapClick(onClose, actions.copyAll.handler)}
        disabled={actions.copyAll.disabled}
      >
        {t(actions.copyAll.labelKey ?? 'chipsMenuCopyAllRecipes')}
      </MenuItem>,
    )
  }
  if (actions.pasteAtEnd) {
    secondaryItems.push(
      <MenuItem key="pasteAtEnd" onClick={wrapClick(onClose, actions.pasteAtEnd)}>
        {t('chipsMenuPasteAtEnd')}
      </MenuItem>,
    )
  }
  if (actions.deleteAll) {
    secondaryItems.push(
      <MenuItem
        key="deleteAll"
        onMouseEnter={() => { actions.deleteAll?.onHighlightChange?.(!actions.deleteAll?.disabled) }}
        onMouseLeave={() => { actions.deleteAll?.onHighlightChange?.(false) }}
        onClick={wrapClick(onClose, actions.deleteAll.handler)}
        disabled={actions.deleteAll.disabled}
        sx={{ color: 'error.main', opacity: actions.deleteAll.disabled ? 0.6 : 1 }}
      >
        {t(actions.deleteAll.labelKey ?? 'deleteRecipes')}
      </MenuItem>,
    )
  }

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      {...(anchorPosition ? { anchorPosition } : {})}
      slotProps={{
        paper: { ...buildContextMenuPaperSlotProps({
          component: ContextMenuPaper,
          contextMenuGuard,
          onRequestClose: onClose,
          closeLabel: t('close'),
          'data-tour-id': paperDataTourId,
          onContextMenu: onPaperContextMenu,
        }), ref: paperRef },
      }}
    >
      {primaryItems}
      {primaryItems.length > 0 && secondaryItems.length > 0 ? <Divider sx={{ my: 0, minHeight: 0 }} /> : null}
      {secondaryItems}
    </Menu>
  )
}

export default RecipeContextMenu
