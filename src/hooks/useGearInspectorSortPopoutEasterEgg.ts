import * as React from 'react'
import type { GearInspectorSortKey } from '../lib/gearInspectorSort'

/**
 * GearInspectorSortPopout easter egg (UI-only mischief).
 *
 * Contract:
 * - Trigger a “burst” when the user toggles the same priority key 10x within 10s.
 * - Switching priority keys resets the trigger counter.
 * - A burst selects exactly one variant and keeps it stable until 2s of idle.
 * - Additional clicks never restart/cancel the current animation; they only extend the idle timer.
 * - Animations are driven via WAAPI (compositor-friendly) so they stay smoother under load.
 * - Overlay strings are intentionally hardcoded (not localized) per request.
 */
export type GearInspectorSortPopoutEasterEggVariant =
  | 'stopSign'
  | 'microConfirm'
  | 'rowYeet'
  | 'shockwave'
  | 'paperTilt'
  | 'glitchScrub'
  | 'waveAwayText'
  | 'timeoutBanner'
  | 'badgeMeltdown'
  | 'accordionFold'
  | 'carouselScramble'

type OverlayPhase = 'hidden' | 'enter' | 'latched' | 'exit'

export type GearInspectorSortPopoutEasterEggOverlayState = Readonly<{
  active: boolean
  variant: GearInspectorSortPopoutEasterEggVariant | null
  targetKey: GearInspectorSortKey | null
  stopSign: Readonly<{
    phase: OverlayPhase
    blocksClicks: boolean
  }>
  banner: Readonly<{
    phase: OverlayPhase
  }>
  microConfirm: Readonly<{
    phase: OverlayPhase
    // Coordinates are relative to the sort menu paper (0,0 = top-left of the paper).
    anchor: Readonly<{ x: number; y: number }> | null
  }>
}>

const EASTER_EGG_RULES = {
  // Trigger: 10 toggles of the same substat within 10 seconds (sliding window).
  triggerToggleCount: 10,
  triggerWindowMs: 10_000,
  // Cooldown: require 2 seconds of no further toggles before returning to normal.
  idleBeforeReturnMs: 2_000,
  // Stop-sign: eat clicks for a short burst, but keep the menu open.
  stopSignEatClicksMs: 2_500,
} as const

const VARIANTS: readonly GearInspectorSortPopoutEasterEggVariant[] = [
  'stopSign',
  'microConfirm',
  'rowYeet',
  'shockwave',
  'paperTilt',
  'glitchScrub',
  'waveAwayText',
  'timeoutBanner',
  'badgeMeltdown',
  'accordionFold',
  'carouselScramble',
]

const easingSnappy = 'cubic-bezier(0.2, 0.9, 0.2, 1)'
const easingSlam = 'cubic-bezier(0.18, 1.15, 0.22, 1)'
const easingGlitch = 'steps(6, end)'

type ToggleStreak = Readonly<{
  key: GearInspectorSortKey | null
  times: readonly number[]
}>

type Burst = {
  id: number
  variant: GearInspectorSortPopoutEasterEggVariant
  targetKey: GearInspectorSortKey
  phase: 'active' | 'exiting'
  lastToggleAtMs: number
  animations: readonly Animation[]
  // Some variants need temporary style overrides (e.g., transform-origin).
  cleanup: readonly (() => void)[]
  // Clicks during the exit animation should not cancel it; instead we re-arm after exit completes.
  pendingRearm: boolean
}

type Options = Readonly<{
  enabled: boolean
  getPaperEl: () => HTMLDivElement | null
  onTogglePriority: (key: GearInspectorSortKey) => void
}>

const emptyOverlayState: GearInspectorSortPopoutEasterEggOverlayState = {
  active: false,
  variant: null,
  targetKey: null,
  stopSign: { phase: 'hidden', blocksClicks: false },
  banner: { phase: 'hidden' },
  microConfirm: { phase: 'hidden', anchor: null },
} as const

