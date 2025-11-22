# Documentation & Localization Surfaces to Revisit (post `2fcc9d0`)

We shipped multiple UI/behavior changes after release `2fcc9d04db1a3a045827ee17e539f1bab59064bb`, but none of the outward-facing docs/tooltips/catalogs have been refreshed since that tag. This checklist enumerates every surface that now risks being out of date so we can audit them deliberately.

## 1. README family

**Files to inspect**
- `README.md`
- `README.de.md`, `README.es.md`, `README.fr.md`, `README.it.md`, `README.pt.md`, `README.pt-BR.md`, `README.ru.md`, `README.tr.md`, `README.uk.md`

**Focus areas**
- Builder Min Required Rolls: document the locked-min badge workflow, Auto reset interactions, and “locked floor clears global floor” logic introduced in `src/components/BuilderPanel.tsx` after the last release.
- Rule Tester preview: capture the new context-menu toggles, champion icon overlay, color-blind palettes, and Matched/No Match outcome filters driven by `src/components/TesterItemsGrid.tsx`.
- Preview filters: explain the tester-mode glyph roll filters, dual-handle level slider, `Ctrl/Cmd+F` shortcut, and Config Filter tri-state (`Off` → `First-Match` → `Any-Match`) so users understand the redesigned `RulesFilterPanel`.
- Autosave restore + Load flows: reflect that `.db` drops auto-switch the preview, autosave now restores tester gear, filter panel state, and `Final Sell` toggles, and the copy-path button in `PreviewHeaderActions.tsx` helps locate `%APPDATA%\\RslHelper\\Config`.
- Re-sync every translation once the English README is accurate; the localized copies currently mirror the pre-`2fcc9d0` feature set.

## 2. Tutorial & Help dialog

**Files to inspect**
- `docs/technical/tutorial.md`
- `src/components/HelpDialog.tsx`
- `src/hooks/useTutorialCoachState.ts`
- `src/components/tutorial/TutorialCoach.tsx`

**Focus areas**
- Extend the narrative so the tutorial explicitly opens the Rule Tester dialog (“Gear…”), drags a `.db`, and demonstrates the preview toggle without losing builder progress.
- Ensure the scripted steps mention the copy-to-clipboard button (Preview header) and how to locate/export the `%APPDATA%` database through the new helper text.
- Update hydration logic (`handleTutorialSkipTo`) so jumping into new steps (Rule Tester, metaset context menus, Final Sell remainder toggles, builder auto-reset/auto-apply menus) still yields deterministic state. Document these steps in `docs/technical/tutorial.md`.
- Confirm the Help dialog (`README` overlay) still accurately describes first-run gating (`README_SEEN_VERSION_KEY`) and the “Start Tutorial” entry point for the expanded walkthrough.

## 3. Builder cheat sheet documentation

**Files to inspect**
- `docs/technical/app-behavior.md` (Builder cheat sheet section)
- `src/components/BuilderCheatSheetPopover.tsx`
- `src/components/SubstatToggleDisplay.tsx`

**Focus areas**
- Describe the dedicated `Rolls Cap`, `Rolls Sum`, and milestone timeline sections now rendered inside the popover, including how CDMG cap previews work and why the timeline rows animate in sync with `BuilderPanel`.
- Call out the locked-min badges and how they mirror the builder’s locked aggregate floor so doc readers understand the lock icons shown in screenshots/examples.
- Verify the doc references the shared layout helpers (`ResizeObserver` height cap, scroll momentum) and the shared substat toggle visuals so UI/text remain consistent.

## 4. Tooltip / context-hint inventory

**Files to inspect**
- `docs/TOOLTIPS.md` (create/update; currently missing the recent surfaces called out in `docs/TECHNICAL_DEBT_SINCE_v0.9.8.md`)
- `src/components/ContextMenuHintOverlay.tsx`
- `src/components/PreviewHeaderActions.tsx`
- `src/components/TesterItemsGrid.tsx`
- `src/components/BuilderPanel.tsx`, `src/components/ConfigChipsPanel.tsx`, `src/components/HsfRulesTable.tsx`, `src/components/RulesFilterPanel.tsx`
- `src/components/dialogs/RuleTesterDialog.tsx` (copy-path tooltip)

**Focus areas**
- Document every surface that now uses `ContextMenuHintOverlay` (builder reset/insert/apply buttons, config chips, preview export menu, tester grid, Rules table header rows, Rule Tester dialog compact button, filter sections) so future auditors know which tooltips must stay in sync.
- Capture the tester-grid context menu entries (color palettes, column count, match-row pinning, champion avatar toggles) and the associated tooltips introduced post-release.
- Note the Rule Tester copy-path tooltip and the new `rulesFilterSections` context hint: both surfaced after `2fcc9d0` and have never been described in the tooltip inventory.
- If `docs/TOOLTIPS.md` truly does not exist, create it under `docs/` and index it from `docs/TECHNICAL.md`.

## 5. Localization catalogs & strings

**Files to inspect**
- `src/lib/i18n/catalogs/en-US.ts`
- Locale mirrors: `de-DE.ts`, `es-ES.ts`, `fr-FR.ts`, `it-IT.ts`, `pt-PT.ts`, `pt-BR.ts`, `ru-RU.ts`, `tr-TR.ts`, `uk-UA.ts`
- Supporting checklist: `docs/technical/l10n-translation-checklist.md`

**Focus areas**
- Audit any strings added since `2fcc9d0` (locked-min roll controls, builder auto-reset/auto-apply menus, preview export hints, tester-grid context menu, copy-path status toasts, new filter slider/glyph labels, context-menu hint text) and ensure every locale provides translations.
- Check tooltip/aria-label coverage where we hard-coded English text after the last release (`RulesFilterPanel` accordion controls, Rule Tester dialog add/remove row buttons, Cookie Monster easter-egg tooltip).
- Keep catalogs alphabetized with `en-US` as the source of truth; update `docs/technical/l10n-translation-checklist.md` with any new workflows uncovered while localizing the new strings.
- Once translations land, re-run our normal verification commands (`npm run typecheck`, `npm run lint`, `npm test`) to ensure catalog imports remain type-safe (strict TS types depend on the shape of `en-US`).

---

Use this document as the backlog for post-`2fcc9d0` doc work. Each bullet should result in a concrete diff (README copy updates, tutorial narration, cheat sheet docs, tooltip inventory, catalog refreshes) so the next release ships with accurate guidance.
