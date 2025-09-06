/**
 * useConfirmDialog
 *
 * Tiny helper for confirm modal open/close state.
 */
import { useState } from 'react'

export function useConfirmDialog() {
  const [open, setOpen] = useState(false)
  const openDialog = () => setOpen(true)
  const closeDialog = () => setOpen(false)
  return { open, openDialog, closeDialog, setOpen }
}

