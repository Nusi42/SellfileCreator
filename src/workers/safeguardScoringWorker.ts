/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { ensureWasmRuleEngineReady } from '../lib/wasm/wasmRuleEngine'
import { scoreSafeguardCandidates } from '../lib/safeguards'
import type { SafeguardDetectionArtifact, SafeguardCandidateOut } from '../lib/safeguards'
import type { StatVariant } from '../lib/types'

declare const self: DedicatedWorkerGlobalScope

// Pre-warm WASM as soon as the worker starts so the first scoring request
// does not pay the initialization latency. No pre-grow: scoring needs minimal heap.
void ensureWasmRuleEngineReady()

self.onmessage = async (event: MessageEvent<{
  id: number
  artifacts: SafeguardDetectionArtifact[]
  substats: number[]
  weights: Record<number, number>
  requiredCount: number
}>) => {
  const { id, artifacts, substats, weights, requiredCount } = event.data
  try {
    // No-op after the first call — ensures WASM is ready even if pre-warm hasn't resolved yet.
    await ensureWasmRuleEngineReady()
    const candidates: SafeguardCandidateOut[] = scoreSafeguardCandidates({
      artifacts,
      substats: substats as unknown as StatVariant[],
      weights,
      requiredCount,
    })
    self.postMessage({ id, candidates })
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  }
}

export {}