const listForPaper = (paper: HTMLElement): HTMLElement | null => {
  // MUI MenuList usually renders as `.MuiMenu-list`, but keep the selector defensive.
  return (
    paper.querySelector<HTMLElement>('.MuiMenu-list')
    ?? paper.querySelector<HTMLElement>('[role="menu"]')
    ?? null
  )
}

const menuItemsForPaper = (paper: HTMLElement): readonly HTMLElement[] => {
  // Prefer the concrete MenuItem class, but fall back to the ARIA role.
  const menuItems = Array.from(paper.querySelectorAll<HTMLElement>('.MuiMenuItem-root'))
  return menuItems.length > 0 ? menuItems : Array.from(paper.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

const priorityRowForKey = (paper: HTMLElement, key: GearInspectorSortKey): HTMLElement | null =>
  paper.querySelector<HTMLElement>(`[data-gear-inspector-sort-key="${Number(key)}"]`)

const badgeForPriorityRow = (row: HTMLElement): HTMLElement | null =>
  row.querySelector<HTMLElement>('[data-sort-popout-badge]')

const textNodesForPaper = (paper: HTMLElement): readonly HTMLElement[] =>
  Array.from(paper.querySelectorAll<HTMLElement>('[data-sort-popout-text]'))

const animateAll = (targets: readonly HTMLElement[], keyframes: Keyframe[], options: KeyframeAnimationOptions): readonly Animation[] => {
  // WAAPI animations are compositor-friendly and don’t require React re-rendering per frame.
  return targets
    .map((el) => el.animate(keyframes, options))
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const pickVariant = (): GearInspectorSortPopoutEasterEggVariant => {
  // Keep the selection simple: one random pick per burst, stable until the idle timeout clears it.
  const idx = Math.floor(Math.random() * VARIANTS.length)
  return VARIANTS[Math.max(0, Math.min(VARIANTS.length - 1, idx))]!
}

const overlayForBurst = (paper: HTMLElement, variant: GearInspectorSortPopoutEasterEggVariant, targetKey: GearInspectorSortKey): Partial<GearInspectorSortPopoutEasterEggOverlayState> => {
  // Most variants are purely animated via WAAPI; overlays are opt-in for a few “big” gags.
  if (variant === 'timeoutBanner') {
    return {
      banner: { phase: 'enter' },
    }
  }
  if (variant === 'stopSign') {
    return {
      stopSign: { phase: 'enter', blocksClicks: true },
    }
  }
  if (variant === 'microConfirm') {
    const row = priorityRowForKey(paper, targetKey)
    const paperRect = paper.getBoundingClientRect()
    const rowRect = row?.getBoundingClientRect() ?? null
    const anchor = rowRect ? { x: rowRect.right - paperRect.left - 12, y: rowRect.top - paperRect.top + rowRect.height / 2 } : null
    return {
      microConfirm: { phase: 'enter', anchor },
    }
  }
  return {}
}

const runEnterAnimations = (
  paper: HTMLElement,
  variant: GearInspectorSortPopoutEasterEggVariant,
  targetKey: GearInspectorSortKey,
  cleanup: (() => void)[],
): readonly Animation[] => {
  // Prefer animating the menu list so we don’t fight Popover positioning/transform state.
  const list = listForPaper(paper)
  const items = menuItemsForPaper(paper)
  const targetRow = priorityRowForKey(paper, targetKey)
  const targetBadge = targetRow ? badgeForPriorityRow(targetRow) : null
  const textNodes = textNodesForPaper(paper)

  if (!list) return []

  if (variant === 'stopSign') {
    return [
      ...animateAll([list], [
        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
        { transform: 'translate3d(0, 4px, 0) scale(0.985)', opacity: 0.6 },
      ], { duration: 240, easing: easingSlam, fill: 'forwards' }),
    ]
  }

  if (variant === 'microConfirm') {
    const base = animateAll([list], [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: 'translate3d(0, 2px, 0) scale(0.99)', opacity: 0.85 },
    ], { duration: 220, easing: easingSnappy, fill: 'forwards' })
    const pulse = targetRow
      ? animateAll([targetRow], [
        { transform: 'translate3d(0, 0, 0)', filter: 'none' },
        { transform: 'translate3d(8px, 0, 0)', filter: 'saturate(1.15)' },
      ], { duration: 220, easing: easingSlam, fill: 'forwards' })
      : []
    return [...base, ...pulse]
  }

  if (variant === 'rowYeet') {
    if (!targetRow) return []
    return animateAll([targetRow], [
      { transform: 'translate3d(0, 0, 0) rotate(0deg)', opacity: 1 },
      { transform: 'translate3d(180px, -10px, 0) rotate(4deg)', opacity: 0.08 },
    ], { duration: 360, easing: easingSlam, fill: 'forwards' })
  }

  if (variant === 'shockwave') {
    // Stagger a wobble, but land in a slight “aftershock” tilt that persists until idle clears.
    const targetIndex = Math.max(0, items.findIndex((el) => el === targetRow))
    const withDelay = items.map((el, idx) => {
      const dist = Math.abs(idx - targetIndex)
      const delay = dist * 22
      const intensity = clamp01(1 - dist / 10)
      const dx = 10 * intensity
      const rot = -0.8 * intensity
      return el.animate(
        [
          { transform: 'translate3d(0, 0, 0) rotate(0deg)', opacity: 1 },
          { transform: `translate3d(${dx}px, 0, 0) rotate(${rot}deg)`, opacity: 0.92 },
        ],
        { duration: 260, easing: easingSnappy, fill: 'forwards', delay },
      )
    })
    return withDelay
  }

  if (variant === 'paperTilt') {
    // Tilt the content wrapper, not the paper, so Popover anchoring remains stable.
    return animateAll([list], [
      { transform: 'translate3d(0, 0, 0) rotate(0deg)', opacity: 1 },
      { transform: 'translate3d(12px, 6px, 0) rotate(1.2deg)', opacity: 0.85 },
    ], { duration: 320, easing: easingSlam, fill: 'forwards' })
  }

  if (variant === 'glitchScrub') {
    // Scrub the text with a steps easing; keep it “ghosted” until the idle timeout.
    const base = animateAll([list], [
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
      { transform: 'translate3d(8px, 0, 0)', opacity: 0.5 },
    ], { duration: 260, easing: easingGlitch, fill: 'forwards' })
    const perText = textNodes.map((el, idx) => {
      const jitter = (idx % 2 === 0 ? 1 : -1) * (4 + (idx % 3))
      return el.animate(
        [
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          { transform: `translate3d(${jitter}px, 0, 0)`, opacity: 0.12 },
        ],
        { duration: 260, easing: easingGlitch, fill: 'forwards', delay: idx * 8 },
      )
    })
    return [...base, ...perText]
  }

  if (variant === 'waveAwayText') {
    // Fly labels away (transforms only) so the menu still “works”, just… cryptic.
    const perText = textNodes.map((el) => {
      const angle = (Math.random() * 2 - 1) * (Math.PI / 2.8)
      const distance = 42 + Math.random() * 22
      const dx = Math.cos(angle) * distance
      const dy = Math.sin(angle) * distance
      return el.animate(
        [
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          { transform: `translate3d(${dx}px, ${dy}px, 0)`, opacity: 0 },
        ],
        { duration: 360, easing: easingSlam, fill: 'forwards' },
      )
    })
    const dim = animateAll([list], [
      { opacity: 1 },
      { opacity: 0.9 },
    ], { duration: 220, easing: easingSnappy, fill: 'forwards' })
    return [...dim, ...perText]
  }

  if (variant === 'timeoutBanner') {
    return animateAll([list], [
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
      { transform: 'translate3d(0, 10px, 0)', opacity: 0.75 },
    ], { duration: 260, easing: easingSnappy, fill: 'forwards' })
  }

  if (variant === 'badgeMeltdown') {
    if (!targetBadge) return []
    const melt = animateAll([targetBadge], [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1, filter: 'none' },
      { transform: 'translate3d(0, 10px, 0) scale(1.25)', opacity: 0, filter: 'blur(1px)' },
    ], { duration: 340, easing: easingSlam, fill: 'forwards' })
    const wobble = animateAll([list], [
      { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
      { transform: 'translate3d(6px, 0, 0) rotate(-0.6deg)' },
    ], { duration: 240, easing: easingSnappy, fill: 'forwards' })
    return [...wobble, ...melt]
  }

  if (variant === 'accordionFold') {
    // Force a stable fold origin so the list collapses “from the top.”
    const prevOrigin = list.style.transformOrigin
    list.style.transformOrigin = 'top left'
    cleanup.push(() => { list.style.transformOrigin = prevOrigin })
    return animateAll([list], [
      { transform: 'translate3d(0, 0, 0) scaleY(1)', opacity: 1 },
      { transform: 'translate3d(0, 0, 0) scaleY(0.05)', opacity: 0.35 },
    ], { duration: 320, easing: easingSlam, fill: 'forwards' })
  }

  // carouselScramble
  // Spin the list quickly, but land “slightly off” so it persists until the idle timeout.
  return animateAll([list], [
    { transform: 'translate3d(0, 0, 0)', opacity: 1 },
    { transform: 'translate3d(0, -68px, 0)', opacity: 0.9, offset: 0.55 },
    { transform: 'translate3d(0, -14px, 0)', opacity: 0.82 },
  ], { duration: 420, easing: easingSnappy, fill: 'forwards' })
}

export function useGearInspectorSortPopoutEasterEgg({ enabled, getPaperEl, onTogglePriority }: Options) {
  const [overlay, setOverlay] = React.useState<GearInspectorSortPopoutEasterEggOverlayState>(emptyOverlayState)

  // Toggle streak tracking is intentionally separate from “burst” state:
  // - streak: decides when we *enter* a burst
  // - burst: owns the chosen variant/animations until idle clears it
  const streakRef = React.useRef<ToggleStreak>({
    // The requested behavior resets the counter when switching substats.
    key: null,
    times: [],
  })
  // Burst state is stored in a ref so animations remain stable even when React re-renders.
  const burstRef = React.useRef<Burst | null>(null)
  // Idle timer controls when we reverse the “enter” animations back to neutral.
  const idleTimerRef = React.useRef<number | null>(null)
  // Stop-sign variant temporarily eats clicks; this timer controls that “eat” window only.
  const stopSignEatClicksTimerRef = React.useRef<number | null>(null)
  // `startExit` is called from timer callbacks; keep it in a ref to avoid dependency cycles.
  const startExitRef = React.useRef<(burstId: number) => void>(() => {})

  const clearIdleTimer = React.useCallback(() => {
    if (idleTimerRef.current === null) return
    window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = null
  }, [])

  const clearStopSignEatClicksTimer = React.useCallback(() => {
    if (stopSignEatClicksTimerRef.current === null) return
    window.clearTimeout(stopSignEatClicksTimerRef.current)
    stopSignEatClicksTimerRef.current = null
  }, [])

  const reset = React.useCallback(() => {
    // Reset is used when the menu closes or the component unmounts.
    clearIdleTimer()
    clearStopSignEatClicksTimer()
    streakRef.current = { key: null, times: [] }

    const burst = burstRef.current
    burstRef.current = null
    if (burst) {
      burst.cleanup.forEach((fn) => fn())
      // Cancelling removes fill-forwards styles so we don’t leave the menu distorted when closed.
      burst.animations.forEach((anim) => anim.cancel())
    }

    setOverlay(emptyOverlayState)
  }, [clearIdleTimer, clearStopSignEatClicksTimer])

  React.useEffect(() => {
    // When the menu is not enabled, the hook should be inert and release side effects.
    if (enabled) return
    reset()
  }, [enabled, reset])

  React.useEffect(() => {
    // Safety: ensure timers are cleaned up even if the parent forgets to call reset.
    return () => { reset() }
  }, [reset])

  const scheduleIdleExit = React.useCallback((burstId: number) => {
    // “Stopped clicking for 2 seconds” is measured from the *last* toggle we saw.
    clearIdleTimer()
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null
      const burst = burstRef.current
      if (!burst) return
      if (burst.id !== burstId) return
      if (burst.phase === 'exiting') return
      const now = Date.now()
      if (now - burst.lastToggleAtMs < EASTER_EGG_RULES.idleBeforeReturnMs) {
        // A later click extended the burst; reschedule and keep the current animation intact.
        scheduleIdleExit(burstId)
        return
      }
      startExitRef.current(burstId)
    }, EASTER_EGG_RULES.idleBeforeReturnMs)
  }, [clearIdleTimer])

  const startExit = React.useCallback((burstId: number) => {
    // Exit should be a one-way transition; clicks during exit set `pendingRearm` instead of cancelling.
    const burst = burstRef.current
    if (!burst) return
    if (burst.id !== burstId) return
    if (burst.phase === 'exiting') return

    burst.phase = 'exiting'
    // Reverse the existing WAAPI animations instead of creating new ones.
    burst.animations.forEach((anim) => { anim.reverse() })
    setOverlay((prev) => ({
      ...prev,
      stopSign: prev.stopSign.phase === 'hidden' ? prev.stopSign : { ...prev.stopSign, phase: 'exit' },
      banner: prev.banner.phase === 'hidden' ? prev.banner : { ...prev.banner, phase: 'exit' },
      microConfirm: prev.microConfirm.phase === 'hidden' ? prev.microConfirm : { ...prev.microConfirm, phase: 'exit' },
    }))

    // When the reverse completes, either settle to idle or re-arm if clicks happened mid-exit.
    void Promise.allSettled(burst.animations.map((anim) => anim.finished)).then(() => {
      const current = burstRef.current
      if (!current || current.id !== burstId) return
      if (current.pendingRearm) {
        // Re-arm by re-reversing back to the “latched” end state; don’t cancel the exit itself.
        current.pendingRearm = false
        current.phase = 'active'
        current.animations.forEach((anim) => { anim.reverse() })
        setOverlay((prev) => ({
          ...prev,
          stopSign: prev.stopSign.phase === 'hidden' ? prev.stopSign : { ...prev.stopSign, phase: 'latched' },
          banner: prev.banner.phase === 'hidden' ? prev.banner : { ...prev.banner, phase: 'latched' },
          microConfirm: prev.microConfirm.phase === 'hidden' ? prev.microConfirm : { ...prev.microConfirm, phase: 'latched' },
        }))
        scheduleIdleExit(burstId)
        return
      }

      // Fully settle: clear burst state, overlays, and the toggle streak.
      current.cleanup.forEach((fn) => fn())
      current.animations.forEach((anim) => anim.cancel())
      burstRef.current = null
      streakRef.current = { key: null, times: [] }
      setOverlay(emptyOverlayState)
    })
  }, [scheduleIdleExit])

  // Keep a stable reference for timer callbacks without creating dependency cycles.
  startExitRef.current = startExit

  const beginBurst = React.useCallback((paper: HTMLElement, key: GearInspectorSortKey) => {
    // One variant per burst: once picked, keep it stable until idle clears the state.
    const variant = pickVariant()
    const cleanup: Array<() => void> = []
    const animations = runEnterAnimations(paper, variant, key, cleanup)
    const id = (burstRef.current?.id ?? 0) + 1
    burstRef.current = {
      id,
      variant,
      targetKey: key,
      phase: 'active',
      lastToggleAtMs: Date.now(),
      animations,
      cleanup,
      pendingRearm: false,
    }

    setOverlay((prev) => ({
      ...prev,
      active: true,
      variant,
      targetKey: key,
      stopSign: { phase: 'hidden', blocksClicks: false },
      banner: { phase: 'hidden' },
      microConfirm: { phase: 'hidden', anchor: null },
      ...overlayForBurst(paper, variant, key),
    }))

    if (variant === 'stopSign') {
      // Eat clicks only for a short “slam” window, but keep the visual effect latched until idle.
      clearStopSignEatClicksTimer()
      stopSignEatClicksTimerRef.current = window.setTimeout(() => {
        stopSignEatClicksTimerRef.current = null
        setOverlay((prev) => (prev.variant === 'stopSign' ? { ...prev, stopSign: { ...prev.stopSign, blocksClicks: false, phase: 'latched' } } : prev))
      }, EASTER_EGG_RULES.stopSignEatClicksMs)
    }

    scheduleIdleExit(id)
  }, [clearStopSignEatClicksTimer, scheduleIdleExit])

  const onPriorityToggle = React.useCallback((key: GearInspectorSortKey, event: React.MouseEvent) => {
    // Keep the core behavior deterministic: the priority toggle always executes unless the stop-sign is actively eating clicks.
    const paper = getPaperEl()
    const currentBurst = burstRef.current
    const blocksClicks = overlay.stopSign.blocksClicks && overlay.variant === 'stopSign'
    if (blocksClicks) {
      // Even when we “eat” clicks, treat them as “activity” so the burst doesn’t self-clear mid-spam.
      // This keeps the punishment stable without restarting the animation on every click.
      if (currentBurst) {
        currentBurst.lastToggleAtMs = Date.now()
        if (currentBurst.phase === 'exiting') currentBurst.pendingRearm = true
        scheduleIdleExit(currentBurst.id)
      }
      // Eat clicks by preventing propagation and returning early; this is the “punishment” for the stop-sign variant.
      event.preventDefault()
      event.stopPropagation()
      return
    }

    onTogglePriority(key)

    const now = Date.now()
    const prev = streakRef.current
    if (prev.key !== key) {
      // Requested: switching substats resets the streak counter immediately.
      streakRef.current = { key, times: [now] }
    } else {
      // Sliding window: keep any toggles within the last triggerWindowMs and append the new one.
      const filtered = prev.times.filter((t) => now - t <= EASTER_EGG_RULES.triggerWindowMs)
      streakRef.current = { key, times: [...filtered, now] }
    }

    const nextBurst = burstRef.current
    if (nextBurst) {
      // Extra clicks must not cancel/restart the animation; only extend the idle timer.
      nextBurst.lastToggleAtMs = now
      if (nextBurst.phase === 'exiting') {
        // Don’t cancel the exit; request a re-arm after the reverse finishes.
        nextBurst.pendingRearm = true
      }
      scheduleIdleExit(nextBurst.id)
      return
    }

    const streakMet = streakRef.current.times.length >= EASTER_EGG_RULES.triggerToggleCount
    if (!streakMet) return
    if (!paper) return
    beginBurst(paper, key)
  }, [beginBurst, getPaperEl, onTogglePriority, overlay.stopSign.blocksClicks, overlay.variant, scheduleIdleExit])

  const forceExit = React.useCallback(() => {
    // Used by overlay actions (e.g., “Stop” on the micro-confirm).
    const burst = burstRef.current
    if (!burst) return
    // Exit immediately; don’t wait for the idle timeout.
    startExit(burst.id)
  }, [startExit])

  const microConfirmToggle = React.useCallback(() => {
    // “Yep” means “fine, do one more and keep the burst active.”
    const burst = burstRef.current
    if (!burst || burst.variant !== 'microConfirm' || burst.targetKey == null) return
    onTogglePriority(burst.targetKey)
    burst.lastToggleAtMs = Date.now()
    scheduleIdleExit(burst.id)
  }, [onTogglePriority, scheduleIdleExit])

  return {
    overlay,
    onPriorityToggle,
    microConfirmToggle,
    forceExit,
    reset,
  }
}
