/**
 * useSubstatTargetsDialog
 *
 * Tiny helper to encapsulate the Substat Target Values dialog open/close state.
 * Keeps BuilderPanel lean and mirrors the pattern used for the Manage Colors dialog.
 */
import { useState } from 'react'

export function useSubstatTargetsDialog() {
  const [open, setOpen] = useState(false)
  const openDialog = () => setOpen(true)
  const closeDialog = () => setOpen(false)
  return { open, openDialog, closeDialog }
}
