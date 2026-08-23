# Tutorial and Onboarding

## Help Dialog

- Rendering: `src/components/HelpDialog.tsx` renders `userDocs/README.md` (or the matching `userDocs/README.<lang>.md`, imported as raw strings via a Vite `?raw` glob) using `@uiw/react-md-editor`'s Markdown preview with `rehype-sanitize` for safety.
- First-run gating: On mount, `App` compares `localStorage.getItem(README_SEEN_VERSION_KEY)` with `APP_VERSION`. If they differ, the Help dialog opens. When the dialog closes, the app writes the current `APP_VERSION` to `README_SEEN_VERSION_KEY` to avoid reopening until the version changes.
- UX: A clearly labeled Help button sits to the right of the three top-right caption lines in the header and opens the Help dialog on demand.
- Constants: `README_SEEN_VERSION_KEY = 'sellfileCreator.readme.seen.version'` lives in `src/lib/constants.ts` and centralizes the storage key.
- Style: `userDocs/README.md` is strictly user-facing. Keep language simple and practical (ELI5 level), similar to tooltips/tutorial copy. Avoid phrasing that suggests AI authorship. Using Raid: Shadow Legends terminology is okay where it helps players. The app is closed source, so the README (like everything in `userDocs/`) must never mention file paths, module names, or other internals — see [User-facing docs](../TECHNICAL.md#user-facing-docs-userdocs).

## Tutorial Coach

- Overlay: `src/components/tutorial/TutorialCoach.tsx` renders a lightweight coachmark overlay that highlights elements by `data-tour-id` and shows step text with Back/Next controls. The coach dialog is slightly wider on desktop (`sm: 860px`) to accommodate section breadcrumbs without ellipsis.
- Gating: The Help dialog auto-opens once per app version (keyed by `README_SEEN_VERSION_KEY`). The walkthrough only starts when the user clicks Start; finishing stores `APP_VERSION` under `TUTORIAL_SEEN_VERSION_KEY = 'sellfileCreator.tutorial.seen.version'` in `src/lib/constants.ts` so completion for that version is recorded.
- Manual start: `HelpDialog` includes a bottom-left "Start Tutorial" button. The dialog surfaces README content and acts as the entry point.
- Steps: `src/hooks/useTutorialCoachState.ts` constructs the typed `TutorialStep[]` and wires the scripted examples: a basic Speed-Boots recipe, metaset creation and application, an advanced DPS recipe covering substats/Min Required Rolls/Flex, a third Banner-SPD recipe demonstrating the Auto-Late (early/late keep) mode, a Gear Inspector walkthrough, Final Sell, a Safeguards walkthrough, and Save & Export. Each step can register a `before` action to stage builder state before the overlay renders.
- Targets: A step can highlight a single `targetId` or multiple `targetIds: string[]`. When multiple are given, the overlay hole covers the union of all target rects.
- Targets: Key controls expose `data-tour-id` attributes: rank/rarity/faction selects, mainstat group, slots, sets Select, add-recipe button, SFC load/save buttons, Min Required Rolls, Thresholds groups, and the builder mode toggle (recipe vs. safeguard).

### Navigation

- Breadcrumbs: The dialog footer shows section breadcrumbs in order: Basics, Metasets, Advanced, Flex, Auto-Late, Gear Inspector, Final Sell, Safeguards, Save & Export. Clicking a section jumps there; the current section is clickable too (jumps to its first step).
- Emoji feedback: When skipping forward/backward, a small emoji rises briefly over the section being left (🙁 for forward/skip, 👍 for rewind). Jumps happen immediately; the animation runs independently. No emoji is shown when clicking the current section.

### Jump Hydration

- Intent: Section jumps reconstruct state as if the user walked through intermediate steps, rather than literally skipping.
- Implementation: On jump, the app resets to a clean baseline and replays step effects up to the target index (slots, mainstat, sets, substats, required count, min rolls, locked roll floors, flex toggle, early/late mode, recipe adds/selection, metaset creation/defaults, metaset selection, Gear Inspector items, preview mode, Tools dialog open/tab, safeguard rules, builder mode, Final Sell defaults).
- Gear Inspector hydration: when a jump lands on or past the Gear Inspector steps, `nextGearInspectorItems` is populated via `buildTutorialGearInspectorItems()` and `nextPreviewMode` is set to `'gearInspector'`. `nextLogicHubOpen` and `nextLogicHubDialogTab` are set to `LOGIC_HUB_DIALOG_TAB_GEAR` for any step that expects the integrated Gear tab open.
- Safeguard hydration: when a jump lands on or past `safeguards-intro`, `nextBuilderMode` is set to `'safeguard'`, `nextSafeguardRules` is populated via `buildTutorialSafeguardRules()`, and `nextSafeguardsEnabled` is set to `true`.
- Determinism: After hydration, the target step's `before` still opens/closes any dialogs/menus to match the intended view.

### Behavioral Details

- Highlight hole: The overlay darkens everything except the current target rect (four masking panes). A brief fade-out "ghost" (180ms) smooths transitions when the target changes or vanishes (e.g., menus/dialogs closing).
- Auto-scroll: The coach scrolls the target into view on every step, including rAF+timeout recomputes to handle MUI portal timing.
- Step normalization: Each step can prepare UI state via `before` (e.g., ensure metasets dialog open/closed, open/close Sets menu, open/close chips context menu, open/close Preview header menu, open/close the Tools dialog, switch builder mode). This keeps navigation robust when moving back and forth.
- Targeted closers: To reliably close menus under the overlay, the coach dispatches `Escape` directly to portals (`ul[role=listbox]`, `[data-tour-id="chips.menu"]`, `[data-tour-id="chip.menu"]`, `[data-tour-id="preview.header.menu"]`) and then sends a synthetic outside click (on `document.body`). Sets menu closing also ESCs the listbox itself.
- Text emphasis: Step bodies support backticks `` `code` `` (UI keywords render primary + bold) and double tildes `~~brand~~` for emphasis styling with a subtle heartbeat.

### Session Handling

- Snapshot/restore: On tutorial start, the app snapshots the full SFC state in memory (recipes, selection, metasets, substatTargets, final-sell, safeguard rules, safeguards/recipes enabled flags, note, builder, Gear Inspector items, preview mode, Tools dialog open state and tab, safeguard improvement-chance display flag) and resets to a clean default so the walkthrough is deterministic. On exit or finish, the snapshot is restored exactly.
- Exit hygiene: On exit/finish, the app first closes all transient UI (menus, dialogs, context menus), then restores the snapshot, then closes the coach. Autosave resumes after the original state is back in place.
- Autosave: Paused while the tutorial runs to avoid overwriting the user's real session. Resumes after exit/finish.
- History: Tutorial-driven resets, jumps, and snapshot restores suppress undo/redo history entries so the timeline only reflects user edits.

## Extending the Tutorial

### Section Anchors

- Give the first step of the section a stable `id` (e.g., `'my-feature-intro'`).
- Add `{ label, index: find('<first-step-id>') }` to the `sections` array in the hook's `startTutorial()`.
- The breadcrumb will render automatically if `index >= 0`.

### Hydration Effects

- Jumps reconstruct state by replaying step effects (a `switch` on `step.id`) inside the `handleTutorialSkipTo` callback defined in `useTutorialCoachState` (just below `startTutorial()`).
- To support a new step that mutates state, add a `case '<step-id>'` and update the in-memory variables:
  - `nextBuilder` (slots, mainstats, substats, locks, counts, rolls, name, flex, early/late mode, etc.)
  - `nextRecipes` / `nextSel` (when a step "adds" the current builder as a recipe)
  - `nextMetas` (create/merge metasets; reuse `makeMetasetId()` and `defaultMetasets()` as needed)
  - `nextFsr` (Final Sell defaults: no level ranges selected plus the sets mode)
  - `nextGearInspectorItems` (populate via `buildTutorialGearInspectorItems()` for Gear Inspector steps)
  - `nextPreviewMode` (`'rules'` or `'gearInspector'`)
  - `nextLogicHubOpen` / `nextLogicHubDialogTab` (match whatever the step's `before` expects)
  - `nextSafeguardRules` / `nextSafeguardsEnabled` / `nextBuilderMode` (for safeguard steps)
- Keep mutations minimal and explicit so later tweaks to a step can be mirrored here safely.
- **Recipe display name lives in `appearance.name`, not a top-level `name`.** A step that names a recipe must write `appearance: { ...prev.appearance, name: … }` in *both* its `before()` hook and its `handleTutorialSkipTo` replay `case`. Writing a bare `{ ...prev, name: … }` in the `before()` is a silent no-op (the builder input and preview read `appearance.name`), so the name only appears after a Back replay (which historically already used `appearance.name`) — a forward Next leaves the recipe nameless. The `name` (Recipe #2) and `auto-late-slot` (Recipe #3) steps use shared constants (`TUTORIAL_ADVANCED_RECIPE_NAME`, `TUTORIAL_AUTO_LATE_RECIPE_NAME`) so both paths cannot drift.
- For any new dialogs or menus, add an `ensureXxx(open: boolean)` helper and call it in the step's `before` to guarantee the expected UI state.
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
- If a portal target occasionally opens late, trigger a short `setTimeout` retry inside the step's `before` to reopen it once.

### Gear Inspector Coverage

- The Gear Inspector section sits between Auto-Late and Final Sell. `gear-inspector-open` highlights `data-tour-id="builder.tools-button"` (the Tools button in the builder panel) with the Tools dialog closed, so the narration introduces the button before the user opens it. `gear-inspector-add-manual` opens the Tools dialog on the Gear tab (`ensureFinalSellGearTab(true)`) and highlights the dialog container plus the Add button (`gear-inspector.dialog`, `gear-inspector.add-manual`); the four scripted items are loaded into state at this point. The follow-up `gear-inspector-preview` closes the Gear tab and switches `previewMode` to `'gearInspector'`, highlighting `preview.paper-top` so the Gear Inspector grid is visible alongside the rule outcomes.
- The four scripted items in `buildTutorialGearInspectorItems()` are: (1) 5★ Epic Refresh Banner, ACC main, SPD substat — matches Recipe #3; (2) 4★ Uncommon Knight Revenant Amulet, CDMG main — no recipe match, caught by Final Sell; (3) 5★ Rare Refresh Banner, RES main — no SPD substat, fails Recipe #3's roll filter, kept by the Safeguard rule; (4) 5★ Epic Lethal Boots, HP main, SPD+CR+CDMG substats — matches Recipe #2.

### Safeguards Coverage

- The Safeguards section follows Final Sell. `safeguards-intro` closes the Tools dialog, switches the builder to **Safeguard mode** (`setBuilderMode('safeguard')`), and targets `['builder.core', 'safeguards.builder']` to introduce the concept with an empty rule form. `safeguards-rule` adds the predefined tutorial rule via `buildTutorialSafeguardRules()`, selects it, and targets `['safeguards.chip.tutorial-refresh-safeguard', 'safeguards.builder']` so users see the rule chip alongside its form. The rule protects: Banner slot, Refresh set, ranks 5–6, Rare–Legendary rarity, RES main stat, HP or DEF substats (Any match). `safeguards-payoff` switches `previewMode` to `'gearInspector'` and highlights `preview.paper-top` so all four scripted items and their pipeline outcomes (recipe keep ×2, Final Sell sell, Safeguard keep) are visible at once.
