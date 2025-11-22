# English Documentation Update Proposals

Each section below lists the precise copy gaps we found plus the new text to add or replace. All snippets are written for the English sources so you can review/edit them directly. While editing, rewrite the affected paragraph instead of bolting new sentences on top—keep the tone consistent, keep the wording simple, avoid repeating the same instructions twice, and stick to the in-app vocabulary so players see the same terms everywhere.

## README.md

### 1. Expand the "Min Required Rolls" paragraph (Builder layout)
- **README sections to touch:** `Builder layout (top → bottom)` → bullet `Min Required Rolls (global)`.
- **Gap:** The current copy only explains the global Min Required Rolls badge and never mentions the locked-only floor, how the lock clears the global badge, or what happens when Auto is toggled. The release notes specifically called out "locked floor clears global floor" and players now see an extra 🔒 badge without any guidance.
- **Proposed wording to insert immediately after the existing "Min Required Rolls (global)" bullet:**
  ```md
  - Locked Min Required Rolls (🔒) appears when at least one substat is locked. Click a number in the lock row to reserve that many rolls for the locked stats only; the rest of the builder keeps following the global minimum. If the lock equals or exceeds the highlighted global number, the global badge clears so the lock becomes the only aggregate floor. Unlocking the substat (or tapping Auto) clears both badges; picking a smaller global value re-lights the global badge alongside the lock so you can see which floor applies to which stats.
  - Example: Lock SPD and CR%, set Min Required Rolls = 3, then set the 🔒 row to 2. The builder now needs 3 total rolls across every selected substat, at least 2 of which must land on the locked SPD/CR% picks. Lock = 3 automatically clears the global badge because both floors would be identical.
  ```

### 2. Document the auto-reset / auto-apply menus (Builder layout → Action buttons)
- **README sections to touch:** `Configs Builder` (paragraph after “Load/Save” bullet).
- **Gap:** Builders can now right-click Reset / Insert as config / Apply as config for an options menu, but the README never explains those toggles or that Auto Reset and Auto Apply are mutually exclusive.
- **Proposed paragraph right after the "Load/Save" note inside "Configs Builder":**
  ```md
  - Reset/Insert/Apply menus: Right-click Reset, Insert as config, or Apply as config to open the shared options menu. Save your current builder state as the default template, jump back to the factory defaults, enable Auto reset after Insert (clear the builder immediately after inserting a config), or enable Auto apply to selected config (push edits into the highlighted config automatically after ~400 ms of inactivity). Auto reset and Auto apply cannot be on at the same time—turning one on turns the other off—and both preferences persist between sessions.
  ```

### 3. Capture the filter shortcut + key controls ("Sellfile Preview Controls → Filters")
- **README sections to touch:** `Sellfile Preview Controls` → bullet `Filters`.
- **Gap:** Users already understand Slot/Rank/Rarity/Level chips—the missing info is how to open the panel quickly (`Ctrl+F` / `Cmd+F`), how the section chevrons respond to right-click (`Collapse all` / `Expand all`), and how the two Config buttons differ. Rewrite the bullet to focus on those controls; skip low-level details like slider ranges for now.
- **Proposed wording to replace the Filters bullet:**
  ```md
  - Filters: Press `Ctrl+F` (`Cmd+F` on macOS) to open the panel and focus the Config search instantly. Right-click any section header (or `Ctrl`/`Cmd`+click its chevron) to collapse or expand every section at once. Preview Configs hides saved-config chips that do not match the active filter so the preview stays readable. Config Filter controls which configs are allowed in the table: it’s a simple On/Off toggle in Rules mode, and it cycles through `Off` → `First-Match` → `Any-Match` when the Rule Tester preview is active.
  ```

### 4. Call out the preview header copy-path button
- **README sections to touch:** `Features` list (new bullet after “Autosave restore dialog”).
- **Gap:** The README never mentions the `%APPDATA%\RslHelper\Config` copy helper that sits next to the Load button, so players still hunt for the path manually.
- **Proposed bullet to add under "Features" (after the Autosave bullet):**
  ```md
  - Copy the RSL Helper DB folder: the preview header exposes a clipboard button that copies `%APPDATA%\RslHelper\Config` so you can paste the folder path into Explorer before dragging the `.db` into Sellfile Creator.
  ```

### 5. Clarify autosave coverage for Final Sell
- **README sections to touch:** `Configs Builder` → paragraph `Autosave restore`.
- **Gap:** "Autosave restore" talks about Final Sell remainder but not the new toggles for Artifacts/Accessories/level ranges, so it underplays what comes back on restore.
- **Proposed sentence to append to the Autosave restore paragraph under "Configs Builder":**
  ```md
  Autosave also remembers which Final Sell toggles (Artifacts, Accessories, and level ranges) were enabled, so reopening the dialog mirrors exactly what you exported last time.
  ```

