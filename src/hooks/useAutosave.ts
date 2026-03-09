/**
 * useAutosave
 *
 * Encapsulates autosave writes and flush-on-exit behavior. The caller
 * controls when autosave becomes enabled (e.g., after restore choice).
 */
import { useCallback, useEffect, useRef } from 'react'
import { saveAutosave } from '../lib/autosave'

type IdleHandle = number
const NO_SIGNAL_SENTINEL = Symbol('autosave:no-signal')

const hasWindow = typeof window !== 'undefined'
// Prefer idle callbacks so heavy payload serialization runs off the interaction path.
const requestIdleWork = (cb: () => void, timeoutMs: number): IdleHandle => {
  if (hasWindow && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(() => cb(), { timeout: timeoutMs })
  }
  // Fallback keeps behavior cross-browser when requestIdleCallback is unavailable.
  return globalThis.setTimeout(cb, Math.min(64, timeoutMs))
}
// Shared cancel helper keeps timeout/idle cleanup in one place.
const cancelIdleWork = (handle: IdleHandle): void => {
  if (hasWindow && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle)
    return
  }
  globalThis.clearTimeout(handle)
}

type UseAutosaveOptions = {
  key: string
  // Eager payload path used by existing callers.
  payload?: unknown
  // Lightweight signal that marks "content changed"; this can avoid eagerly
  // allocating/serializing heavy payloads every render.
  payloadSignal?: unknown
  // Lazy payload builder invoked only when we actually persist.
  buildPayload?: () => unknown
  enabled: boolean
  debounceMs?: number
  // Control whether enabling autosave should force an immediate write.
  writeOnEnable?: boolean
  // Run post-debounce writes in idle periods to avoid blocking interactions.
  idle?: boolean
  // Deadline passed to requestIdleCallback (or timeout fallback).
  idleTimeoutMs?: number
  beforeSave?: () => void
}

export function useAutosave(opts: UseAutosaveOptions) {
  const {
    key,
    payload,
    payloadSignal,
    buildPayload,
    enabled,
    debounceMs = 0,
    writeOnEnable = true,
    idle = true,
    idleTimeoutMs = 2_000,
    beforeSave,
  } = opts
  const lastRef = useRef<unknown>(null)
  const debounceRef = useRef<number | null>(null)
  const idleRef = useRef<IdleHandle | null>(null)
  // Track the transition so "enabled=true" writes exactly once per activation.
  const prevEnabledRef = useRef<boolean>(false)
  // Keep the last observed change-signal so enable/disable flips cannot reschedule
  // heavy payload work when the underlying data did not actually change.
  const lastScheduledSignalRef = useRef<unknown>(NO_SIGNAL_SENTINEL)
  // Prefer explicit payloadSignal; fall back to payload identity for eager callers.
  const changeSignal = payloadSignal !== undefined ? payloadSignal : payload

  // Stable payload resolver lets us decouple "when to save" from "how to build".
  const resolvePayload = useCallback((): unknown => {
    if (buildPayload) return buildPayload()
    return payload
  }, [buildPayload, payload])

  const writeSnapshot = useCallback(() => {
    try {
      beforeSave?.()
    } catch {}
    const nextPayload = resolvePayload()
    lastRef.current = nextPayload
    saveAutosave(key, nextPayload)
  }, [beforeSave, key, resolvePayload])

  const clearScheduledWrite = useCallback(() => {
    // Clear pending debounce timers when the source payload changes again.
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    // Clear pending idle callbacks so stale payloads cannot be written later.
    if (idleRef.current !== null) {
      cancelIdleWork(idleRef.current)
      idleRef.current = null
    }
  }, [])

  // Key changes target a different storage bucket, so force a fresh first write.
  useEffect(() => {
    lastScheduledSignalRef.current = NO_SIGNAL_SENTINEL
  }, [key])

  const scheduleWrite = useCallback(() => {
    // Callers can opt out of idle scheduling for tiny payloads/tests.
    if (!idle) {
      try { writeSnapshot() } catch {}
      return
    }
    // Replace any existing idle callback with the newest payload snapshot.
    if (idleRef.current !== null) {
      cancelIdleWork(idleRef.current)
      idleRef.current = null
    }
    idleRef.current = requestIdleWork(() => {
      idleRef.current = null
      try { writeSnapshot() } catch {}
    }, idleTimeoutMs)
  }, [idle, idleTimeoutMs, writeSnapshot])

  // Persist immediately when enabled flips true so first-time sessions still get a snapshot right away.
  useEffect(() => {
    const wasEnabled = prevEnabledRef.current
    prevEnabledRef.current = enabled
    if (!enabled || wasEnabled || !writeOnEnable) return
    try { writeSnapshot() } catch {}
    // Skip the follow-up debounce cycle when enable already wrote this signal.
    lastScheduledSignalRef.current = changeSignal
  }, [changeSignal, enabled, writeOnEnable, writeSnapshot])

  // Write on subsequent payload changes (post-render), honoring debounce to reduce churn.
  useEffect(() => {
    if (!enabled) return undefined
    // Ignore no-op rerenders so we only debounce real payload changes.
    if (Object.is(lastScheduledSignalRef.current, changeSignal)) return undefined
    lastScheduledSignalRef.current = changeSignal
    // New payload signal invalidates both the pending debounce and idle work.
    clearScheduledWrite()
    // Store the timer id locally so clearTimeout is visible to the lint rule in the cleanup.
    let timerId: number | null = window.setTimeout(() => {
      timerId = null
      debounceRef.current = null
      scheduleWrite()
    }, debounceMs)
    debounceRef.current = timerId
    return () => {
      // Direct clearTimeout satisfies the lint rule's cleanup tracing.
      if (timerId !== null) window.clearTimeout(timerId)
      clearScheduledWrite()
    }
  }, [changeSignal, clearScheduledWrite, debounceMs, enabled, scheduleWrite])

  // Flush on unload / when tab becomes hidden
  useEffect(() => {
    if (!enabled) return
    // On unload/when tab gets hidden, persist the latest known payload.
    // Fall back to a fresh payload resolve if we never wrote yet.
    const flush = () => {
      clearScheduledWrite()
      try {
        const cur = lastRef.current ?? resolvePayload()
        saveAutosave(key, cur)
      } catch {}
    }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [clearScheduledWrite, enabled, key, resolvePayload])
}
