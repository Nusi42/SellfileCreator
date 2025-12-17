/**
 * TesterSortWeightControls
 *
 * Shared weight control strip used by:
 * - Sort popout (Normalized weight editing)
 * - Tester grid normalized preset editor
 *
 * Why: Keep the weight interaction and chip styling in one place so updates stay consistent.
 */
import React from 'react'
import { Box } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { normalizeTesterSortWeight, TESTER_SORT_WEIGHT_DEFAULT } from '../lib/testerSort'
import { STATUS_CHIP_BORDER_RADIUS_PX } from '../lib/constants'
import { useI18n } from '../lib/i18n'

export type TesterSortWeightControlsProps = {
  // Human label for aria strings (e.g., "SPD").
  label: string
  // Whether the controls are interactive; disabled state also affects visuals.
  enabled: boolean
  // Current weight (raw); normalized internally to match persistence rules.
  weight: number
  // Optional formatting prefix for the displayed weight (default is '×').
  weightPrefix?: string
  // Bump by +/- step counts (step size is owned by the caller).
  onBump: (deltaSteps: number) => void
  // Reset back to the neutral default.
  onReset: () => void
}

const formatWeight = (value: number, prefix: string): string => {
  // Weight values are normalized to 2 decimals (0.05 steps); keep display stable across locales.
  const safe = Number.isFinite(value) ? value : TESTER_SORT_WEIGHT_DEFAULT
  return `${prefix}${safe.toFixed(2)}`
}

export function TesterSortWeightControls({
  label,
  enabled,
  weight,
  weightPrefix = '×',
  onBump,
  onReset,
}: TesterSortWeightControlsProps) {
  const { t } = useI18n()

  // Normalize weight so the UI never shows floating point drift (0.05 steps).
  const resolvedWeight = normalizeTesterSortWeight(weight)
  const weightLabel = formatWeight(resolvedWeight, weightPrefix)

  const holdRef = React.useRef<{
    timeoutId: number | null
    startedAtMs: number
    deltaSteps: number
    pointerId: number | null
  } | null>(null)

  const stopHold = React.useCallback((releaseTarget?: HTMLElement | null) => {
    // Pointer-hold repeats must stop immediately on pointer up/leave to avoid accidental drift.
    const state = holdRef.current
    if (!state) return
    if (state.timeoutId != null) {
      window.clearTimeout(state.timeoutId)
    }
    if (state.pointerId != null && releaseTarget) {
      try { releaseTarget.releasePointerCapture(state.pointerId) } catch {}
    }
    holdRef.current = null
  }, [])

  React.useEffect(() => {
    // Unmount should always cancel holds so we never leave pointer capture behind.
    return () => { stopHold() }
  }, [stopHold])

  React.useEffect(() => {
    // Closing the host menu/popover cancels holds; enabled=false is our signal that the host went away.
    if (enabled) return
    stopHold()
  }, [enabled, stopHold])

  const holdDelayMs = React.useCallback((elapsedMs: number): number => {
    // Accelerate as the user keeps holding the button: smaller delay => faster bumping.
    if (elapsedMs < 450) return 180
    if (elapsedMs < 900) return 120
    if (elapsedMs < 1500) return 80
    if (elapsedMs < 2400) return 55
    return 40
  }, [])

  const scheduleTick = React.useCallback(() => {
    // Tick re-schedules itself with an adaptive delay so long holds feel responsive.
    const state = holdRef.current
    if (!state) return
    onBump(state.deltaSteps)
    const elapsedMs = Date.now() - state.startedAtMs
    state.timeoutId = window.setTimeout(scheduleTick, holdDelayMs(elapsedMs))
  }, [holdDelayMs, onBump])

  const beginHold = React.useCallback((
    event: React.PointerEvent<HTMLElement>,
    deltaSteps: number,
  ) => {
    // Holding +/- should never toggle the host row; keep the interaction explicit.
    event.preventDefault()
    event.stopPropagation()
    if (!enabled) return
    stopHold(event.currentTarget)

    // Apply the first bump immediately so a quick click behaves like a normal press.
    onBump(deltaSteps)

    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : null
    if (pointerId != null) {
      try { event.currentTarget.setPointerCapture(pointerId) } catch {}
    }
    holdRef.current = {
      timeoutId: window.setTimeout(scheduleTick, holdDelayMs(0)),
      startedAtMs: Date.now(),
      deltaSteps,
      pointerId,
    }
  }, [enabled, holdDelayMs, onBump, scheduleTick, stopHold])

  const decreaseAria = t('testerSortWeightDecreaseAria', { label })
  const increaseAria = t('testerSortWeightIncreaseAria', { label })
  const resetAria = t('testerSortWeightResetAria', { label })

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label={decreaseAria}
        aria-disabled={!enabled}
        onPointerDown={(event) => beginHold(event, -1)}
        onPointerUp={(event) => stopHold(event.currentTarget)}
        onPointerLeave={(event) => stopHold(event.currentTarget)}
        onPointerCancel={(event) => stopHold(event.currentTarget)}
        onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          if (!enabled) return
          onBump(-1)
        }}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          cursor: enabled ? 'pointer' : 'default',
          font: 'inherit',
          opacity: enabled ? 1 : 0.35,
        }}
      >
        <Box
          component="span"
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 22,
            minWidth: 26,
            px: 0.5,
            borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
            fontSize: theme.typography.pxToRem(14),
            fontWeight: 800,
            border: `1px solid ${alpha(theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.28 : 0.18)}`,
            color: theme.palette.text.secondary,
            userSelect: 'none',
          })}
        >
          –
        </Box>
      </Box>
      <Box
        component="button"
        type="button"
        aria-label={resetAria}
        aria-disabled={!enabled}
        onClick={(event) => {
          // Reset should never toggle the host row; keep the behavior explicit.
          event.preventDefault()
          event.stopPropagation()
          if (!enabled) return
          onReset()
        }}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          cursor: enabled ? 'pointer' : 'default',
          font: 'inherit',
          opacity: enabled ? 1 : 0.35,
        }}
      >
        <Box
          component="span"
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 22,
            minWidth: 56,
            px: 0.75,
            borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
            fontSize: theme.typography.pxToRem(13),
            fontWeight: 800,
            letterSpacing: 0.1,
            fontVariantNumeric: 'tabular-nums',
            border: `1px solid ${alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.7 : 0.55)}`,
            backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
            color: theme.palette.success.main,
            userSelect: 'none',
          })}
        >
          {weightLabel}
        </Box>
      </Box>
      <Box
        component="button"
        type="button"
        aria-label={increaseAria}
        aria-disabled={!enabled}
        onPointerDown={(event) => beginHold(event, 1)}
        onPointerUp={(event) => stopHold(event.currentTarget)}
        onPointerLeave={(event) => stopHold(event.currentTarget)}
        onPointerCancel={(event) => stopHold(event.currentTarget)}
        onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          if (!enabled) return
          onBump(1)
        }}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          cursor: enabled ? 'pointer' : 'default',
          font: 'inherit',
          opacity: enabled ? 1 : 0.35,
        }}
      >
        <Box
          component="span"
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 22,
            minWidth: 26,
            px: 0.5,
            borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
            fontSize: theme.typography.pxToRem(14),
            fontWeight: 800,
            border: `1px solid ${alpha(theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.28 : 0.18)}`,
            color: theme.palette.text.secondary,
            userSelect: 'none',
          })}
        >
          +
        </Box>
      </Box>
    </>
  )
}
