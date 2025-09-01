/**
 * CopyDialog
 *
 * Fallback manual copy dialog shown when browser blocks clipboard writes.
 */
import React from 'react'
import { Dialog, DialogActions, DialogContent, DialogTitle, Button, TextField, Typography } from '@mui/material'

export default function CopyDialog({
  open,
  text,
  onClose,
  onTextChange,
  inputRef,
}: {
  open: boolean
  text: string
  onClose: () => void
  onTextChange: (v: string) => void
  inputRef?: React.Ref<HTMLTextAreaElement | HTMLInputElement>
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Copy Config JSON</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Your browser blocked clipboard access. Select and copy manually.
        </Typography>
        <TextField
          multiline
          minRows={8}
          maxRows={16}
          fullWidth
          value={text}
          {...(inputRef ? { inputRef } : {})}
          onFocus={(e) => { try { (e.target as HTMLTextAreaElement).select() } catch {} }}
          onChange={(e) => onTextChange(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
