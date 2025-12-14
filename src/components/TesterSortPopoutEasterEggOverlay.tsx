import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import type { TesterSortPopoutEasterEggOverlayState } from '../hooks/useTesterSortPopoutEasterEgg'

/**
 * Sort popout easter-egg overlays.
 *
 * Why a component (vs. injecting raw JSX):
 * - Keeps “big gag” visuals (STOP sign, banner, micro-confirm) isolated from the already-large header component.
 * - Uses simple transform/opacity transitions so it stays mostly compositor-driven.
 * - Strings are intentionally hardcoded (not localized) per request.
 */
type Props = Readonly<{
  state: TesterSortPopoutEasterEggOverlayState
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

const stopSignSx = (theme: Theme, visible: boolean) => ({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: visible ? 'auto' : 'none',
  backgroundColor: alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.35 : 0.22),
  ...overlayFadeSx(visible),
} as const)

const stopSignOctagonSx = (theme: Theme, phase: 'enter' | 'latched' | 'exit' | 'hidden') => ({
  width: 140,
  height: 140,
  clipPath: octagonClipPath,
  backgroundColor: theme.palette.error.main,
  border: `10px solid ${theme.palette.common.white}`,
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
  backgroundColor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.24 : 0.18),
  border: `1px solid ${alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.6 : 0.5)}`,
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
  backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.92 : 0.98),
  border: `1px solid ${alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.6 : 0.5)}`,
  boxShadow: theme.shadows[6],
} as const)

export default function TesterSortPopoutEasterEggOverlay({ state, onMicroConfirmYep, onMicroConfirmStop }: Props) {
  // Overlays are visual-only until activated by the hook; keeping them mounted avoids reflow surprises.
  const showStopSign = state.variant === 'stopSign' && state.stopSign.phase !== 'hidden' && state.stopSign.phase !== 'exit'
  const showBanner = state.variant === 'timeoutBanner' && state.banner.phase !== 'hidden' && state.banner.phase !== 'exit'
  const showMicroConfirm = state.variant === 'microConfirm' && state.microConfirm.phase !== 'hidden' && state.microConfirm.phase !== 'exit'

  return (
    <Box sx={overlayRootSx}>
      <Box
        sx={(theme) => stopSignSx(theme, showStopSign && state.stopSign.blocksClicks)}
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
              color: 'common.white',
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
            color: 'text.primary',
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
