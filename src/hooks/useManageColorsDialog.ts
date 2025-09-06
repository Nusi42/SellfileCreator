/**
 * useManageColorsDialog
 *
 * Encapsulates the Manage Colors dialog open/close state together with the
 * persisted substat color map. Keeps App lean by grouping related concerns.
 */
import { useState } from 'react'
import { useSubstatColors, defaultSubstatColorMapV5 } from './useSubstatColors'

export function useManageColorsDialog() {
  const [open, setOpen] = useState(false)
  const [substatColors, setSubstatColors] = useSubstatColors()

  const openDialog = () => setOpen(true)
  const closeDialog = () => setOpen(false)
  const resetColors = () => setSubstatColors(defaultSubstatColorMapV5())

  return {
    open,
    openDialog,
    closeDialog,
    substatColors,
    setSubstatColors,
    resetColors,
  }
}

