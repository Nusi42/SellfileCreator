# Tutorial and Onboarding

## Help Dialog

- Rendering: `src/components/HelpDialog.tsx` renders the top-level `README.md` (imported as a raw string via `README.md?raw`) using `@uiw/react-md-editor`’s Markdown preview with `rehype-sanitize` for safety.
- First-run gating: On mount, `App` compares `localStorage.getItem(README_SEEN_VERSION_KEY)` with `APP_VERSION`. If they differ, the Help dialog opens. When the dialog closes, the app writes the current `APP_VERSION` to `README_SEEN_VERSION_KEY` to avoid reopening until the version changes.
- UX: A clearly labeled Help button sits to the right of the three top-right caption lines in the header and opens the Help dialog on demand.
- Constants: `README_SEEN_VERSION_KEY = 'sellfileCreator.readme.seen.version'` lives in `src/lib/constants.ts` and centralizes the storage key.
- Style: `README.md` is strictly user-facing. Keep language simple and practical (ELI5 level), similar to tooltips/tutorial copy. Avoid phrasing that suggests AI authorship. Using Raid: Shadow Legends terminology is okay where it helps players.

## Tutorial Coach

- Overlay: `src/components/tutorial/TutorialCoach.tsx` renders a lightweight coachmark overlay that highlights elements by `data-tour-id` and shows step text with Back/Next controls. The coach dialog is slightly wider on desktop (`sm: 860px`) to accommodate section breadcrumbs without ellipsis.
- Gating: The Help dialog auto-opens once per app version (keyed by `README_SEEN_VERSION_KEY`). The walkthrough only starts when the user clicks Start; finishing stores `APP_VERSION` under `TUTORIAL_SEEN_VERSION_KEY = 'sellfileCreator.tutorial.seen.version'` in `src/lib/constants.ts` so completion for that version is recorded.
- Manual start: `HelpDialog` includes a bottom-left “Start Tutorial” button. The dialog surfaces README content and acts as the entry point.
- Steps: `src/hooks/useTutorialCoachState.ts` constructs the typed `TutorialStep[]` and wires the scripted examples (basic recipe followed by an advanced recipe that covers substats, Min Required Rolls, and Milestone Thresholds). Each step can register a `before` action to stage builder state before the overlay renders.
- Targets: A step can highlight a single `targetId` or multiple `targetIds: string[]`. When multiple are given, the overlay hole covers the union of all target rects.
- Targets: Key controls expose `data-tour-id` attributes: rank/rarity/faction selects, mainstat group, slots (Boots), sets Select, add-recipe button, SFR load/save buttons, Min Required Rolls and Thresholds groups.

### Navigation

- Breadcrumbs: The dialog footer shows section breadcrumbs (Basics, Advanced, Metasets, Recipe Chips, Final Sell, Save & Export). Clicking a section jumps there; the current section is clickable too (jumps to its first step).
- Emoji feedback: When skipping forward/backward, a small emoji rises briefly over the section being left (🙁 for forward/skip, 👍 for rewind). Jumps happen immediately; the animation runs independently. No emoji is shown when clicking the current section.

### Jump Hydration

- Intent: Section jumps reconstruct state as if the user walked through intermediate steps, rather than literally skipping.
- Implementation: On jump, the app resets to a clean baseline and replays step effects up to the target index (slots, mainstat, sets, substats, required count, min rolls, recipe adds/selection, metaset creation/defaults, metaset selection, Final Sell defaults — Artifacts/Accessories off with the standard level ranges plus sets mode).
- Include tester state in replay: when a jump lands on or past the Gear dialog / Rule Tester steps, hydrate the gear queue, preview mode (`'tester'`), and tester filter state before showing the step. Reuse the same helpers the live tutorial uses (`useTesterItemsActions`, `setPreviewMode('tester')`, `setTesterFilters`) so jumps never flash empty grids, and set `logicHubOpen`/`logicHubDialogTab = LOGIC_HUB_DIALOG_TAB_GEAR` any time a step expects the embedded tester tab.
- Persist builder preference toggles: when a step toggles Auto reset or Auto apply, record the toggles in `nextPreferences` so replays and jumps keep the same defaults active.
- Determinism: After hydration, the target step’s `before` still opens/closes any dialogs/menus to match the intended view.

### Behavioral Details

- Highlight hole: The overlay darkens everything except the current target rect (four masking panes). A brief fade-out “ghost” (180ms) smooths transitions when the target changes or vanishes (e.g., menus/dialogs closing).
- Auto-scroll: The coach scrolls the target into view on every step, including rAF+timeout recomputes to handle MUI portal timing.
- Step normalization: Each step can prepare UI state via `before` (e.g., ensure metasets dialog open/closed, open/close Sets menu, open/close chips context menu, open/close Preview header menu, open/close Logic Hub). This keeps navigation robust when moving back and forth.
- Targeted closers: To reliably close menus under the overlay, the coach dispatches `Escape` directly to portals (`ul[role=listbox]`, `[data-tour-id="chips.menu"]`, `[data-tour-id="chip.menu"]`, `[data-tour-id="preview.header.menu"]`) and then sends a synthetic outside click (on `document.body`). Sets menu closing also ESCs the listbox itself.
- Text emphasis: Step bodies support backticks ``code`` (UI keywords render primary + bold) and double tildes `~~brand~~` for emphasis styling with a subtle heartbeat.

