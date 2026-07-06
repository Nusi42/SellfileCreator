/**
 * GearInspectorSortWeightControls
 *
 * Shared weight control strip used by:
 * - Sort popout (Normalized weight editing)
 * - Gear Inspector grid normalized preset editor
 *
 * Why: Keep the weight interaction and chip styling in one place so updates stay consistent.
 */
import React from 'react'
import { Box } from '@mui/material'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT } from '../lib/gearInspectorSort'
import { STATUS_CHIP_BORDER_RADIUS_PX } from '../lib/constants'
import { useI18n } from '../lib/i18n'

export type GearInspectorSortWeightControlsProps = {
  // Human label for aria strings (e.g., "SPD").
  label: string
  // Whether the controls are interactive; disabled state also affects visuals.
  enabled: boolean
  // Current weight (raw); normalized internally to match persistence rules.
  weight: number
  // Optional pre-resolved display value. When provided, it is shown verbatim (only formatted to
  // 2 decimals) INSTEAD of clamping through normalizeGearInspectorSortWeight — needed by callers
  // whose value range or step differs from the gear-inspector sort weight bounds (e.g. the
  // safeguard main-stat rank factor, clamped/stepped on its own SSOT scale). The caller owns the
  // clamp in that case. Substat weight rows omit this and keep the sort-weight clamp/normalization.
  displayValue?: number
  // Optional formatting prefix for the displayed weight (default is '×').
  weightPrefix?: string
  // Bump by +/- step counts (step size is owned by the caller).
  onBump: (deltaSteps: number) => void
  // Reset back to the neutral default.
  onReset: () => void
}

const formatWeight = (value: number, prefix: string): string => {
  // Weight values are normalized to 2 decimals (0.05 steps); keep display stable across locales.
  const safe = Number.isFinite(value) ? value : GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT
  return `${prefix}${safe.toFixed(2)}`
}

export function GearInspectorSortWeightControls({
  label,
  enabled,
  weight,
  displayValue,
  weightPrefix = '×',
  onBump,
  onReset,
}: GearInspectorSortWeightControlsProps) {
  const { t } = useI18n()

  // Display value: a caller-supplied pre-clamped value (its own bounds) when given, otherwise
  // the sort-weight-normalized value (sort-weight clamp). Only affects the label, not the callbacks.
  const resolvedWeight = displayValue !== undefined ? displayValue : normalizeGearInspectorSortWeight(weight)
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

  const holdStepMultiplier = React.useCallback((elapsedMs: number): number => {
    // Grow the step SIZE (not just the rate) as the hold continues, so long holds cover the full
    // range in a couple seconds instead of dozens of single-step bumps. Kept coarser than the rate
    // ramp so a brief hold still fine-tunes: 1× for the first ~1.5s, then 2×, 5×, 10×. The caller's
    // per-step math (bump*Weight/bumpMainStatRankWeightFactor) multiplies this by its own step size.
    if (elapsedMs < 1500) return 1
    if (elapsedMs < 2400) return 2
    if (elapsedMs < 3600) return 5
    return 10
  }, [])

  // Ref indirection breaks the self-reference cycle so the lint rule sees a stable binding.
  const scheduleTickRef = React.useRef<() => void>(() => {})

  const scheduleTick = React.useCallback(() => {
    // Tick re-schedules itself with an adaptive delay so long holds feel responsive.
    const state = holdRef.current
    if (!state) return
    const elapsedMs = Date.now() - state.startedAtMs
    // Scale the ±1 step by the elapsed-time multiplier, preserving direction (sign of deltaSteps).
    onBump(Math.sign(state.deltaSteps) * holdStepMultiplier(elapsedMs))
    state.timeoutId = window.setTimeout(scheduleTickRef.current, holdDelayMs(elapsedMs))
  }, [holdDelayMs, holdStepMultiplier, onBump])

  // Keep the ref in sync so recursive setTimeout calls always reach the latest closure.
  React.useEffect(() => { scheduleTickRef.current = scheduleTick }, [scheduleTick])

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

  const decreaseAria = t('gearInspectorSortWeightDecreaseAria', { label })
  const increaseAria = t('gearInspectorSortWeightIncreaseAria', { label })
  const resetAria = t('gearInspectorSortWeightResetAria', { label })

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
            border: `1px solid ${theme.custom.weakBorder}`,
            color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
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
            border: `1px solid ${theme.custom.successBorder}`,
            backgroundColor: theme.custom.successBg,
            color: (theme.vars?.palette.success.main ?? theme.palette.success.main),
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
            border: `1px solid ${theme.custom.weakBorder}`,
            color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
            userSelect: 'none',
          })}
        >
          +
        </Box>
      </Box>
    </>
  )
}
