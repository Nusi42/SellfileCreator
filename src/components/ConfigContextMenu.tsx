import React from 'react'
import { Divider, Menu, MenuItem } from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { useI18n } from '../lib/i18n'
import ContextMenuPaper from './ContextMenuPaper'

type MenuClickHandler = () => void

type MoveAction = {
  handler: MenuClickHandler
  disabled?: boolean
}

type HighlightableAction = {
  handler: MenuClickHandler
  disabled: boolean
  onHighlightChange?: (active: boolean) => void
}

type SelectAllAction = {
  handler: MenuClickHandler
  disabled: boolean
  labelKey: string
}

export interface ConfigContextMenuActions {
  duplicate?: MenuClickHandler
  moveTop?: MoveAction
  moveUp?: MoveAction
  moveDown?: MoveAction
  moveBottom?: MoveAction
  copyConfig?: MenuClickHandler
  pasteAfter?: MenuClickHandler
  pasteAtEnd?: MenuClickHandler
  copyConfigDev?: MenuClickHandler
  deleteConfig?: MenuClickHandler
  selectAll?: SelectAllAction
  copyAll?: { handler: MenuClickHandler; disabled: boolean }
  deleteAll?: HighlightableAction
}

interface ConfigContextMenuProps {
  open: boolean
  anchorPosition: { top: number; left: number } | null
  onClose: () => void
  paperRef: React.MutableRefObject<HTMLDivElement | null>
  paperDataTourId: string
  onPaperContextMenu: (event: React.MouseEvent) => void
  actions: ConfigContextMenuActions
}

function wrapClick(onClose: () => void, handler?: MenuClickHandler) {
  return (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onClose()
    if (handler) handler()
  }
}

export function ConfigContextMenu({
  open,
  anchorPosition,
  onClose,
  paperRef,
  paperDataTourId,
  onPaperContextMenu,
  actions,
}: ConfigContextMenuProps) {
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
  if (actions.copyConfig) {
    primaryItems.push(
      <MenuItem key="copyConfig" onClick={wrapClick(onClose, actions.copyConfig)}>
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

  if (actions.copyConfigDev) {
    primaryItems.push(
      <MenuItem
        key="copyDev"
        onClick={async (event: React.MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          onClose()
          try {
            await actions.copyConfigDev?.()
          } catch {
            // Ignore clipboard failures; dev helper mirrors previous behavior.
          }
        }}
      >
        Copy config + rules (dev)
      </MenuItem>,
    )
  }
  if (actions.deleteConfig) {
    primaryItems.push(
      <MenuItem key="deleteConfig" onClick={wrapClick(onClose, actions.deleteConfig)} sx={{ color: 'error.main' }}>
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
        {t('chipsMenuCopyAllConfigs')}
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
        {t('deleteConfigs')}
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
        paper: {
          component: ContextMenuPaper,
          onRequestClose: onClose,
          closeLabel: t('close'),
          ref: paperRef,
          'data-tour-id': paperDataTourId,
          onContextMenu: onPaperContextMenu,
        } as unknown as MuiPaperProps,
      }}
    >
      {primaryItems}
      {primaryItems.length > 0 && secondaryItems.length > 0 ? <Divider sx={{ my: 0, minHeight: 0 }} /> : null}
      {secondaryItems}
    </Menu>
  )
}

export default ConfigContextMenu
