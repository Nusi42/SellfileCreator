# Dungeon Simulator

The Tools dialog now includes a **Dungeon Drops** tab that simulates dungeon farming outcomes using the current HSF rule set.

## Data Sources

- Set availability is derived from the dungeon/set mapping in `docs/TECHNICAL.md` (Ice Golem, Fire Knight, Dragon, Spider).
- Drop tables are transcribed from published loot tables (normal, hard and Spider's Den dungeon tables). The source screenshots are third-party material and are not part of the repository.
- Reference sources: Ayumilove loot table page (retrieved **2026-02-08**) and Tyrauku video (published **2024-08-22**).
- Event dungeon drop anchors are transcribed from the published event drop-rate table (Stage 20/24/30).

## Simulation Defaults

- Runs per dungeon stage: **100000** (fixed, non-configurable).
- Worker fallback (no worker support) uses **500** runs per dungeon to keep the UI responsive.
- Simulation runs in a worker and streams updates every **250** runs (throttled to at most once per second).
- Levels evaluated: **+0 / +4 / +8 / +12 / +16**.
- Simulation mode is persisted:
- Level-up (default) stops rolling after the first failed keep check.
- Snapshot keeps rolling items through +16 even if they would be sold earlier.
- The refresh icon beside Simulation mode reruns the full simulation for all dungeons without changing inputs.
- Stage selection is per dungeon and persisted in localStorage.
- Standard dungeons allow Normal **1–25** / Hard **1–10** (default **Hard 10**).
- Event dungeon allows Normal **1–30** only (default **Normal 30**).
- Dungeon tables start collapsed; collapse state is persisted.
- Ctrl/Cmd+click or right-click on the collapse chevron toggles all dungeon tables to the same state.
- Collapsed tables show a single milestone row (default **+16**); the rotate icon cycles **+0 / +4 / +8 / +12 / +16** per dungeon and the selection is persisted.
- Left-click rotates forward, right-click rotates backward, and Ctrl/Cmd+click or Ctrl/Cmd+right-click sync the chosen milestone across all dungeons.
- Set drop rates are treated as equal across all sets for a dungeon unless a boosted set is configured (Event spotlight/non-spotlight split still applies).
- Boosted set selection is available for **Fire Knight / Dragon / Ice Golem** only, with **Off / 2× / 3×** weighting on the chosen set.
- Boosted set selections are persisted in localStorage and re-run the simulator when changed.
- Ice Golem / Fire Knight / Dragon drop artifacts only.
- Spider drops accessories only with the **No Gear-Set** sentinel.
- Event drops artifacts **and** accessories, all tagged with the current spotlight set.
- Event spotlight set can be toggled between **Chronophage** and **Pinpoint** (same spotlight rate).
- Event non-spotlight artifacts are split evenly across **Critical Rate / Accuracy / Curing / Daze / Critical Damage**.
- Event spotlight toggles reuse cached results: both spotlights are simulated in the same run so switching is instant.

## Stage Weights

- Normal-mode rank/rarity weights come from the normal dungeon loot table.
- Hard-mode rank/rarity weights come from the hard-mode dungeon loot table.
- Event spotlight/accessory/5★/6★ rates are linearly interpolated between Stage **20 → 24 → 30** anchors.
- Event spotlight/accessory anchors clamp to the nearest known stage outside **20–30**.
- Event rarity uses normal tables through Stage **25**, then blends hard-mode tables for Stage **26–30**.

## Stat Generation

- Slot-specific main stat and substat pools use the shared catalogs in `src/lib/types.ts`.
- Substat roll timing follows the rarity schedule documented in `docs/TECHNICAL.md` (Common → Mythical).
- Substat values use the current **Substat Targets** minima for the item’s star rank.
- Mythical items apply the documented pre-roll at level 0.

## Keep Evaluation

- Each simulated item is evaluated against the merged HSF rules (including Final Sell + Safeguards).
- A cell’s keep percentage reflects **kept items / total simulated drops** for that dungeon stage.
- Collapsed tables show the selected milestone’s keep share (kept at that milestone, as a share of all drops).
- Percent precision is dataset-driven per dungeon table: the smallest non-zero keep rate sets the decimal count (min 2, max 6), capped by simulation resolution so digits beyond the run granularity are hidden; slot+main breakdowns may raise precision within that cap.
- In Level-up mode, items that fail a milestone are not rolled further; detailed stats only include items that reached the queried level.
- The popover breakdown renders a 3×3 slot grid with per-main-stat percentages (share of all drops for that cell).
- Clicking a slot+main row opens a nested popover where you pick explicit substats and see ≥1/2/3/4 presence, ≥1/2/3/4 roll counts, and runs-needed estimates (computed from the cached simulation run data).

## Worker Lifecycle and WASM Mutual Exclusion

Both simulator instances — the **Tools dialog sim** (`useDungeonSimulatorWorker`) and the **Note dialog sim** (`useDungeonNoteSimulator`) — share the same `dungeonSimulatorWorker.ts` WASM worker. The rule-cache pipeline also uses WASM. To prevent both WASM heaps from being live simultaneously, the two systems use a soft-pause / resume protocol coordinated through `src/lib/wasmWorkerSlot.ts`.

### Registration

Each dungeon-sim hook registers two callbacks at mount via `registerDsimCallbacks(pause, onPipelineDone)` and deregisters them via `clearDsimCallbacks(pause)` at unmount. Multiple hooks can be live simultaneously (e.g. both dialogs open at once); the slot module keeps an array of registrations.

### Soft pause (pipeline starts)

`useRuleCacheWorker` calls `pauseAllDsimWorkers()` at the start of every pipeline run (`startPipelineRunOnWorker`). This sends a `cancel` message to each registered worker — enough to break the batch loop — but does **not** terminate the worker, so `cachedSession` (the in-progress simulation state) survives intact.

### Resume / restart (pipeline queue drains)

Once the pipeline queue is fully empty, `signalPipelineDone(rulesChanged)` fires. Each hook's `onPipelineDone` callback decides what to do:

- **Tools-sim**: if `rulesChanged=false` and the worker is still alive, sends a `resume` message so the sim continues from exactly where it stopped. If `rulesChanged=true`, the stale `cachedSession` is discarded by terminating the worker; the sim effect restarts fresh when the new rules arrive. If the worker was idle-terminated before the pipeline started, `evictToken` is bumped regardless so the sim effect re-runs.
- **Note-sim**: delegates entirely to the `enabled = !pipelineRunning` prop; `onPipelineDone` is a no-op. The control effect's re-enable path decides whether to restart — gated by the completion flag described below (a completed run is left alone; a mid-flight run restarts fresh).

### Note-sim restart trigger: override epoch + completion gate

The note-sim's control effect (`useDungeonNoteSimulator`) restarts on **user intent**, never on rule-content identity. It deliberately does **not** compare `rules`/`substatTargets` — those are read live via refs at worker-send time, but a change to them alone never restarts. A run starts when either:

1. **a user restart is owed** — `userOverrideEpoch` advanced or `runs` changed, latched in `pendingRestartRef` (see below), or
2. **a mid-flight run re-enables** after a pause (`reenabledMidRun`).

`userOverrideEpoch` is a monotonic counter owned by `NoteDialog`, forwarded through `NoteRenderContext`. It is bumped at a single chokepoint: the wrapped `onRecipeOverridesAnswersChange` / `onSafeguardOverridesAnswersChange` setters. Every user-driven override mutation funnels through these two setters — per-question edits, reset-to-defaults, and the save/load/delete override-set controller — so all of them bump it, and nothing else can.

**Why a completion gate is needed (the push-restart trap).** The sim's `enabled` prop is `!pipelineRunning`, and *every* endpoint push that runs the rule-cache pipeline flips `pipelineRunning` true→false. Without a gate, the re-enable (`reenabled`) at the end of each push would restart the whole round-robin run from scratch — so background pushes would restart it constantly even though no user touched anything. The fix: `completedRef` tracks whether the round-robin run finished (all configs complete). On re-enable, a run that had **already completed** is left untouched (`reenabledMidRun` is false), so pushes never restart a completed sim. A run interrupted **mid-flight** is restarted fresh — not resumed — because a push may have changed `rules` and configs are read live at send time, so resuming would mix old and new rules within one run.

**Owed-restart latch (`pendingRestartRef`).** A user override edit bumps the epoch *and* triggers the rule-cache pipeline, which pauses the sim before the debounced start fires. A level-triggered epoch comparison would lose that owed start (the comparison advances on the next render, and a previously-*completed* run leaves `completedRef = true`, so the re-enable path would skip). To avoid this, a user restart (epoch/runs change) sets `pendingRestartRef = true`; it survives pauses and re-renders and is cleared only when a run **actually starts**. The control effect starts a run whenever `pendingRestartRef` is set (debounced) or a mid-flight run re-enables. So an edit always results in exactly one run after the pipeline settles, regardless of whether the prior run had completed.

**Invalidate-on-edit.** The same epoch/runs change clears the results map immediately (before the run starts), so every column renders its skeleton (`isConfigPending` = `!resultsByConfig.has(id)`) right away. The stale numbers do not linger while the pipeline recomputes; the fresh run then fills the skeletons in place.

**Consequence:** after a run completes, the sim reflects the rules as of that run and silently ignores subsequent background pushes until the next user override edit. The displayed odds can therefore lag live rules in that window — intended, given that pushes must never restart the sim.

### Note-sim round-robin scheduling (`simulate:multi`)

The note table has 6 configs spanning ~18 visible columns. Rather than running them sequentially (one config to completion, then the next — which fills the table block-by-block), the note-sim issues a **single** `simulate:multi` worker request carrying all 6 configs. The worker builds one session per config and **round-robins** a slice (`NOTE_SIM_SLICE_RUNS = 500`) through each session per round, emitting one `simulate:multi:progress` snapshot covering *all* configs each round. The hook merges the whole `resultsByConfig` map in one `setState`, so every column refines together — the table comes into focus at once instead of left-to-right. `NOTE_SIM_RUNS = 2500` per config → ~5 update rounds.

- **Memory stays flat despite 6 concurrent sessions.** The only per-session state that scales with run count is the substat *detail buffer* (`detailBySet`, one item pushed per run). The note-sim never issues detail queries, so its sessions are built with `collectDetail: false` — the buffer is neither allocated nor filled. What remains is the fixed-size accumulator state (cells per set × milestone), independent of run count. So 6 sessions × 2500 runs ≈ the memory of the old single 2000-run session. `collectDetail` defaults to `true`, so the Tools-dialog sim (which *does* run detail queries) is unaffected.
- **Overwrite-in-place.** A restart resets the accumulator refs but does **not** blank the displayed map; incoming snapshots overwrite each config's entry as fresh values arrive. No blank flash between runs (especially invisible since deterministic seeds mean the numbers usually barely move).

### Note-sim start debounce (deferring past the pipeline)

A user override edit bumps `userOverrideEpoch` immediately, but the *same* edit also triggers the rule-cache pipeline — debounced by `PIPELINE_DEBOUNCE_MS = 200` in `App.tsx`. If the sim started the instant the epoch bumped, the pipeline would pause+cancel it ~200ms later and the re-enable would restart it: the first run is pure waste and flickers numbers in then out.

To avoid this, a **user-driven** (re)start (epoch/runs change) is debounced by `NOTE_SIM_START_DEBOUNCE_MS = 300` — just above the pipeline debounce — so the edit coalesces into a single start *after* the pipeline settles. A **mid-run re-enable** (already past the pipeline) starts immediately, since there is nothing left to wait for. The pending-start timer is cleared on pause (`pauseNoteSim`), on disable, and on unmount; `activeRequestRef` also guards a stale timer from firing for a superseded run.

### `resume` worker message

`dungeonSimulatorWorkerTypes.ts` defines a `resume` request kind (`{ id, kind: 'resume', payload: { batchSize, throttleMs? } }`). The worker's `runResumedSimulation` handler reads `cachedSession` and calls the shared `runSessionToCompletion` helper, which is also used by fresh `simulate` runs. If `cachedSession` is null or already complete the handler is a no-op.

### `rulesChanged` detection

`useRuleCacheWorker` tracks `rulesChangedRef` (a `useRef<boolean>`). In the `pipeline:done` handler, `rulesChanged = data.payload.mergedRules !== null` — full pipelines send merged rules, artifact-only bursts send `null`. `rulesChangedRef.current` is updated there and read by `promoteQueuedPipeline`'s `.finally()` when calling `signalPipelineDone`.
