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
  // A change was observed but has not been written yet. This is the truth the unload flush
  // and the debounce effect consult — NOT the timer/idle handles, which the debounce
  // effect's own cleanup nulls whenever any dependency changes identity (e.g. the payload
  // builder re-created by a selection click) even though the signal did not. Without this
  // the cancelled write was never rescheduled and the flush saw "nothing pending".
  const pendingWriteRef = useRef(false)
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
    // Storage now holds the live state; only a new signal makes it pending again.
    pendingWriteRef.current = false
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
    // Ignore no-op rerenders so we only debounce real payload changes — unless a write is
    // still pending: this run may be a dependency-identity re-run whose cleanup just
    // cancelled that write, and it must be rescheduled, not forgotten.
    if (Object.is(lastScheduledSignalRef.current, changeSignal) && !pendingWriteRef.current) return undefined
    lastScheduledSignalRef.current = changeSignal
    pendingWriteRef.current = true
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
    // A change made just before the tab goes away is only known as PENDING work — it has
    // not reached lastRef, which is the payload of the last COMPLETED write. Persisting
    // lastRef here re-wrote what storage already held while the cancel below discarded the
    // pending change: an edit inside the debounce window (e.g. flip an override, hit F5)
    // was silently dropped on every reload. When work is pending, the flush must rebuild
    // from the LIVE state instead. Pending is read from pendingWriteRef, never from the
    // timer/idle handles — those are nulled by an effect cleanup that a cancelled-but-
    // unwritten change survives.
    const flush = () => {
      const pending = pendingWriteRef.current
      clearScheduledWrite()
      try {
        // No pending work and a write already landed: storage is current, nothing to do.
        // (Skipping also keeps tab-hides on an idle session write-free.)
        if (!pending && lastRef.current !== null) return
        // Pending change, or nothing ever written: persist a fresh snapshot now.
        writeSnapshot()
      } catch {}
    }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [clearScheduledWrite, enabled, writeSnapshot])
}
