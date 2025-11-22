# Other-Language Follow-Ups

Share this checklist with whichever agent handles each locale so the non-English docs and UI strings land after we merge the English updates from `ENGLISH_NEW.md`.

## README translations (de, es, fr, it, pt, pt-BR, ru, tr, uk)
- **Sections to update (mirror the English edits):**
  1. `Builder layout (top → bottom)` → `Min Required Rolls (global)` bullet (add the locked-floor explanation + example).
  2. `Configs Builder` → paragraph after the “Load/Save” bullet (builder Reset/Insert/Apply menu behavior).
  3. `Sellfile Preview Controls` → `Filters` bullet (rewrite to include the keyboard shortcut, tester Level slider, and glyph-based Rolls popover).
  4. `Features` list (new bullet after “Autosave restore dialog” describing the copy-path button and `%APPDATA%\RslHelper\Config`).
  5. `Configs Builder` → `Autosave restore` paragraph (note that Final Sell toggles are restored).
- Mirror every change listed in `ENGLISH_NEW.md` sections 1–5:
  - add the Locked Min Required Rolls explanation (🔒 floor, Auto interactions, sample scenario),
  - describe the Reset/Insert/Apply context menu with Auto reset / Auto apply toggles,
  - refresh the Filters paragraph with the `Ctrl/Cmd+F` shortcut, tester-only level slider, and glyph-based roll filters,
  - mention the preview-header copy-path button (Windows `%APPDATA%\RslHelper\Config` path only), and
  - update the Autosave paragraph so it calls out the restored Final Sell toggles.
- While rewriting, replace the affected paragraphs wholesale so the new copy flows naturally—don’t add second explanations of the same control. Preserve the established terminology (“Config”, “Keep”, “Sell”, etc.), keep the `%APPDATA%\RslHelper\Config` literal untouched so the inline copy button still finds it, and stick to simple language that matches each locale’s existing tone.
- Review the rest of each README for “accidental” English strings related to these features. If a locale previously borrowed a term on purpose (for example “Substats” in German), keep the loanword and note that decision in your PR; otherwise translate it using the wording that locale already uses elsewhere in the doc/catalog.
- Translate “Rule Tester” to the locale-specific term everywhere (README + i18n catalogs). Use the following targets and keep them consistent with the updated doc copy:
  - German: `Regeltester`
  - Spanish: `Probador de Reglas` (already in use—keep it consistent)
  - French: `Testeur de règles`
  - Italian: `Verificatore regole`
  - Portuguese (pt + pt-BR): `Testador de regras`
  - Russian: `Проверка правил`
  - Turkish: `Kural testi`
  - Ukrainian: `Перевірка правил`
- After translating, re-run the README linter/checker used in this repo (same `npm run lint` suite) so Markdown anchors stay valid; translated copies mirror the English structure exactly.

## Tooltip/context-hint doc
- No localized copies exist for `docs/TOOLTIPS.md`; other languages can keep referencing the English file. If a locale doc set is ever created, translate the entries wholesale but keep the translation keys (`contextMenuHint`, `contextMenuHintRulesTableHeader`, etc.) verbatim so UI references stay searchable.

## Localization catalogs
- **Relevant keys (reuse existing translations or add them if missing):**
  - Locked min rolls: `builderMinRequiredRollsChipLocked`, `builderMinRequiredRollsLockIconSet`, `builderMinRequiredRollsLockIconClear`, `builderMinRequiredRollsLockIconDisabled`
  - Builder defaults menu: `builderMenuSaveUserDefaults`, `builderMenuResetFactory`, `builderMenuAutoResetAfterInsert`, `builderMenuAutoApplySelected`
  - Filters/menus: `contextMenuHint`, `contextMenuHintRulesTableHeader`, `rulesMenuColorStatTexts`, `rulesMenuColorBlindPalette`, `rulesMenuGridColumns`, `rulesMenuShowFirstMatch`, `rulesMenuShowOtherMatches`, `rulesMenuShowChampionIcons`
  - Rule Tester naming + dialogs: `testerPreviewHeading`, `previewModeTester`, `testerOpenLabel`, `testerIntro`, `testerManualOnlyNotice`, `testerResetConfirmTitle`, `restoreAutosaveTesterSavedAt`, `restoreAutosaveTesterLabel`
  - Copy helpers: `rowMenuCopy`