## docs/technical/tutorial.md

- Skip tutorial edits in this pass; another agent will handle the walkthrough and hydration notes.

## docs/technical/app-behavior.md

### 9. Flesh out the Builder cheat sheet section
- **Gap:** The section mentions the new Rolls Cap/Sum/timeline rows but not why the lock badges show up or how the popover mirrors builder state.
- **Proposed paragraph to append to the existing "Builder cheat sheet" bullet:**
  ```md
  The popover renders the same 🔒 aggregate badges the builder uses, so when a config reserves Locked Min Required Rolls the cheat sheet shows the lock chip right next to the global badge. Timeline rows animate whenever the builder’s level window changes, keeping the +0 → +16 milestones in sync with the primary panel so screenshots and documentation always show the same roll cadence. Height and scroll momentum reuse the Builder root’s `ResizeObserver`, so wide screens cap at 60 % of the viewport while smaller screens borrow the panel’s actual height to avoid double scrollbars.
  ```

### 10. Cross-link the shared substat visuals to Keep Uniques/tutorial references
- **Gap:** Readers still don’t know why the lock badge appears inside the static cheat sheet rows or where else the shared component shows up.
- **Proposed sentence to append to "Shared substat toggles":**
  ```md
  These snapshots intentionally reuse the builder’s lock badge + wildcard glyph component so screenshots in the tutorial, Keep Uniques dialog, and cheat sheet all show the exact same indicator language.
  ```

## docs/TOOLTIPS.md (new file)

### 11. Create a dedicated tooltip + context-hint inventory
- **Gap:** The file doesn’t exist, yet we now rely on it to track the growing list of `ContextMenuHintOverlay` surfaces and bespoke tooltips (copy-path button, builder defaults menu, etc.). Keep each entry concise so we avoid repeating the same tooltip explanations across files.
- **Proposed outline for the new file:**
  ```md
  # Tooltip & Context-Hint Inventory

  ## Context menu hints (ContextMenuHintOverlay)
  - `builderSubstats`, `builderInsertMenu`, `builderApplyMenu`, `builderReset`, and `builderHistoryMenu` — Right-clickable surfaces in the builder show `t('contextMenuHint')` until the user dismisses it per app version.
  - `configChipsArea` and `configChipsMenu` — The saved-config chips area + individual chip menu expose the same hint so players learn about Duplicate/Move/Copy/Paste.
  - `previewExportMenu` — Right-click the export button to pick deduped export, default dedupe toggle, and “omit disabled” options; hint string `contextMenuHint`.
  - `rulesTableHeader` and `rulesTableRows` — Table header gets `contextMenuHintRulesTableHeader` (mentions column management) while rows reuse `contextMenuHint` for the row menu.
  - `rulesFilterSections` — Chevron toolbar shows the hint when users hover without opening the context menu; ctrl/meta-click still applies the collapse/expand all behavior.
  - `ruleTesterCompact` — The compact/expanded toggle in the Rule Tester dialog shows the hint to explain that right-clicking the tester intro block reveals the clipboard helper.

  ## Button/tooltips tied to new flows
  - Rule Tester copy-path button — Tooltip text comes from `t('rowMenuCopy')` and the button lives inline with the `%APPDATA%\RslHelper\Config` path; document that this tooltip must stay in sync with the clipboard fallback dialog.
  - Preview header copy-path button — Shares the same tooltip text and status toast as the dialog button; note that both rely on `writeTextSafe` plus the fallback copy dialog.
  - Builder auto-reset / auto-apply toggles — Describe the tooltip text that clarifies mutual exclusion.
  ```

## docs/TECHNICAL.md

### 12. Link the new tooltip inventory
- **Gap:** The technical index currently points to build, app behavior, tutorial, etc., but not the tooltip inventory.
- **Proposed addition under the existing list of technical documents:**
  ```md
  - [Tooltip & Context Hints](TOOLTIPS.md) — inventory of every tooltip/context menu hint so localization and QA can keep the surfaces in sync.
  ```

## docs/technical/l10n-translation-checklist.md

### 13. Remove the translation checklist
- **Gap:** The standalone checklist is obsolete now that we track localization follow-ups inside `OTHER_LANGS.md`. Keeping the file around risks drift and gives translators outdated instructions.
- **Removal plan:**
  - Delete `docs/technical/l10n-translation-checklist.md`.
  - Drop every reference to the file (AGENTS hints, `docs/TECHNICAL.md`, README footers, etc.) so the index doesn’t point to a deleted page.
  - Move any future translation notes into `OTHER_LANGS.md` so we only have one living checklist.

