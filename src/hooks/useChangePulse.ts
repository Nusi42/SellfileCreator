import { useEffect, useState } from 'react'

// Duration of the pulse animation in milliseconds.
// Callers pass their own constant so each use site can tune timing independently.
export type UseChangePulseDurationMs = number

// Returns true for `durationMs` after each change in `value`.
// On first mount the previous value is initialised to the current value, so no
// pulse fires just because the component mounted — only genuine subsequent
// changes trigger it.  Uses Object.is for equality so primitive values (strings,
// numbers) and stable object references are handled correctly without the caller
// needing to supply a comparator.
//
// Implementation note: change detection uses the "setState in render" pattern —
// React's own equivalent of getDerivedStateFromProps.  When `value` changes,
// calling setState in the render body causes React to immediately retry the render
// with isPulsing=true BEFORE committing to the DOM, so the new value and the
// animation start appear in the same paint frame.  useEffect only handles the
// timed cleanup (setting isPulsing back to false after durationMs).
export function useChangePulse<T>(value: T, durationMs: UseChangePulseDurationMs): boolean {
  // State bundles the previous value, initialization flag, and pulse state.
  // Storing prevValue in state (rather than a ref) lets us call setState during render
  // to synchronously derive isPulsing when the value changes.
  const [state, setState] = useState<{ prevValue: T; isPulsing: boolean; initialized: boolean }>(
    () => ({ prevValue: value, isPulsing: false, initialized: false }),
  )

  // "setState in render" — React's getDerivedStateFromProps equivalent for hooks.
  // When a change is detected, update state synchronously so the SAME committed render
  // has both the new prop value and isPulsing=true (React throws away the intermediate
  // render and retries before painting).
  if (state.initialized && !Object.is(state.prevValue, value)) {
    // Detected a change: activate pulse and track the new value.
    setState({ prevValue: value, isPulsing: true, initialized: true })
  } else if (!state.initialized) {
    // First render: record the initial value without firing a pulse.
    setState({ prevValue: value, isPulsing: false, initialized: true })
  }

  useEffect(() => {
    // Nothing to clear when the pulse is not active.
    if (!state.isPulsing) return
    // Schedule deactivation so the pulse auto-expires after the animation window.
    const timer = setTimeout(
      () => setState((s) => ({ ...s, isPulsing: false })),
      durationMs,
    )
    return () => clearTimeout(timer)
  }, [state.isPulsing, durationMs])

  return state.isPulsing
}
