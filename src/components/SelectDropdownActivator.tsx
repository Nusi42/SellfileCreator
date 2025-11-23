import { Box } from '@mui/material'
import type { MouseEvent, TouchEvent } from 'react'
import { SETS_SELECT_DROPDOWN_ICON_HITBOX_PX } from '../lib/constants'

export interface SelectDropdownActivatorProps {
  getDisplayNode: () => HTMLElement | null
  widthPx?: number | undefined
}

// Transparent hitbox that forwards pointer interactions on the dropdown icon
// back to the Select display element so MUI still opens the menu when we
// overlay additional affordances (e.g., the inline clear button). Width is
// override-able so the empty clear-button gutter can also trigger the menu.
export default function SelectDropdownActivator({ getDisplayNode, widthPx }: SelectDropdownActivatorProps) {
  const trigger = () => {
    const displayNode = getDisplayNode()
    if (!displayNode) return
    const doc = displayNode.ownerDocument ?? document
    const view = doc.defaultView ?? window
    try {
      const synthetic = new view.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
      displayNode.dispatchEvent(synthetic)
      return
    } catch {
      try {
        const legacy = doc.createEvent('MouseEvents')
        legacy.initMouseEvent('mousedown', true, true, view, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
        displayNode.dispatchEvent(legacy)
      } catch {
        // Fall through when dispatching fails; the native click already focused the field.
      }
    }
  }

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    trigger()
  }

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    trigger()
  }

  return (
    <Box
      role="presentation"
      aria-hidden
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: `${widthPx ?? SETS_SELECT_DROPDOWN_ICON_HITBOX_PX}px`,
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
    />
  )
}
