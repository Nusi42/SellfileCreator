import { useEffect, useRef } from 'react'

import { normalizeExternalCommand, type ExternalCommand } from '../lib/externalCommands'

export type UseExternalCommandsOptions = {
  pushEndpoint: string | undefined
  onCommand: (command: ExternalCommand) => void
  onReachabilityChange: (reachable: boolean) => void
}

/**
 * useExternalCommands
 *
 * Polls the configured push endpoint for external commands, normalizes them,
 * and forwards each event to the provided handler. Keeps the reachability flag
 * in sync so the app can expose live push controls only when the endpoint
 * responds successfully.
 */
export function useExternalCommands({
  pushEndpoint,
  onCommand,
  onReachabilityChange,
}: UseExternalCommandsOptions): void {
  const handlerRef = useRef(onCommand)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    handlerRef.current = onCommand
  }, [onCommand])

  useEffect(() => {
    if (typeof window === 'undefined' || !pushEndpoint) {
      return undefined
    }

    let cancelled = false

    const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms) })
    const isRecord = (value: unknown): value is Record<string, unknown> => (
      Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    )

    const run = async () => {
      while (!cancelled) {
        try {
          const base = pushEndpoint.endsWith('/') ? pushEndpoint : `${pushEndpoint}/`
          let commandsUrl: URL
          try {
            commandsUrl = new URL('commands', base)
          } catch {
            const fallback = base.endsWith('/') ? `${base}commands` : `${base}/commands`
            commandsUrl = new URL(fallback)
          }
          const controller = new AbortController()
          abortRef.current = controller
          const response = await fetch(commandsUrl.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
          })
          abortRef.current = null
          if (cancelled) return
          onReachabilityChange(true)
          if (response.status === 204) {
            await sleep(1000)
            continue
          }
          if (!response.ok) {
            await sleep(2000)
            continue
          }
          let payload: unknown = null
          try {
            payload = await response.json()
          } catch {}
          if (!payload) {
            await sleep(1000)
            continue
          }
          const record = isRecord(payload) ? payload : {}
          const eventsCandidate = Array.isArray(record.events)
            ? record.events as unknown[]
            : Array.isArray((record.Events as unknown[]))
              ? record.Events as unknown[]
              : []
          for (const raw of eventsCandidate) {
            const normalized = normalizeExternalCommand(raw)
            if (!normalized) continue
            try {
              handlerRef.current(normalized)
            } catch (err) {
              if (import.meta.env.DEV) {
                console.error('Failed to apply external command', err)
              }
            }
          }
          if (eventsCandidate.length === 0) {
            await sleep(1000)
          } else {
            await sleep(100)
          }
        } catch (err) {
          abortRef.current = null
          if (cancelled) return
          const name = (err as { name?: string }).name
          if (name === 'AbortError') {
            continue
          }
          onReachabilityChange(false)
          await sleep(2000)
        }
      }
    }

    run()

    return () => {
      cancelled = true
      const controller = abortRef.current
      if (controller) {
        try { controller.abort() } catch {}
        abortRef.current = null
      }
    }
  }, [onReachabilityChange, pushEndpoint])
}

export default useExternalCommands
