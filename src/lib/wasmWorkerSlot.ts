// Serializes WASM worker lifetime so dungeon-sim workers and the rule-cache worker
// never hold live WASM linear memory simultaneously.
//
// Each dungeon-sim hook registers two callbacks at mount via registerDsimCallbacks():
//   pause          — sends a soft 'cancel' message to the worker (preserves cachedSession)
//   onPipelineDone — called when the rule-cache queue drains; provides rulesChanged so
//                    each hook can decide whether to resume or restart from scratch
//
// The rule-cache hook calls pauseAllDsimWorkers() at the start of each pipeline run and
// signalPipelineDone(rulesChanged) once the queue is empty.  Any registered dsim that was
// paused during the pipeline receives onPipelineDone so it can resume or restart.
//
// Both callbacks are always registered/cleared as a matched pair.

// Registration entry: one entry per live dsim hook instance.
type DsimRegistration = {
  // Soft-pause: sends 'cancel' to the worker, preserving cachedSession.
  pause: () => void
  // Fires once the pipeline queue drains; rulesChanged=true means a fresh
  // simulate is required, false means resume from where the sim stopped.
  onPipelineDone: (rulesChanged: boolean) => void
}

// Active registrations; grows/shrinks as hooks mount/unmount.
const _registrations: DsimRegistration[] = []
// Tracks whether any sim was paused during the current pipeline batch;
// consumed (reset) by signalPipelineDone.
let _pendingRestart = false

// Called by each dungeon-sim hook on mount.
export const registerDsimCallbacks = (
  pause: () => void,
  onPipelineDone: (rulesChanged: boolean) => void,
): void => {
  _registrations.push({ pause, onPipelineDone })
}

// Called by each dungeon-sim hook on unmount.
// Matches by pause identity so each hook deregisters only its own entry.
export const clearDsimCallbacks = (pause: () => void): void => {
  const idx = _registrations.findIndex((r) => r.pause === pause)
  if (idx !== -1) _registrations.splice(idx, 1)
  // If all hooks have unmounted, reset pending state to avoid a ghost signal.
  if (_registrations.length === 0) _pendingRestart = false
}

// Called by the rule-cache hook at the start of each pipeline run (startPipelineRunOnWorker).
// Soft-pauses all live dsim workers and marks a restart as pending so they
// resume once the pipeline queue is fully drained.
export const pauseAllDsimWorkers = (): void => {
  if (_registrations.length > 0) {
    _pendingRestart = true
    for (const r of _registrations) r.pause()
  }
}

// Called by the rule-cache hook when the pipeline queue is fully drained.
// Fires each dsim's onPipelineDone callback so it can resume (rulesChanged=false)
// or restart from scratch (rulesChanged=true).
export const signalPipelineDone = (rulesChanged: boolean): void => {
  if (_pendingRestart) {
    _pendingRestart = false
    for (const r of _registrations) r.onPipelineDone(rulesChanged)
  }
}
