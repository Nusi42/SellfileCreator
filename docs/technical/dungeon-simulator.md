# Dungeon Simulator

The Tools dialog now includes a **Dungeon Drops** tab that simulates dungeon farming outcomes using the current HSF rule set.

## Data Sources

- Set availability is derived from the dungeon/set mapping in `docs/TECHNICAL.md` (Ice Golem, Fire Knight, Dragon, Spider).
- Drop tables are sourced from the images under `docs/` (`Dungeons_LootTable_DropRates.jpg`, `Dungeons_LootTable_DropRates_Hard.jpg`, `SpiderDen_LootTable_DropRate.jpg`).
- Reference sources: Ayumilove loot table page (retrieved **2026-02-08**) and Tyrauku video (published **2024-08-22**).
- Event dungeon drop anchors are sourced from `docs/EventDungeonDropRate.jpg` (Stage 20/24/30).

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

- Normal-mode rank/rarity weights come from `Dungeons_LootTable_DropRates.jpg`.
- Hard-mode rank/rarity weights come from `Dungeons_LootTable_DropRates_Hard.jpg`.
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
- **Note-sim**: delegates entirely to the `enabled = !pipelineRunning` prop. Because the note-sim's control effect treats `reenabled = true` as a clean restart, `onPipelineDone` is a no-op — the pipeline-running state change already triggers the correct reset path.

### `resume` worker message

`dungeonSimulatorWorkerTypes.ts` defines a `resume` request kind (`{ id, kind: 'resume', payload: { batchSize, throttleMs? } }`). The worker's `runResumedSimulation` handler reads `cachedSession` and calls the shared `runSessionToCompletion` helper, which is also used by fresh `simulate` runs. If `cachedSession` is null or already complete the handler is a no-op.

### `rulesChanged` detection

`useRuleCacheWorker` tracks `rulesChangedRef` (a `useRef<boolean>`). In the `pipeline:done` handler, `rulesChanged = data.payload.mergedRules !== null` — full pipelines send merged rules, artifact-only bursts send `null`. `rulesChangedRef.current` is updated there and read by `promoteQueuedPipeline`'s `.finally()` when calling `signalPipelineDone`.
