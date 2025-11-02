# Technical Details

The technical reference is now split across focused documents. Start here, then dive into the section you need:

- [Build and Tooling](technical/build-and-tooling.md) — stack, scripts, packaging, project structure, and the Tauri wrapper.
- [Application Behavior](technical/app-behavior.md) — builder guardrails, preview filters, rule cache fast paths, clipboard/save flows, file import, and the rule tester.
- [Tutorial and Onboarding](technical/tutorial.md) — help dialog, tutorial coach behavior, and guidance for extending scripted steps.
- [Rules and Data](technical/rules-and-data.md) — HSFC/HSF schemas, builder roll semantics, autosave plumbing, and migration notes.
- [UI and Layout](technical/ui-and-layout.md) — localization, metasets, preview UX, shared hooks, effect guidelines, and responsive layout constraints.
- [Artifact Rules](#artifact-rules) — slot catalogs, rarity/rank expectations, stat restrictions, and roll behavior.

> **Playwright in the Codex sandbox:** Run the Vite dev server on ports above `5180` (we default to `5182`). When the harness blocks the bind with an `EPERM` error, rerun the Playwright command with `with_escalated_permissions: true` and a concise `justification` so the server can listen on `127.0.0.1`.

All documents describe the *current* implementation; update the relevant file whenever the behavior changes so this index stays accurate.

### Performance Profiling (local only)

We do not ship instrumentation in production builds. When you need detailed HSFC/HSF timing data:
- Create a local branch and add a `perfTimeline.ts` helper that wraps `performance.now()` and exposes a global (keep the helper on the local branch only).
- Gate every `startPerfTimeline`/`markPerfEvent` call behind `if (import.meta.env.DEV)` so only the dev server records data.
- Extend the Playwright specs to read the timeline and print the deltas, but keep those changes off release branches.
- Drop the helper and undo the call sites before merging to main.

Without the helper, the Playwright perf tests fall back to the built-in measurements (note dialog and first-row render) so routine CI runs stay stable.

## Artifact Rules

### Gear Slots

- Artifacts: `Weapon`, `Helmet`, `Shield`, `Gauntlets`, `Chestplate`, `Boots`.
- Accessories: `Ring`, `Amulet`, `Banner`.
- The term *gear* covers artifacts and accessories; UI copy uses *type* and *slot* interchangeably.

### Faction Coverage

- Only accessories are faction-locked; artifact pieces ignore faction.
- Faction groups and their member factions:
  - **Telerian League** — Banner Lords, High Elves, Sacred Order, Barbarians.
  - **Gaellen Pact** — Ogryn Tribes, Lizardmen, Skinwalkers, Orcs.
  - **The Corrupted** — Demonspawn, Undead Hordes, Dark Elves, Knight Revenant.
  - **Nyresan Union** — Dwarves, Shadowkin, Sylvan Watchers.

### Rarity and Rank

- Rarities: Common (gray), Uncommon (green), Rare (blue), Epic (purple), Legendary (orange), Mythical (red).
- Ranks: 1★ through 6★.
- Any rank can pair with any rarity.

### Stats

- Main stat options: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`.
- Substat options draw from the same list.
- Gear never repeats a substat and never repeats the main stat as a substat.

### Leveling and Rolls

- Gear levels range from 0 to 16.
- Main stat values increase with every level; the increment is fixed per stat + rank.
- At levels 4, 8, 12, and 16 either a new substat is added or an existing substat rolls (gains a bonus):
  - **Common** — starts with 0 substats; adds one at 4/8/12/16.
  - **Uncommon** — starts with 1 substat; adds at 8/12/16.
  - **Rare** — starts with 2 substats; adds at 12/16.
  - **Epic** — starts with 3 substats; adds at 16.
  - **Legendary** — starts with 4 substats; rolls only.
  - **Mythical** — starts with 4 substats and has one pre-rolled bonus at level 0; rolls only afterward.
- When a substat rolls, the game applies a bonus from a stat- and rank-specific range (e.g., 6★ SPD gains +5 or +6). Builder heuristics anchor on the documented minimum values but higher rolls are possible.

### Main Stat by Slot

- `Weapon`: `ATK`
- `Helmet`: `HP`
- `Shield`: `DEF`
- `Gauntlets`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`
- `Chestplate`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `ACC`, `RES`
- `Boots`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `SPD`
- `Ring`: `ATK`, `HP`, `DEF`
- `Amulet`: `ATK`, `HP`, `DEF`, `CDMG%`
- `Banner`: `ATK`, `HP`, `DEF`, `ACC`, `RES`

### Substat by Slot

- `Weapon`: `HP`, `HP%`, `ATK`, `ATK%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Helmet`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Shield`: `HP`, `HP%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Gauntlets`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Chestplate`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Boots`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Ring`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`
- `Amulet`: `ATK`, `HP`, `DEF`, `CDMG%`, `ACC`, `RES`
- `Banner`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `SPD`

### Substat Minimum Values

| Rank | HP | HP% | ATK | ATK% | DEF | DEF% | CR% | CDMG% | ACC | RES | SPD |
| ---- | -- | --- | --- | ---- | --- | ---- | --- | ----- | --- | --- | --- |
| 5★   | 160 | 4% | 12 | 4% | 12 | 4% | 4% | 4% | 8 | 8 | 4 |
| 6★   | 200 | 5% | 15 | 5% | 15 | 5% | 5% | 5% | 9 | 9 | 5 |

- Interim baseline for 1–4★ gear (temporary implementation detail): use the 5★ target minus one unit for each stat (e.g., `HP = 159`, `HP% = 3%`, `SPD = 3`).
- When new substats are added at the level milestones they enter at least at these minimum values; actual in-game rolls can exceed them.

### Playwright Harness

- Fixtures live under `e2e/`:
  - `fixtures.ts` wires console mirroring and page-error logging so specs surface browser output in the CLI.
  - `app-init.ts` primes localStorage, forces `isSecureContext`, and (optionally) stubs the clipboard API for deterministic tests.
- Specs:
  - `e2e/smoke.spec.ts` is the canonical health-check (`npx playwright test e2e/smoke.spec.ts --project=chromium --reporter=list`).
  - `e2e/config-insert-order.spec.ts` guards the “paste after” ordering regression by loading `samples/Nusi_20251026_2036.hsfc`, performing copy/paste, and verifying row ordering.
- Sandbox specifics:
  - Playwright requires elevated permissions when binding Vite to `127.0.0.1:5182`; re-run the command with `with_escalated_permissions: true` if you hit `EPERM`.
  - The harness still logs `[Violation]` entries for slow handlers; ignore them unless a spec fails.
  - Some warm-cache aborts can emit `AbortError` in the console; the tests swallow them but keep an eye out for regressions.
