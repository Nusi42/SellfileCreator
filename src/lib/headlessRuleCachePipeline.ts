/**
 * headlessRuleCachePipeline.ts
 *
 * One-shot rule-cache pipeline for flows that must build merged rules OUTSIDE the live
 * session — currently the background account-push (see docs/technical/accounts.md).
 *
 * Why a dedicated worker instead of the live useRuleCacheWorker instance: the live
 * scheduler is latest-only (a background payload would supersede or be superseded by
 * the user's own pipeline), and the worker keeps document-keyed skip-caches that a
 * foreign account's payload would poison. A fresh worker per run avoids both; the cost
 * is a temporary second WASM heap, bounded by terminating the worker in `finally`.
 */
import RuleCacheWorker from '../workers/ruleCacheWorker?worker&inline'
import type {
  RuleCachePipelineRequest,
  RuleCacheWorkerRequest,
  RuleCacheWorkerResponse,
} from '../workers/ruleCacheWorkerTypes'
import type { HsfRuleWithRecipe } from './merge'
import { ensureWasmRuleEngineReady, getCompiledWasmRuleEngineModule } from './wasm/wasmRuleEngine'
import { getCaptureSessionId } from './packetCapture'
import { pauseAllDsimWorkers, signalPipelineDone } from './wasmWorkerSlot'

// Everything the worker needs except the plumbing fields this module owns.
export type HeadlessPipelineParams = Omit<RuleCachePipelineRequest['payload'], 'generation' | 'emitProgressEvents'>

export type HeadlessPipelineOutcome = {
  // Final merged rules with safeguards injected — ready for buildHsfFileFromMerged.
  mergedRules: HsfRuleWithRecipe[]
  // Worker-computed export crc of exactly those rules (same SSOT as the live dirty check).
  mergedRulesHash: string
}

// Background builds are bounded: a hung worker must not leak a ~460 MB WASM heap forever.
const HEADLESS_PIPELINE_TIMEOUT_MS = 120_000

/**
 * Hand the compiled WASM module to a freshly spawned rule-cache worker (the mandatory
 * `init-wasm` handshake — a worker without it hangs on its wasmReadyPromise forever).
 * SSOT shared with useRuleCacheWorker's spawn path; throws when the module is missing
 * so one-shot callers fail fast (the hook swallows that to keep its old behavior).
 */
export const postRuleCacheWasmInit = async (worker: Worker): Promise<void> => {
  // Resolves immediately after the app-startup warmup; only cold paths actually wait.
  await ensureWasmRuleEngineReady()
  const mod = getCompiledWasmRuleEngineModule()
  if (!mod) throw new Error('rule-engine WASM module unavailable')
  // Dev-only: tee the worker's console output into the active capture session.
  const captureSessionId = import.meta.env.DEV ? getCaptureSessionId() : null
  worker.postMessage({ kind: 'init-wasm', wasmModule: mod, captureSessionId } satisfies RuleCacheWorkerRequest)
}

/**
 * Spawn a dedicated worker, run exactly one pipeline, return the merged rules + export
 * crc, and terminate the worker. Serial by design — callers queue their own runs.
 */
export const runHeadlessRuleCachePipeline = async (
  params: HeadlessPipelineParams,
): Promise<HeadlessPipelineOutcome> => {
  const worker = new RuleCacheWorker()
  // Soft-pause dungeon-sim workers so their WASM heaps do not coexist with this run's.
  // If a LIVE pipeline is mid-flight this pause/signal pair may overlap with its own —
  // the broadcast has no counting, so the worst case is dsim resuming a bit early; that
  // is a transient memory-pressure nuance, never a correctness issue.
  pauseAllDsimWorkers()
  try {
    await postRuleCacheWasmInit(worker)
    return await new Promise<HeadlessPipelineOutcome>((resolve, reject) => {
      // One settle path: clear the timeout whichever way the run ends.
      const timeoutId = setTimeout(() => {
        reject(new Error('headless rule-cache pipeline timed out'))
      }, HEADLESS_PIPELINE_TIMEOUT_MS)
      const settleReject = (reason: Error) => {
        clearTimeout(timeoutId)
        reject(reason)
      }
      worker.addEventListener('message', (event: MessageEvent<RuleCacheWorkerResponse>) => {
        const data = event.data
        if (!data) return
        if (data.kind === 'pipeline:done') {
          // A fresh worker has no skip-cache, so its first response always carries the
          // full rule set; a null here means the contract changed — fail loudly.
          if (!data.payload.mergedRules) {
            settleReject(new Error('headless pipeline returned no merged rules'))
            return
          }
          clearTimeout(timeoutId)
          resolve({ mergedRules: data.payload.mergedRules, mergedRulesHash: data.payload.mergedRulesHash })
          return
        }
        if (data.kind === 'error') settleReject(new Error(data.error))
      })
      // Worker-level faults (script error, WASM trap) reject instead of hanging.
      worker.addEventListener('error', () => settleReject(new Error('headless rule-cache worker crashed')))
      worker.addEventListener('messageerror', () => settleReject(new Error('headless rule-cache worker message error')))
      const request: RuleCachePipelineRequest = {
        id: 1,
        kind: 'pipeline',
        // generation is per-worker state; a one-shot worker always starts at 1.
        payload: { generation: 1, ...params, emitProgressEvents: false },
      }
      worker.postMessage(request)
    })
  } finally {
    // Always reclaim the second WASM heap, success or failure.
    worker.terminate()
    // Resume dsim workers; `false` = the LIVE session's rules did not change.
    signalPipelineDone(false)
  }
}