### Session Handling

- Snapshot/restore: On tutorial start, the app snapshots the full SFR state in memory (recipes, selection, metasets, substatTargets, final-sell, note, builder) and resets to a clean default so the walkthrough is deterministic. On exit or finish, the snapshot is restored exactly.
- Exit hygiene: On exit/finish, the app first closes all transient UI (menus, dialogs, context menus), then restores the snapshot, then closes the coach. Autosave resumes after the original state is back in place.
- Autosave: Paused while the tutorial runs to avoid overwriting the user’s real session. Resumes after exit/finish.
- History: Tutorial-driven resets, jumps, and snapshot restores suppress undo/redo history entries so the timeline only reflects user edits.

## Extending the Tutorial

### Section Anchors

- Give the first step of the section a stable `id` (e.g., `'my-feature-intro'`).
- Add `{ label, index: find('<first-step-id>') }` to the `sections` array in the hook’s `startTutorial()`.
- The breadcrumb will render automatically if `index >= 0`.

### Hydration Effects

- Jumps reconstruct state by replaying step effects (a `switch` on `step.id`) inside the `handleTutorialSkipTo` callback defined in `useTutorialCoachState` (just below `startTutorial()`).
- To support a new step that mutates state, add a `case '<step-id>'` and update the in-memory variables:
  - `nextBuilder` (slots, mainstats, substats, locks, counts, rolls, name, etc.)
  - `nextRecipes` / `nextSel` (when a step “adds” the current builder as a recipe)
  - `nextMetas` (create/merge metasets; reuse `makeMetasetId()` and `defaultMetasets()` as needed)
  - `nextFsr` (Final Sell defaults: no level ranges selected plus the sets mode)
- Keep mutations minimal and explicit so later tweaks to a step can be mirrored here safely.
- For any new dialogs or menus, add an `ensureXxx(open: boolean)` helper and call it in the step’s `before` to guarantee the expected UI state.
- Add targeted closers to `closeAllTransientUi()` if a new portal needs a direct `Escape`.

### Step Targets

- Tag the UI with a stable `data-tour-id` and reference it from the step `targetId`/`targetIds`.
- If you highlight an element rendered in a portal (e.g., MUI `Menu`/`Dialog`), consider a short retry in `before` if it mounts on the next tick.
- Portal retries reuse `tutorialTimersRef.current` (managed inside `useTutorialCoachState`) so only one reopen timer runs at a time.

### Example Step Additions

```ts
// Highlight the Sets selector, then the Metasets section inside the open menu
{
  id: 'sets-open',
  title: 'Select a Metaset',
  body: 'Open `Sets` and see your metasets at the top.',
  targetId: 'builder.sets',
  before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); },
},
{
  id: 'sets-metasets',
  title: 'Metasets in Sets',
  body: 'Your `Metasets` appear here at the top.',
  targetId: 'menu.metasets.section',
  before: () => {
    ensureMetasetsDialog(false); ensureSetsMenu(true); ensureChipsMenu(false);
    const timers = tutorialTimersRef.current
    if (timers.setsMenuRetryId !== null) { clearTimeout(timers.setsMenuRetryId); timers.setsMenuRetryId = null }
    timers.setsMenuRetryId = window.setTimeout(() => { ensureSetsMenu(true) }, 60)
  },
},

// Toggle Keep/Sell highlight (no state change required — the user can click it)
{
  id: 'action',
  title: 'Choose Action',
  body: 'Toggle between `Keep` and `Sell` to control outcomes.',
  targetIds: ['builder.action.keep', 'builder.action.sell'],
  before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureLogicHubDialog(false); },
}
```

### Verification

- After adding a step: run the tutorial, navigate forward/back; ensure the highlighted target is scrolled into view, menus/dialogs are opened/closed as expected, and the overlay hole does not clip the target.
- If a portal target occasionally opens late, trigger a short `setTimeout` retry inside the step’s `before` to reopen it once.

### Gear Dialog + Rule Tester Coverage

- The Gear dialog section (still inserted before Final Sell) now walks through the Logic Hub Gear tab. The `tester-open` step highlights the `Gear…` button in the preview header and expects it to open `LogicHubDialog` directly on the Gear tab before narration continues. The combined `tester-add-manual` (`Add a custom gear`) step keeps the dialog open while covering `.db` drag-and-drop, `%APPDATA%\RslHelper\Config` imports, `scripts/watchers/run-db-watcher.ps1`, and the scripted 5★ Rare Refresh amulet from the Banner Lords. The follow-up `tester-preview` step closes the Gear tab, switches the preview mode to `Rule Tester`, and highlights the Sellfile Preview ⇄ Rule Tester toggle so the scripted item is the only row rendered.

### Safeguards Coverage

- Right after the classic Final Sell steps, `safeguards-intro` opens Logic Hub, switches the tab to Safeguards, and describes how the automatic protections work. `safeguards-rule` focuses the rule editor (`data-tour-id="safeguards.rules"`) while the tutorial adds a predefined Refresh combo (Amulet slot, Refresh set, Banner Lords faction, CDMG main stat, 5★ Rare) so users see how to keep at least one Refresh accessory around before the Final Sell catch-alls run.
