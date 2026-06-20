/**
 * gearDbToastStyles — SSOT for the shared gear-diff preview surface.
 *
 * The endpoint gear-update diff is shown in three places — the update toast, the
 * history hover tooltip, and the pinned history flyout. All three render the same
 * diff body (GearDiffPreview) on the same neutral paper surface so they read as one
 * consistent "here's an update" card rather than three different-looking frames.
 *
 * This module is the single definition of that surface. It is applied by GearDiffPreview
 * to its own paper container (NOT an MUI Alert), so it carries no Alert-specific selectors.
 * Failure/invalid toasts keep their red `error` Alert and are intentionally NOT covered here.
 */
import type { SystemStyleObject, Theme } from '@mui/system'

// Neutral paper surface shared by every gear-diff preview container (toast / tooltip /
// flyout). Opaque paper background with primary text and a divider border, so the diff
// chip + cards provide the only colour cues. Typed as a plain style object (not the SxProps
// union) so callers can spread it safely into a composed sx.
export const GEAR_DIFF_PREVIEW_SURFACE_SX: SystemStyleObject<Theme> = {
  // Opaque paper surface keeps the preview on the app's neutral surface ladder.
  bgcolor: 'background.paper',
  // Body text tracks the primary text colour (no accent hue).
  color: 'text.primary',
  // Single divider border frames the card consistently across all three containers.
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
}
