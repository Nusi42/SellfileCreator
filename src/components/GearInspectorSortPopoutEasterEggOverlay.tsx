import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import type { Theme } from '@mui/material/styles'
import type { GearInspectorSortPopoutEasterEggOverlayState } from '../hooks/useGearInspectorSortPopoutEasterEgg'

// THEME-AGNOSTIC gag palette: fixed colors so the easter egg looks identical in light and dark.
// Intentionally NOT sourced from the MUI palette or the global colorTints SSOT — these gags are a
// constant joke, not part of the themable surface system. (Only theme.shadows are reused, for
// elevation.)
const EGG_SCRIM = 'rgba(0, 0, 0, 0.3)'        // darkens the popout behind the STOP sign
const EGG_STOP_RED = '#d32f2f'                // STOP-sign octagon fill
const EGG_STOP_BORDER = '#ffffff'             // STOP-sign white rim
const EGG_AMBER_BG = 'rgba(237, 108, 2, 0.2)' // "CHILL." banner bg (amber)
const EGG_AMBER_BORDER = 'rgba(237, 108, 2, 0.55)'
const EGG_BUBBLE_BG = 'rgba(24, 26, 32, 0.97)'// micro-confirm bubble (fixed dark)
const EGG_BUBBLE_BORDER = 'rgba(211, 47, 47, 0.6)'
const EGG_TEXT_LIGHT = '#ffffff'              // text on the red sign / dark bubble

/**
 * Sort popout easter-egg overlays.
 *
 * Why a component (vs. injecting raw JSX):
 * - Keeps “big gag” visuals (STOP sign, banner, micro-confirm) isolated from the already-large header component.
 * - Uses simple transform/opacity transitions so it stays mostly compositor-driven.
 * - Strings are intentionally hardcoded (not localized) per request.
 */
type Props = Readonly<{
  state: GearInspectorSortPopoutEasterEggOverlayState
  onMicroConfirmYep: () => void
  onMicroConfirmStop: () => void
}>

const octagonClipPath = 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)'

const overlayRootSx = (theme: Theme) => ({
  position: 'absolute',
  inset: 0,
  zIndex: theme.zIndex.modal + 1,
  pointerEvents: 'none',
} as const)

const overlayFadeSx = (visible: boolean) => ({
  opacity: visible ? 1 : 0,
  transition: 'opacity 220ms cubic-bezier(0.2, 0.9, 0.2, 1)',
} as const)

const stopSignSx = (visible: boolean) => ({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: visible ? 'auto' : 'none',
  // Fixed scrim — same darkening in both schemes.
  backgroundColor: EGG_SCRIM,
  ...overlayFadeSx(visible),
} as const)

const stopSignOctagonSx = (theme: Theme, phase: 'enter' | 'latched' | 'exit' | 'hidden') => ({
  width: 140,
  height: 140,
  clipPath: octagonClipPath,
  backgroundColor: EGG_STOP_RED,
  border: `10px solid ${EGG_STOP_BORDER}`,
  boxShadow: theme.shadows[8],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transform: phase === 'enter' ? 'scale(1)' : (phase === 'exit' ? 'scale(0.92)' : 'scale(1)'),
  transition: 'transform 220ms cubic-bezier(0.18, 1.15, 0.22, 1)',
} as const)

const bannerSx = (theme: Theme, visible: boolean) => ({
  position: 'absolute',
  top: 6,
  left: 12,
  right: 12,
  height: 34,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Fixed amber banner — same in both schemes.
  backgroundColor: EGG_AMBER_BG,
  border: `1px solid ${EGG_AMBER_BORDER}`,
  boxShadow: theme.shadows[3],
  transform: visible ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(0, -10px, 0) scale(0.98)',
  opacity: visible ? 1 : 0,
  transition: 'transform 260ms cubic-bezier(0.18, 1.15, 0.22, 1), opacity 200ms cubic-bezier(0.2, 0.9, 0.2, 1)',
} as const)

const microConfirmBubbleSx = (theme: Theme, visible: boolean, anchor: { x: number; y: number } | null) => ({
  position: 'absolute',
  left: anchor ? anchor.x : 0,
  top: anchor ? anchor.y : 0,
  transform: visible ? 'translate3d(-100%, -50%, 0) scale(1)' : 'translate3d(-100%, -50%, 0) scale(0.92)',
  transformOrigin: 'right center',
  opacity: visible ? 1 : 0,
  pointerEvents: visible ? 'auto' : 'none',
  transition: 'transform 240ms cubic-bezier(0.18, 1.15, 0.22, 1), opacity 220ms cubic-bezier(0.2, 0.9, 0.2, 1)',
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
  px: 1,
  py: 0.75,
  borderRadius: 12,
  // Fixed dark bubble — same in both schemes.
  backgroundColor: EGG_BUBBLE_BG,
  border: `1px solid ${EGG_BUBBLE_BORDER}`,
  boxShadow: theme.shadows[6],
} as const)

export default function GearInspectorSortPopoutEasterEggOverlay({ state, onMicroConfirmYep, onMicroConfirmStop }: Props) {
  // Overlays are visual-only until activated by the hook; keeping them mounted avoids reflow surprises.
  const showStopSign = state.variant === 'stopSign' && state.stopSign.phase !== 'hidden' && state.stopSign.phase !== 'exit'
  const showBanner = state.variant === 'timeoutBanner' && state.banner.phase !== 'hidden' && state.banner.phase !== 'exit'
  const showMicroConfirm = state.variant === 'microConfirm' && state.microConfirm.phase !== 'hidden' && state.microConfirm.phase !== 'exit'

  return (
    <Box sx={overlayRootSx}>
      <Box
        sx={stopSignSx(showStopSign && state.stopSign.blocksClicks)}
        onClick={(event) => {
          // Eat clicks without closing the menu; this is intentionally rude.
          event.preventDefault()
          event.stopPropagation()
        }}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <Box sx={(theme) => stopSignOctagonSx(theme, state.stopSign.phase)}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 900,
              letterSpacing: 1,
              color: EGG_TEXT_LIGHT,
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            STOP
          </Typography>
        </Box>
      </Box>

      <Box sx={(theme) => bannerSx(theme, showBanner)}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 800,
            letterSpacing: 0.4,
            userSelect: 'none',
          }}
        >
          CHILL.
        </Typography>
      </Box>

      <Box sx={(theme) => microConfirmBubbleSx(theme, showMicroConfirm, state.microConfirm.anchor)}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            color: EGG_TEXT_LIGHT,
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Again?
        </Typography>
        <Button size="small" variant="contained" color="error" onClick={onMicroConfirmYep} sx={{ minWidth: 0, px: 1 }}>
          Yep
        </Button>
        <Button size="small" variant="outlined" color="inherit" onClick={onMicroConfirmStop} sx={{ minWidth: 0, px: 1 }}>
          Stop
        </Button>
      </Box>
    </Box>
  )
}
