/**
 * useManageColorsDialog
 *
 * Encapsulates the Manage Colors dialog open/close state together with the
 * persisted substat color map. Keeps App lean by grouping related concerns.
 */
import { useCallback, useState } from 'react'
import { useSubstatColors, defaultSubstatColorMapV6 } from './useSubstatColors'

export function useManageColorsDialog() {
  const [open, setOpen] = useState(false)
  const [substatColors, setSubstatColors] = useSubstatColors()

  // Stable references so memoized consumers (e.g. GearInspectorItemsGrid) are not
  // forced to re-render just because the dialog's parent re-renders.
  const openDialog = useCallback(() => setOpen(true), [])
  const closeDialog = useCallback(() => setOpen(false), [])
  const resetColors = useCallback(() => {
    setSubstatColors(defaultSubstatColorMapV6())
  }, [setSubstatColors])

  return {
    open,
    openDialog,
    closeDialog,
    substatColors,
    setSubstatColors,
    resetColors,
  }
}