## Catalog keys to verify
Keep the following existing catalog entries aligned with the updated docs/tooltips (no new strings required, but double-check that the copy still mirrors these keys):
- `builderMinRequiredRollsChipLocked`, `builderMinRequiredRollsLockIconSet`, `builderMinRequiredRollsLockIconClear`, `builderMinRequiredRollsLockIconDisabled`
- `builderMenuSaveUserDefaults`, `builderMenuResetFactory`, `builderMenuAutoResetAfterInsert`, `builderMenuAutoApplySelected`
- `contextMenuHint`, `contextMenuHintRulesTableHeader`
- `rulesMenuColorStatTexts`, `rulesMenuColorBlindPalette`, `rulesMenuGridColumns`, `rulesMenuShowFirstMatch`, `rulesMenuShowOtherMatches`, `rulesMenuShowChampionIcons`
- `testerPreviewHeading`, `previewModeTester`, `testerOpenLabel`, `testerIntro`, `testerManualOnlyNotice`, `testerResetConfirmTitle`, `restoreAutosaveTesterSavedAt`, `restoreAutosaveTesterLabel` — all should use the locale-specific name for “Rule Tester”
- `rowMenuCopy` (used by both copy-path buttons)

## Cross-locale wording audit (completed)
Every localized README still mirrors the pre-`2fcc9d0` English text, so they all need the same updates as sections 1–5 above. Use the following findings to steer each locale, translate “Rule Tester” to the locale-specific term, and keep wording consistent:
- `README.de.md` — Update `Mindest-Rollen (global)`, the paragraph under `Konfig-Builder` (Reset/Insert/Apply options), `Sellfile-Vorschau: Steuerelemente > Filter`, the `Funktionen` list, and the `Autosave` sentence. Replace “Rule Tester” with `Regeltester` across the README and catalog keys, keep other established loanwords (`Sellfile`, `Flex`, `Auto`, `Configs`), and reuse `Vorschau-Konfigs` / `Konfig-Filter`.
- `README.es.md` — Refresh the same sections. This locale already uses `Probador de Reglas`; ensure every “Rule Tester” mention and catalog key uses that translation alongside `Tiradas mínimas`, `Configs vista`, and `Filtro de configs`. Add the copy-path bullet under `Funciones`.
- `README.fr.md` — Update `Jets minimaux (global)`, the post `Charger/Enregistrer` paragraph, `Contrôles de l’aperçu > Filtres`, `Fonctionnalités`, and the `Autosave` text. Translate “Rule Tester” to `Testeur de règles` everywhere (README + catalog) while keeping other loanwords (`Sellfile`, `Configs`) and reusing `Configs aperçu` / `Filtre configs`.
- `README.it.md` — Refresh `Roll minimi (global)`, `Gestione delle configurazioni`, `Controlli dell'Anteprima Sellfile > Filtri`, `Funzioni`, and the `Autosave` paragraph. Translate “Rule Tester” to `Verificatore regole` throughout (README + catalog) and keep the locale’s existing terminology (`Configs`, `Flex`, `Reset`, `Configs anteprima`, `Filtro config`).
- `README.pt.md` — Update the same sections and translate “Rule Tester” to `Testador de regras` everywhere while reusing `Configs prévia` / `Filtro de configs` and the existing loanwords (`Sellfile`, `Configs`). Add the copy-path bullet.
- `README.pt-BR.md` — Mirror the pt-PT updates and ensure `Testador de regras` replaces every “Rule Tester” mention in the README and catalog keys.
- `README.ru.md` — Update `Минимальные прокачки (global)`, the load/save paragraph, `Фильтры`, `Функции`, and the `Autosave` sentence. Translate “Rule Tester” to `Проверка правил` everywhere (README + catalog) while keeping other loanwords (`Matched`, `No Match`, `Sellfile`, `Configs`) and reusing `Конфиги (обзор)` / `Фильтр конфигов`.
- `README.tr.md` — Refresh the analogous sections and translate “Rule Tester” to `Kural testi` across README and catalog keys. Maintain the other established loanwords (`Configs`, `Flex`, `Reset`, `Matched/No Match`) and continue to reference `Önizleme konfigleri` / `Konfig filtresi`.
- `README.uk.md` — Update the same sections and translate “Rule Tester” to `Перевірка правил` everywhere (README + catalog) while keeping `%APPDATA%\RslHelper\Config` literal and reusing `Конфіги (превʼю)` / `Фільтр конфігів`.

Review this list, adjust any wording you want, then we can update the English docs accordingly.