- No brand-new strings are expected for this doc pass; confirm your locale already includes the keys above. If any are missing, add them by matching the `en-US` catalog (reusing existing vocabulary) and keep the phrasing simple. Run `npm run typecheck` and `npm run lint` before submitting translations.

## Locale-specific wording notes
- `README.de.md` — Update `Mindest-Rollen (global)`, `Konfig-Builder` (Reset/Insert/Apply paragraph), `Sellfile-Vorschau: Steuerelemente > Filter`, `Funktionen`, and the `Autosave` paragraph. Translate “Rule Tester” to `Regeltester` across the README/catalog, keep the other established loanwords (`Sellfile`, `Auto`, `Flex`, `Configs`), and reuse `Vorschau-Konfigs` / `Konfig-Filter`.
- `README.es.md` — Same sections remain outdated. Reuse the existing Spanish terms `Tiradas mínimas (global)`, `Configs vista`, `Filtro de configs`, and keep using `Probador de Reglas` for all “Rule Tester” mentions (README + catalog).
- `README.fr.md` — Refresh `Jets minimaux (global)`, the post `Charger/Enregistrer` paragraph, `Contrôles de l’aperçu > Filtres`, `Fonctionnalités`, and the `Autosave` sentence. Translate “Rule Tester” to `Testeur de règles` throughout (README + catalog) and reuse `Configs aperçu` / `Filtre configs`.
- `README.it.md` — Update `Roll minimi (globali)`/`Roll minimi`, the paragraph under `Gestione delle configurazioni`, the `Filtri` bullet, `Funzioni`, and the `Autosave` paragraph. Translate “Rule Tester” to `Verificatore regole` everywhere while keeping the locale’s existing mix of terms (`Flex`, `Reset`, `Configs anteprima`, `Filtro config`).
- `README.pt.md` — Update the same sections and translate “Rule Tester” to `Testador de regras` (README + catalog). Keep the established loanwords (`Sellfile`, `Configs`) and reuse `Configs prévia` / `Filtro de configs`.
- `README.pt-BR.md` — Mirrors pt-PT; apply the same updates and use `Testador de regras` consistently alongside `Configs prévia` / `Filtro de configs`.
- `README.ru.md` — Refresh `Минимальные прокачки (global)`, the paragraph following the load/save bullet, the `Фильтры` description, `Функции`, and the `Autosave` sentence. Translate “Rule Tester” to `Проверка правил` (README + catalog) and keep the other existing loanwords (`Matched`, `No Match`, `Sellfile`, `Configs`) plus `Конфиги (обзор)` / `Фильтр конфигов`.
- `README.tr.md` — Update the analogous sections (`global roll` paragraph, load/save paragraph, `Filtreler` bullet, `Özellikler`, `Autosave`) and translate “Rule Tester” to `Kural testi`. Keep the other familiar loanwords (`Matched`, `No Match`, `Configs`) and reuse `Önizleme konfigleri` / `Konfig filtresi`.
- `README.uk.md` — The same sections need updates. Translate “Rule Tester” to `Перевірка правил` everywhere (README + catalog), keep the other established terms (`Matched`, `No Match`, `Configs`), and reuse `Конфіги (превʼю)` / `Фільтр конфігів`.

## Tutorial references
- No localized tutorial doc currently exists, but if a locale guide is ever introduced, mirror the new Rule Tester walkthrough text exactly (copy-path button explanation, `.db` import step, tester filter tour). Keep UI labels (button names, tooltips) consistent with that locale’s catalog.

## Translation checklist file
- Do not recreate `docs/technical/l10n-translation-checklist.md` in other languages; the English copy is being removed. Track any locale-specific follow-ups directly inside your README PR or in this `OTHER_LANGS.md` file so there is only one source of truth.
