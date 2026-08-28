import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

/**
 * A confirmation whose choices are deliberately EQUAL: every action button wears the same
 * styling, so colour never implies a preferred answer. One definition of that rule for the
 * dialogs that ask before something is lost (going expert over unsaved custom rules,
 * discarding them, disabling dynamic overrides) — they used to each hand-build the same
 * Dialog skeleton and restate the styling comment.
 */
const UNIFORM_CHOICE_BUTTON_PROPS = { color: 'primary', variant: 'contained' } as const

/** One choice: its label and what proceeding with it does (closing is the caller's job). */
export type UniformChoice = { label: string; onClick: () => void }

export default function UniformChoiceDialog({ open, onClose, title, body, choices }: {
  open: boolean
  // Backdrop / Escape — the dialog offers no implicit "cancel"; list one as a choice.
  onClose: () => void
  title: string
  body: string
  // Rendered left to right in the given order.
  choices: readonly UniformChoice[]
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{body}</Typography>
      </DialogContent>
      <DialogActions>
        {choices.map((choice) => (
          <Button key={choice.label} {...UNIFORM_CHOICE_BUTTON_PROPS} onClick={choice.onClick}>{choice.label}</Button>
        ))}
      </DialogActions>
    </Dialog>
  )
}
