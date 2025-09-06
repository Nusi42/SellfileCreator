/**
 * useMinimaDialog
 *
 * Tiny helper to encapsulate the Minima dialog open/close state. Keeps
 * BuilderPanel lean and mirrors the pattern used for the Manage Colors dialog.
 */
import { useState } from 'react'

export function useMinimaDialog() {
  const [open, setOpen] = useState(false)
  const openDialog = () => setOpen(true)
  const closeDialog = () => setOpen(false)
  return { open, openDialog, closeDialog }
}

