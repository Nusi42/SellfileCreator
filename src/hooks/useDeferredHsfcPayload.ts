/**
 * useDeferredHsfcPayload
 *
 * Builds HSFC payload snapshots during idle periods so large datasets do not
 * block the main thread every time builder state changes. The hook still
 * computes the initial snapshot synchronously so first render has data, but
 * subsequent updates queue the work in requestIdleCallback (or a setTimeout
 * fallback) and only publish once the serialization finishes.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildHsfcPayload } from '../lib/hsfcIO'
import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type { Metaset } from '../lib/metasets'
import type { KeepUniqueRule } from '../lib/keepUniques'

type BuildParams = {
  version: string
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  configs: BuilderConfig[]
  finalSellRemainder?: FinalSellRemainderConfig
  selectedConfigIndex: number | null
  note?: string
  keepUniqueRules?: KeepUniqueRule[]
  keepUniquesEnabled?: boolean
}

type IdleHandle = number
type IdleRequestCallback = (deadline: IdleDeadlineLike) => void

type IdleDeadlineLike = {
  didTimeout: boolean
  timeRemaining: () => number
}

const hasWindow = typeof window !== 'undefined'
const requestIdle: (cb: IdleRequestCallback) => IdleHandle = (() => {
  if (hasWindow && typeof window.requestIdleCallback === 'function') {
    return (cb) => window.requestIdleCallback(cb)
  }
  return (cb) => window.setTimeout(() => cb({
    didTimeout: false,
    timeRemaining: () => 0,
  }), 32)
})()

const cancelIdle = (() => {
  if (hasWindow && typeof window.cancelIdleCallback === 'function') {
    return (handle: IdleHandle) => window.cancelIdleCallback(handle)
  }
  return (handle: IdleHandle) => window.clearTimeout(handle)
})()

export function useDeferredHsfcPayload(params: BuildParams): {
  payload: ReturnType<typeof buildHsfcPayload>
  pending: boolean
} {
  const [state, setState] = useState(() => ({
    payload: buildHsfcPayload(params),
    pending: false,
  }))
  const latestParamsRef = useRef(params)
  latestParamsRef.current = params

  const dependencies = useMemo(() => ([
    params.version,
    params.metasets,
    params.substatTargets,
    params.configs,
    params.finalSellRemainder,
    params.selectedConfigIndex,
    params.note ?? null,
    params.keepUniqueRules,
    params.keepUniquesEnabled,
  ]), [
    params.configs,
    params.finalSellRemainder,
    params.keepUniqueRules,
    params.keepUniquesEnabled,
    params.metasets,
    params.note,
    params.selectedConfigIndex,
    params.substatTargets,
    params.version,
  ])

  useEffect(() => {
    let cancelled = false
    setState((prev) => (prev.pending ? prev : { ...prev, pending: true }))
    const handle = requestIdle(() => {
      if (cancelled) return
      const nextPayload = buildHsfcPayload(latestParamsRef.current)
      setState({ payload: nextPayload, pending: false })
    })
    return () => {
      cancelled = true
      cancelIdle(handle)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return state
}
