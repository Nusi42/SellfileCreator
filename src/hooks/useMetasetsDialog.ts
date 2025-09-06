/**
 * useMetasetsDialog
 *
 * Manages open/close state for the Manage Metasets dialog.
 */
import { useState } from 'react'

export function useMetasetsDialog() {
  const [open, setOpen] = useState(false)
  const openDialog = () => setOpen(true)
  const closeDialog = () => setOpen(false)
  return { open, openDialog, closeDialog }
}

