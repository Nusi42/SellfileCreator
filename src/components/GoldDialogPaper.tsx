/**
 * GoldDialogPaper — the Paper every Dialog renders into, wearing the gold corner ornaments.
 *
 * Wired once as the MuiDialog `slots.paper` default in theme.ts, so all dialogs (including
 * every confirm) carry the mark without any per-dialog opt-in. Per-dialog `slotProps.paper`
 * sizing (width/sx) keeps working — slots (which component) and slotProps (its props) are
 * separate maps that MUI merges independently.
 */
import Paper, { type PaperProps } from '@mui/material/Paper'
import { GoldCornerOrnaments, GOLD_CORNER_HOST_SX } from './GoldCornerOrnament'

// React 19: ref arrives as a regular prop (no forwardRef needed) and rides the {...rest} spread.
export default function GoldDialogPaper({ children, style, ...rest }: PaperProps) {
  return (
    // Dialog paper is already a positioned flex column in MUI's layout; the inline position
    // makes the ornament anchor explicit rather than relying on that implementation detail.
    <Paper {...rest} style={{ ...style, ...GOLD_CORNER_HOST_SX }}>
      <GoldCornerOrnaments />
      {children}
    </Paper>
  )
}
